import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid celebration" }, { status: 400 });
  const sql = getDatabase();
  const checks = await sql<{ exists: boolean; open_tasks: number; missing_photos: number; missing_videos: number; customer_balance: string | number; partner_balance: string | number }[]>`
    select exists(select 1 from public.invoices where id=${Number(id)}) as exists,
      (select count(*)::int from public.celebration_tasks where invoice_id=${Number(id)} and completed_at is null) as open_tasks,
      greatest(coalesce((select minimum_photos from public.celebration_media_requirements where invoice_id=${Number(id)}),3) - (select count(*) from public.celebration_media where invoice_id=${Number(id)} and kind='photo'),0)::int as missing_photos,
      greatest(coalesce((select minimum_videos from public.celebration_media_requirements where invoice_id=${Number(id)}),1) - (select count(*) from public.celebration_media where invoice_id=${Number(id)} and kind='video'),0)::int as missing_videos,
      (select greatest(total-coalesce(amount_paid,0),0) from public.invoices where id=${Number(id)}) as customer_balance,
      (select coalesce(sum(greatest(total_amount-coalesce(amount_paid,0),0)),0) from public.vendor_orders where invoice_id=${Number(id)}) as partner_balance
  `;
  const check = checks[0];
  if (!check?.exists) return NextResponse.json({ error: "Celebration not found" }, { status: 404 });
  const blockers = [
    check.open_tasks ? `${check.open_tasks} preparation tasks remain` : null,
    check.missing_photos ? `${check.missing_photos} required photos remain` : null,
    check.missing_videos ? `${check.missing_videos} required videos remain` : null,
    Number(check.customer_balance) > 0 ? "Customer balance remains" : null,
    Number(check.partner_balance) > 0 ? "Partner balance remains" : null,
  ].filter(Boolean);
  if (blockers.length) return NextResponse.json({ error: "This celebration is not ready to reconcile", blockers }, { status: 409 });
  await sql`
    update public.celebration_journeys set journey_status='reconciled', reconciled_at=now(), revision=revision+1,
      updated_by=${owner.subject}::uuid, updated_at=now() where invoice_id=${Number(id)}
  `;
  return NextResponse.json({ reconciled: true });
}
