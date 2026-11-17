export const CITY = "Gainesville, FL";
export const API_BASE = "https://riderts.app/bustime/api/v3/";
export function inServiceArea(point) {
  return (
    Number.isFinite(point?.lat) &&
    Number.isFinite(point?.lon) &&
    point.lat >= 29.35 &&
    point.lat <= 30.1 &&
    point.lon >= -82.9 &&
    point.lon <= -81.9
  );
}
export function validateGainesvilleFeed(schedule) {
  if (!schedule?.stops?.length || !schedule.stops.every(inServiceArea))
    throw new Error(
      "A valid Gainesville RTS timetable is required. Run npm run gtfs:import; only Gainesville feeds are supported.",
    );
}
