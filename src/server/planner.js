export const WALK_METERS_PER_MINUTE = 80;
export const WALK_DETOUR = 1.25;
export const BOARDING_BUFFER = 2;
export function boardingBuffer(stop) {
  return Number.isFinite(stop?.meters) &&
    stop.meters >= 0 &&
    stop.meters <= 1 &&
    stop.walkMinutes === 0
    ? 0
    : BOARDING_BUFFER;
}
export const MAX_FEED_AGE = 180_000;
export function distance(a, b) {
  const rad = (n) => (n * Math.PI) / 180;
  const dlat = rad(b.lat - a.lat),
    dlon = rad(b.lon - a.lon);
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function point(value) {
  if (
    !value ||
    typeof value.lat !== "number" ||
    typeof value.lon !== "number" ||
    !Number.isFinite(value.lat) ||
    !Number.isFinite(value.lon) ||
    Math.abs(value.lat) > 90 ||
    Math.abs(value.lon) > 180
  )
    throw new Error(
      "Choose a valid location on the map, a stop, or your current location.",
    );
  return { lat: value.lat, lon: value.lon };
}
export function normalizeStop(s) {
  if (!s || typeof s !== "object") return null;
  const id = String(s.StopId ?? s.StopID ?? s.stopId ?? "");
  const lat = Number(s.StopLat ?? s.Lat),
    lon = Number(s.StopLon ?? s.Lon);
  if (
    !id ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  )
    return null;
  return { id, name: String(s.StopName || `Stop ${id}`), lat, lon };
}
export function nearby(stops, location, limit = 6, radius = 1000) {
  return stops
    .map((s) => ({
      ...s,
      meters: Math.round(distance(location, s)),
      walkMinutes: Math.ceil(
        (distance(location, s) * WALK_DETOUR) / WALK_METERS_PER_MINUTE,
      ),
    }))
    .filter((s) => s.meters <= radius)
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit);
}
const zoneParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
export function agencyTime(text) {
  if (
    typeof text === "number" ||
    (typeof text === "string" && /^\d{13}$/.test(text))
  ) {
    const value = Number(text);
    return Number.isFinite(value) &&
      value >= 1_000_000_000_000 &&
      value <= 4_000_000_000_000
      ? value
      : NaN;
  }
  if (typeof text !== "string") return NaN;
  const compact = text.match(
    /^(\d{4})(\d{2})(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (compact) {
    const hour = Number(compact[4]);
    if (hour > 23) return NaN;
    return agencyTime(
      `${compact[2]}/${compact[3]}/${compact[1]} ${hour % 12 || 12}:${compact[5]}:${compact[6] || "00"} ${hour >= 12 ? "PM" : "AM"}`,
    );
  }
  const m = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/i,
  );
  if (
    !m ||
    +m[1] < 1 ||
    +m[1] > 12 ||
    +m[2] < 1 ||
    +m[2] > 31 ||
    +m[4] < 1 ||
    +m[4] > 12 ||
    +m[5] > 59 ||
    +m[6] > 59
  )
    return NaN;
  const hour = (+m[4] % 12) + (m[7].toUpperCase() === "PM" ? 12 : 0);
  const local = Date.UTC(+m[3], +m[1] - 1, +m[2], hour, +m[5], +m[6]);
  let utc = local;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(
      zoneParts.formatToParts(new Date(utc)).map((p) => [p.type, p.value]),
    );
    const represented = Date.UTC(
      +parts.year,
      +parts.month - 1,
      +parts.day,
      +parts.hour,
      +parts.minute,
      +parts.second,
    );
    utc = local - (represented - utc);
  }
  const verified = Object.fromEntries(
    zoneParts
      .formatToParts(new Date(utc))
      .map((part) => [part.type, part.value]),
  );
  if (
    +verified.year !== +m[3] ||
    +verified.month !== +m[1] ||
    +verified.day !== +m[2] ||
    +verified.hour !== hour ||
    +verified.minute !== +m[5] ||
    +verified.second !== +m[6]
  )
    return NaN;
  return utc;
}
export function tripKey(p) {
  if (!p || p.RouteId === undefined || p.RouteId === null) return null;
  const external = p.ExternalTripId;
  const id = external && String(external) !== "0" ? external : p.TripId;
  return id && String(id) !== "0" ? `${p.RouteId}:${id}` : null;
}
export function fresh(p, now) {
  const timestamp = agencyTime(p.Timestamp);
  return (
    Number.isFinite(timestamp) &&
    now - timestamp <= MAX_FEED_AGE &&
    timestamp <= now + 60_000
  );
}
export function buildJourneys(
  origins,
  destinations,
  predictions,
  now = Date.now(),
) {
  const journeys = [];
  for (const boarding of origins)
    for (const departure of predictions.get(boarding.id) || []) {
      const departsAt = agencyTime(departure.ETA),
        key = tripKey(departure);
      if (
        !key ||
        !fresh(departure, now) ||
        !Number.isFinite(departsAt) ||
        departsAt <
          now + (boarding.walkMinutes + boardingBuffer(boarding)) * 60_000
      )
        continue;
      for (const alighting of destinations) {
        if (alighting.id === boarding.id) continue;
        for (const arrival of predictions.get(alighting.id) || []) {
          const arrivesAt = agencyTime(arrival.ETA);
          if (
            tripKey(arrival) !== key ||
            !fresh(arrival, now) ||
            !Number.isFinite(arrivesAt) ||
            arrivesAt <= departsAt ||
            arrivesAt - departsAt > 3 * 3600_000
          )
            continue;
          // A trip must be from the same service date and agree on the vehicle when provided.
          if (
            Math.abs(
              agencyTime(departure.Timestamp) - agencyTime(arrival.Timestamp),
            ) > MAX_FEED_AGE
          )
            continue;
          if (
            departure.VehicleId &&
            arrival.VehicleId &&
            String(departure.VehicleId) !== String(arrival.VehicleId)
          )
            continue;
          journeys.push({
            id: `${key}:${boarding.id}:${alighting.id}`,
            route: String(departure.RouteId),
            headsign: departure.DestinationSign || `Route ${departure.RouteId}`,
            direction: departure.RouteDir || "",
            vehicleId: departure.VehicleId ? String(departure.VehicleId) : null,
            tripId: key,
            boarding,
            alighting,
            departsAt,
            arrivesAt,
            boardingBufferMinutes: boardingBuffer(boarding),
            walkMinutes: boarding.walkMinutes,
            finalWalkMinutes: alighting.walkMinutes,
            leaveAt:
              departsAt -
              (boarding.walkMinutes + boardingBuffer(boarding)) * 60_000,
            destinationAt: arrivesAt + alighting.walkMinutes * 60_000,
            feedTimestamp: Math.min(
              agencyTime(departure.Timestamp),
              agencyTime(arrival.Timestamp),
            ),
            rideMinutes: Math.ceil((arrivesAt - departsAt) / 60_000),
          });
        }
      }
    }
  // Prefer the closest usable boarding stop, then the next catchable bus.
  journeys.sort(
    (a, b) =>
      a.boarding.meters - b.boarding.meters ||
      a.departsAt - b.departsAt ||
      a.destinationAt - b.destinationAt,
  );
  const seen = new Set();
  return journeys
    .filter((j) => {
      const key = `${j.tripId}:${j.boarding.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}
export async function planTrip(
  client,
  origin,
  destination,
  maxWalk = 15,
  now = Date.now(),
) {
  point(origin);
  point(destination);
  if (![5, 10, 15, 20].includes(maxWalk))
    throw new Error("Walking limit must be 5, 10, 15, or 20 minutes.");
  const stops = await client.stops();
  const radius = (maxWalk * WALK_METERS_PER_MINUTE) / WALK_DETOUR;
  const origins = nearby(stops, origin, 6, radius),
    destinations = nearby(stops, destination, 6, radius);
  const ids = [...new Set([...origins, ...destinations].map((s) => s.id))];
  const predictions = new Map();
  let failedStops = 0;
  // Keep at most three upstream requests in flight.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, ids.length) }, async () => {
      while (cursor < ids.length) {
        const id = ids[cursor++];
        try {
          predictions.set(id, await client.predictions(id));
        } catch {
          failedStops++;
        }
      }
    }),
  );
  if (ids.length && failedStops === ids.length)
    throw new Error(
      "RTS is not returning predictions right now. Try again shortly.",
    );
  const departures = origins
    .flatMap((stop) =>
      (predictions.get(stop.id) || [])
        .filter((p) => fresh(p, now) && agencyTime(p.ETA) >= now)
        .map((p) => ({
          stop,
          route: String(p.RouteId),
          headsign: p.DestinationSign,
          departsAt: agencyTime(p.ETA),
          catchable:
            agencyTime(p.ETA) >=
            now + (stop.walkMinutes + boardingBuffer(stop)) * 60_000,
        })),
    )
    .sort((a, b) => a.stop.meters - b.stop.meters || a.departsAt - b.departsAt)
    .slice(0, 6);
  const journeys = buildJourneys(origins, destinations, predictions, now);
  let reason = null;
  if (!origins.length)
    reason =
      "No RTS stops within your walking limit of the starting location. Try a nearby stop or increase the walking limit. RTS serves the Gainesville, Florida area.";
  else if (!destinations.length)
    reason =
      "No RTS stops within your walking limit of the destination. Choose another location or increase the walking limit.";
  else if (distance(origin, destination) < 150)
    reason =
      "These locations are very close together. Walking may be easier than taking a bus.";
  else if (!journeys.length)
    reason =
      "No catchable direct bus was verified between these locations in the current live prediction window. A transfer or a later service may be needed. Try nearby stops or check the RTS trip planner.";
  return {
    origin,
    destination,
    nearestStop: origins[0] || null,
    originStops: origins,
    destinationStops: destinations,
    journeys: reason && distance(origin, destination) < 150 ? [] : journeys,
    departures,
    reason,
    partial: failedStops > 0,
    checkedAt: now,
    walking: {
      speedMetersPerMinute: WALK_METERS_PER_MINUTE,
      detourFactor: WALK_DETOUR,
      bufferMinutes: BOARDING_BUFFER,
      atStopBufferMinutes: 0,
      atStopThresholdMeters: 1,
      approximate: true,
    },
    scope:
      "Direct buses; up to six nearby stops at each end. Live prediction window only.",
  };
}
