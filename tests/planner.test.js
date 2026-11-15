import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agencyTime,
  distance,
  nearby,
  normalizeStop,
  point,
  buildJourneys,
  planTrip,
} from "../src/server/planner.js";
const now = Date.parse("2026-11-14T23:00:00Z"); // 6 PM Rochester
const from = {
  id: "a",
  name: "Boarding",
  lat: 43.155,
  lon: -77.594,
  meters: 80,
  walkMinutes: 2,
};
const to = {
  id: "b",
  name: "Destination",
  lat: 43.148,
  lon: -77.578,
  meters: 50,
  walkMinutes: 1,
};
function prediction(extra = {}) {
  return {
    Timestamp: "11/14/2026 6:00:00 PM",
    ETA: "11/14/2026 6:15:00 PM",
    RouteId: 10,
    TripId: 123,
    ExternalTripId: "live123",
    VehicleId: 22,
    DestinationSign: "10 Park",
    ...extra,
  };
}
function matches(a = {}, b = {}) {
  return buildJourneys(
    [from],
    [to],
    new Map([
      ["a", [prediction(a)]],
      ["b", [prediction({ ETA: "11/14/2026 6:25:00 PM", ...b })]],
    ]),
    now,
  );
}
test("agency timestamps use Rochester timezone in winter, summer and at midnight", () => {
  assert.equal(agencyTime("11/14/2026 6:00:00 PM"), now);
  assert.equal(
    agencyTime("7/14/2026 6:00:00 PM"),
    Date.parse("2026-07-14T22:00:00Z"),
  );
  assert.equal(
    agencyTime("11/14/2026 12:00:00 AM"),
    Date.parse("2026-11-14T05:00:00Z"),
  );
  assert.equal(
    agencyTime("11/14/2026 12:00:00 PM"),
    Date.parse("2026-11-14T17:00:00Z"),
  );
  assert.ok(Number.isNaN(agencyTime("garbage")));
  assert.ok(Number.isNaN(agencyTime("2/31/2026 6:00:00 PM")));
  assert.ok(Number.isNaN(agencyTime("3/8/2026 2:30:00 AM")));
});
test("valid locations, nearest stop ordering and normalization", () => {
  assert.throws(() => point({ lat: "43", lon: -77 }));
  assert.throws(() => point({ lat: NaN, lon: 0 }));
  assert.throws(() => point({ lat: 91, lon: 0 }));
  assert.equal(distance(from, from), 0);
  assert.ok(distance(from, to) > 1000);
  assert.deepEqual(
    normalizeStop({ StopID: 5, StopName: "Main", Lat: "43", Lon: "-77" }),
    { id: "5", name: "Main", lat: 43, lon: -77 },
  );
  assert.equal(normalizeStop({ StopId: 1, StopLat: "bad", StopLon: 0 }), null);
  assert.equal(normalizeStop(null), null);
  assert.equal(nearby([to, from], from, 1, 500)[0].id, "a");
});
test("matches the same live trip downstream and includes walking and boarding buffer", () => {
  const [journey] = matches();
  assert.equal(journey.route, "10");
  assert.equal(journey.rideMinutes, 10);
  assert.equal(journey.leaveAt, agencyTime("11/14/2026 6:11:00 PM"));
  assert.equal(journey.destinationAt, agencyTime("11/14/2026 6:26:00 PM"));
});
test("rejects opposite direction, another trip, missing IDs and another vehicle", () => {
  assert.equal(matches({}, { ETA: "11/14/2026 6:10:00 PM" }).length, 0);
  assert.equal(matches({}, { ExternalTripId: "different" }).length, 0);
  assert.equal(
    matches(
      { ExternalTripId: "", TripId: 0 },
      { ExternalTripId: "", TripId: 0 },
    ).length,
    0,
  );
  assert.equal(matches({}, { VehicleId: 23 }).length, 0);
  assert.equal(matches({}, { RouteId: 11 }).length, 0);
});
test("rejects stale feeds, impossible arrival times and buses too soon to reach", () => {
  assert.equal(matches({ Timestamp: "11/14/2026 5:55:00 PM" }).length, 0);
  assert.equal(matches({ ETA: "11/14/2026 6:03:00 PM" }).length, 0);
  assert.equal(matches({ ETA: "invalid" }).length, 0);
  assert.equal(matches({}, { Timestamp: "11/13/2026 6:00:00 PM" }).length, 0);
});
test("planner verifies a direct route using nearby stops and does not mutate locations", async () => {
  let active = 0,
    peak = 0;
  const client = {
    stops: async () => [from, to],
    predictions: async (id) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return [
        prediction({
          ETA: id === "a" ? "11/14/2026 6:15:00 PM" : "11/14/2026 6:25:00 PM",
        }),
      ];
    },
  };
  const plan = await planTrip(client, from, to, 5, now);
  assert.equal(plan.journeys.length, 1);
  assert.equal(plan.nearestStop.id, "a");
  assert.equal(plan.partial, false);
  assert.ok(peak <= 3);
  const outside = await planTrip(client, { lat: 42, lon: -75 }, to, 5, now);
  assert.match(outside.reason, /No RTS stops/);
  assert.equal(outside.journeys.length, 0);
  await assert.rejects(
    () => planTrip(client, from, to, 99, now),
    /Walking limit/,
  );
});
test("all upstream prediction failures are errors, not a no-service result", async () => {
  await assert.rejects(
    () =>
      planTrip(
        {
          stops: async () => [from, to],
          predictions: async () => {
            throw new Error("down");
          },
        },
        from,
        to,
        5,
        now,
      ),
    /not returning predictions/,
  );
});
