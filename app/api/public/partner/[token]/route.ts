import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/database";
import { verifyShareToken } from "@/lib/server/share-links";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await verifyShareToken(token, "partner");
  if (!link) return NextResponse.json({ error: "This partner link is invalid or expired" }, { status: 404 });
  const sql = getDatabase();
  const rows = await sql<{
    recipient: string; occasion: string; delivery_at: Date | string | null; district: string | null; address: string | null;
    reference: string; journey_status: string; partner_status: string | null;
  }[]>`
    select coalesce(r.name,'Recipient details pending') as recipient, coalesce(d.title,i.invoice_number) as occasion,
      j.delivery_at, z.name as district, r.address, i.invoice_number as reference, coalesce(j.journey_status,'details') as journey_status,
      (select vo.status from public.vendor_orders vo where vo.invoice_id=i.id order by vo.created_at desc limit 1) as partner_status
    from public.invoices i left join public.recipients r on r.id=i.recipient_id
    left join public.important_dates d on d.customer_id=i.customer_id and d.recipient_id is not distinct from i.recipient_id
    left join public.celebration_journeys j on j.invoice_id=i.id left join public.delivery_zones z on z.id=i.delivery_zone_id
    where i.id=${link.invoice_id} limit 1
  `;
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Celebration not found" }, { status: 404 });
  const [items, tasks, counts] = await Promise.all([
    sql<{ description: string }[]>`select description from public.invoice_items where invoice_id=${link.invoice_id} order by id`,
    sql<{ id: string; title: string; complete: boolean }[]>`select id::text,title,(completed_at is not null) as complete from public.celebration_tasks where invoice_id=${link.invoice_id} order by sort_order,created_at`,
    sql<{ photos: number; videos: number }[]>`select count(*) filter(where kind='photo')::int as photos,count(*) filter(where kind='video')::int as videos from public.celebration_media where invoice_id=${link.invoice_id}`,
  ]);
  const delivery = row.delivery_at ? new Date(row.delivery_at) : null;
  const rawStatus = (row.partner_status || row.journey_status).toLowerCase();
  const status = ["completed", "delivered", "memories", "reconciled"].includes(rawStatus)
    ? "delivered"
    : ["ready", "paid"].includes(rawStatus)
      ? "ready"
      : "open";
  return NextResponse.json({
    celebration: {
      recipient: row.recipient, occasion: row.occasion,
      dateLabel: delivery ? new Intl.DateTimeFormat("en-LK", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Colombo" }).format(delivery) : "Delivery date not set",
      deliveryTime: delivery ? new Intl.DateTimeFormat("en-LK", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Colombo" }).format(delivery) : null,
      district: row.district, address: row.address, reference: row.reference, items: items.map((item) => item.description),
      checklist: tasks.filter((task) => !task.complete).map((task) => task.title),
    },
    status,
    mediaCounts: { photos: counts[0]?.photos ?? 0, videos: counts[0]?.videos ?? 0 },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
