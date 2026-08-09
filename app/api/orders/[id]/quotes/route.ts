import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { z } from "zod";

const schema = z.object({ vendorId: z.number().int().positive(), amount: z.number().nonnegative().max(100_000_000).nullable().optional(), notes: z.string().trim().max(1000).nullable().optional(), sendWhatsApp: z.boolean().default(false) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!/^\d+$/.test(id) || !parsed.success) return NextResponse.json({ error: "Invalid quote request", details: parsed.success ? undefined : parsed.error.flatten() }, { status: 400 });
  const sql = getDatabase();
  const result = await sql.begin(async (transaction) => {
    await transaction`update public.celebration_partner_quotes set status='expired' where invoice_id=${Number(id)} and vendor_id=${parsed.data.vendorId} and status='requested'`;
    const rows = await transaction<{ id: string }[]>`
      insert into public.celebration_partner_quotes (invoice_id,vendor_id,amount,notes)
      select ${Number(id)},${parsed.data.vendorId},${parsed.data.amount ?? null},${parsed.data.notes ?? null}
      where exists(select 1 from public.invoices where id=${Number(id)}) and exists(select 1 from public.vendors where id=${parsed.data.vendorId}) returning id::text
    `;
    if (!rows.length) return null;
    if (parsed.data.sendWhatsApp) {
      const vendors = await transaction<{ phone: string | null; name: string }[]>`select phone,name from public.vendors where id=${parsed.data.vendorId}`;
      const phone = vendors[0]?.phone?.replace(/\D/g, "");
      const connection = await transaction<{ id: string }[]>`select id::text from public.whatsapp_connections where status='connected' order by updated_at desc limit 1`;
      if (phone && connection[0]) await transaction`
        insert into public.whatsapp_outbox (connection_id,invoice_id,chat_id,payload,idempotency_key)
        values (${connection[0].id}::uuid,${Number(id)},${`${phone}@s.whatsapp.net`},${transaction.json({ text: parsed.data.notes || `Could you please quote for Mathaka celebration #${id}?` })},${`quote-${rows[0].id}-${randomUUID()}`})
      `;
    }
    return rows[0].id;
  });
  if (!result) return NextResponse.json({ error: "Celebration or partner not found" }, { status: 404 });
  return NextResponse.json({ quoteId: result }, { status: 201 });
}
