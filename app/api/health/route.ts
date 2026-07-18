import { loadConfig } from "../../../server/config.js";

export const runtime = "edge";
export async function GET() {
  const config = loadConfig({ requireCredentials: false });
  return Response.json({ ok: true, service: "voxi-2.0", voxConfigured: Boolean(config.authUrl && config.apiBaseUrl && config.basicCredential && config.apiKey), orderWritesEnabled: config.orderWritesEnabled, paymentMode: "simulation" });
}
