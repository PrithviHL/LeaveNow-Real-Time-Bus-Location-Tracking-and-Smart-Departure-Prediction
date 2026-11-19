import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createMetrics } from "../src/server/observability.js";
import { handler } from "../src/server/app.js";

test("metrics endpoint is private, excludes itself, and never calls the provider", async (t) => {
  const metrics = createMetrics({ defaults: false });
  const server = http.createServer(
    handler({ key: "SECRET-do-not-export" }, { metrics }),
  );
  server.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  await fetch(`${base}/api/health`);
  await fetch(`${base}/arbitrary-private-place?q=secret-location`);
  const response = await fetch(`${base}/metrics`),
    text = await response.text();
  assert.match(response.headers.get("content-type"), /text\/plain/);
  assert.match(text, /route="\/api\/health",status="200"} 1/);
  assert.match(text, /route="other",status="404"} 1/);
  assert.doesNotMatch(
    text,
    /SECRET|secret-location|arbitrary-private-place|route="\/metrics"/,
  );
  const denied = await new Promise((resolve, reject) => {
    http
      .get(
        `${base}/metrics`,
        { headers: { Host: "untrusted.example" } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      )
      .on("error", reject);
  });
  assert.equal(denied, 403);
});

test("tracking metrics distinguish evidence types without exporting IDs or coordinates", async () => {
  const metrics = createMetrics({ defaults: false });
  const now = Date.now();
  metrics.tracking({ buses: [], partial: true });
  metrics.tracking({
    buses: [
      {
        id: "private-bus",
        position: { lat: 29.123456, lon: -82.123456, updatedAt: now - 5000 },
      },
    ],
  });
  metrics.tracking({
    buses: [{ arrivalAt: now + 60000, predictionAt: now - 15000 }],
  });
  metrics.tracking({
    buses: [
      {
        arrivalAt: now + 60000,
        predictionAt: now,
        position: { updatedAt: now },
      },
    ],
  });
  metrics.plan({ journeys: [{}, {}], partial: true });
  metrics.plan({ journeys: [] });
  const text = await metrics.registry.metrics();
  for (const outcome of ["unavailable", "gps_only", "eta_only", "gps_eta"])
    assert.match(text, new RegExp(`outcome="${outcome}"} 1`));
  assert.match(text, /leavenow_evidence_age_seconds_count{kind="gps"} 2/);
  assert.match(text, /leavenow_journeys_returned_sum 2/);
  assert.doesNotMatch(text, /private-bus|29\.123456|82\.123456/);
});

test("provider attempts record HTTP and network failures without leaking request secrets", async () => {
  const metrics = createMetrics({ defaults: false });
  await metrics.wrapFetcher(async () => ({ ok: true }))(
    "https://private?key=secret",
  );
  await metrics.wrapFetcher(async () => ({ ok: false }))(
    "https://private?key=secret",
  );
  await assert.rejects(
    metrics.wrapFetcher(async () => {
      throw Error("secret");
    })(),
  );
  const text = await metrics.registry.metrics();
  for (const outcome of ["success", "http_error", "network_error"])
    assert.match(text, new RegExp(`outcome="${outcome}"} 1`));
  assert.doesNotMatch(text, /private|secret/);
});

test("cached and coalesced provider reads do not inflate network attempt counts", async () => {
  const { BusTimeClient } = await import("../src/server/bustime.js");
  const metrics = createMetrics({ defaults: false });
  const client = new BusTimeClient("test-placeholder", {
    fetcher: metrics.wrapFetcher(async () => ({
      ok: true,
      json: async () => ({ "bustime-response": { tm: "fixture" } }),
    })),
  });
  await Promise.all([client.request("gettime"), client.request("gettime")]);
  await client.request("gettime");
  assert.match(
    await metrics.registry.metrics(),
    /leavenow_provider_http_requests_total{outcome="success"} 1/,
  );
});
