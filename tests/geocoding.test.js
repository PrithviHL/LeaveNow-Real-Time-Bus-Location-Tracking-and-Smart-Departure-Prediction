import { test } from "node:test";
import assert from "node:assert/strict";
import { Geocoder } from "../src/server/geocoding.js";
test("place search uses bounded Gainesville requests, cache, and filters distant results", async () => {
  let calls = 0;
  const geocoder = new Geocoder({
    fetcher: async (url) => {
      calls++;
      assert.equal(url.searchParams.get("bbox"), "-82.9,29.35,-81.9,30.1");
      return Response.json({
        features: [
          {
            geometry: { coordinates: [-82.34, 29.65] },
            properties: { name: "Library", city: "Gainesville" },
          },
          {
            geometry: { coordinates: [-77, 43] },
            properties: { name: "Wrong city" },
          },
        ],
      });
    },
  });
  const result = await geocoder.search("Library");
  assert.equal(result.length, 1);
  assert.match(result[0].name, /Library/);
  assert.deepEqual(await geocoder.search("library"), result);
  assert.equal(calls, 1);
  await assert.rejects(() => geocoder.search("Another place"), /busy/);
  await assert.rejects(() => geocoder.search("a"), /3–150/);
});
test("place provider errors are safe and not returned as fake results", async () => {
  const geocoder = new Geocoder({
    fetcher: async () => {
      throw Error("private detail");
    },
  });
  await assert.rejects(
    () => geocoder.search("Library"),
    (e) =>
      /temporarily unavailable/.test(e.message) &&
      !e.message.includes("private detail"),
  );
});
