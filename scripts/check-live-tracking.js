// Server-side, bounded diagnostic. Never prints credentials, provider URLs or user input.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Schedule } from "../src/server/schedule.js";
import { BusTimeClient } from "../src/server/bustime.js";
import { agencyTime } from "../src/server/planner.js";
import { patternServesJourney } from "../src/server/tracking.js";

const data = JSON.parse(
  gunzipSync(readFileSync(process.env.GTFS_PATH || "data/gtfs.json.gz")),
);
const stops = new Map(data.stops.map((s) => [String(s.code || s.id), s]));
const client = new BusTimeClient(process.env.GAINESVILLE_RTS_API_KEY, {
  feed: process.env.GAINESVILLE_RTS_FEED || "",
  schedule: new Schedule(data),
  requestsPerMinute: 10,
});
let planChecks = 0;
try {
  // First check the reported route; one alternative is enough for this smoke test.
  for (const route of ["20", "13"]) {
    const [vehicles, patterns] = await Promise.all([
      client.vehicles(route),
      client.patterns(route),
    ]);
    for (const v of vehicles) v.tripId = client.resolveVehicleTrip(v, patterns);
    console.log(
      "Tracking diagnostic: " +
        JSON.stringify({
          route,
          vehicles: vehicles.length,
          patterns: patterns.length,
          assignedTrips: vehicles.filter((v) => v.tripId).length,
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
      if (!vehicle.tripId) continue;
      const pattern = patterns.find((p) => p.id === vehicle.patternId);
      const ahead = (pattern?.stops || []).filter(
        (s) => s.distance >= vehicle.patternDistance && stops.has(s.id),
      );
      if (ahead.length < 2) continue;
      const boarding = stops.get(ahead[Math.min(3, ahead.length - 2)].id),
        alighting = stops.get(ahead.at(-1).id);
      if (!patternServesJourney(vehicle, patterns, boarding, alighting))
        continue;
      const response = await fetch(
        "http://127.0.0.1:3001/api/tracking?" +
          new URLSearchParams({
            stop: boarding.id,
            alight: alighting.id,
            route,
            trip: vehicle.tripId,
            date: new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/New_York",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })
              .format(new Date())
              .replaceAll("-", ""),
          }),
        { signal: AbortSignal.timeout(20000) },
      );
      if (!response.ok) continue;
      let result = await response.json();
      if (!result.buses?.some((b) => b.position)) continue;
      if (planChecks >= 2) break;
      planChecks++;
      const plannedResponse = await fetch("http://127.0.0.1:3001/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: boarding,
          destination: alighting,
          mode: "leave_now",
          maxWalk: 5,
          maxTransfers: 0,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!plannedResponse.ok) continue;
      const plan = await plannedResponse.json();
      const index = plan.journeys.findIndex(
        (j) => j.legs?.length === 1 && j.legs[0].liveVehicleId,
      );
      console.log(
        "Full journey tracking check: " +
          JSON.stringify({
            route,
            origin: boarding.name,
            originId: boarding.id,
            destination: alighting.name,
            destinationId: alighting.id,
            matchedOption: index,
            options: plan.journeys.map((j) => ({
              route: j.route,
              departure: j.departsAt,
              trip: j.legs?.[0]?.tripId,
              assigned: j.legs?.[0]?.liveVehicleId,
            })),
          }),
      );
      if (index < 0) continue;
      const leg = plan.journeys[index].legs[0];
      const tracked = await fetch(
        "http://127.0.0.1:3001/api/tracking?" +
          new URLSearchParams({
            stop: leg.boarding.id,
            alight: leg.alighting.id,
            route: leg.route,
            trip: leg.tripId,
            date: leg.instance.split(":")[0],
          }),
        { signal: AbortSignal.timeout(15000) },
      );
      if (!tracked.ok) continue;
      result = await tracked.json();
      if (!result.buses?.some((b) => b.position && b.tripId === leg.tripId))
        continue;
      console.log(
        "Verified live tracking example: " +
          JSON.stringify({
            route,
            journeyOption: index + 1,
            boarding: { id: boarding.id, name: boarding.name },
            alighting: { id: alighting.id, name: alighting.name },
            buses: result.buses.map((b) => ({
              id: b.id,
              gps: Boolean(b.position),
              approachPath: Boolean(b.approachGeometry?.path?.length),
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
