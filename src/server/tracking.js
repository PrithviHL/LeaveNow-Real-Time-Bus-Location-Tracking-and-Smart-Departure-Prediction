import { agencyTime, fresh } from "./planner.js";
import { inServiceArea } from "./gainesville.js";

export async function trackBoarding(client, stop, route, now = Date.now()) {
  const [predictions, positions] = await Promise.allSettled([
    client.predictions(stop.code || stop.id),
    client.vehicles(),
  ]);
  const vehicles = positions.status === "fulfilled" ? positions.value : [];
  const arrivals = predictions.status === "fulfilled" ? predictions.value : [];
  const buses = new Map();
  for (const p of arrivals) {
    const arrivalAt = agencyTime(p.ETA);
    if (
      String(p.RouteId) !== route ||
      !p.VehicleId ||
      !fresh(p, now) ||
      !Number.isFinite(arrivalAt) ||
      arrivalAt < now - 30000
    )
      continue;
    const id = String(p.VehicleId);
    const v = vehicles.find(
      (v) =>
        String(v.id) === id &&
        String(v.route) === route &&
        inServiceArea(v) &&
        agencyTime(v.positionTimestamp) >= now - 180000 &&
        agencyTime(v.positionTimestamp) <= now + 60000,
    );
    const bus = {
      id,
      route,
      destination: p.Destination || p.RouteDir || "",
      arrivalAt,
      predictionAt: agencyTime(p.Timestamp),
      position: v
        ? { lat: v.lat, lon: v.lon, updatedAt: agencyTime(v.positionTimestamp) }
        : null,
    };
    if (!buses.has(id) || arrivalAt < buses.get(id).arrivalAt)
      buses.set(id, bus);
  }
  return {
    stop,
    route,
    checkedAt: now,
    buses: [...buses.values()].sort((a, b) => a.arrivalAt - b.arrivalAt),
    partial:
      predictions.status === "rejected" || positions.status === "rejected",
  };
}
