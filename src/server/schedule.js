import { recommendJourneys } from "./recommendations.js";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  agencyTime,
  distance,
  nearby,
  WALK_METERS_PER_MINUTE,
  WALK_DETOUR,
  BOARDING_BUFFER,
} from "./planner.js";

const DAY = 86400_000;
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function serviceDate(epoch) {
  return dateFormat.format(new Date(epoch)).replaceAll("-", "");
}
export function shiftDate(date, days) {
  return new Date(
    Date.UTC(
      +date.slice(0, 4),
      +date.slice(4, 6) - 1,
      +date.slice(6, 8) + days,
    ),
  )
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
}
export function serviceAnchor(date) {
  // GTFS service seconds are measured from local noon minus twelve hours, including DST days.
  return (
    agencyTime(
      `${+date.slice(4, 6)}/${+date.slice(6, 8)}/${date.slice(0, 4)} 12:00:00 PM`,
    ) -
    12 * 3600_000
  );
}
function lowerBound(items, value, field) {
  let lo = 0,
    hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid][field] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class Schedule {
  static load(file) {
    return new Schedule(JSON.parse(gunzipSync(readFileSync(file)).toString()));
  }
  constructor(data) {
    if (data.schema !== 1 || data.timezone !== "America/New_York")
      throw new Error("Unsupported timetable artifact");
    this.data = data;
    this.tripIndex = new Map(data.trips.map((t) => [t.id, t]));
    this.stops = data.stops;
    this.index = new Map(this.stops.map((s, i) => [s.id, i]));
    this.calendar = new Map(data.calendar.map((c) => [c.service_id, c]));
    this.exceptions = new Map(
      data.exceptions.map((c) => [
        `${c.service_id}:${c.date}`,
        c.exception_type,
      ]),
    );
    this.transferRules = new Map();
    for (const rule of data.transfers) {
      const key = `${rule.from_stop_id}:${rule.to_stop_id}`;
      const list = this.transferRules.get(key) || [];
      list.push(rule);
      this.transferRules.set(key, list);
    }
    this.maxServiceSecond = data.trips.reduce(
      (max, t) => Math.max(max, t.stops.at(-1)?.[2] || 0),
      0,
    );
    this.footpaths = new Map();
    this.dayCache = new Map();
  }
  metadata() {
    return {
      version: this.data.info.feed_version || "unknown",
      startDate: this.data.info.feed_start_date,
      endDate: this.data.info.feed_end_date,
      importedAt: this.data.importedAt,
      source: this.data.source,
      sha256: this.data.sha256,
    };
  }
  active(service, date) {
    const exception = this.exceptions.get(`${service}:${date}`);
    if (exception) return exception === "1";
    const c = this.calendar.get(service);
    if (!c || date < c.start_date || date > c.end_date) return false;
    const weekday = new Date(
      Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8)),
    ).getUTCDay();
    return (
      c[
        [
          "sunday",
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
        ][weekday]
      ] === "1"
    );
  }
  dayTrips(date) {
    if (this.dayCache.has(date)) return this.dayCache.get(date);
    const anchor = serviceAnchor(date);
    const trips = this.data.trips
      .filter((t) => this.active(t.service, date))
      .map((t) => ({ ...t, key: `${date}:${t.id}`, anchor }));
    if (this.dayCache.size >= 5)
      this.dayCache.delete(this.dayCache.keys().next().value);
    this.dayCache.set(date, trips);
    return trips;
  }
  neighbors(index) {
    if (this.footpaths.has(index)) return this.footpaths.get(index);
    const from = this.stops[index],
      list = [];
    for (let i = 0; i < this.stops.length; i++) {
      const to = this.stops[i];
      if (
        Math.abs(from.lat - to.lat) > 0.004 ||
        Math.abs(from.lon - to.lon) > 0.006
      )
        continue;
      const meters = distance(from, to);
      if (meters <= 400)
        list.push({
          index: i,
          meters: Math.round(meters),
          seconds: Math.ceil(
            ((meters * WALK_DETOUR) / WALK_METERS_PER_MINUTE) * 60,
          ),
        });
    }
    this.footpaths.set(index, list);
    return list;
  }
  transfer(first, second, walk, buffer) {
    const from = this.stops[first.to],
      to = this.stops[second.from];
    const rules = [];
    for (const a of [from.id, from.parent].filter(Boolean))
      for (const b of [to.id, to.parent].filter(Boolean))
        rules.push(...(this.transferRules.get(`${a}:${b}`) || []));
    const matching = rules.filter(
      (r) =>
        (!r.from_route_id || r.from_route_id === first.routeId) &&
        (!r.to_route_id || r.to_route_id === second.routeId) &&
        (!r.from_trip_id || r.from_trip_id === first.tripId) &&
        (!r.to_trip_id || r.to_trip_id === second.tripId),
    );
    const specificity = (r) =>
      8 * [r.from_trip_id, r.to_trip_id].filter(Boolean).length +
      4 * [r.from_route_id, r.to_route_id].filter(Boolean).length +
      (r.from_stop_id === from.id ? 1 : 0) +
      (r.to_stop_id === to.id ? 1 : 0);
    const most = matching.length ? Math.max(...matching.map(specificity)) : -1;
    const specific = matching.filter((r) => specificity(r) === most);
    if (specific.some((r) => ["3", "4", "5"].includes(r.transfer_type)))
      return null;
    const minimum = Math.max(
      0,
      ...specific.map((r) => Number(r.min_transfer_time) || 0),
    );
    return {
      from: { ...from },
      to: { ...to },
      meters: walk.meters,
      walkMinutes: Math.ceil(walk.seconds / 60),
      bufferMinutes: buffer,
      minimumSeconds: Math.max(walk.seconds + buffer * 60, minimum),
    };
  }
  leg(t, i, j) {
    const a = t.stops[i],
      b = t.stops[j],
      r = this.data.routes[t.route];
    return {
      tripId: t.id,
      instance: t.key,
      routeId: t.route,
      route: r.short,
      headsign: t.headsign || r.name,
      direction: t.headsign || r.name,
      fromSequence: i,
      toSequence: j,
      from: a[0],
      to: b[0],
      boarding: { ...this.stops[a[0]] },
      alighting: { ...this.stops[b[0]] },
      departsAt: t.anchor + a[2] * 1000,
      arrivesAt: t.anchor + b[1] * 1000,
      scheduledDeparture: t.anchor + a[2] * 1000,
      scheduledArrival: t.anchor + b[1] * 1000,
      timingSource: "scheduled",
    };
  }
  routeGeometry(leg) {
    const trip = this.tripIndex.get(leg.tripId);
    const shape = this.data.shapes?.[trip?.shape];
    const from = trip?.stops[leg.fromSequence]?.[5];
    const to = trip?.stops[leg.toSequence]?.[5];
    // Distances keep the correct segment even on loops and repeated stops.
    if (
      !shape ||
      shape.length < 2 ||
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      to <= from ||
      shape.some((p) => !Number.isFinite(p[2])) ||
      from < shape[0][2] ||
      to > shape.at(-1)[2]
    )
      return null;
    const interpolate = (d) => {
      const right = lowerBound(shape, d, 2);
      if (right === 0) return shape[0].slice(0, 2);
      const a = shape[right - 1],
        b = shape[right];
      const fraction = b[2] === a[2] ? 0 : (d - a[2]) / (b[2] - a[2]);
      return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
    };
    return {
      source: "RTS GTFS shapes",
      path: [
        interpolate(from),
        ...shape
          .filter((p) => p[2] > from && p[2] < to)
          .map((p) => p.slice(0, 2)),
        interpolate(to),
      ],
    };
  }
  search(
    origin,
    destination,
    {
      mode = "leave_now",
      when,
      maxWalk = 15,
      maxTransfers = 1,
      transferBuffer = 5,
    } = {},
    now = Date.now(),
  ) {
    const reference = mode === "leave_now" ? now : when;
    const start =
      mode === "arrive_by"
        ? Math.max(now, reference - 8 * 3600_000)
        : reference;
    const end = mode === "arrive_by" ? reference : start + 36 * 3600_000;
    const firstDate = shiftDate(serviceDate(start), -1),
      lastDate = serviceDate(end);
    const radius = (maxWalk * WALK_METERS_PER_MINUTE) / WALK_DETOUR;
    const origins = nearby(this.stops, origin, 12, radius),
      destinations = nearby(this.stops, destination, 12, radius);
    const omap = new Map(origins.map((s) => [this.index.get(s.id), s])),
      dmap = new Map(destinations.map((s) => [this.index.get(s.id), s]));
    const base = {
      origin,
      destination,
      nearestStop: origins[0] || null,
      originStops: origins,
      destinationStops: destinations,
      journeys: [],
      departures: [],
      partial: false,
      checkedAt: now,
      mode,
      requestedTime: reference,
      feed: this.metadata(),
      scope:
        "Direct or one-transfer journeys; 36-hour departure window / 8-hour arrival lookback; up to 12 nearby stops at each end.",
      walking: {
        approximate: true,
        speedMetersPerMinute: 80,
        detourFactor: 1.25,
        bufferMinutes: 2,
      },
    };
    if (!origins.length || !destinations.length)
      return {
        ...base,
        reason:
          "No timetable stops within your walking limit of one of these locations. Try another location or a longer walking allowance.",
      };
    if (distance(origin, destination) < 150)
      return {
        ...base,
        reason:
          "These locations are very close together. Walking may be easier.",
      };
    const date = serviceDate(reference);
    if (
      (base.feed.startDate && date < base.feed.startDate) ||
      (base.feed.endDate &&
        date >
          shiftDate(
            base.feed.endDate,
            Math.floor(this.maxServiceSecond / 86400),
          ))
    )
      return {
        ...base,
        reason: `The available timetable covers ${base.feed.startDate}–${base.feed.endDate}. Choose a date in that range; no service is inferred outside it.`,
      };
    const first = [],
      second = new Map();
    for (let date = firstDate; date <= lastDate; date = shiftDate(date, 1))
      for (const t of this.dayTrips(date)) {
        const times = t.stops;
        for (let i = 0; i < times.length; i++) {
          const stop = times[i],
            depart = t.anchor + stop[2] * 1000,
            access = omap.get(stop[0]);
          if (
            access &&
            stop[3] === 0 &&
            depart >= start + (access.walkMinutes + BOARDING_BUFFER) * 60000 &&
            depart <= end
          ) {
            for (let j = i + 1; j < times.length; j++) {
              if (times[j][4] !== 0) continue;
              const leg = this.leg(t, i, j);
              if (leg.arrivesAt > end || leg.arrivesAt <= leg.departsAt)
                continue;
              first.push({ ...leg, access });
            }
          }
          const egress = dmap.get(stop[0]),
            arrive = t.anchor + stop[1] * 1000;
          if (
            egress &&
            stop[4] === 0 &&
            arrive + egress.walkMinutes * 60000 <= end &&
            arrive >= start
          ) {
            for (let j = 0; j < i; j++) {
              if (times[j][3] !== 0) continue;
              const leg = this.leg(t, j, i);
              if (leg.departsAt < start) continue;
              const list = second.get(leg.from) || [];
              list.push({ ...leg, egress });
              second.set(leg.from, list);
            }
          }
        }
      }
    for (const list of second.values())
      list.sort((a, b) => a.departsAt - b.departsAt);
    const candidates = new Map();
    const directCandidates = new Map();
    let cutoff = mode === "arrive_by" ? -Infinity : Infinity;
    first.sort((a, b) =>
      mode === "arrive_by"
        ? b.departsAt -
          b.access.walkMinutes * 60000 -
          (a.departsAt - a.access.walkMinutes * 60000)
        : a.arrivesAt - b.arrivesAt,
    );
    const emit = (legs, access, egress, connection = null) => {
      const first = legs[0],
        last = legs.at(-1),
        leaveAt =
          first.departsAt - (access.walkMinutes + BOARDING_BUFFER) * 60000,
        destinationAt = last.arrivesAt + egress.walkMinutes * 60000;
      if (
        leaveAt < start ||
        destinationAt > end ||
        destinationAt - leaveAt > 6 * 3600_000
      )
        return;
      if (
        legs.length > 1 &&
        (mode === "arrive_by" ? leaveAt < cutoff : destinationAt > cutoff)
      )
        return;
      const key = legs.map((l) => l.instance).join("|");
      const existing = candidates.get(key) || directCandidates.get(key);
      if (
        existing &&
        (mode === "arrive_by"
          ? leaveAt < existing.leaveAt ||
            (leaveAt === existing.leaveAt &&
              destinationAt >= existing.destinationAt)
          : destinationAt > existing.destinationAt ||
            (destinationAt === existing.destinationAt &&
              leaveAt <= existing.leaveAt))
      )
        return;
      const candidate = {
        id: legs.map((l) => `${l.instance}:${l.from}:${l.to}`).join("|"),
        legs: legs.map(({ access, egress, ...leg }) => leg),
        transfers: legs.length - 1,
        connection,
        route: legs.map((l) => l.route).join(" → "),
        headsign:
          legs.length === 1
            ? first.headsign
            : `Route ${first.route} → Route ${last.route}`,
        direction: first.direction,
        boarding: { ...first.boarding, ...access },
        alighting: { ...last.alighting, ...egress },
        departsAt: first.departsAt,
        arrivesAt: last.arrivesAt,
        destinationAt,
        leaveAt,
        walkMinutes: access.walkMinutes,
        finalWalkMinutes: egress.walkMinutes,
        rideMinutes: Math.ceil(
          legs.reduce((s, l) => s + l.arrivesAt - l.departsAt, 0) / 60000,
        ),
        timingSource: "scheduled",
        timingLabel: "Scheduled",
        totalMinutes: Math.ceil((destinationAt - leaveAt) / 60000),
        transferWaitMinutes: connection
          ? Math.floor((last.departsAt - first.arrivesAt) / 60000)
          : 0,
      };
      if (legs.length === 1) {
        if (
          !existing ||
          this.rank([candidate, existing], mode)[0] === candidate
        )
          directCandidates.set(key, candidate);
        return;
      }
      if (!existing || this.rank([candidate, existing], mode)[0] === candidate)
        candidates.set(key, candidate);
      if (candidates.size > 512) {
        const best = this.rank([...candidates.values()], mode).slice(0, 128);
        cutoff =
          mode === "arrive_by"
            ? best.at(-1).leaveAt
            : best.at(-1).destinationAt;
        candidates.clear();
        for (const j of best)
          candidates.set(j.legs.map((l) => l.instance).join("|"), j);
      }
    };
    for (const a of first) {
      const direct = dmap.get(a.to);
      if (direct) emit([a], a.access, direct);
      const leave =
        a.departsAt - (a.access.walkMinutes + BOARDING_BUFFER) * 60000;
      if (mode === "arrive_by" ? leave < cutoff : a.arrivesAt > cutoff)
        continue;
      if (!maxTransfers) continue;
      for (const walk of this.neighbors(a.to)) {
        if (walk.seconds > maxWalk * 60) continue;
        const list = second.get(walk.index) || [];
        const lower = lowerBound(
          list,
          a.arrivesAt + Math.max(transferBuffer * 60, walk.seconds) * 1000,
          "departsAt",
        );
        for (let k = lower; k < list.length; k++) {
          const b = list[k];
          if (b.departsAt - a.arrivesAt > 2 * 3600_000) break;
          if (a.instance === b.instance || b.to === a.from) continue;
          const connection = this.transfer(a, b, walk, transferBuffer);
          if (
            !connection ||
            b.departsAt < a.arrivesAt + connection.minimumSeconds * 1000
          )
            continue;
          emit([a, b], a.access, b.egress, connection);
        }
      }
    }
    base.journeys = recommendJourneys(
      [...directCandidates.values(), ...candidates.values()],
      mode,
      24,
    );
    for (const journey of base.journeys)
      for (const leg of journey.legs) leg.geometry = this.routeGeometry(leg);
    base.departures = base.journeys.slice(0, 6).map((j) => ({
      stop: j.boarding,
      route: j.legs[0].route,
      headsign: j.legs[0].headsign,
      departsAt: j.departsAt,
      catchable: true,
      timingSource: "scheduled",
    }));
    return {
      ...base,
      reason: base.journeys.length
        ? null
        : "No journey was found within the selected timetable window and walking/transfer limits. Try a different time or destination.",
    };
  }
  rank(journeys, mode) {
    return journeys.sort((a, b) =>
      mode === "arrive_by"
        ? b.leaveAt - a.leaveAt ||
          a.transfers - b.transfers ||
          a.destinationAt - b.destinationAt
        : a.destinationAt - b.destinationAt ||
          a.transfers - b.transfers ||
          b.leaveAt - a.leaveAt,
    );
  }
}
