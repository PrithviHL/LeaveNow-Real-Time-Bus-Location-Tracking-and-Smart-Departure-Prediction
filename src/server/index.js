import http from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TransitClient } from "./transit.js";
import { handler } from "./app.js";
import { readConfig } from "./config.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const envPath = path.join(root, ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);
const config = readConfig(process.env);
const server = http.createServer(
  handler(new TransitClient(config.apiKey), {
    allowedHosts: config.allowedHosts,
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
