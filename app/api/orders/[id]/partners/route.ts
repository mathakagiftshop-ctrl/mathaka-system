import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { getOrderPartners } from "@/lib/server/partners";
import { z } from "zod";

const schema = z.object({
  vendorId: z.number().int().positive(),
  description: z.string().trim().min(1).max(500),
  amount: z.number().nonnegative().max(100_000_000),
  quoteId: z.string().uuid().optional(),
  sendWhatsApp: z.boolean().default(false),
  message: z.string().trim().min(1).max(4000).optional(),
}).superRefine((value, context) => {
  if (value.sendWhatsApp && !value.message) {
    context.addIssue({ code: "custom", path: ["message"], message: "A WhatsApp message is required when sending is enabled" });
  }
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid celebration" }, { status: 400 });
  return NextResponse.json(await getOrderPartners(Number(id)));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid celebration" }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid partner assignment", details: parsed.error.flatten() }, { status: 400 });
  const sql = getDatabase();
  const result = await sql.begin(async (transaction) => {
    const existing = await transaction<{ id: string }[]>`
      select id::text from public.vendor_orders
      where invoice_id=${Number(id)} and vendor_id=${parsed.data.vendorId} and status not in ('completed','cancelled')
      order by created_at desc limit 1
    `;
    if (existing[0]) return { kind: "existing" as const, assignmentId: existing[0].id };

    const vendors = await transaction<{ phone: string | null }[]>`
      select phone from public.vendors where id=${parsed.data.vendorId}
    `;
    const invoice = await transaction<{ exists: boolean }[]>`
      select exists(select 1 from public.invoices where id=${Number(id)}) as exists
    `;
    if (!vendors[0] || !invoice[0]?.exists) return { kind: "missing" as const };

    let connectionId: string | null = null;
    let chatId: string | null = null;
    if (parsed.data.sendWhatsApp) {
      const phone = vendors[0].phone?.replace(/\D/g, "") || "";
      const connections = await transaction<{ id: string }[]>`
        select id::text from public.whatsapp_connections where status='connected' order by updated_at desc limit 1
      `;
      if (!phone) return { kind: "no-phone" as const };
      if (!connections[0]) return { kind: "disconnected" as const };
      connectionId = connections[0].id;
      chatId = `${phone}@s.whatsapp.net`;
    }

    const rows = await transaction<{ id: string }[]>`
      insert into public.vendor_orders (invoice_id,vendor_id,description,total_amount,status)
      values (${Number(id)},${parsed.data.vendorId},${parsed.data.description},${parsed.data.amount},'assigned')
      returning id::text
    `;
    if (parsed.data.sendWhatsApp && connectionId && chatId) {
      await transaction`
        insert into public.whatsapp_outbox (connection_id,invoice_id,chat_id,payload,idempotency_key)
        values (${connectionId}::uuid,${Number(id)},${chatId},${transaction.json({ text: parsed.data.message })},${`assignment-${rows[0].id}-${randomUUID()}`})
      `;
    }
    if (parsed.data.quoteId) await transaction`
      update public.celebration_partner_quotes set status='accepted',responded_at=now()
      where id=${parsed.data.quoteId}::uuid and invoice_id=${Number(id)}
    `;
    await transaction`
      update public.celebration_journeys
      set fulfilment_mode=case when fulfilment_mode='self' then 'hybrid' else fulfilment_mode end, revision=revision+1,updated_at=now()
      where invoice_id=${Number(id)}
    `;
    return { kind: "created" as const, assignmentId: rows[0].id, messageQueued: parsed.data.sendWhatsApp };
  });

  if (result.kind === "existing") return NextResponse.json({ error: "This partner is already assigned to the celebration", assignmentId: result.assignmentId }, { status: 409 });
  if (result.kind === "missing") return NextResponse.json({ error: "Celebration or partner not found" }, { status: 404 });
  if (result.kind === "no-phone") return NextResponse.json({ error: "This partner does not have a WhatsApp phone number. Assign without sending or add their number first." }, { status: 409 });
  if (result.kind === "disconnected") return NextResponse.json({ error: "WhatsApp is not connected. Assign without sending or reconnect WhatsApp first." }, { status: 409 });
  return NextResponse.json({ assignmentId: result.assignmentId, messageQueued: result.messageQueued }, { status: 201 });
}
