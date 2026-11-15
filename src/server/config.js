export function readConfig(env) {
  const apiKey = env.RTS_API_KEY?.trim();
  if (!apiKey || apiKey === "your-rts-api-key")
    throw new Error(
      "Set RTS_API_KEY in the root .env file before starting LeaveNow.",
    );
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer between 1 and 65535.");
  const bindHost = env.HOST || "127.0.0.1";
  if (!["127.0.0.1", "0.0.0.0"].includes(bindHost))
    throw new Error("HOST must be 127.0.0.1 or 0.0.0.0.");
  const extraHosts = (env.ALLOWED_HOSTS || "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  if (extraHosts.some((host) => !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(host)))
    throw new Error(
      "ALLOWED_HOSTS must be comma-separated hostnames without schemes or ports.",
    );
  const allowedHosts = [
    ...new Set(["localhost", "127.0.0.1", "[::1]", ...extraHosts]),
  ];
  return { apiKey, port, bindHost, allowedHosts };
}
