import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler } from "../src/server/app.js";
test("HTTP validation, stop search, static files and origin boundaries", async () => {
  const client = {
    key: "test-secret",
    stops: async () => [
      { id: "1", name: "East & Alexander", lat: 43.155, lon: -77.594 },
    ],
    vehicles: async () => [],
  };
  const server = http.createServer(handler(client));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const index = await fetch(base);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /Find my next bus/);
    const health = await (await fetch(base + "/api/health")).json();
    assert.equal(health.configured, true);
    assert.ok(!JSON.stringify(health).includes("test-secret"));
    const catalog = await (await fetch(base + "/api/stops")).json();
    assert.deepEqual(catalog.results, [
      { id: "1", name: "East & Alexander", lat: 43.155, lon: -77.594 },
    ]);
    assert.ok(!JSON.stringify(catalog).includes("test-secret"));
    const stops = await (await fetch(base + "/api/places?q=East")).json();
    assert.equal(stops.results[0].id, "1");
    assert.equal((await fetch(base + "/api/places?q=x")).status, 400);
    assert.equal((await fetch(base + "/.env")).status, 404);
    assert.equal(
      (
        await fetch(base + "/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(base + "/api/plan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            origin: "https://evil.example",
          },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(base + "/api/plan", { method: "POST", body: "{}" })).status,
      415,
    );
    assert.equal(
      (await fetch(base + "/vendor/leaflet/leaflet.js")).status,
      200,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("container DNS hosts are explicitly allowed without allowing arbitrary hosts", async () => {
  const client = { key: "test", stops: async () => [] };
  const server = http.createServer(
    handler(client, { allowedHosts: ["localhost", "127.0.0.1", "api"] }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const requestHost = (host) =>
    new Promise((resolve, reject) => {
      http
        .get(base + "/api/health", { headers: { Host: host } }, (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode));
        })
        .on("error", reject);
    });
  try {
    assert.equal(await requestHost("api:3001"), 200);
    assert.equal(await requestHost("untrusted.example"), 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
