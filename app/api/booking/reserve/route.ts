export const runtime = "edge";
export async function POST() {
  return Response.json({ code: "ORDER_WRITES_DISABLED", message: "Order writes remain disabled until the production order contract is approved." }, { status: 501 });
}
