import http from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BusTimeClient } from "./bustime.js";
import { validateGainesvilleFeed } from "./gainesville.js";
import { handler } from "./app.js";
import { readConfig } from "./config.js";
import { Schedule } from "./schedule.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const envPath = path.join(root, ".env.gainesville");
if (existsSync(envPath)) process.loadEnvFile(envPath);
const config = readConfig(process.env);
const feedPath = process.env.GTFS_PATH || path.join(root, "data/gtfs.json.gz");
const schedule = existsSync(feedPath) ? Schedule.load(feedPath) : null;
validateGainesvilleFeed(schedule);
if (schedule)
  console.log(
    `Timetable ready: ${schedule.stops.length} stops; feed ${schedule.metadata().version}`,
  );
const server = http.createServer(
  handler(new BusTimeClient(config.apiKey, { schedule, feed: config.feed }), {
    allowedHosts: config.allowedHosts,
    schedule,
  }),
);
server.requestTimeout = 60_000;
server.headersTimeout = 15_000;
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${config.port} is already in use. Change PORT in .env.`
      : "LeaveNow could not start its HTTP server.",
  );
  process.exitCode = 1;
});
server.listen(config.port, config.bindHost, () =>
  console.log(`LeaveNow ready at http://localhost:${config.port}`),
);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    const timer = setTimeout(() => process.exit(1), 10_000);
    timer.unref();
    server.close(() => process.exit(0));
    server.closeIdleConnections();
  });
}
