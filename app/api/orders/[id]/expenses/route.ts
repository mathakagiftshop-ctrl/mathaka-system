import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { expenseCreateSchema } from "@/lib/server/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid celebration" }, { status: 400 });
  const parsed = expenseCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid expense", details: parsed.error.flatten() }, { status: 400 });
  const sql = getDatabase();
  const rows = await sql<{ id: string }[]>`
    insert into public.expenses (invoice_id, description, amount, notes)
    select ${Number(id)}, ${parsed.data.description}, ${parsed.data.amount}, ${parsed.data.notes ?? null}
    where exists (select 1 from public.invoices where id = ${Number(id)}) returning id::text
  `;
  if (!rows.length) return NextResponse.json({ error: "Celebration not found" }, { status: 404 });
  await sql`update public.invoices set total_cost = (select coalesce(sum(amount),0) from public.expenses where invoice_id = ${Number(id)}) where id = ${Number(id)}`;
  return NextResponse.json({ expense: { id: rows[0].id, ...parsed.data } }, { status: 201 });
}
