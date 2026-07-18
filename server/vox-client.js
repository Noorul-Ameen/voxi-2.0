export class VoxApiError extends Error {
  constructor(message, { status = 502, code = "VOX_UPSTREAM_ERROR", retryable = false, details = null } = {}) {
    super(message);
    this.name = "VoxApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export class VoxClient {
  #config; #token = null; #tokenExpiresAt = 0; #tokenRequest = null;
  constructor(config) { this.#config = config; }

  async #fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#config.requestTimeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const text = await response.text();
      let body = null;
      if (text) {
        try { body = JSON.parse(text); }
        catch { throw new VoxApiError("VOX returned malformed JSON.", { code: "VOX_INVALID_JSON" }); }
      }
      if (!response.ok) throw new VoxApiError("VOX rejected the request.", {
        status: response.status,
        code: "VOX_HTTP_ERROR",
        retryable: response.status === 429 || response.status >= 500,
        details: body?.ErrorDescription || body?.message || null,
      });
      return body;
    } catch (error) {
      if (error instanceof VoxApiError) throw error;
      const timeout = error?.name === "AbortError";
      throw new VoxApiError(timeout ? "VOX request timed out." : "VOX could not be reached.", {
        code: timeout ? "VOX_TIMEOUT" : "VOX_NETWORK_ERROR", retryable: true,
      });
    } finally { clearTimeout(timer); }
  }

  async #accessToken() {
    if (this.#token && Date.now() < this.#tokenExpiresAt - this.#config.refreshSkewMs) return this.#token;
    if (this.#tokenRequest) return this.#tokenRequest;
    this.#tokenRequest = (async () => {
      const payload = await this.#fetchJson(this.#config.authUrl, {
        headers: { Authorization: `Basic ${this.#config.basicCredential}`, Accept: "application/json" },
      });
      const token = String(payload?.access_token || "").trim();
      if (!token) throw new VoxApiError("VOX authentication returned no access token.", { code: "VOX_AUTH_INVALID" });
      this.#token = token;
      this.#tokenExpiresAt = Date.now() + Math.max(30, Number(payload?.expires_in || 3600)) * 1000;
      return token;
    })();
    try { return await this.#tokenRequest; } finally { this.#tokenRequest = null; }
  }

  async request(path, { method = "GET", query, body, correlationId } = {}) {
    const token = await this.#accessToken();
    const url = new URL(`${this.#config.apiBaseUrl}/${String(path).replace(/^\/+/, "")}`);
    for (const [key, value] of Object.entries(query || {})) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    const payload = await this.#fetchJson(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`, "x-api-key": this.#config.apiKey, Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(correlationId ? { "x-correlation-id": correlationId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = Number(payload?.Result ?? payload?.ResponseCode ?? 0);
    const extended = Number(payload?.ExtendedResultCode ?? 0);
    if ((Number.isFinite(result) && result !== 0) || (Number.isFinite(extended) && extended !== 0)) {
      throw new VoxApiError(payload?.ErrorDescription || "VOX returned a business error.", {
        status: 409, code: "VOX_BUSINESS_ERROR", details: { result, extended },
      });
    }
    return payload;
  }
}
