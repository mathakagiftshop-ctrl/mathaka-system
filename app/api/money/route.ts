import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";

export async function GET() {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sql = getDatabase();
  const summary = await sql<{ collected: string | number; costs: string | number; partner_outstanding: string | number; profit: string | number }[]>`
    select coalesce(sum(i.amount_paid),0) as collected, coalesce(sum(i.total_cost),0) as costs,
      (select coalesce(sum(greatest(vo.total_amount-coalesce(vo.amount_paid,0),0)),0) from public.vendor_orders vo) as partner_outstanding,
      coalesce(sum(i.amount_paid-i.total_cost),0) as profit from public.invoices i
  `;
  const orders = await sql`
    select i.id::text, i.invoice_number as "invoiceNumber", c.name as sender, coalesce(r.name,'Recipient pending') as recipient,
      i.total, coalesce(i.amount_paid,0) as paid, coalesce(i.total_cost,0) as costs,
      coalesce(i.amount_paid,0)-coalesce(i.total_cost,0) as profit, coalesce(j.journey_status,i.order_status,'details') as status
    from public.invoices i join public.customers c on c.id=i.customer_id left join public.recipients r on r.id=i.recipient_id
    left join public.celebration_journeys j on j.invoice_id=i.id order by i.created_at desc limit 100
  `;
  const row = summary[0];
  return NextResponse.json({ summary: { collected: Number(row.collected), costs: Number(row.costs), partnerOutstanding: Number(row.partner_outstanding), profit: Number(row.profit) }, orders });
}
