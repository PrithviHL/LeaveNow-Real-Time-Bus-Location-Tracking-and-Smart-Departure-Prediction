import { normalizeStop } from "./planner.js";
export class TransitClient {
  constructor(
    key,
    fetcher = fetch,
    { requestsPerMinute = 60, now = Date.now } = {},
  ) {
    this.key = key;
    this.requestsPerMinute = requestsPerMinute;
    this.now = now;
    this.windowStart = now();
    this.requestsInWindow = 0;
    this.fetcher = fetcher;
    this.cache = new Map();
    this.pending = new Map();
  }
  async request(endpoint, params = {}, ttl = 20_000) {
    if (!this.key)
      throw new Error(
        "RTS_API_KEY is missing. Add it to the server .env file.",
      );
    const cacheKey = endpoint + JSON.stringify(params),
      cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expires) return cached.data;
    if (this.pending.has(cacheKey)) return this.pending.get(cacheKey);
    if (this.now() - this.windowStart >= 60_000) {
      this.windowStart = this.now();
      this.requestsInWindow = 0;
    }
    if (this.requestsInWindow >= this.requestsPerMinute)
      throw new Error(
        "Live transit request limit reached. Please wait a minute and retry.",
      );
    this.requestsInWindow++;
    const work = (async () => {
      const url = new URL(`https://api.rgrta.com/${endpoint}`);
      url.searchParams.set("key", this.key);
      for (const [k, v] of Object.entries(params))
        url.searchParams.set(k, String(v));
      let response;
      try {
        response = await this.fetcher(url, {
          signal: AbortSignal.timeout(10_000),
          headers: { Accept: "application/json" },
        });
      } catch {
        throw new Error(
          "The RTS service timed out or could not be reached. Please retry.",
        );
      }
      if (response.status === 401 || response.status === 403)
        throw new Error(
          "RTS rejected the server API credential. Check RTS_API_KEY.",
        );
      if (!response.ok)
        throw new Error("RTS data is temporarily unavailable. Please retry.");
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error("RTS returned an unreadable response. Please retry.");
      }
      if (!Array.isArray(data))
        throw new Error("RTS returned an unexpected response.");
      if (this.cache.size > 1000) this.cache.clear();
      this.cache.set(cacheKey, { data, expires: Date.now() + ttl });
      return data;
    })();
    this.pending.set(cacheKey, work);
    try {
      return await work;
    } finally {
      this.pending.delete(cacheKey);
    }
  }
  async stops() {
    return (await this.request("rtstops", {}, 3600_000))
      .map(normalizeStop)
      .filter(Boolean);
  }
  async predictions(id) {
    return (await this.request("rtpredictions", { stopid: id }, 15_000)).filter(
      (prediction) =>
        prediction &&
        typeof prediction === "object" &&
        prediction.RouteId !== undefined,
    );
  }
  async vehicles() {
    return (await this.request("rtvehicles", {}, 20_000))
      .filter((vehicle) => vehicle && typeof vehicle === "object")
      .map((v) => ({
        id: String(v.VehicleId),
        route: String(v.RouteId),
        label: String(v.Destination || ""),
        lat: Number(v.CurrentLat),
        lon: Number(v.CurrentLon),
        timestamp: v.Timestamp,
        positionTimestamp: v.VehiclePositionDateTime || v.LastPositionDateTime,
      }))
      .filter(
        (v) =>
          Number.isFinite(v.lat) &&
          Number.isFinite(v.lon) &&
          Math.abs(v.lat) <= 90 &&
          Math.abs(v.lon) <= 180,
      );
  }
}
