import { test } from "node:test";
import assert from "node:assert/strict";
import { WalkingGraph } from "../src/server/walking.js";
import { Schedule } from "../src/server/schedule.js";
const a = { lon: 0, lat: 0 },
  b = { lon: 0, lat: 0.001 };
function graph(overrides = {}) {
  return new WalkingGraph({
    schema: 1,
    bbox: [-1, -1, 1, 1],
    nodes: [
      [0, 0, 0],
      [0.001, 0, 0],
      [0.001, 0.001, 0],
      [0, 0.001, 0],
    ],
    segments: [
      [0, 1, 111.2, 0, true],
      [1, 2, 111.2, 0, true],
      [2, 3, 111.2, 0, true],
    ],
    ...overrides,
  });
}
test("walking follows the mapped detour instead of a straight line", () => {
  const route = graph().route(a, b);
  assert.equal(route.status, "routed");
  assert.ok(route.meters > 330);
  assert.ok(route.seconds > 300);
  assert.ok(route.path.some((p) => p[0] === 0.001));
});
test("projection routes a fraction of an edge and preserves one-way foot restrictions", () => {
  const g = graph({
    nodes: [
      [0, 0, 0],
      [0.001, 0, 0],
    ],
    segments: [[0, 1, 111.2, 0, false]],
  });
  const start = { lon: 0.00025, lat: 0 },
    end = { lon: 0.00075, lat: 0 };
  assert.ok(g.route(start, end).meters < 60);
  assert.equal(g.route(end, start).status, "unreachable");
});
test("disconnected mapped networks are rejected, missing nearby paths are reported separately", () => {
  const g = graph({
    segments: [
      [0, 1, 111.2, 0, true],
      [2, 3, 111.2, 0, true],
    ],
  });
  assert.equal(g.route(a, b).status, "unreachable");
  assert.equal(g.route(a, { lon: 0.5, lat: 0.5 }).status, "unavailable");
});
test("crossing allowances and steps affect walking time; repeated queries safely reuse buffers", () => {
  const g = graph({
    nodes: [
      [0, 0, 0],
      [0.001, 0, 15],
      [0.002, 0, 0],
    ],
    segments: [
      [0, 1, 111.2, 30, true],
      [1, 2, 111.2, 0, true],
    ],
  });
  const route = g.route(a, { lon: 0.002, lat: 0 });
  assert.ok(route.seconds >= (222.4 * 60) / 65 + 44);
  assert.equal(g.route({ lon: 0.002, lat: 0 }, a).status, "routed");
  assert.equal(g.route(a, { lon: 0.002, lat: 0 }).seconds, route.seconds);
});
function schedule(walking) {
  return new Schedule(
    {
      schema: 1,
      timezone: "America/New_York",
      info: {},
      stops: [
        { id: "board", name: "Board", ...b },
        { id: "off", name: "Off", lon: 0.002, lat: 0.001 },
      ],
      calendar: [],
      exceptions: [{ service_id: "s", date: "20261118", exception_type: "1" }],
      transfers: [],
      routes: { r: { short: "1", name: "Test" } },
      trips: [
        {
          id: "too-early",
          route: "r",
          service: "s",
          stops: [
            [0, 8 * 3600 + 5 * 60, 8 * 3600 + 5 * 60, 0, 0],
            [1, 8 * 3600 + 15 * 60, 8 * 3600 + 15 * 60, 0, 0],
          ],
        },
        {
          id: "catchable",
          route: "r",
          service: "s",
          stops: [
            [0, 8 * 3600 + 12 * 60, 8 * 3600 + 12 * 60, 0, 0],
            [1, 8 * 3600 + 22 * 60, 8 * 3600 + 22 * 60, 0, 0],
          ],
        },
      ],
    },
    { walking },
  );
}
test("network walking time excludes a bus that only the old straight-line estimate could catch", () => {
  const s = schedule(graph()),
    now = Date.parse("2026-11-18T13:00:00Z");
  const r = s.search(
    a,
    { lon: 0.002, lat: 0.001 },
    { maxWalk: 10, maxTransfers: 0 },
    now,
  );
  assert.ok(r.journeys.length);
  assert.ok(r.journeys.every((j) => j.legs[0].tripId === "catchable"));
  assert.equal(r.journeys[0].boarding.walkSource, "osm");
  assert.ok(r.journeys[0].walkMinutes >= 6);
  assert.equal(
    s.accessStops(a, 2).some((s) => s.id === "board"),
    false,
  );
});
