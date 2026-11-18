import { agencyTime, fresh } from "./planner.js";

// Resolve duplicate observations by generation time, never by earliest ETA.
// Contradictory observations at the same generation time fail closed.
export function latestPredictions(records, now) {
  const groups = new Map();
  for (const p of records) {
    if (!fresh(p, now)) continue;
    const key = JSON.stringify([
      String(p.RouteId),
      String(p.ExternalTripId || p.TripId || p.NativeTripId || ""),
      String(p.VehicleId || ""),
      String(p.StopId || ""),
    ]);
    const timestamp = agencyTime(p.Timestamp),
      old = groups.get(key);
    if (!old || timestamp > old.timestamp)
      groups.set(key, { timestamp, records: [p] });
    else if (timestamp === old.timestamp) old.records.push(p);
  }
  return [...groups.values()].flatMap((g) => {
    const etas = g.records.map((p) => agencyTime(p.ETA));
    if (
      etas.some(
        (t) => !Number.isFinite(t) || t < now || t > now + 3 * 3600000,
      ) ||
      new Set(etas).size !== 1
    )
      return [];
    return [g.records[0]];
  });
}

export function predictionAtStop(p, id) {
  const code = (value) =>
    /^\d+$/.test(String(value))
      ? String(value).replace(/^0+(?=\d)/, "")
      : String(value);
  return p.StopId === undefined || code(p.StopId) === code(id);
}
