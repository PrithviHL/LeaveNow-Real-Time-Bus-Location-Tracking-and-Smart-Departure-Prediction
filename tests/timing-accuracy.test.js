import { test } from "node:test";
import assert from "node:assert/strict";
import { trackBoarding } from "../src/server/tracking.js";
import { WalkingGraph } from "../src/server/walking.js";
const now = Date.parse("2026-11-18T20:00:00Z");
const a = { id: "a", lat: 29.64, lon: -82.34 },
  b = { id: "b", lat: 29.65, lon: -82.34 };
const p = (eta, age = 0) => ({
  RouteId: "20",
  VehicleId: "v",
  ExternalTripId: "trip",
  TripId: "trip",
  Timestamp: now - age,
  ETA: now + eta * 60000,
});
test("latest generated boarding ETA wins over an older optimistic prediction", async () => {
  const client = {
    predictions: async (id) => (id === "a" ? [p(3, 10000), p(8)] : [p(20)]),
    vehicles: async () => [],
    patterns: async () => [],
  };
  const r = await trackBoarding(client, a, "20", now, b, { id: "trip" });
  assert.equal(r.buses[0].arrivalAt, now + 8 * 60000);
});
test("one-way endpoint snapping permits other legal junction paths", () => {
  const graph = new WalkingGraph({
    schema: 1,
    bbox: [29, -83, 30, -82],
    nodes: [
      [-82.34, 29.64, 0],
      [-82.338, 29.64, 0],
      [-82.34, 29.642, 0],
    ],
    segments: [
      [0, 1, 193, 0, false],
      [0, 2, 222.4, 0, true],
    ],
  });
  const r = graph.route(a, { lat: 29.642, lon: -82.34 });
  assert.equal(r.status, "routed");
  assert.ok(r.seconds <= 206);
});

import { latestPredictions } from "../src/server/predictions.js";
import { distance } from "../src/server/planner.js";

test("prediction boundaries reject stale, future, malformed and contradictory observations", () => {
  for (const records of [
    [p(5, 180001)],
    [{ ...p(5), Timestamp: now + 60001 }],
    [{ ...p(5), ETA: "bad" }],
    [p(-1)],
    [p(181)],
    [p(5), p(8)],
    [p(5, 1000), { ...p(8), ETA: "invalid" }],
  ])
    assert.equal(latestPredictions(records, now).length, 0);
  assert.equal(latestPredictions([p(5, 180000)], now).length, 1);
  assert.equal(
    latestPredictions([{ ...p(5), Timestamp: now + 60000 }], now).length,
    1,
  );
});

test("all 128 route/trip/vehicle/freshness/order/stop combinations fail closed except valid evidence", async () => {
  for (let mask = 0; mask < 128; mask++) {
    const board = p(5),
      off = p(15);
    if (mask & 1) board.RouteId = "wrong";
    if (mask & 2) off.ExternalTripId = "wrong";
    if (mask & 4) off.VehicleId = "wrong";
    if (mask & 8) board.Timestamp = now - 180001;
    if (mask & 16) off.Timestamp = now + 60001;
    if (mask & 32) off.ETA = now + 60000;
    if (mask & 64) board.StopId = "wrong-stop";
    const client = {
      predictions: async (id) => (id === "a" ? [board] : [off]),
      vehicles: async () => [],
      patterns: async () => [],
    };
    const r = await trackBoarding(client, a, "20", now, b, { id: "trip" });
    assert.equal(r.buses.length, mask === 0 ? 1 : 0, `mask ${mask}`);
    if (!mask) {
      assert.equal(r.buses[0].alightingAt, now + 15 * 60000);
      assert.ok(r.buses[0].alightingAt > r.buses[0].arrivalAt);
    }
  }
});

test("1,296 directed/stair/crossing walking routes agree with independent Dijkstra oracle", () => {
  let state = 20261118;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const nodes = Array.from({ length: 36 }, (_, i) => [
    -82.35 + (i % 6) * 0.0006,
    29.64 + Math.floor(i / 6) * 0.0006,
    random() < 0.2 ? 15 : 0,
  ]);
  const segments = [];
  const point = (i) => ({ lon: nodes[i][0], lat: nodes[i][1] });
  for (let i = 0; i < 36; i++)
    for (const j of [i % 6 < 5 ? i + 1 : -1, i < 30 ? i + 6 : -1])
      if (j >= 0) {
        const reverse = random() < 0.25,
          u = reverse ? j : i,
          v = reverse ? i : j;
        segments.push([
          u,
          v,
          distance(point(u), point(v)),
          random() < 0.2 ? 25 : 0,
          random() < 0.6,
        ]);
      }
  const graph = new WalkingGraph({
    schema: 1,
    bbox: [29, -83, 30, -82],
    nodes,
    segments,
  });
  const edges = Array.from({ length: 36 }, () => []);
  for (const [u, v, meters, extra, both] of segments) {
    edges[u].push([v, (meters * 60) / 65 + extra + nodes[v][2]]);
    if (both) edges[v].push([u, (meters * 60) / 65 + extra + nodes[u][2]]);
  }
  for (let start = 0; start < 36; start++) {
    const costs = Array(36).fill(Infinity),
      done = new Set();
    costs[start] = 0;
    for (let k = 0; k < 36; k++) {
      let u = -1;
      for (let i = 0; i < 36; i++)
        if (!done.has(i) && (u < 0 || costs[i] < costs[u])) u = i;
      if (u < 0 || !Number.isFinite(costs[u])) break;
      done.add(u);
      for (const [v, cost] of edges[u])
        costs[v] = Math.min(costs[v], costs[u] + cost);
    }
    for (let end = 0; end < 36; end++) {
      const result = graph.route(point(start), point(end));
      if (!Number.isFinite(costs[end]))
        assert.equal(result.status, "unreachable", `${start}->${end}`);
      else {
        assert.equal(result.status, "routed", `${start}->${end}`);
        assert.ok(
          Math.abs(result.seconds - Math.ceil(costs[end])) <= 1,
          `${start}->${end}: ${result.seconds} vs ${costs[end]}`,
        );
      }
    }
  }
});

import { Schedule } from "../src/server/schedule.js";
import { overlayLive } from "../src/server/journeys.js";
test("600 delayed-transfer scenarios preserve timing arithmetic and feasibility", async () => {
  const stop = (id, lat) => ({ id, name: id, lat, lon: -82.34 });
  const event = (i, min) => [
    i,
    15 * 3600 + min * 60,
    15 * 3600 + min * 60,
    0,
    0,
  ];
  const data = {
    schema: 1,
    timezone: "America/New_York",
    source: "test",
    info: { feed_start_date: "20261118", feed_end_date: "20261118" },
    stops: [
      stop("a", 29.64),
      stop("b", 29.65),
      stop("c", 29.6501),
      stop("d", 29.66),
    ],
    routes: { r1: { short: "1" }, r2: { short: "2" }, r3: { short: "3" } },
    trips: [
      {
        id: "one",
        route: "r1",
        service: "daily",
        stops: [event(0, 10), event(1, 20)],
      },
      {
        id: "two",
        route: "r2",
        service: "daily",
        stops: [event(2, 30), event(3, 40)],
      },
      {
        id: "direct",
        route: "r3",
        service: "daily",
        stops: [event(0, 15), event(3, 50)],
      },
    ],
    calendar: [
      {
        service_id: "daily",
        start_date: "20261118",
        end_date: "20261118",
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
  };
  const schedule = new Schedule(data);
  let transferCases = 0;
  for (let i = 0; i < 600; i++) {
    const d1 = (i % 29) - 8,
      d2 = (Math.floor(i / 29) % 29) - 8;
    const predictions = new Map([
      [
        "a",
        [
          {
            RouteId: "1",
            ExternalTripId: "one",
            VehicleId: "v1",
            Timestamp: now,
            ETA: now + (10 + d1) * 60000,
          },
        ],
      ],
      [
        "b",
        [
          {
            RouteId: "1",
            ExternalTripId: "one",
            VehicleId: "v1",
            Timestamp: now,
            ETA: now + (20 + d1) * 60000,
          },
        ],
      ],
      [
        "c",
        [
          {
            RouteId: "2",
            ExternalTripId: "two",
            VehicleId: "v2",
            Timestamp: now,
            ETA: now + (30 + d2) * 60000,
          },
        ],
      ],
      [
        "d",
        [
          {
            RouteId: "2",
            ExternalTripId: "two",
            VehicleId: "v2",
            Timestamp: now,
            ETA: now + (40 + d2) * 60000,
          },
        ],
      ],
    ]);
    const raw = schedule.search(
      data.stops[0],
      data.stops[3],
      {
        mode: "depart_at",
        when: now,
        maxWalk: 5,
        maxTransfers: 1,
        transferBuffer: 5,
      },
      now,
    );
    const r = await overlayLive(
      raw,
      { predictions: async (id) => predictions.get(id) || [] },
      schedule,
      now,
    );
    for (const j of r.journeys) {
      assert.ok(j.leaveAt >= now);
      assert.equal(
        j.leaveAt,
        j.legs[0].departsAt - (j.walkMinutes + j.boardingBufferMinutes) * 60000,
      );
      assert.equal(
        j.destinationAt,
        j.legs.at(-1).arrivesAt + j.finalWalkMinutes * 60000,
      );
      for (const l of j.legs) assert.ok(l.arrivesAt > l.departsAt);
      if (j.connection) {
        transferCases++;
        assert.ok(
          j.legs[1].departsAt - j.legs[0].arrivesAt >=
            j.connection.minimumSeconds * 1000,
          `delays ${d1},${d2}`,
        );
      }
    }
  }
  assert.ok(
    transferCases > 50,
    "the stress test must exercise actual transfer results",
  );
});

test("a recurring trip on a different service date cannot borrow tonight's live ETA", async () => {
  const clock = Date.parse("2026-11-18T23:50:00-05:00"),
    departure = Date.parse("2026-11-19T00:10:00-05:00"),
    arrival = departure + 20 * 60000;
  const leg = {
    tripId: "same-id",
    instance: "20261119:same-id",
    route: "20",
    boarding: a,
    alighting: b,
    scheduledDeparture: departure,
    scheduledArrival: arrival,
    departsAt: departure,
    arrivesAt: arrival,
    timingSource: "scheduled",
  };
  const result = {
    mode: "leave_now",
    requestedTime: clock,
    journeys: [
      {
        id: "next-day",
        legs: [leg],
        walkMinutes: 0,
        finalWalkMinutes: 0,
        transfers: 0,
      },
    ],
  };
  const checked = await overlayLive(
    result,
    {
      predictions: async (id) => [
        {
          RouteId: "20",
          VehicleId: "bus",
          ExternalTripId: "same-id",
          Timestamp: clock,
          ETA: clock + (id === "a" ? 8 : 28) * 60000,
        },
      ],
    },
    {},
    clock,
  );
  assert.equal(checked.journeys[0].timingLabel, "Scheduled");
  assert.equal(checked.journeys[0].departsAt, departure);
});
