import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import { loadConfig } from "./config.js";
import { VoxApiError, VoxClient } from "./vox-client.js";

const config = loadConfig({ requireCredentials: false });
const app = express();
const client = new VoxClient(config);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configured = () => Boolean(config.authUrl && config.apiBaseUrl && config.basicCredential && config.apiKey);
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: "64kb" }));
app.use((req, res, next) => {
  req.correlationId = String(req.get("x-correlation-id") || crypto.randomUUID()).slice(0, 128);
  res.set("x-correlation-id", req.correlationId);
  next();
});
const requireVox = (_req, _res, next) => configured() ? next() : next(new VoxApiError(
  "VOX development credentials are not configured on this server.", { status: 503, code: "VOX_NOT_CONFIGURED" },
));

app.get("/health", (_req, res) => res.json({
  ok: true, service: "voxi-2.0", voxConfigured: configured(),
  orderWritesEnabled: config.orderWritesEnabled, paymentMode: "simulation",
}));

app.use("/api/vox/vistatickets/vista/v2", requireVox, asyncRoute(async (req, res) => {
  const relative = req.originalUrl.split("/api/vox/vistatickets/vista/v2/")[1] || "";
  const [pathname, rawQuery] = relative.split("?");
  const payload = await client.request(pathname, {
    method: req.method,
    query: Object.fromEntries(new URLSearchParams(rawQuery || "")),
    body: req.method === "GET" ? undefined : req.body,
    correlationId: req.correlationId,
  });
  res.set("Cache-Control", pathname.startsWith("OData/Cinemas") ? "private, max-age=300" : "no-store");
  res.json(payload);
}));

app.post("/api/booking/quote", requireVox, asyncRoute(async (req, res) => {
  const cinemaId = String(req.body?.CinemaId || "").trim();
  const sessionId = String(req.body?.SessionId || "").trim();
  const seats = Array.isArray(req.body?.Seats) ? req.body.Seats.map(String) : [];
  if (!cinemaId || !sessionId || !seats.length) return res.status(400).json({ code: "INVALID_QUOTE_REQUEST" });
  const ticketResponse = await client.request(`Data/Cinemas/${encodeURIComponent(cinemaId)}/sessions/${encodeURIComponent(sessionId)}/tickets`, {
    query: { salesChannel: config.salesChannel }, correlationId: req.correlationId,
  });
  const tickets = (ticketResponse?.Tickets || []).filter((ticket) => Number(ticket.PriceInCents) > 0);
  if (!tickets.length) throw new VoxApiError("No priced ticket type is available.", { status: 409, code: "NO_TICKET_TYPES" });
  const regular = tickets.find((ticket) => /^(?:premium view|standard|adult)(?:\s+2d)?$/i.test(String(ticket.Description || "").trim()))
    || tickets.filter((ticket) => !/(?:bank|visa|voucher|vchr|comp|spoil|upgrade|package|pkg|kids?|student|birthday|promo|test)/i.test(String(ticket.Description || "")))
      .sort((a, b) => Number(a.PriceInCents) - Number(b.PriceInCents))[0]
    || tickets.slice().sort((a, b) => Number(a.PriceInCents) - Number(b.PriceInCents))[0];
  const items = seats.map((seatId) => ({ seatId, amount: Number(regular.PriceInCents) / 100, ticketTypeCode: regular.TicketTypeCode }));
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  res.set("Cache-Control", "no-store").json({
    QuoteId: `live-${sessionId}-${crypto.randomUUID()}`, Items: items, Subtotal: subtotal,
    FeeTotal: 0, Total: subtotal, CurrencyCode: "AED", Source: "VOX_SESSION_TICKET_TYPES",
  });
}));

app.post("/api/booking/reserve", requireVox, (_req, res) => res.status(501).json({
  code: config.orderWritesEnabled ? "ORDER_CONTRACT_PENDING" : "ORDER_WRITES_DISABLED",
  message: "Order writes require the approved initial UserSessionId, sales-channel, expiry, conflict, and idempotency contract.",
}));

app.post("/api/payment/simulate", (req, res) => {
  if (!String(req.body?.quoteId || "").trim()) return res.status(400).json({ code: "QUOTE_REQUIRED" });
  res.set("Cache-Control", "no-store").json({
    success: true, simulated: true, paymentReference: `SIM-${Date.now().toString(36).toUpperCase()}`,
    warning: "No payment was processed and no VOX booking was completed.",
  });
});

app.use(express.static(path.join(root, "dist"), { index: false, maxAge: "1y", immutable: true }));
app.get("/{*splat}", (req, res, next) => !path.extname(req.path) ? res.sendFile(path.join(root, "dist", "index.html")) : next());
app.use((error, req, res, _next) => {
  const status = Number(error?.status) || 500;
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  console.error(JSON.stringify({ level: "error", correlationId: req.correlationId, code: error?.code || "INTERNAL_ERROR", status: safeStatus }));
  res.status(safeStatus).json({
    code: error?.code || "INTERNAL_ERROR",
    message: safeStatus >= 500 && !(error instanceof VoxApiError) ? "The service could not complete the request." : error.message,
    retryable: Boolean(error?.retryable), correlationId: req.correlationId,
  });
});

app.listen(config.port, "0.0.0.0", () => console.log(JSON.stringify({
  level: "info", message: "VOXi server ready", port: config.port, voxConfigured: configured(),
})));
