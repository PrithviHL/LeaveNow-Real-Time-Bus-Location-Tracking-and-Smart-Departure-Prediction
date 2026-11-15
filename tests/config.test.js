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
    bindHost: "127.0.0.1",
    allowedHosts: ["localhost", "127.0.0.1", "[::1]"],
  });
});

test("container hosts require explicit configuration", () => {
  const config = readConfig({
    RTS_API_KEY: "test",
    HOST: "0.0.0.0",
    ALLOWED_HOSTS: "api,leavenow-api",
  });
  assert.equal(config.bindHost, "0.0.0.0");
  assert.ok(config.allowedHosts.includes("api"));
  assert.throws(
    () => readConfig({ RTS_API_KEY: "test", HOST: "example.com" }),
    /HOST/,
  );
  assert.throws(
    () => readConfig({ RTS_API_KEY: "test", ALLOWED_HOSTS: "*" }),
    /ALLOWED_HOSTS/,
  );
});
