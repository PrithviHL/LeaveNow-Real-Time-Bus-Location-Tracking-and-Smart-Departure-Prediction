// Offline, reproducible real-feed invariants; not a real-world prediction error study.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { Schedule } from "../src/server/schedule.js";
import { distance } from "../src/server/planner.js";
const args = process.argv.slice(2),
  arg = (name) => args[args.indexOf(name) + 1];
const feed = arg("--feed"),
  output = arg("--output");
if (!feed || !output)
  throw new Error(
    "Usage: node scripts/verify-timing.js --feed file --output report.json",
  );
const schedule = Schedule.load(feed),
  date = "20261118",
  now = Date.parse("2026-11-18T19:50:00Z");
const trips = schedule.dayTrips(date).filter((t) => t.stops.length > 3);
assert.ok(trips.length);
let seed = 20261118;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const latencies = [],
  cases = [];
let journeys = 0,
  transfers = 0,
  routedWalks = 0,
  estimatedWalks = 0;
for (let i = 0; i < 120; i++) {
  const t = trips[Math.floor(random() * trips.length)],
    first = Math.floor(random() * (t.stops.length - 2)),
    last = first + 1 + Math.floor(random() * (t.stops.length - first - 1));
  const origin = { ...schedule.stops[t.stops[first][0]] },
    destination = { ...schedule.stops[t.stops[last][0]] };
  if (i % 4 === 0) {
    origin.lat += 0.0003;
    destination.lon += 0.0003;
  }
  const mode = ["leave_now", "depart_at", "arrive_by"][i % 3],
    when =
      mode === "leave_now"
        ? now
        : now + (mode === "depart_at" ? 30 : 150) * 60000;
  const options = {
    mode,
    when,
    maxWalk: [5, 10, 15, 20][i % 4],
    maxTransfers: i % 2,
    transferBuffer: 5,
  };
  const start = performance.now(),
    result = schedule.search(origin, destination, options, now);
  latencies.push(performance.now() - start);
  for (const j of result.journeys) {
    journeys++;
    transfers += j.transfers;
    assert.ok(j.leaveAt >= (mode === "arrive_by" ? now : when));
    assert.equal(
      j.leaveAt,
      j.legs[0].departsAt - (j.walkMinutes + j.boardingBufferMinutes) * 60000,
    );
    assert.equal(
      j.destinationAt,
      j.legs.at(-1).arrivesAt + j.finalWalkMinutes * 60000,
    );
    assert.ok(
      j.walkMinutes <= options.maxWalk && j.finalWalkMinutes <= options.maxWalk,
    );
    if (mode === "arrive_by") assert.ok(j.destinationAt <= when);
    for (const l of j.legs) {
      assert.ok(l.arrivesAt > l.departsAt);
      assert.ok(l.fromSequence < l.toSequence);
    }
    if (j.connection)
      assert.ok(
        j.legs[1].departsAt >=
          j.legs[0].arrivesAt + j.connection.minimumSeconds * 1000,
      );
    for (const walk of [j.boarding, j.alighting, j.connection].filter(
      Boolean,
    )) {
      if (walk.walkSource === "osm") {
        routedWalks++;
        assert.ok(walk.walkPath?.length >= 2);
        assert.ok(walk.walkMinutes >= 0);
        const path = walk.walkPath;
        const straight = distance(
          { lon: path[0][0], lat: path[0][1] },
          { lon: path.at(-1)[0], lat: path.at(-1)[1] },
        );
        assert.ok(walk.meters + 2 >= straight);
        assert.ok(walk.walkMinutes * 60 >= (straight * 60) / 65 - 1);
      } else estimatedWalks++;
    }
  }
  cases.push({
    index: i,
    origin: origin.id,
    destination: destination.id,
    mode,
    maxWalk: options.maxWalk,
    maxTransfers: options.maxTransfers,
    results: result.journeys.length,
  });
}
assert.ok(journeys > 0 && routedWalks > 0);
const sorted = latencies.toSorted((a, b) => a - b),
  hash = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const report = {
  schema: 1,
  seed: 20261118,
  verifiedAt: new Date().toISOString(),
  serviceDate: date,
  clock: now,
  feedSource: schedule.data.source,
  sourceZipSha256: schedule.data.sha256,
  feedSha256: hash(feed),
  walkingGraphSha256: hash(
    new URL("../src/server/walking-data/gainesville.json.gz", import.meta.url),
  ),
  stops: schedule.stops.length,
  trips: schedule.data.trips.length,
  searches: cases.length,
  candidateJourneys: journeys,
  transferJourneys: transfers,
  routedWalks,
  estimatedWalks,
  invariantFailures: 0,
  localLatencyMs: {
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1),
  },
  rssBytes: process.memoryUsage().rss,
  limitations: [
    "No HTTP, UI or live provider calls in this run.",
    "No observed real arrivals or timed human walks: MAE, on-time accuracy and guarantees are not measured.",
    "120 generated searches on one service date do not establish citywide coverage or optimality.",
  ],
  cases,
};
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ...report, cases: undefined }, null, 2));
