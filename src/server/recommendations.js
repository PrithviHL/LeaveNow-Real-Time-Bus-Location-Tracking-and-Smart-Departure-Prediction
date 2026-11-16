// Favor simple trips, while keeping transfers that provide a meaningful time saving.
const MINUTE = 60000;
export function recommendJourneys(journeys, mode, limit = 3) {
  const score = (j) =>
    (mode === "arrive_by" ? -j.leaveAt : j.destinationAt) +
    (j.transfers || 0) * 8 * MINUTE +
    ((j.walkMinutes || 0) + (j.finalWalkMinutes || 0)) * MINUTE;
  const ranked = [...journeys].sort(
    (a, b) =>
      score(a) - score(b) ||
      (a.transfers || 0) - (b.transfers || 0) ||
      a.destinationAt - b.destinationAt ||
      b.leaveAt - a.leaveAt,
  );
  const direct = ranked.filter((j) => !j.transfers);
  const useful = ranked.filter(
    (j) =>
      !j.transfers ||
      !direct.some(
        (d) =>
          d.destinationAt <= j.destinationAt &&
          d.leaveAt >= j.leaveAt &&
          (d.walkMinutes || 0) + (d.finalWalkMinutes || 0) <=
            (j.walkMinutes || 0) + (j.finalWalkMinutes || 0) + 3,
      ),
  );
  const seen = new Set();
  return useful
    .filter((j) => {
      // Transfer variants on the same first trip are alternatives to the same boarding.
      const first = j.legs?.[0];
      const key =
        first?.instance ||
        `${first?.tripId || j.route}:${j.departsAt}:${j.boarding?.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
