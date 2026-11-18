import { test } from "node:test";
import assert from "node:assert/strict";
import { BusTimeClient } from "../src/server/bustime.js";

test("route tracking shares requests and obtains new positions after five seconds", async () => {
  let now = 100000,
    calls = 0;
  const client = new BusTimeClient("test", {
    feed: "bustime",
    now: () => now,
    fetcher: async (url) => {
      assert.equal(url.pathname.split("/").at(-1), "getvehicles");
      assert.equal(url.searchParams.get("rt"), "17");
      calls++;
      await Promise.resolve();
      return {
        ok: true,
        json: async () => ({
          "bustime-response": {
            vehicle: [
              {
                vid: "2414",
                rt: "17",
                lat: 29.65,
                lon: -82.34,
                tmstmp: String(now),
              },
            ],
          },
        }),
      };
    },
  });
  const [a, b] = await Promise.all([
    client.vehicles("17"),
    client.vehicles("17"),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  now += 4999;
  await client.vehicles("17");
  assert.equal(calls, 1);
  now++;
  const fresh = await client.vehicles("17");
  assert.equal(calls, 2);
  assert.notEqual(fresh[0].positionTimestamp, a[0].positionTimestamp);
});

// Gainesville BusTime uses zero-padded stop codes while its GTFS IDs do not.
test("provider stop padding preserves GTFS identity for predictions and patterns", async () => {
  const requests = [];
  const client = new BusTimeClient("test", {
    feed: "bustime",
    fetcher: async (url) => {
      requests.push(url);
      return {
        ok: true,
        json: async () => ({
          "bustime-response": url.pathname.endsWith("getpatterns")
            ? {
                ptr: [
                  {
                    pid: 1,
                    pt: [
                      { typ: "S", stpid: "0473", seq: 1, pdist: 100 },
                      { typ: "S", stpid: "0171", seq: 2, pdist: 200 },
                    ],
                  },
                ],
              }
            : { prd: [] },
        }),
      };
    },
  });
  await client.predictions("473");
  assert.equal(requests[0].searchParams.get("stpid"), "0473");
  const patterns = await client.patterns("20");
  assert.deepEqual(
    patterns[0].stops.map((s) => s.id),
    ["473", "171"],
  );
});
