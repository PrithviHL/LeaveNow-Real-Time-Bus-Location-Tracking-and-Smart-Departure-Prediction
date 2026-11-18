import { agencyTime, fresh } from "./planner.js";
import { serviceDate } from "./schedule.js";
import { busApproach } from "./approach.js";
import { inServiceArea } from "./gainesville.js";

export function patternServesJourney(vehicle, patterns, boarding, alighting) {
  if (!Number.isFinite(vehicle.patternDistance) || vehicle.patternDistance < 0)
    return false;
  const pattern = patterns.find((p) => p.id === vehicle.patternId);
  if (!pattern) return false;
  const stops = pattern.stops;
  return stops.some(
    (a, i) =>
      a.id === String(boarding.code || boarding.id) &&
      Number.isFinite(a.distance) &&
      vehicle.patternDistance <= a.distance &&
      stops
        .slice(i + 1)
        .some(
          (b) =>
            b.id === String(alighting.code || alighting.id) &&
            Number.isFinite(b.distance) &&
            b.distance > a.distance,
        ),
  );
}

export async function trackBoarding(
  client,
  stop,
  route,
  now = Date.now(),
  alighting = null,
  selectedTrip = null,
) {
  if (
    !alighting ||
    (selectedTrip?.date && selectedTrip.date !== serviceDate(now))
  )
    return { stop, route, checkedAt: now, buses: [], partial: false };
  const results = await Promise.allSettled([
    client.predictions(stop.code || stop.id),
    client.vehicles(route),
    client.predictions(alighting.code || alighting.id),
    client.patterns(route),
  ]);
  const [arrivals, vehicles, departures, patterns] = results.map((r) =>
    r.status === "fulfilled" ? r.value : [],
  );
  if (selectedTrip) {
    for (const v of vehicles)
      v.tripId = client.resolveVehicleTrip?.(v, patterns) || v.tripId || "";
    for (const p of [...arrivals, ...departures]) {
      if (p.ExternalTripId) continue;
      const v = vehicles.find(
        (v) =>
          String(v.id) === String(p.VehicleId) &&
          v.tripId &&
          ((p.NativeTripId && p.NativeTripId === v.nativeTripId) ||
            (p.OriginalTripId && p.OriginalTripId === v.originalTripId)),
      );
      if (v) p.ExternalTripId = v.tripId;
    }
  }
  const validPrediction = (p) =>
    (!selectedTrip || String(p.ExternalTripId || "") === selectedTrip.id) &&
    String(p.RouteId) === route &&
    p.VehicleId &&
    fresh(p, now) &&
    Number.isFinite(agencyTime(p.ETA)) &&
    agencyTime(p.ETA) >= now;
  const validVehicle = (v) =>
    Number.isFinite(agencyTime(v.positionTimestamp)) &&
    (!selectedTrip ||
      (String(v.tripId || "") === selectedTrip.id &&
        (!selectedTrip.date ||
          (v.serviceDate || serviceDate(agencyTime(v.positionTimestamp))) ===
            selectedTrip.date))) &&
    String(v.route) === route &&
    v.id &&
    inServiceArea(v) &&
    Number.isFinite(agencyTime(v.positionTimestamp)) &&
    agencyTime(v.positionTimestamp) >= now - 180000 &&
    agencyTime(v.positionTimestamp) <= now + 60000;
  const tripId = (p) => String(p.ExternalTripId || p.TripId || "");
  const upcoming = vehicles.filter(validVehicle);
  const buses = new Map();
  for (const p of arrivals.filter(validPrediction)) {
    const id = String(p.VehicleId),
      v = upcoming.find((v) => String(v.id) === id);
    const through = departures.some(
      (q) =>
        validPrediction(q) &&
        String(q.VehicleId) === id &&
        tripId(p) &&
        tripId(q) === tripId(p) &&
        agencyTime(q.ETA) > agencyTime(p.ETA),
    );
    if (!through && !(v && patternServesJourney(v, patterns, stop, alighting)))
      continue;
    const bus = {
      id,
      route,
      destination: p.Destination || p.RouteDir || "",
      arrivalAt: agencyTime(p.ETA),
      predictionAt: agencyTime(p.Timestamp),
      tripId: selectedTrip?.id || null,
      directionVerified: true,
      position: v
        ? { lat: v.lat, lon: v.lon, updatedAt: agencyTime(v.positionTimestamp) }
        : null,
    };
    if (!buses.has(id) || bus.arrivalAt < buses.get(id).arrivalAt)
      buses.set(id, bus);
  }
  for (const v of upcoming) {
    if (
      buses.has(String(v.id)) ||
      !patternServesJourney(v, patterns, stop, alighting)
    )
      continue;
    buses.set(String(v.id), {
      id: String(v.id),
      route,
      destination: v.label || alighting.name,
      arrivalAt: null,
      predictionAt: null,
      tripId: selectedTrip?.id || null,
      directionVerified: true,
      position: {
        lat: v.lat,
        lon: v.lon,
        updatedAt: agencyTime(v.positionTimestamp),
      },
    });
  }
  for (const bus of buses.values()) {
    const vehicle = upcoming.find((v) => String(v.id) === bus.id);
    bus.approachGeometry =
      vehicle && patternServesJourney(vehicle, patterns, stop, alighting)
        ? busApproach(
            vehicle,
            patterns.find((p) => p.id === vehicle.patternId),
            stop,
          )
        : null;
  }
  return {
    stop,
    alighting,
    route,
    checkedAt: now,
    tripId: selectedTrip?.id || null,
    buses: [...buses.values()].sort(
      (a, b) => (a.arrivalAt ?? Infinity) - (b.arrivalAt ?? Infinity),
    ),
    partial: results.some((r) => r.status === "rejected"),
  };
}
