import { test } from "node:test";
import assert from "node:assert/strict";
import { Schedule } from "../src/server/schedule.js";
function fixture() {
  return new Schedule({
    schema: 1,
    timezone: "America/New_York",
    stops: [],
    calendar: [],
    exceptions: [],
    transfers: [],
    routes: {},
    shapes: {
      loop: [
        [0, 0, 0],
        [1, 0, 10],
        [1, 1, 20],
        [0, 0, 30],
      ],
    },
    trips: [
      {
        id: "t",
        shape: "loop",
        stops: [
          [0, 0, 0, 0, 0, 5],
          [0, 0, 0, 0, 0, 25],
        ],
      },
    ],
  });
}
test("route clipping follows ordered shape distances through a loop and interpolates endpoints", () => {
  const geometry = fixture().routeGeometry({
    tripId: "t",
    fromSequence: 0,
    toSequence: 1,
  });
  assert.deepEqual(geometry.path, [
    [0.5, 0],
    [1, 0],
    [1, 1],
    [0.5, 0.5],
  ]);
});
test("missing or reversed geometry is omitted instead of inventing a straight bus line", () => {
  const s = fixture();
  assert.equal(
    s.routeGeometry({ tripId: "missing", fromSequence: 0, toSequence: 1 }),
    null,
  );
  assert.equal(
    s.routeGeometry({ tripId: "t", fromSequence: 1, toSequence: 0 }),
    null,
  );
  s.data.shapes.loop[1][2] = null;
  assert.equal(
    s.routeGeometry({ tripId: "t", fromSequence: 0, toSequence: 1 }),
    null,
  );
});
