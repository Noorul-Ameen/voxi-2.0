import { loadConfig } from "../../../../server/config.js";
import { VoxApiError, VoxClient } from "../../../../server/vox-client.js";

export const runtime = "edge";
const config = loadConfig({ requireCredentials: false });
const client = new VoxClient(config);

export async function POST(request: Request) {
  const correlationId = String(request.headers.get("x-correlation-id") || crypto.randomUUID()).slice(0, 128);
  try {
    const body = await request.json() as any;
    const cinemaId = String(body?.CinemaId || "").trim();
    const sessionId = String(body?.SessionId || "").trim();
    const seats = Array.isArray(body?.Seats) ? body.Seats.map(String) : [];
    if (!cinemaId || !sessionId || !seats.length) return Response.json({ code: "INVALID_QUOTE_REQUEST" }, { status: 400 });
    const ticketResponse: any = await client.request(`Data/Cinemas/${encodeURIComponent(cinemaId)}/sessions/${encodeURIComponent(sessionId)}/tickets`, { query: { salesChannel: config.salesChannel }, correlationId });
    const tickets = (ticketResponse?.Tickets || []).filter((ticket: any) => Number(ticket.PriceInCents) > 0);
    if (!tickets.length) throw new VoxApiError("No priced ticket type is available.", { status: 409, code: "NO_TICKET_TYPES" });
    const regular = tickets.find((ticket: any) => /^(?:premium view|standard|adult)(?:\s+2d)?$/i.test(String(ticket.Description || "").trim()))
      || tickets.filter((ticket: any) => !/(?:bank|visa|voucher|vchr|comp|spoil|upgrade|package|pkg|kids?|student|birthday|promo|test)/i.test(String(ticket.Description || "")))
        .sort((a: any, b: any) => Number(a.PriceInCents) - Number(b.PriceInCents))[0]
      || tickets.slice().sort((a: any, b: any) => Number(a.PriceInCents) - Number(b.PriceInCents))[0];
    const items = seats.map((seatId: string) => ({ seatId, amount: Number(regular.PriceInCents) / 100, ticketTypeCode: regular.TicketTypeCode }));
    const subtotal = items.reduce((sum: number, item: any) => sum + item.amount, 0);
    return Response.json({ QuoteId: `live-${sessionId}-${crypto.randomUUID()}`, Items: items, Subtotal: subtotal, FeeTotal: 0, Total: subtotal, CurrencyCode: "AED", Source: "VOX_SESSION_TICKET_TYPES" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return Response.json({ code: error?.code || "INTERNAL_ERROR", message: error?.message || "Quote failed", correlationId }, { status: Number(error?.status) || 500 });
  }
}
