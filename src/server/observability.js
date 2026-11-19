import {
  Registry,
  Counter,
  Histogram,
  collectDefaultMetrics,
} from "@prometheus-io/client";

const routes = new Set([
  "/api/health",
  "/api/stops",
  "/api/addresses",
  "/api/places",
  "/api/provider-status",
  "/api/tracking",
  "/api/vehicles",
  "/api/plan",
]);
// Never label metrics with user input, URLs, stop/trip/vehicle IDs, or errors.
export function createMetrics({ defaults = true } = {}) {
  const registry = new Registry();
  if (defaults)
    collectDefaultMetrics({ register: registry, prefix: "leavenow_" });
  const counter = (name, help, labelNames) =>
    new Counter({
      name: `leavenow_${name}`,
      help,
      labelNames,
      registers: [registry],
    });
  const histogram = (name, help, labelNames, buckets) =>
    new Histogram({
      name: `leavenow_${name}`,
      help,
      labelNames,
      buckets,
      registers: [registry],
    });
  const requests = counter(
    "http_requests_total",
    "Completed API HTTP requests",
    ["method", "route", "status"],
  );
  const duration = histogram(
    "http_request_duration_seconds",
    "API HTTP request duration",
    ["method", "route"],
    [0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
  );
  const plans = counter(
    "plan_results_total",
    "Successful search responses by result availability",
    ["outcome"],
  );
  const journeys = histogram(
    "journeys_returned",
    "Journeys per successful search response",
    [],
    [0, 1, 2, 3, 5, 10, 20],
  );
  const tracking = counter(
    "tracking_results_total",
    "Successful tracking responses by available live evidence",
    ["outcome"],
  );
  const partial = counter(
    "partial_results_total",
    "Responses with partial upstream failures",
    ["operation"],
  );
  const age = histogram(
    "evidence_age_seconds",
    "Age of returned live evidence; not arrival prediction error",
    ["kind"],
    [0, 5, 15, 30, 60, 120, 180, 300, 600],
  );
  const upstream = counter(
    "provider_http_requests_total",
    "Actual RTS HTTP attempts (cache hits excluded)",
    ["outcome"],
  );
  const upstreamDuration = histogram(
    "provider_http_duration_seconds",
    "RTS network duration including failed attempts",
    [],
    [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 15],
  );
  return {
    registry,
    observeHttp(req, res, pathname) {
      if (pathname === "/metrics") return;
      const route = routes.has(pathname) ? pathname : "other";
      const method = ["GET", "POST", "HEAD", "OPTIONS"].includes(req.method)
        ? req.method
        : "other";
      const end = duration.startTimer({ method, route });
      res.once("finish", () => {
        end();
        requests.inc({ method, route, status: String(res.statusCode) });
      });
    },
    plan(result) {
      const count = result.journeys?.length || 0;
      plans.inc({ outcome: count ? "results" : "empty" });
      journeys.observe(count);
      if (result.partial) partial.inc({ operation: "plan" });
    },
    tracking(result) {
      const buses = result.buses || [];
      const gps = buses.some((b) => b.position),
        eta = buses.some((b) => Number.isFinite(b.arrivalAt));
      tracking.inc({
        outcome: gps
          ? eta
            ? "gps_eta"
            : "gps_only"
          : eta
            ? "eta_only"
            : "unavailable",
      });
      if (result.partial) partial.inc({ operation: "tracking" });
      for (const bus of buses)
        for (const [kind, stamp] of [
          ["gps", bus.position?.updatedAt],
          ["boarding", bus.predictionAt],
          ["alighting", bus.alightingPredictionAt],
        ]) {
          if (Number.isFinite(stamp))
            age.observe({ kind }, Math.max(0, (Date.now() - stamp) / 1000));
        }
    },
    wrapFetcher(fetcher) {
      return async (...args) => {
        const end = upstreamDuration.startTimer();
        try {
          const response = await fetcher(...args);
          upstream.inc({ outcome: response.ok ? "success" : "http_error" });
          return response;
        } catch (error) {
          upstream.inc({ outcome: "network_error" });
          throw error;
        } finally {
          end();
        }
      };
    },
  };
}
