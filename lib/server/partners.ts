import "server-only";
import { getDatabase } from "@/lib/server/database";

export async function getPartners() {
  const sql = getDatabase();
  const rows = await sql<{
    id: number; name: string; phone: string | null; address: string | null; notes: string | null;
    services: string[]; service_areas: string[]; reliability: string | number; open_orders: string | number; balance: string | number;
  }[]>`
    select v.id, v.name, v.phone, v.address, v.notes, coalesce(p.services,'{}') as services,
      coalesce(p.service_areas,'{}') as service_areas, coalesce(p.reliability,100) as reliability,
      (select count(*) from public.vendor_orders vo where vo.vendor_id=v.id and vo.status not in ('completed','cancelled')) as open_orders,
      (select coalesce(sum(greatest(vo.total_amount-coalesce(vo.amount_paid,0),0)),0) from public.vendor_orders vo where vo.vendor_id=v.id) as balance
    from public.vendors v left join public.vendor_profiles p on p.vendor_id=v.id
    where coalesce(p.active,true) order by v.name
  `;
  return rows.map((row) => ({ id: String(row.id), name: row.name, phone: row.phone, address: row.address, notes: row.notes,
    location: row.service_areas.join(", ") || row.address || "Service area not set", services: row.services,
    serviceAreas: row.service_areas, reliability: Number(row.reliability), openOrders: Number(row.open_orders), balance: Number(row.balance) }));
}

export async function getOrderPartners(invoiceId: number) {
  const sql = getDatabase();
  const [quotes, assignments] = await Promise.all([
    sql`select q.id::text, q.vendor_id::text as "vendorId", v.name as "vendorName", q.amount, q.status, q.notes, q.requested_at as "requestedAt" from public.celebration_partner_quotes q join public.vendors v on v.id=q.vendor_id where q.invoice_id=${invoiceId} order by q.requested_at desc`,
    sql`select vo.id::text, vo.vendor_id::text as "vendorId", v.name as "vendorName", vo.description, vo.total_amount as "totalAmount", vo.amount_paid as "amountPaid", vo.status from public.vendor_orders vo join public.vendors v on v.id=vo.vendor_id where vo.invoice_id=${invoiceId} order by vo.created_at desc`,
  ]);
  return { quotes, assignments };
}
