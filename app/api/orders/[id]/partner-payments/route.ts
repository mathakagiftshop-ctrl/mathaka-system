import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { z } from "zod";

const schema = z.object({ vendorOrderId: z.number().int().positive(), amount: z.number().positive().max(100_000_000), paymentType: z.enum(["advance","final","other"]).default("advance"), paymentMethod: z.string().trim().max(80).default("bank_transfer"), notes: z.string().trim().max(1000).nullable().optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!/^\d+$/.test(id) || !parsed.success) return NextResponse.json({ error: "Invalid partner payment", details: parsed.success ? undefined : parsed.error.flatten() }, { status: 400 });
  const sql = getDatabase();
  const result = await sql.begin(async (transaction) => {
    const orders = await transaction<{ vendor_id: number; total_amount: string | number; amount_paid: string | number }[]>`select vendor_id,total_amount,amount_paid from public.vendor_orders where id=${parsed.data.vendorOrderId} and invoice_id=${Number(id)} for update`;
    const order = orders[0]; if (!order) return null;
    const remaining = Math.max(Number(order.total_amount)-Number(order.amount_paid || 0),0);
    if (parsed.data.amount > remaining) return { error: `Payment exceeds the remaining partner balance of LKR ${remaining.toLocaleString("en-LK")}` };
    const rows = await transaction<{ id: string }[]>`insert into public.vendor_payments (vendor_order_id,vendor_id,amount,payment_type,payment_method,notes) values (${parsed.data.vendorOrderId},${order.vendor_id},${parsed.data.amount},${parsed.data.paymentType},${parsed.data.paymentMethod},${parsed.data.notes ?? null}) returning id::text`;
    await transaction`update public.vendor_orders set amount_paid=coalesce(amount_paid,0)+${parsed.data.amount}, status=case when coalesce(amount_paid,0)+${parsed.data.amount}>=total_amount then 'paid' else status end,updated_at=now() where id=${parsed.data.vendorOrderId}`;
    return { id: rows[0].id };
  });
  if (!result) return NextResponse.json({ error: "Partner assignment not found" }, { status: 404 });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ paymentId: result.id }, { status: 201 });
}
