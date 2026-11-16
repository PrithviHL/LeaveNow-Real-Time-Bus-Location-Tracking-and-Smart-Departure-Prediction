import { inServiceArea } from "./gainesville.js";
export class Geocoder {
  constructor({
    fetcher = fetch,
    now = Date.now,
    base = process.env.GEOCODER_URL || "https://photon.komoot.io/api/",
  } = {}) {
    this.fetcher = fetcher;
    this.now = now;
    this.base = base;
    this.cache = new Map();
    this.pending = new Map();
    this.last = -Infinity;
  }
  async search(raw) {
    const q = raw.trim();
    if (q.length < 3 || q.length > 150)
      throw Error("Enter 3–150 characters for an address or place.");
    const key = q.toLowerCase();
    const cached = this.cache.get(key);
    if (cached && cached.until > this.now()) return cached.results;
    if (this.pending.has(key)) return this.pending.get(key);
    if (this.now() - this.last < 1000)
      throw Error(
        "Place search is busy. Please wait a second and search again.",
      );
    this.last = this.now();
    const work = (async () => {
      const url = new URL(this.base);
      url.search = new URLSearchParams({
        q,
        limit: "8",
        lang: "en",
        lat: "29.6516",
        lon: "-82.3394",
        bbox: "-82.9,29.35,-81.9,30.1",
      });
      let data;
      try {
        const response = await this.fetcher(url, {
          signal: AbortSignal.timeout(8000),
          redirect: "error",
          headers: {
            Accept: "application/json",
            "User-Agent":
              "LeaveNow/1.0 (https://leavenow-prithvihl.onrender.com)",
          },
        });
        if (!response.ok) throw Error();
        data = await response.json();
      } catch {
        throw Error(
          "Place search is temporarily unavailable. Try stop search or coordinates.",
        );
      }
      if (!Array.isArray(data.features))
        throw Error("Place search returned an unexpected response.");
      const results = data.features.flatMap((f, i) => {
        const c = f.geometry?.coordinates,
          p = f.properties || {};
        if (!Array.isArray(c)) return [];
        const point = { lon: Number(c[0]), lat: Number(c[1]) };
        if (!inServiceArea(point)) return [];
        const name = [
          p.name,
          [p.housenumber, p.street].filter(Boolean).join(" "),
          p.city || p.locality,
          p.state,
          p.postcode,
        ]
          .filter(Boolean)
          .join(", ");
        return name ? [{ id: String(i), name, ...point }] : [];
      });
      if (this.cache.size >= 500) this.cache.clear();
      this.cache.set(key, { results, until: this.now() + 86400000 });
      return results;
    })();
    this.pending.set(key, work);
    try {
      return await work;
    } finally {
      this.pending.delete(key);
    }
  }
}
