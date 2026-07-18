export const runtime = "edge";
export async function POST(request: Request) {
  const body = await request.json() as any;
  if (!String(body?.quoteId || "").trim()) return Response.json({ code: "QUOTE_REQUIRED" }, { status: 400 });
  return Response.json({ success: true, simulated: true, paymentReference: `SIM-${Date.now().toString(36).toUpperCase()}`, warning: "No payment was processed and no VOX booking was completed." }, { headers: { "Cache-Control": "no-store" } });
}
