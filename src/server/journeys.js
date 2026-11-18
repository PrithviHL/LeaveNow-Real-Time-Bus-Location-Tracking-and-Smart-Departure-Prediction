import { serviceDate } from "./schedule.js";
import { latestPredictions, predictionAtStop } from "./predictions.js";
import { patternServesJourney } from "./tracking.js";
import { recommendJourneys } from "./recommendations.js";
import { agencyTime, fresh, planTrip, boardingBuffer } from "./planner.js";

export function routingOptions(raw, now = Date.now()) {
  const mode = raw.mode ?? "leave_now";
  if (!["leave_now", "depart_at", "arrive_by"].includes(mode))
    throw new Error("Choose Leave now, Depart at, or Arrive by.");
  const when = mode === "leave_now" ? now : raw.when;
  if (
    !Number.isFinite(when) ||
    when < now - 60_000 ||
    when > now + 14 * 86400_000
  )
    throw new Error("Choose a time from now through the next 14 days.");
  const maxTransfers = raw.maxTransfers ?? 1,
    transferBuffer = raw.transferBuffer ?? 5;
  if (![0, 1].includes(maxTransfers) || ![3, 5, 8, 10].includes(transferBuffer))
    throw new Error(
      "Choose zero or one transfer and a 3, 5, 8, or 10 minute connection buffer.",
    );
  return {
    mode,
    when,
    maxTransfers,
    transferBuffer,
    maxWalk: raw.maxWalk ?? 15,
  };
}

export async function overlayLive(result, client, schedule, now) {
  const cache = new Map(),
    ids = new Set();
  for (const j of result.journeys.slice(0, 12))
    for (const l of j.legs) {
      if (l.departsAt > now + 90 * 60_000) continue;
      for (const s of [l.boarding, l.alighting])
        if (ids.size < 12) ids.add(s.code || s.id);
    }
  let failed = 0,
    cursor = 0;
  const list = [...ids];
  await Promise.all(
    Array.from({ length: Math.min(3, list.length) }, async () => {
      while (cursor < list.length) {
        const id = list[cursor++];
        try {
          cache.set(id, await client.predictions(id));
        } catch {
          failed++;
        }
      }
    }),
  );
  const assigned = [];
  if (typeof client.resolveVehicleTrip === "function") {
    const routes = [
      ...new Set(
        result.journeys
          .flatMap((j) => j.legs)
          .filter((l) => l.departsAt <= now + 90 * 60000)
          .map((l) => String(l.route)),
      ),
    ];
    await Promise.all(
      routes.map(async (route) => {
        try {
          const [vehicles, patterns] = await Promise.all([
            client.vehicles(route),
            client.patterns(route),
          ]);
          for (const v of vehicles) {
            const timestamp = agencyTime(v.positionTimestamp);
            if (
              !Number.isFinite(timestamp) ||
              timestamp < now - 180000 ||
              timestamp > now + 60000
            )
              continue;
            const tripId = client.resolveVehicleTrip(v, patterns);
            if (tripId)
              assigned.push({
                ...v,
                tripId,
                pattern: patterns.find((p) => p.id === v.patternId),
              });
          }
        } catch {
          failed++;
        }
      }),
    );
    for (const predictions of cache.values())
      for (const p of predictions) {
        if (p.ExternalTripId) continue;
        const v = assigned.find(
          (v) =>
            String(v.id) === String(p.VehicleId) &&
            String(v.route) === String(p.RouteId) &&
            ((p.NativeTripId && p.NativeTripId === v.nativeTripId) ||
              (p.OriginalTripId && p.OriginalTripId === v.originalTripId)),
        );
        if (v) p.ExternalTripId = v.tripId;
      }
  }
  for (const [id, records] of cache)
    cache.set(id, latestPredictions(records, now));
  const prediction = (leg, stop, scheduled) => {
    if (leg.instance && leg.instance.split(":")[0] !== serviceDate(now))
      return null;
    const matches = (cache.get(stop.code || stop.id) || []).filter(
      (p) =>
        predictionAtStop(p, stop.code || stop.id) &&
        String(p.ExternalTripId ?? "") === leg.tripId &&
        String(p.RouteId) === String(leg.route) &&
        fresh(p, now) &&
        Number.isFinite(agencyTime(p.ETA)) &&
        Math.abs(agencyTime(p.ETA) - scheduled) < 2 * 3600000,
    );
    return matches.length === 1 ? matches[0] : null;
  };
  const valid = [];
  for (const original of result.journeys) {
    const j = { ...original, legs: original.legs.map((l) => ({ ...l })) };
    for (const l of j.legs) {
      const matching = assigned.filter(
        (v) =>
          v.tripId === l.tripId &&
          v.pattern &&
          patternServesJourney(v, [v.pattern], l.boarding, l.alighting) &&
          (!l.instance || (v.serviceDate || "") === l.instance.split(":")[0]),
      );
      l.liveVehicleId = matching.length === 1 ? String(matching[0].id) : null;
      const bp = prediction(l, l.boarding, l.scheduledDeparture),
        ap = prediction(l, l.alighting, l.scheduledArrival);
      if (
        bp &&
        ap &&
        bp.VehicleId &&
        ap.VehicleId &&
        String(bp.VehicleId) !== String(ap.VehicleId)
      )
        continue;
      l.boardingPredictionAt = bp ? agencyTime(bp.Timestamp) : null;
      l.alightingPredictionAt = ap ? agencyTime(ap.Timestamp) : null;
      if (bp?.RouteDir) l.direction = bp.RouteDir;
      if (bp) l.departsAt = agencyTime(bp.ETA);
      if (ap) l.arrivesAt = agencyTime(ap.ETA);
      l.timingSource = bp && ap ? "live" : bp || ap ? "mixed" : "scheduled";
      if (bp || ap)
        l.feedTimestamp = Math.min(
          ...[bp, ap].filter(Boolean).map((p) => agencyTime(p.Timestamp)),
        );
    }
    const a = j.legs[0],
      b = j.legs.at(-1);
    j.departsAt = a.departsAt;
    j.arrivesAt = b.arrivesAt;
    j.boardingBufferMinutes = boardingBuffer(j.boarding || a.boarding);
    j.leaveAt = a.departsAt - (j.walkMinutes + j.boardingBufferMinutes) * 60000;
    j.destinationAt = b.arrivesAt + j.finalWalkMinutes * 60000;
    if (j.legs.some((l) => l.arrivesAt <= l.departsAt)) continue;
    const earliest = result.mode === "arrive_by" ? now : result.requestedTime;
    if (j.leaveAt < earliest) continue;
    if (j.connection) {
      if (b.departsAt < a.arrivesAt + j.connection.minimumSeconds * 1000)
        continue;
      j.transferWaitMinutes = Math.floor((b.departsAt - a.arrivesAt) / 60000);
    }
    if (result.mode === "arrive_by" && j.destinationAt > result.requestedTime)
      continue;
    const sources = j.legs.map((l) => l.timingSource);
    j.timingSource = sources.every((s) => s === "live")
      ? "live"
      : sources.every((s) => s === "scheduled")
        ? "scheduled"
        : "mixed";
    j.timingLabel = {
      live: "Live",
      scheduled: "Scheduled",
      mixed: "Live + Scheduled",
    }[j.timingSource];
    j.totalMinutes = Math.ceil((j.destinationAt - j.leaveAt) / 60000);
    valid.push(j);
  }
  result.journeys = recommendJourneys(valid, result.mode, 3);
  result.journeys.forEach((journey, index) => {
    journey.recommendation = index === 0 ? "Recommended" : "Alternative";
  });
  result.partial = failed > 0;
  result.liveStatus = failed
    ? "Some live predictions are unavailable; timetable times remain labelled Scheduled."
    : "Live predictions are used only when the exact GTFS trip matches; other times are Scheduled.";
  if (!result.journeys.length && !result.reason)
    result.reason =
      "No catchable journey remains after checking walking time, live updates, and connection buffers. Try another time or a longer walking allowance.";
  return result;
}

export async function planJourney(
  client,
  schedule,
  origin,
  destination,
  raw,
  now = Date.now(),
) {
  const options = routingOptions(raw, now);
  if (!schedule) {
    if (options.mode !== "leave_now")
      throw new Error(
        "Timetable data is unavailable. Depart at and Arrive by require a valid GTFS feed.",
      );
    const live = await planTrip(
      client,
      origin,
      destination,
      options.maxWalk,
      now,
    );
    for (const j of live.journeys) {
      j.timingSource = "live";
      j.timingLabel = "Live";
      j.transfers = 0;
    }
    live.liveStatus =
      "Timetable unavailable; only live direct departures could be checked.";
    return live;
  }
  const result = schedule.search(origin, destination, options, now);
  return overlayLive(result, client, schedule, now);
}
