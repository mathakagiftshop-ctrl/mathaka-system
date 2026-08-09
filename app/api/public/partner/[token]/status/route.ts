import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/database";
import { verifyShareToken } from "@/lib/server/share-links";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await verifyShareToken(token, "partner");
  if (!link) return NextResponse.json({ error: "This partner link is invalid or expired" }, { status: 404 });
  const body = await request.json().catch(() => null) as { status?: unknown } | null;
  if (body?.status !== "ready" && body?.status !== "delivered") return NextResponse.json({ error: "Status must be ready or delivered" }, { status: 400 });
  const sql = getDatabase();
  if (body.status === "ready") {
    await sql`update public.vendor_orders set status='ready',updated_at=now() where invoice_id=${link.invoice_id} and status not in ('completed','cancelled')`;
    await sql`update public.celebration_journeys set journey_status='preparing',revision=revision+1,updated_at=now() where invoice_id=${link.invoice_id} and journey_status in ('details','confirmed')`;
  } else {
    await sql`update public.vendor_orders set status='completed',completed_at=now(),updated_at=now() where invoice_id=${link.invoice_id} and status<>'cancelled'`;
    await sql`update public.invoices set order_status='delivered',delivered_at=now() where id=${link.invoice_id}`;
    await sql`update public.celebration_journeys set journey_status='memories',revision=revision+1,updated_at=now() where invoice_id=${link.invoice_id}`;
  }
  return NextResponse.json({ status: body.status });
}
