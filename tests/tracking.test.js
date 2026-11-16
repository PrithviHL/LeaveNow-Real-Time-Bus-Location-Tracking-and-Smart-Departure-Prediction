import { test } from "node:test";
import assert from "node:assert/strict";
import { trackBoarding } from "../src/server/tracking.js";
const now = Date.parse("2026-11-16T18:00:00Z");
const stop = { id: "473", name: "Reitz Union", lat: 29.64514, lon: -82.346983 };
const prediction = (id, route = "17") => ({
  VehicleId: id,
  RouteId: route,
  ETA: now + 300000,
  Timestamp: now,
  Destination: "Downtown",
});
const position = (id, route = "17", timestamp = now) => ({
  id,
  route,
  lat: 29.64,
  lon: -82.34,
  positionTimestamp: timestamp,
});
test("tracking joins exact vehicle and route, excludes stale predictions and wrong route buses", async () => {
  const result = await trackBoarding(
    {
      predictions: async () => [
        prediction("1"),
        prediction("2"),
        prediction("3", "20"),
        { ...prediction("4"), Timestamp: now - 600000 },
      ],
      vehicles: async () => [
        position("1"),
        position("2", "20"),
        position("3", "20"),
      ],
    },
    stop,
    "17",
    now,
  );
  assert.deepEqual(
    result.buses.map((b) => b.id),
    ["1", "2"],
  );
  assert.ok(result.buses[0].position);
  assert.equal(result.buses[1].position, null);
  assert.equal(result.buses[0].arrivalAt, now + 300000);
});
test("stale GPS is hidden and provider failure retains arrival without a fabricated marker", async () => {
  const client = {
    predictions: async () => [prediction("1")],
    vehicles: async () => [position("1", "17", now - 600000)],
  };
  assert.equal(
    (await trackBoarding(client, stop, "17", now)).buses[0].position,
    null,
  );
  client.vehicles = async () => {
    throw Error("unavailable");
  };
  const result = await trackBoarding(client, stop, "17", now);
  assert.equal(result.partial, true);
  assert.equal(result.buses[0].position, null);
  client.predictions = async () => {
    throw Error("unavailable");
  };
  assert.deepEqual((await trackBoarding(client, stop, "17", now)).buses, []);
});

test("tracking endpoint validates stop and route and returns only public tracking fields", async () => {
  const { default: http } = await import("node:http");
  const { handler } = await import("../src/server/app.js");
  const client = {
    predictions: async () => [prediction("1")],
    vehicles: async () => [position("1")],
  };
  const schedule = { stops: [stop], data: { routes: { r: { short: "17" } } } };
  const server = http.createServer(handler(client, { schedule }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(
      (await fetch(base + "/api/tracking?stop=bad&route=17")).status,
      400,
    );
    assert.equal(
      (await fetch(base + "/api/tracking?stop=473&route=bad")).status,
      400,
    );
    const response = await fetch(base + "/api/tracking?stop=473&route=17");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).route, "17");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("route GPS is selectable without a stop prediction, with no invented ETA", async () => {
  const result = await trackBoarding(
    {
      predictions: async () => [],
      vehicles: async () => [
        position("1"),
        position("2", "20"),
        position("3", "17", now - 600000),
      ],
    },
    stop,
    "17",
    now,
  );
  assert.equal(result.buses.length, 1);
  assert.equal(result.buses[0].id, "1");
  assert.equal(result.buses[0].arrivalAt, null);
  assert.ok(result.buses[0].position);
});
