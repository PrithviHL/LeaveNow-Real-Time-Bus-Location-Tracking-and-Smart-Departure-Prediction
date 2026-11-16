import { test } from "node:test";
import assert from "node:assert/strict";
import { BusTimeClient } from "../src/server/bustime.js";
import { agencyTime } from "../src/server/planner.js";
import { validateGainesvilleFeed } from "../src/server/gainesville.js";
const schedule = {
  stops: [{ id: "473", name: "Reitz Union", lat: 29.64514, lon: -82.346983 }],
  data: { trips: [{ id: "gtfs-exact" }] },
};
const envelope = (data) => Response.json({ "bustime-response": data });
test("BusTime HTTPS JSON requests coalesce without exposing credentials", async () => {
  let count = 0;
  const c = new BusTimeClient("test-secret", {
    schedule,
    feed: "bustime",
    fetcher: async (url) => {
      count++;
      assert.equal(url.origin, "https://riderts.app");
      assert.equal(url.searchParams.get("key"), "test-secret");
      assert.equal(url.searchParams.get("format"), "json");
      assert.equal(url.searchParams.get("unixTime"), "true");
      await new Promise((r) => setTimeout(r, 5));
      return envelope({
        prd: [
          {
            rt: "38",
            vid: "v",
            tatripid: "local-trip",
            origtatripno: "gtfs-exact",
            prdtm: 1794834300000,
            tmstmp: 1794834000000,
          },
        ],
      });
    },
  });
  const [a, b] = await Promise.all([
    c.predictions("473"),
    c.predictions("473"),
  ]);
  assert.deepEqual(a, b);
  assert.equal(count, 1);
  assert.equal(a[0].ExternalTripId, "gtfs-exact");
  assert.equal((await c.stops())[0].name, "Reitz Union");
});
test("credential and API envelope errors are safe; no-service is a valid empty result", async () => {
  const c = new BusTimeClient("private-token", {
    feed: "bustime",
    fetcher: async () =>
      envelope({ error: [{ msg: "Invalid API access key supplied" }] }),
  });
  await assert.rejects(
    () => c.predictions("1"),
    (e) => /rejected/.test(e.message) && !e.message.includes("private-token"),
  );
  const empty = new BusTimeClient("test", {
    feed: "bustime",
    fetcher: async () =>
      envelope({ error: [{ msg: "No data found for parameters: rt" }] }),
  });
  assert.deepEqual(await empty.predictions("1"), []);
  await assert.rejects(
    () => new BusTimeClient("").request("gettime"),
    /missing/,
  );
  await assert.rejects(
    () =>
      new BusTimeClient("test", {
        fetcher: async () => Response.json([]),
      }).request("gettime"),
    /unexpected/,
  );
});
test("trip identity is not guessed when BusTime IDs differ from GTFS", async () => {
  const c = new BusTimeClient("test", {
    schedule,
    feed: "bustime",
    fetcher: async () =>
      envelope({
        prd: [
          null,
          {},
          {
            rt: "38",
            vid: "x",
            tatripid: "not-gtfs",
            prdtm: 1794834300000,
            tmstmp: 1794834000000,
          },
        ],
      }),
  });
  assert.equal((await c.predictions("473"))[0].ExternalTripId, "");
});
test("vehicles are requested in batches of at most ten routes and filtered to Gainesville", async () => {
  let calls = 0;
  const c = new BusTimeClient("test", {
    feed: "bustime",
    fetcher: async (url) => {
      if (url.pathname.endsWith("getroutes"))
        return envelope({
          routes: Array.from({ length: 21 }, (_, i) => ({ rt: String(i + 1) })),
        });
      assert.ok(url.searchParams.get("rt").split(",").length <= 10);
      calls++;
      return envelope({
        vehicle: [
          {
            vid: "v",
            rt: "1",
            lat: 29.65,
            lon: -82.34,
            tmstmp: "20261116 08:00:00",
          },
          { vid: "ny", lat: 43.15, lon: -77.6 },
        ],
      });
    },
  });
  assert.equal((await c.vehicles()).length, 3);
  assert.equal(calls, 3);
});
test("rate budgets permit cached reads and reset each minute", async () => {
  let now = 0;
  const c = new BusTimeClient("test", {
    feed: "bustime",
    now: () => now,
    requestsPerMinute: 1,
    fetcher: async () => envelope({ prd: [] }),
  });
  await c.predictions("1");
  await c.predictions("1");
  await assert.rejects(() => c.predictions("2"), /request limit/);
  now = 60001;
  await c.predictions("2");
});
test("BusTime times use milliseconds or validated local agency time; wrong-region feeds rejected", () => {
  assert.equal(agencyTime("20261116 08:00:00"), 1794834000000);
  assert.equal(agencyTime(1794834000000), 1794834000000);
  assert.ok(Number.isNaN(agencyTime("20260230 08:00")));
  validateGainesvilleFeed(schedule);
  assert.throws(
    () => validateGainesvilleFeed({ stops: [{ lat: 43.15, lon: -77.6 }] }),
    /Gainesville/,
  );
});

test("single-feed deployments omit the optional feed parameter", async () => {
  const urls = [];
  const client = new BusTimeClient("test", {
    fetcher: async (url) => {
      urls.push(new URL(url));
      return {
        ok: true,
        json: async () => ({
          "bustime-response": url.pathname.endsWith("getroutes")
            ? { routes: [] }
            : {},
        }),
      };
    },
  });
  assert.deepEqual(await client.vehicles(), []);
  assert.equal(urls.at(-1).searchParams.has("rtpidatafeed"), false);
});

test("live patterns retain ordered stop distances for direction verification", async () => {
  const c = new BusTimeClient("test", {
    feed: "bustime",
    fetcher: async (url) => {
      assert.ok(url.pathname.endsWith("getpatterns"));
      assert.equal(url.searchParams.get("rt"), "1");
      return Response.json({
        "bustime-response": {
          ptr: [
            {
              pid: 12,
              pt: [
                { typ: "S", stpid: 1, seq: 3, pdist: 500 },
                { typ: "W", seq: 2 },
                { typ: "S", stpid: 44, seq: 1, pdist: 100 },
              ],
            },
          ],
        },
      });
    },
  });
  const [p] = await c.patterns("1");
  assert.equal(p.id, "12");
  assert.deepEqual(
    p.stops.map((s) => s.id),
    ["44", "1"],
  );
  assert.equal(p.stops[0].distance, 100);
});
