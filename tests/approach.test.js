import { test } from "node:test";
import assert from "node:assert/strict";
import { busApproach } from "../src/server/approach.js";
const points = [
  { sequence: 1, lat: 29.64, lon: -82.34 },
  { sequence: 2, lat: 29.641, lon: -82.34 },
  { sequence: 3, lat: 29.641, lon: -82.338 },
  { sequence: 4, lat: 29.642, lon: -82.338 },
];
const pattern = {
  points,
  stops: [
    { id: "a", sequence: 1, distance: 0 },
    { id: "b", sequence: 3, distance: 300 },
    { id: "c", sequence: 4, distance: 400 },
  ],
};
const v = { lat: 29.6405, lon: -82.34, patternDistance: 50 };
const boarding = { id: "b", lat: 29.641, lon: -82.338 };
test("bus approach preserves bends and ends at boarding rather than final destination", () => {
  const result = busApproach(v, pattern, boarding);
  assert.deepEqual(result.path[0], [v.lon, v.lat]);
  assert.ok(result.path.some((p) => p[0] === -82.34 && p[1] === 29.641));
  assert.deepEqual(result.path.at(-1), [boarding.lon, boarding.lat]);
  assert.ok(!result.path.some((p) => p[1] === 29.642));
});
test("missing geometry, passed stops and large GPS offsets never draw a bus shortcut", () => {
  assert.equal(busApproach(v, {}, boarding), null);
  assert.equal(
    busApproach({ ...v, patternDistance: 350 }, pattern, boarding),
    null,
  );
  assert.equal(busApproach({ ...v, lon: -82.35 }, pattern, boarding), null);
});
