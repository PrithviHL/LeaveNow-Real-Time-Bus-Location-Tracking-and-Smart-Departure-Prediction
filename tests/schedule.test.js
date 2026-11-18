import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Schedule,
  serviceAnchor,
  serviceDate,
} from "../src/server/schedule.js";
import { overlayLive, routingOptions } from "../src/server/journeys.js";
const now = Date.parse("2026-11-16T12:50:00Z");
const origin = { lat: 43.15, lon: -77.6 },
  destination = { lat: 43.18, lon: -77.6 };
const sec = (h, m = 0) => h * 3600 + m * 60;
const event = (stop, h, m = 0, pickup = 0, dropoff = 0) => [
  stop,
  sec(h, m),
  sec(h, m),
  pickup,
  dropoff,
];
function feed() {
  return {
    schema: 1,
    timezone: "America/New_York",
    source: "https://example.test/feed.zip",
    info: {
      feed_version: "fixture",
      feed_start_date: "20261101",
      feed_end_date: "20261130",
    },
    calendar: [
      {
        service_id: "daily",
        start_date: "20261101",
        end_date: "20261130",
        monday: "1",
        tuesday: "1",
        wednesday: "1",
        thursday: "1",
        friday: "1",
        saturday: "1",
        sunday: "1",
      },
    ],
    exceptions: [],
    transfers: [],
    stops: [
      { id: "a", code: "a", name: "Origin", ...origin },
      { id: "b", code: "b", name: "Transfer east", lat: 43.16, lon: -77.6 },
      { id: "c", code: "c", name: "Transfer west", lat: 43.1605, lon: -77.6 },
      { id: "d", code: "d", name: "Destination", ...destination },
    ],
    routes: {
      r1: { short: "1", name: "First" },
      r2: { short: "2", name: "Second" },
      r3: { short: "3", name: "Direct" },
    },
    trips: [
      {
        id: "t1",
        route: "r1",
        service: "daily",
        headsign: "First",
        direction: "0",
        stops: [event(0, 8), event(1, 8, 10)],
      },
      {
        id: "t2",
        route: "r2",
        service: "daily",
        headsign: "Second",
        direction: "0",
        stops: [event(2, 8, 17), event(3, 8, 30)],
      },
      {
        id: "t3",
        route: "r3",
        service: "daily",
        headsign: "Direct",
        direction: "0",
        stops: [event(0, 8, 15), event(3, 8, 45)],
      },
    ],
  };
}
function search(data = feed(), options = {}) {
  const schedule = new Schedule(data);
  return schedule.search(
    origin,
    destination,
    {
      mode: "depart_at",
      when: now,
      maxWalk: 5,
      maxTransfers: 1,
      transferBuffer: 5,
      ...options,
    },
    now,
  );
}
test("finds a two-bus transfer with walk, buffer, final arrival, and scheduled provenance", () => {
  const r = search();
  const j = r.journeys[0];
  assert.equal(j.transfers, 1);
  assert.equal(j.route, "1 → 2");
  assert.equal(j.legs.length, 2);
  assert.equal(j.timingLabel, "Scheduled");
  assert.equal(j.transferWaitMinutes, 7);
  assert.equal(j.connection.walkMinutes, 1);
  assert.equal(j.destinationAt, Date.parse("2026-11-16T13:30:00Z"));
  assert.ok(
    j.legs[1].departsAt - j.legs[0].arrivesAt >=
      j.connection.minimumSeconds * 1000,
  );
});
test("direct-only, departure threshold, and arrival deadline produce different valid options", () => {
  assert.equal(search(feed(), { maxTransfers: 0 }).journeys[0].route, "3");
  assert.equal(
    search(feed(), { when: Date.parse("2026-11-16T13:01:00Z") }).journeys[0]
      .route,
    "3",
  );
  assert.equal(
    search(feed(), {
      mode: "arrive_by",
      when: Date.parse("2026-11-16T13:35:00Z"),
    }).journeys[0].route,
    "1 → 2",
  );
  const r = search(feed(), {
    mode: "arrive_by",
    when: Date.parse("2026-11-16T13:50:00Z"),
  });
  assert.equal(r.journeys[0].route, "3");
  assert.ok(r.journeys.every((j) => j.destinationAt <= r.requestedTime));
});
test("rejects prohibited transfers, insufficient buffers, and restricted pickup/dropoff", () => {
  const prohibited = feed();
  prohibited.transfers = [
    { from_stop_id: "b", to_stop_id: "c", transfer_type: "3" },
  ];
  assert.equal(search(prohibited).journeys[0].transfers, 0);
  assert.equal(search(feed(), { transferBuffer: 8 }).journeys[0].transfers, 0);
  const minimum = feed();
  minimum.transfers = [
    {
      from_stop_id: "b",
      to_stop_id: "c",
      transfer_type: "2",
      min_transfer_time: "1200",
    },
  ];
  assert.equal(search(minimum).journeys[0].transfers, 0);
  const noDrop = feed();
  noDrop.trips[0].stops[1][4] = 1;
  assert.equal(search(noDrop).journeys[0].transfers, 0);
  const noPickup = feed();
  noPickup.trips[1].stops[0][3] = 1;
  assert.equal(search(noPickup).journeys[0].transfers, 0);
});
test("service calendar exceptions and feed date limits are enforced", () => {
  const holiday = feed();
  holiday.exceptions = [
    { service_id: "daily", date: "20261116", exception_type: "2" },
  ];
  const result = search(holiday);
  assert.equal(serviceDate(result.journeys[0].departsAt), "20261117");
  assert.equal(
    search(holiday, {
      mode: "arrive_by",
      when: Date.parse("2026-11-16T13:50:00Z"),
    }).journeys.length,
    0,
  );
  const expired = feed();
  expired.info.feed_end_date = "20261115";
  assert.match(search(expired).reason, /timetable covers/);
});
test("honors scoped transfer bans without banning unrelated routes", () => {
  const data = feed();
  data.transfers = [
    {
      from_stop_id: "b",
      to_stop_id: "c",
      transfer_type: "3",
      from_trip_id: "other",
    },
  ];
  assert.equal(search(data).journeys[0].transfers, 1);
  data.transfers[0].from_trip_id = "t1";
  assert.equal(search(data).journeys[0].transfers, 0);
});
test("supports GTFS times after 24:00 on the previous service date", () => {
  const data = feed();
  data.calendar[0].tuesday = "0";
  data.info.feed_end_date = "20261116";
  data.trips = [
    { ...data.trips[2], stops: [event(0, 25, 5), event(3, 25, 30)] },
  ];
  const r = search(data, { when: Date.parse("2026-11-17T06:00:00Z") });
  assert.equal(r.journeys[0].departsAt, Date.parse("2026-11-17T06:05:00Z"));
  assert.ok(r.journeys[0].id.includes("20261116"));
  assert.equal(serviceAnchor("20260308"), Date.parse("2026-03-08T04:00:00Z"));
});
test("validates travel controls and rejects unreasonable dates", () => {
  assert.throws(() => routingOptions({ mode: "bad" }, now), /Choose/);
  assert.throws(
    () => routingOptions({ mode: "depart_at", when: now - 120000 }, now),
    /14 days/,
  );
  assert.throws(
    () => routingOptions({ mode: "arrive_by", when: now + 20 * 86400000 }, now),
    /14 days/,
  );
  assert.throws(() => routingOptions({ maxTransfers: 2 }, now), /zero or one/);
});
test("live overlay matches exact trips and rechecks missed transfer connections", async () => {
  const schedule = new Schedule(feed());
  let result = search();
  const ts = "11/16/2026 7:50:00 AM";
  const predictions = {
    a: [
      {
        ExternalTripId: "t1",
        RouteId: 1,
        Timestamp: ts,
        ETA: "11/16/2026 8:00:00 AM",
        VehicleId: 1,
      },
    ],
    b: [
      {
        ExternalTripId: "t1",
        RouteId: 1,
        Timestamp: ts,
        ETA: "11/16/2026 8:16:00 AM",
        VehicleId: 1,
      },
    ],
  };
  result = await overlayLive(
    result,
    { predictions: async (id) => predictions[id] || [] },
    schedule,
    now,
  );
  assert.equal(result.journeys[0].route, "3");
  assert.ok(
    !result.journeys.some(
      (j) => j.legs[0].instance === "20261116:t1" && j.transfers === 1,
    ),
  );
  const live = search(feed(), { maxTransfers: 0 });
  const direct = {
    a: [
      {
        ExternalTripId: "t3",
        RouteId: 3,
        Timestamp: ts,
        ETA: "11/16/2026 8:16:00 AM",
      },
    ],
    d: [
      {
        ExternalTripId: "t3",
        RouteId: 3,
        Timestamp: ts,
        ETA: "11/16/2026 8:46:00 AM",
      },
    ],
  };
  const checked = await overlayLive(
    live,
    { predictions: async (id) => direct[id] || [] },
    schedule,
    now,
  );
  assert.equal(checked.journeys[0].timingLabel, "Live");
  assert.equal(
    checked.journeys[0].departsAt,
    Date.parse("2026-11-16T13:16:00Z"),
  );
});
test("unavailable or unrelated live data cannot turn schedule into live evidence", async () => {
  const schedule = new Schedule(feed());
  const result = await overlayLive(
    search(),
    {
      predictions: async () => {
        throw new Error("offline");
      },
    },
    schedule,
    now,
  );
  assert.ok(result.partial);
  assert.ok(result.journeys.every((j) => j.timingLabel === "Scheduled"));
});

test("planner applies verified native trip mapping and advertises only an upcoming exact assignment", async () => {
  const client = {
    vehicles: async (route) =>
      route === "3"
        ? [
            {
              id: "bus",
              route: "3",
              nativeTripId: "123",
              serviceDate: "20261116",
              patternId: "p",
              patternDistance: 0,
              positionTimestamp: now,
            },
          ]
        : [],
    patterns: async () => [
      {
        id: "p",
        stops: [
          { id: "a", distance: 10 },
          { id: "d", distance: 100 },
        ],
      },
    ],
    resolveVehicleTrip: () => "t3",
    predictions: async (id) => [
      {
        VehicleId: "bus",
        RouteId: "3",
        NativeTripId: "123",
        ExternalTripId: "",
        Timestamp: now,
        ETA: Date.parse(
          id === "a" ? "2026-11-16T13:16:00Z" : "2026-11-16T13:46:00Z",
        ),
      },
    ],
  };
  const result = await overlayLive(
    search(feed(), { maxTransfers: 0 }),
    client,
    new Schedule(feed()),
    now,
  );
  assert.equal(result.journeys[0].timingLabel, "Live");
  assert.equal(result.journeys[0].legs[0].liveVehicleId, "bus");
  client.vehicles = async () => [];
  const unavailable = await overlayLive(
    search(feed(), { maxTransfers: 0 }),
    client,
    new Schedule(feed()),
    now,
  );
  assert.equal(unavailable.journeys[0].timingLabel, "Scheduled");
  assert.equal(unavailable.journeys[0].legs[0].liveVehicleId, null);
});
