import { test } from "node:test";
import assert from "node:assert/strict";
import { TransitClient } from "../src/server/transit.js";
test("API credential stays in HTTPS requests; cached requests coalesce", async () => {
  let count = 0;
  const client = new TransitClient("test-secret", async (url) => {
    count++;
    assert.equal(url.protocol, "https:");
    assert.equal(url.searchParams.get("key"), "test-secret");
    await new Promise((r) => setTimeout(r, 5));
    return Response.json([
      { StopId: 1, StopName: "Main", StopLat: "43", StopLon: "-77" },
    ]);
  });
  const [a, b] = await Promise.all([client.stops(), client.stops()]);
  assert.deepEqual(a, b);
  await client.stops();
  assert.equal(count, 1);
});
test("credential rejection never exposes the upstream URL or credential", async () => {
  const client = new TransitClient(
    "test-secret",
    async () => new Response("bad key", { status: 403 }),
  );
  await assert.rejects(
    () => client.predictions("1"),
    (error) =>
      /rejected/.test(error.message) && !error.message.includes("test-secret"),
  );
});
test("validates upstream data and missing configuration", async () => {
  await assert.rejects(() => new TransitClient("").stops(), /missing/);
  await assert.rejects(
    () =>
      new TransitClient("x", async () =>
        Response.json({ error: "bad" }),
      ).stops(),
    /unexpected/,
  );
  await assert.rejects(
    () => new TransitClient("x", async () => new Response("not-json")).stops(),
    /unreadable/,
  );
});

test("ignores malformed prediction and vehicle entries", async () => {
  const client = new TransitClient("test", async () =>
    Response.json([
      null,
      {},
      { RouteId: 10, VehicleId: 5, CurrentLat: "43", CurrentLon: "-77" },
    ]),
  );
  assert.equal((await client.predictions("1")).length, 1);
  assert.equal((await client.vehicles()).length, 1);
});

test("upstream rate budget allows cached requests but rejects excess new requests", async () => {
  let time = 0;
  const client = new TransitClient("test", async () => Response.json([]), {
    requestsPerMinute: 1,
    now: () => time,
  });
  await client.predictions("1");
  await client.predictions("1");
  await assert.rejects(() => client.predictions("2"), /request limit/);
  time = 60_001;
  await client.predictions("2");
});
