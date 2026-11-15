export function readConfig(env) {
  const apiKey = env.RTS_API_KEY?.trim();
  if (!apiKey || apiKey === "your-rts-api-key")
    throw new Error(
      "Set RTS_API_KEY in the root .env file before starting LeaveNow.",
    );
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer between 1 and 65535.");
  return { apiKey, port };
}
