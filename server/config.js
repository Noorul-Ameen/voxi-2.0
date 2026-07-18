const required = (name) => {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
};

export function loadConfig({ requireCredentials = true } = {}) {
  const read = requireCredentials ? required : (name) => String(process.env[name] || "").trim();
  return Object.freeze({
    authUrl: read("VOX_AUTH_URL"),
    apiBaseUrl: read("VOX_API_BASE_URL").replace(/\/+$/, ""),
    basicCredential: read("VOX_BASIC_CREDENTIAL"),
    apiKey: read("VOX_API_KEY"),
    port: Number(process.env.PORT || 8787),
    salesChannel: String(process.env.VOX_SALES_CHANNEL || "WWW"),
    requestTimeoutMs: Number(process.env.VOX_REQUEST_TIMEOUT_MS || 15_000),
    refreshSkewMs: Number(process.env.VOX_TOKEN_REFRESH_SKEW_SECONDS || 60) * 1000,
    orderWritesEnabled: String(process.env.VOX_ENABLE_ORDER_WRITES || "false").toLowerCase() === "true",
  });
}
