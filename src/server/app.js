import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { point, agencyTime } from "./planner.js";
import { planJourney, routingOptions } from "./journeys.js";
const root = fileURLToPath(new URL("../../", import.meta.url));
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
export function handler(
  client,
  { allowedHosts = ["localhost", "127.0.0.1", "[::1]"], schedule = null } = {},
) {
  return async (req, res) => {
    const json = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(self)");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
    );
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (!allowedHosts.includes(url.hostname))
        return json(403, { error: "Local access only." });
      if (req.method === "POST") {
        if (req.headers.origin && req.headers.origin !== url.origin)
          return json(403, { error: "Cross-origin request rejected." });
        if (!req.headers["content-type"]?.includes("application/json"))
          return json(415, { error: "JSON request required." });
      }
      if (req.method === "GET" && url.pathname === "/api/health")
        return json(200, {
          ok: true,
          configured: Boolean(client.key),
          timetable: schedule?.metadata() || null,
          service: "RTS Rochester",
          timeZone: "America/New_York",
        });
      if (req.method === "GET" && url.pathname === "/api/stops") {
        const stops = (schedule ? schedule.stops : await client.stops())
          .map(({ id, name, lat, lon }) => ({ id, name, lat, lon }))
          .sort(
            (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
          );
        return json(200, { results: stops });
      }
      if (req.method === "GET" && url.pathname === "/api/places") {
        const q = (url.searchParams.get("q") || "").trim().toLowerCase();
        if (q.length < 2 || q.length > 100)
          return json(400, {
            error: "Enter 2–100 characters to search RTS stops.",
          });
        const terms = q.split(/\s+/);
        const stops = (schedule ? schedule.stops : await client.stops())
          .filter(
            (s) =>
              terms.every((t) => s.name.toLowerCase().includes(t)) ||
              s.id === q,
          )
          .sort((a, b) => a.name.localeCompare(b.name));
        return json(200, { results: stops.slice(0, 12), count: stops.length });
      }
      if (req.method === "GET" && url.pathname === "/api/vehicles") {
        const now = Date.now();
        return json(200, {
          vehicles: (await client.vehicles()).filter((v) => {
            const t = agencyTime(v.positionTimestamp);
            return Number.isFinite(t) && now - t < 180_000 && t <= now + 60_000;
          }),
          checkedAt: now,
        });
      }
      if (req.method === "POST" && url.pathname === "/api/plan") {
        let body = "",
          bytes = 0;
        for await (const part of req) {
          bytes += part.length;
          if (bytes > 16_384) return json(413, { error: "Request too large." });
          body += part;
        }
        let parsed;
        try {
          parsed = JSON.parse(body);
          point(parsed.origin);
          point(parsed.destination);
          routingOptions(parsed);
          if (
            parsed.maxWalk !== undefined &&
            ![5, 10, 15, 20].includes(parsed.maxWalk)
          )
            throw new Error("Choose a valid walking limit.");
        } catch (error) {
          return json(400, {
            error:
              error instanceof SyntaxError || error instanceof TypeError
                ? "Choose valid starting and destination locations, a walking limit, and a travel time."
                : error.message,
          });
        }
        return json(
          200,
          await planJourney(
            client,
            schedule,
            parsed.origin,
            parsed.destination,
            parsed,
          ),
        );
      }
      if (req.method !== "GET" && req.method !== "HEAD")
        return json(405, { error: "Method not allowed." });
      const relative =
        url.pathname === "/"
          ? "index.html"
          : decodeURIComponent(url.pathname).slice(1);
      if (
        relative.includes("..") ||
        relative.includes("\\") ||
        !/^[\w/.-]+$/.test(relative) ||
        !types[path.extname(relative)]
      )
        return json(404, { error: "Not found." });
      const file = path.join(root, "public", relative);
      try {
        if (!(await stat(file)).isFile())
          return json(404, { error: "Not found." });
        res.writeHead(200, {
          "Content-Type": `${types[path.extname(file)]}; charset=utf-8`,
          "Cache-Control": relative.startsWith("vendor/")
            ? "public, max-age=604800"
            : "no-cache",
        });
        res.end(req.method === "HEAD" ? undefined : await readFile(file));
      } catch {
        return json(404, { error: "Not found." });
      }
    } catch (error) {
      if (!res.headersSent)
        json(503, {
          error:
            error.message || "Live transit data is unavailable. Please retry.",
        });
      else res.end();
    }
  };
}
