import { test } from "node:test";
import assert from "node:assert/strict";
import { trackBoarding, patternServesJourney } from "../src/server/tracking.js";
const now = Date.parse("2026-11-16T18:00:00Z");
const stop = { id: "473", name: "Reitz Union", lat: 29.64514, lon: -82.346983 };
const end = { id: "1", name: "Downtown", lat: 29.645567, lon: -82.322697 };
const patterns = [
  {
    id: "out",
    stops: [
      { id: "473", distance: 100 },
      { id: "1", distance: 500 },
    ],
  },
  {
    id: "in",
    stops: [
      { id: "1", distance: 100 },
      { id: "473", distance: 500 },
    ],
  },
];
const vehicle = (id, patternId = "out", patternDistance = 50) => ({
  id,
  route: "17",
  lat: 29.64,
  lon: -82.34,
  positionTimestamp: now,
  patternId,
  patternDistance,
});
const pred = (id, trip = "trip", eta = now + 300000) => ({
  VehicleId: id,
  RouteId: "17",
  TripId: trip,
  Timestamp: now,
  ETA: eta,
});
const client = (vehicles, arrivals = [], alight = []) => ({
  vehicles: async () => vehicles,
  patterns: async () => patterns,
  predictions: async (id) => (id === "473" ? arrivals : alight),
});
test("same-route opposite-direction, passed-stop and unverified GPS vehicles are excluded", async () => {
  const c = client([
    vehicle("out"),
    vehicle("in", "in"),
    vehicle("passed", "out", 200),
    { ...vehicle("unknown"), patternId: "" },
  ]);
  const r = await trackBoarding(c, stop, "17", now, end);
  assert.deepEqual(
    r.buses.map((b) => b.id),
    ["out"],
  );
  assert.equal(r.buses[0].arrivalAt, null);
  assert.equal(r.buses[0].directionVerified, true);
});
test("boarding and alighting predictions must belong to the same vehicle and live trip in time order", async () => {
  const c = client(
    [],
    [pred("yes"), pred("reverse"), pred("otherTrip"), pred("stale")],
    [
      pred("yes", "trip", now + 600000),
      pred("reverse", "trip", now + 100000),
      pred("otherTrip", "different", now + 600000),
      { ...pred("stale", "trip", now + 600000), Timestamp: now - 600000 },
    ],
  );
  const r = await trackBoarding(c, stop, "17", now, end);
  assert.deepEqual(
    r.buses.map((b) => b.id),
    ["yes"],
  );
  assert.equal(r.buses[0].position, null);
});
test("verified pattern adds GPS to a boarding prediction; stale positions are hidden", async () => {
  const c = client([vehicle("1")], [pred("1")]);
  let r = await trackBoarding(c, stop, "17", now, end);
  assert.ok(r.buses[0].position);
  assert.equal(r.buses[0].arrivalAt, now + 300000);
  c.vehicles = async () => [
    { ...vehicle("1"), positionTimestamp: now - 600000 },
  ];
  c.predictions = async (id) => [
    pred("1", "trip", id === "473" ? now + 300000 : now + 600000),
  ];
  r = await trackBoarding(c, stop, "17", now, end);
  assert.equal(r.buses[0].position, null);
});
test("unknown direction and provider failures do not fall back to route-only buses", async () => {
  const c = client([vehicle("1")]);
  c.patterns = async () => {
    throw Error("unavailable");
  };
  const r = await trackBoarding(c, stop, "17", now, end);
  assert.deepEqual(r.buses, []);
  assert.equal(r.partial, true);
  assert.deepEqual((await trackBoarding(c, stop, "17", now)).buses, []);
});
test("loop patterns use the upcoming occurrence of a boarding stop", () => {
  const loop = [
    {
      id: "loop",
      stops: [
        { id: "473", distance: 100 },
        { id: "1", distance: 200 },
        { id: "473", distance: 600 },
        { id: "1", distance: 900 },
      ],
    },
  ];
  assert.equal(
    patternServesJourney(vehicle("1", "loop", 300), loop, stop, end),
    true,
  );
  assert.equal(
    patternServesJourney(vehicle("1", "loop", 700), loop, stop, end),
    false,
  );
});
test("tracking endpoint requires destination context", async () => {
  const { default: http } = await import("node:http");
  const { handler } = await import("../src/server/app.js");
  const schedule = {
    stops: [stop, end],
    data: { routes: { r: { short: "17" } } },
  };
  const server = http.createServer(handler(client([]), { schedule }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const query of [
      "stop=473&route=17",
      "stop=473&alight=bad&route=17",
      "stop=473&alight=1&route=bad",
    ])
      assert.equal((await fetch(base + "/api/tracking?" + query)).status, 400);
    assert.equal(
      (await fetch(base + "/api/tracking?stop=473&alight=1&route=17")).status,
      200,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("selected trip never substitutes another same-route vehicle or prediction", async () => {
  const c = client(
    [
      { ...vehicle("right"), tripId: "selected" },
      { ...vehicle("wrong"), tripId: "other" },
      vehicle("unknown"),
    ],
    [{ ...pred("wrong", "other"), ExternalTripId: "other" }],
  );
  const result = await trackBoarding(c, stop, "17", now, end, {
    id: "selected",
  });
  assert.deepEqual(
    result.buses.map((b) => b.id),
    ["right"],
  );
  assert.equal(result.buses[0].tripId, "selected");
  const future = await trackBoarding(c, stop, "17", now, end, {
    id: "selected",
    date: "20261117",
  });
  assert.deepEqual(future.buses, []);
});

test("exact-trip predictions can show ETA while unrelated GPS stays hidden", async () => {
  const c = client(
    [{ ...vehicle("same-bus"), tripId: "other" }],
    [{ ...pred("same-bus", "selected"), ExternalTripId: "selected" }],
    [
      {
        ...pred("same-bus", "selected", now + 900000),
        ExternalTripId: "selected",
      },
    ],
  );
  const result = await trackBoarding(c, stop, "17", now, end, {
    id: "selected",
  });
  assert.equal(result.buses.length, 1);
  assert.equal(result.buses[0].position, null);
  assert.equal(result.buses[0].arrivalAt, now + 300000);
});
