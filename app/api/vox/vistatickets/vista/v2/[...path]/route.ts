import { loadConfig } from "../../../../../../../server/config.js";
import { VoxApiError, VoxClient } from "../../../../../../../server/vox-client.js";

export const runtime = "edge";
const config = loadConfig({ requireCredentials: false });
const client = new VoxClient(config);

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const correlationId = String(request.headers.get("x-correlation-id") || crypto.randomUUID()).slice(0, 128);
  try {
    if (!config.authUrl || !config.apiBaseUrl || !config.basicCredential || !config.apiKey) throw new VoxApiError("VOX credentials are not configured.", { status: 503, code: "VOX_NOT_CONFIGURED" });
    const { path } = await context.params;
    const url = new URL(request.url);
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.json();
    const payload = await client.request(path.join("/"), { method: request.method, query: Object.fromEntries(url.searchParams), body, correlationId });
    return Response.json(payload, { headers: { "Cache-Control": path[0] === "OData" && path[1] === "Cinemas" ? "private, max-age=300" : "no-store", "x-correlation-id": correlationId } });
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    return Response.json({ code: error?.code || "INTERNAL_ERROR", message: status >= 500 && !(error instanceof VoxApiError) ? "The service could not complete the request." : error.message, retryable: Boolean(error?.retryable), correlationId }, { status, headers: { "x-correlation-id": correlationId } });
  }
}

export const GET = handle;
export const POST = handle;
