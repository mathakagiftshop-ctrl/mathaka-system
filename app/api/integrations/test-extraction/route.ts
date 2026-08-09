import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase, isDatabaseConfigured } from "@/lib/server/database";

export async function POST() {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const sql = getDatabase();
  const conversations = await sql<{ id: string }[]>`
    select c.id::text from public.whatsapp_conversations c
    where exists(select 1 from public.whatsapp_messages m where m.conversation_id=c.id and nullif(trim(m.body),'') is not null)
    order by (select max(m.sent_at) from public.whatsapp_messages m where m.conversation_id=c.id) desc limit 1
  `;
  if (!conversations[0]) return NextResponse.json({ error: "No text conversation is available for a sample extraction" }, { status: 409 });
  const rows = await sql<{ id: string }[]>`
    insert into public.integration_commands (integration,command,payload,requested_by)
    values ('whatsapp','extract_conversation',${sql.json({ conversationId: conversations[0].id, source: "connection_test" })},${owner.subject}::uuid)
    on conflict do nothing returning id::text
  `;
  return NextResponse.json({ queued: Boolean(rows.length), conversationId: conversations[0].id }, { status: 202 });
}
