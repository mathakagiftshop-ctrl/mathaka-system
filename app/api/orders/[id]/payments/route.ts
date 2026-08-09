import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { paymentCreateSchema } from "@/lib/server/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid celebration" }, { status: 400 });
  const parsed = paymentCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment", details: parsed.error.flatten() }, { status: 400 });
  const sql = getDatabase();
  const rows = await sql<{ id: string }[]>`
    insert into public.payments (invoice_id, amount, payment_method, notes)
    select ${Number(id)}, ${parsed.data.amount}, ${parsed.data.paymentMethod}, ${parsed.data.notes ?? null}
    where exists (select 1 from public.invoices where id = ${Number(id)}) returning id::text
  `;
  if (!rows.length) return NextResponse.json({ error: "Celebration not found" }, { status: 404 });
  await sql`update public.invoices set amount_paid = (select coalesce(sum(amount),0) from public.payments where invoice_id = ${Number(id)}), paid_at = case when (select coalesce(sum(amount),0) from public.payments where invoice_id = ${Number(id)}) >= total then now() else paid_at end where id = ${Number(id)}`;
  return NextResponse.json({ payment: { id: rows[0].id, ...parsed.data } }, { status: 201 });
}
