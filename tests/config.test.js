import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../src/server/config.js";
test("configuration fails early for missing credentials and invalid ports", () => {
  assert.throws(() => readConfig({}), /RTS_API_KEY/);
  assert.throws(
    () => readConfig({ RTS_API_KEY: "your-rts-api-key" }),
    /RTS_API_KEY/,
  );
  for (const port of ["abc", "-1", "0", "1.5", "65536"])
    assert.throws(
      () => readConfig({ RTS_API_KEY: "test", PORT: port }),
      /PORT/,
    );
  assert.deepEqual(readConfig({ RTS_API_KEY: " test " }), {
    apiKey: "test",
    port: 3001,
  });
});
