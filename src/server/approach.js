import { distance } from "./planner.js";

// Clip the live pattern between the GPS projection and the upcoming boarding stop.
// Provider distance selects the stop interval, preventing shortcuts across loops.
export function busApproach(vehicle, pattern, boarding) {
  if (!pattern?.points?.length || !Number.isFinite(vehicle.patternDistance))
    return null;
  const target = pattern.stops.find(
    (s) =>
      s.id === String(boarding.code || boarding.id) &&
      s.distance >= vehicle.patternDistance,
  );
  if (!target) return null;
  const before = pattern.stops
    .filter(
      (s) =>
        s.sequence <= target.sequence && s.distance <= vehicle.patternDistance,
    )
    .at(-1);
  const after = pattern.stops.find(
    (s) =>
      s.sequence <= target.sequence && s.distance >= vehicle.patternDistance,
  );
  if (!after) return null;
  const points = pattern.points.filter((p) => p.sequence <= target.sequence);
  const start = before?.sequence ?? points[0]?.sequence;
  const end = after.sequence;
  let best = null;
  const cos = Math.cos((vehicle.lat * Math.PI) / 180);
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i],
      b = points[i + 1];
    if (a.sequence < start || b.sequence > end) continue;
    const dx = (b.lon - a.lon) * cos,
      dy = b.lat - a.lat;
    const length = dx * dx + dy * dy;
    const t = length
      ? Math.max(
          0,
          Math.min(
            1,
            ((vehicle.lon - a.lon) * cos * dx + (vehicle.lat - a.lat) * dy) /
              length,
          ),
        )
      : 0;
    const projection = {
      lon: a.lon + t * (b.lon - a.lon),
      lat: a.lat + t * (b.lat - a.lat),
    };
    const gap = distance(vehicle, projection);
    if (!best || gap < best.gap) best = { i, projection, gap };
  }
  // No confident geometry means no line; do not invent a direct bus route.
  if (!best || best.gap > 100 || distance(points.at(-1), boarding) > 80)
    return null;
  const path = [
    [vehicle.lon, vehicle.lat],
    [best.projection.lon, best.projection.lat],
    ...points.slice(best.i + 1).map((p) => [p.lon, p.lat]),
    [boarding.lon, boarding.lat],
  ];
  return {
    path,
    source: "bustime-pattern",
    accessMeters: Math.round(best.gap),
    label: "Bus route to boarding stop",
  };
}
