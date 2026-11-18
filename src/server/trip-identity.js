const code = (value) => String(value).replace(/^0+(?=\d)/, "");

// Exact timetable signature only: never nearest-time, headsign or route-only matching.
export function resolveVehicleTrip(vehicle, patterns, schedule) {
  if (vehicle.tripId) return vehicle.tripId;
  if (
    !schedule?.active ||
    !/^\d{8}$/.test(vehicle.serviceDate || "") ||
    !Number.isFinite(vehicle.scheduledStart)
  )
    return "";
  const pattern = patterns.find((p) => p.id === vehicle.patternId);
  if (!pattern?.stops?.length) return "";
  const ids = pattern.stops.map((s) => code(s.id));
  const candidates = schedule.data.trips.filter(
    (t) =>
      String(schedule.data.routes[t.route]?.short) === String(vehicle.route) &&
      schedule.active(t.service, vehicle.serviceDate) &&
      t.stops[0]?.[2] === vehicle.scheduledStart &&
      t.stops.length === ids.length &&
      t.stops.every(
        (s, i) =>
          code(schedule.stops[s[0]].code || schedule.stops[s[0]].id) === ids[i],
      ),
  );
  return candidates.length === 1 ? candidates[0].id : "";
}
