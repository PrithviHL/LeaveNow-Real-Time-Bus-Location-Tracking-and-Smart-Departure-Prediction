import { API_BASE, inServiceArea } from "./gainesville.js";
import { agencyTime } from "./planner.js";

// Clever Devices BusTime v3, per the supplied developer guide. No Rochester endpoints.
export class BusTimeClient {
  constructor(
    key,
    {
      schedule,
      feed = "",
      fetcher = fetch,
      requestsPerMinute = 60,
      now = Date.now,
    } = {},
  ) {
    this.key = key;
    this.fetcher = fetcher;
    this.requestsPerMinute = requestsPerMinute;
    this.now = now;
    this.windowStart = now();
    this.requestsInWindow = 0;
    this.cache = new Map();
    this.pending = new Map();
    this.schedule = schedule;
    this.feed = feed;
    this.tripIds = new Set(
      schedule?.data?.trips?.map((t) => String(t.id)) || [],
    );
  }
  async request(endpoint, params = {}, ttl = 20_000) {
    if (!this.key)
      throw new Error(
        "GAINESVILLE_RTS_API_KEY is missing in the server environment.",
      );
    const cacheKey = endpoint + JSON.stringify(params);
    const cached = this.cache.get(cacheKey);
    if (cached && this.now() < cached.expires) return cached.data;
    if (this.pending.has(cacheKey)) return this.pending.get(cacheKey);
    if (this.now() - this.windowStart >= 60_000) {
      this.windowStart = this.now();
      this.requestsInWindow = 0;
    }
    if (this.requestsInWindow >= this.requestsPerMinute)
      throw new Error(
        "Gainesville live request limit reached. Please retry in a minute.",
      );
    this.requestsInWindow++;
    const work = (async () => {
      const url = new URL(endpoint, API_BASE);
      url.search = new URLSearchParams({
        key: this.key,
        format: "json",
        ...params,
      });
      let response;
      try {
        response = await this.fetcher(url, {
          signal: AbortSignal.timeout(10_000),
          headers: { Accept: "application/json" },
          redirect: "error",
        });
      } catch {
        throw new Error("Gainesville RTS could not be reached. Please retry.");
      }
      if (!response.ok)
        throw new Error(
          "Gainesville RTS is unavailable or rejected the server credential.",
        );
      let data;
      try {
        data = (await response.json())["bustime-response"];
      } catch {
        throw new Error("Gainesville RTS returned an unreadable response.");
      }
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw new Error("Gainesville RTS returned an unexpected response.");
      if (data.error?.length) {
        const errors = data.error.map((e) =>
          String(e.msg || "")
            .replace(/\s+/g, " ")
            .trim(),
        );
        if (
          errors.every((e) =>
            /^(No data found\b|No arrival times\b|No service scheduled\b)/i.test(e),
          )
        )
          data = {};
        else
          throw new Error(
            errors.some((e) => /key|access/i.test(e))
              ? "Gainesville RTS rejected GAINESVILLE_RTS_API_KEY. Check the hosting secret."
              : `Gainesville RTS ${endpoint} failed (${errors.some((e) => /feed/i.test(e)) ? "feed configuration" : errors.some((e) => /limit|quota/i.test(e)) ? "provider quota" : ["No data found", "Maximum number", "Invalid parameter", "Either rt or vid", "No parameter", "Internal server", "Unsupported function", "No service"].find((label) => errors.some((e) => e.toLowerCase().includes(label.toLowerCase()))) || "provider response"}).`,
          );
      }
      if (this.cache.size > 1000) this.cache.clear();
      this.cache.set(cacheKey, { data, expires: this.now() + ttl });
      return data;
    })();
    this.pending.set(cacheKey, work);
    try {
      return await work;
    } finally {
      this.pending.delete(cacheKey);
    }
  }
  async feedName() {
    if (this.feed) return this.feed;
    const result = await this.request("getrtpidatafeeds", {}, 3600_000);
    const feeds = (result.rtpidatafeed || []).filter(
      (f) => f.enabled !== false && f.enabled !== "false",
    );
    // Single-feed systems omit rtpidatafeed entirely (guide section 1.7).
    if (!feeds.length) return "";
    if (feeds.length === 1 && feeds[0].name) this.feed = String(feeds[0].name);
    else {
      const selected = feeds.filter(
        (f) => String(f.name).toLowerCase() === "bustime",
      );
      if (selected.length !== 1)
        throw new Error(
          "Select a Gainesville RTS data feed with GAINESVILLE_RTS_FEED.",
        );
      this.feed = String(selected[0].name);
    }
    return this.feed;
  }
  async stops() {
    return (this.schedule?.stops || []).filter(inServiceArea);
  }
  async predictions(id) {
    const rtpidatafeed = await this.feedName();
    const data = await this.request(
      "getpredictions",
      {
        stpid: String(id),
        ...(rtpidatafeed ? { rtpidatafeed } : {}),
        unixTime: "true",
        tmres: "s",
      },
      15_000,
    );
    return (data.prd || [])
      .filter((p) => p && typeof p === "object")
      .map((p) => ({
        RouteId: String(p.rt ?? ""),
        TripId: String(p.tatripid || ""),
        ExternalTripId:
          [p.origtatripno, p.tatripid]
            .map(String)
            .find((t) => this.tripIds.has(t)) || "",
        VehicleId: String(p.vid || ""),
        RouteDir: String(p.rtdir || ""),
        Destination: String(p.des || ""),
        ETA: p.prdtm,
        Timestamp: p.tmstmp,
        StopId: String(p.stpid || id),
        PredictionType: p.typ,
      }))
      .filter(
        (p) =>
          p.RouteId &&
          Number.isFinite(agencyTime(p.ETA)) &&
          Number.isFinite(agencyTime(p.Timestamp)),
      );
  }
  async vehicles() {
    const rtpidatafeed = await this.feedName();
    const data = await this.request(
      "getroutes",
      rtpidatafeed ? { rtpidatafeed } : {},
      3600_000,
    );
    const routes = (data.routes || [])
      .filter((r) => r && r.rt !== undefined)
      .map((r) => String(r.rt));
    const vehicles = [];
    // BusTime permits at most ten route designators per request.
    for (let i = 0; i < routes.length; i += 10) {
      const result = await this.request(
        "getvehicles",
        {
          rt: routes.slice(i, i + 10).join(","),
          ...(rtpidatafeed ? { rtpidatafeed } : {}),
          tmres: "s",
        },
        20_000,
      );
      vehicles.push(...(result.vehicle || []));
    }
    return vehicles
      .filter((v) => v && typeof v === "object")
      .map((v) => ({
        id: String(v.vid),
        route: String(v.rt),
        label: String(v.des || ""),
        lat: Number(v.lat),
        lon: Number(v.lon),
        timestamp: v.tmstmp,
        positionTimestamp: v.tmstmp,
      }))
      .filter(inServiceArea);
  }
}
