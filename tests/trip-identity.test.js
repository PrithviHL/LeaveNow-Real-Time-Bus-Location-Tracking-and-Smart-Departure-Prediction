import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveVehicleTrip } from "../src/server/trip-identity.js";
const trip = {
  id: "gtfs-trip",
  route: "r",
  service: "weekday",
  stops: [
    [0, 36000, 36000],
    [1, 36600, 36600],
  ],
};
const schedule = {
  data: { routes: { r: { short: "20" } }, trips: [trip] },
  stops: [{ id: "473" }, { id: "171" }],
  active: (_s, d) => d === "20261118",
};
const v = {
  route: "20",
  serviceDate: "20261118",
  scheduledStart: 36000,
  patternId: "p",
};
const patterns = [{ id: "p", stops: [{ id: "0473" }, { id: "0171" }] }];
test("numeric provider trip resolves only through exact unique active timetable signature", () => {
  assert.equal(resolveVehicleTrip(v, patterns, schedule), "gtfs-trip");
  for (const change of [
    { scheduledStart: 36001 },
    { serviceDate: "20261119" },
    { scheduledStart: null },
    { route: "13" },
  ])
    assert.equal(
      resolveVehicleTrip({ ...v, ...change }, patterns, schedule),
      "",
    );
  assert.equal(
    resolveVehicleTrip(
      v,
      [{ id: "p", stops: [{ id: "171" }, { id: "473" }] }],
      schedule,
    ),
    "",
  );
  assert.equal(
    resolveVehicleTrip(v, patterns, {
      ...schedule,
      data: { ...schedule.data, trips: [trip, { ...trip, id: "ambiguous" }] },
    }),
    "",
  );
});
