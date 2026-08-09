import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { updateCreateSchema } from "@/lib/server/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid celebration" }, { status: 400 });
  const parsed = updateCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid customer update", details: parsed.error.flatten() }, { status: 400 });
  const sql = getDatabase();
  const result = await sql.begin(async (transaction) => {
    const conversations = await transaction<{ id: string; connection_id: string; external_chat_id: string; connection_status: string }[]>`
      select c.id::text, c.connection_id::text, c.external_chat_id, connection.status as connection_status
      from public.whatsapp_messages m join public.whatsapp_conversations c on c.id = m.conversation_id
      join public.whatsapp_connections connection on connection.id = c.connection_id
      where m.invoice_id = ${Number(id)} order by m.sent_at desc limit 1
    `;
    const conversation = conversations[0];
    if (!conversation) return { error: "No WhatsApp conversation is linked to this celebration", status: 409 } as const;
    if (conversation.connection_status !== "connected") return { error: "WhatsApp is not connected", status: 409 } as const;
    const outbox = await transaction<{ id: string }[]>`
      insert into public.whatsapp_outbox (connection_id, invoice_id, chat_id, payload, idempotency_key)
      values (${conversation.connection_id}::uuid, ${Number(id)}, ${conversation.external_chat_id}, ${transaction.json({ text: parsed.data.body })}, ${`celebration-update-${randomUUID()}`})
      returning id::text
    `;
    const updates = await transaction<{ id: string; body: string; status: string; created_at: Date | string }[]>`
      insert into public.celebration_updates (invoice_id, conversation_id, outbox_id, body, status, created_by)
      values (${Number(id)}, ${conversation.id}::uuid, ${outbox[0].id}::uuid, ${parsed.data.body}, 'queued', ${owner.subject}::uuid)
      returning id::text, body, status, created_at
    `;
    return { update: updates[0] } as const;
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ update: { id: result.update.id, body: result.update.body, status: result.update.status, createdAt: new Date(result.update.created_at).toISOString() } }, { status: 201 });
}
