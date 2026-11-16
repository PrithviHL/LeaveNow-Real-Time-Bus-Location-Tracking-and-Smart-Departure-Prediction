import { test } from "node:test";
import assert from "node:assert/strict";
import { recommendJourneys } from "../src/server/recommendations.js";
const minute = 60000;
const trip = (id, arrival, transfers = 0, leave = 0, walk = 2) => ({
  id,
  legs: [{ instance: id.split(":")[0] }],
  destinationAt: arrival * minute,
  leaveAt: leave * minute,
  departsAt: (leave + 2) * minute,
  transfers,
  walkMinutes: walk,
  finalWalkMinutes: 0,
});
test("direct journey replaces slower transfer variants using the same first bus", () => {
  const direct = trip("37:direct", 20),
    transfer = trip("37:transfer", 25, 1),
    next = trip("38:direct", 35);
  assert.deepEqual(
    recommendJourneys([transfer, direct, next], "leave_now").map((j) => j.id),
    ["37:direct", "38:direct"],
  );
});
test("small transfer savings favor staying on the bus; significant savings are retained", () => {
  const direct = trip("37:direct", 30);
  assert.equal(
    recommendJourneys([trip("37:transfer", 26, 1), direct], "leave_now")[0].id,
    direct.id,
  );
  assert.equal(
    recommendJourneys([trip("37:transfer", 15, 1), direct], "leave_now")[0].id,
    "37:transfer",
  );
});
test("arrival search favors simple choices while preserving latest-departure tradeoffs", () => {
  const direct = trip("37:direct", 50, 0, 20),
    transfer = trip("37:transfer", 50, 1, 24);
  assert.equal(
    recommendJourneys([transfer, direct], "arrive_by")[0].id,
    direct.id,
  );
  assert.equal(
    recommendJourneys([trip("37:fast", 50, 1, 35), direct], "arrive_by")[0].id,
    "37:fast",
  );
});
test("recommendations are capped and distinct departures remain selectable", () => {
  const input = Array.from({ length: 8 }, (_, i) =>
    trip("departure" + i + ":direct", 20 + i),
  );
  assert.equal(recommendJourneys(input, "leave_now").length, 3);
  assert.equal(input.length, 8);
});

test("slower transfers from a different first bus are suppressed when a later-leaving direct bus beats them", () => {
  const direct = trip("inbound:direct", 20, 0, 7, 3),
    transfer = trip("outbound:transfer", 27, 1, 6, 2);
  assert.deepEqual(
    recommendJourneys([transfer, direct], "leave_now").map((j) => j.id),
    [direct.id],
  );
});
