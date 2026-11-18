import { test } from "node:test";
import assert from "node:assert/strict";
import { Schedule } from "../src/server/schedule.js";
import { boardingBuffer, buildJourneys } from "../src/server/planner.js";
import { overlayLive } from "../src/server/journeys.js";
const now = Date.parse("2026-11-18T17:59:00Z");
const a = { id: "a", name: "Board", lat: 29.64, lon: -82.34 },
  b = { id: "b", name: "Off", lat: 29.65, lon: -82.34 };
function schedule() {
  const trip = (id, minute) => ({
    id,
    route: "r",
    service: "daily",
    stops: [
      [0, 13 * 3600 + minute * 60, 13 * 3600 + minute * 60, 0, 0],
      [1, 13 * 3600 + (minute + 10) * 60, 13 * 3600 + (minute + 10) * 60, 0, 0],
    ],
  });
  return new Schedule({
    schema: 1,
    timezone: "America/New_York",
    info: { feed_start_date: "20261118", feed_end_date: "20261118" },
    stops: [a, b],
    routes: { r: { short: "20" } },
    trips: [trip("imminent", 0), trip("later", 15)],
    calendar: [
      {
        service_id: "daily",
        start_date: "20261118",
        end_date: "20261118",
        wednesday: "1",
      },
    ],
    exceptions: [],
    transfers: [],
  });
}
test("12:59 search from the boarding stop retains the 1 PM bus", () => {
  const r = schedule().search(a, b, { maxWalk: 5, maxTransfers: 0 }, now);
  assert.equal(r.journeys[0].legs[0].tripId, "imminent");
  assert.equal(r.journeys[0].boardingBufferMinutes, 0);
  assert.equal(r.journeys[0].leaveAt, Date.parse("2026-11-18T18:00:00Z"));
});
test("nearby address with a real walk retains the approach buffer", () => {
  const r = schedule().search(
    { ...a, lat: a.lat - 0.0001 },
    b,
    { maxWalk: 5, maxTransfers: 0 },
    now,
  );
  assert.equal(r.journeys[0].legs[0].tripId, "later");
  assert.equal(r.journeys[0].boardingBufferMinutes, 2);
  assert.equal(boardingBuffer({ meters: 0, walkMinutes: 1 }), 2);
  assert.equal(boardingBuffer({ meters: 5, walkMinutes: 0 }), 2);
});
test("live-only fallback and live-overlay catchability use the same zero at-stop buffer", async () => {
  const pred = (eta) => ({
    RouteId: "20",
    ExternalTripId: "imminent",
    VehicleId: "v",
    Timestamp: now,
    ETA: eta,
  });
  const predictions = new Map([
    ["a", [pred(now + 30000)]],
    ["b", [pred(now + 630000)]],
  ]);
  const direct = buildJourneys(
    [{ ...a, meters: 0, walkMinutes: 0 }],
    [{ ...b, meters: 0, walkMinutes: 0 }],
    predictions,
    now,
  );
  assert.equal(direct.length, 1);
  assert.equal(direct[0].boardingBufferMinutes, 0);
  const s = schedule(),
    r = await overlayLive(
      s.search(a, b, { maxWalk: 5, maxTransfers: 0 }, now),
      { predictions: async (id) => predictions.get(id) || [] },
      s,
      now,
    );
  assert.equal(r.journeys[0].departsAt, now + 30000);
  assert.equal(r.journeys[0].leaveAt, now + 30000);
});

test("Arrive by preserves the imminent bus and departed buses remain excluded", () => {
  const s = schedule();
  const deadline = Date.parse("2026-11-18T18:10:00Z");
  const arrive = s.search(
    a,
    b,
    { mode: "arrive_by", when: deadline, maxWalk: 5, maxTransfers: 0 },
    now,
  );
  assert.equal(arrive.journeys[0].legs[0].tripId, "imminent");
  assert.equal(arrive.journeys[0].leaveAt, Date.parse("2026-11-18T18:00:00Z"));
  const after = s.search(
    a,
    b,
    { maxWalk: 5, maxTransfers: 0 },
    Date.parse("2026-11-18T18:00:01Z"),
  );
  assert.equal(after.journeys[0].legs[0].tripId, "later");
});
