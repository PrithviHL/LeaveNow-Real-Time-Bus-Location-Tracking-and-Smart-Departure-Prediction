// Server-side, bounded diagnostic. Never prints credentials, provider URLs or user input.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { BusTimeClient } from "../src/server/bustime.js";
import { agencyTime } from "../src/server/planner.js";
import { patternServesJourney } from "../src/server/tracking.js";

const data = JSON.parse(
  gunzipSync(readFileSync(process.env.GTFS_PATH || "data/gtfs.json.gz")),
);
const stops = new Map(data.stops.map((s) => [String(s.code || s.id), s]));
const client = new BusTimeClient(process.env.GAINESVILLE_RTS_API_KEY, {
  feed: process.env.GAINESVILLE_RTS_FEED || "",
  requestsPerMinute: 10,
});
try {
  // First check the reported route; one alternative is enough for this smoke test.
  for (const route of ["20", "13"]) {
    const [vehicles, patterns] = await Promise.all([
      client.vehicles(route),
      client.patterns(route),
    ]);
    console.log(
      "Tracking diagnostic: " +
        JSON.stringify({
          route,
          vehicles: vehicles.length,
          patterns: patterns.length,
          patternStops: patterns.reduce((n, p) => n + p.stops.length, 0),
          freshVehicles: vehicles.filter(
            (v) =>
              Math.abs(Date.now() - agencyTime(v.positionTimestamp)) < 180000,
          ).length,
          matchedPatterns: vehicles.filter((v) =>
            patterns.some((p) => p.id === v.patternId),
          ).length,
          mappedStops: patterns.reduce(
            (n, p) => n + p.stops.filter((s) => stops.has(s.id)).length,
            0,
          ),
        }),
    );
    for (const vehicle of vehicles) {
      const pattern = patterns.find((p) => p.id === vehicle.patternId);
      const ahead = (pattern?.stops || []).filter(
        (s) => s.distance >= vehicle.patternDistance && stops.has(s.id),
      );
      if (ahead.length < 2) continue;
      const boarding = stops.get(ahead[0].id),
        alighting = stops.get(ahead.at(-1).id);
      if (!patternServesJourney(vehicle, patterns, boarding, alighting))
        continue;
      const response = await fetch(
        "http://127.0.0.1:3001/api/tracking?" +
          new URLSearchParams({
            stop: boarding.id,
            alight: alighting.id,
            route,
          }),
        { signal: AbortSignal.timeout(20000) },
      );
      if (!response.ok) continue;
      const result = await response.json();
      if (!result.buses?.some((b) => b.position)) continue;
      console.log(
        "Verified live tracking example: " +
          JSON.stringify({
            route,
            boarding: { id: boarding.id, name: boarding.name },
            alighting: { id: alighting.id, name: alighting.name },
            buses: result.buses.map((b) => ({
              id: b.id,
              gps: Boolean(b.position),
              eta: Boolean(b.arrivalAt),
            })),
            checkedAt: new Date().toISOString(),
          }),
      );
      process.exit(0);
    }
  }
  console.log("Live tracking example unavailable in this bounded sample.");
} catch {
  console.log(
    "Live tracking diagnostic unavailable; retry during active service.",
  );
}
