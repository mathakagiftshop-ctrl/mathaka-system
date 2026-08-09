import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase, isDatabaseConfigured } from "@/lib/server/database";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });
  const sql = getDatabase();
  const conversations = await sql<{ message_count: number | string }[]>`
    select count(m.id) as message_count
    from public.whatsapp_conversations c
    left join public.whatsapp_messages m on m.conversation_id = c.id and nullif(trim(m.body), '') is not null
    where c.id = ${id}::uuid
    group by c.id
  `;
  if (!conversations.length) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  if (Number(conversations[0].message_count) === 0) {
    return NextResponse.json({ error: "This conversation has no text messages to extract" }, { status: 409 });
  }

  const inserted = await sql<{ id: string }[]>`
    insert into public.integration_commands (integration, command, payload, requested_by)
    select 'whatsapp', 'extract_conversation', ${sql.json({ conversationId: id, source: "manual" })}, ${owner.subject}::uuid
    where not exists (
      select 1 from public.integration_commands
      where integration = 'whatsapp'
        and command = 'extract_conversation'
        and status in ('pending', 'processing')
        and payload->>'conversationId' = ${id}
    )
    on conflict do nothing
    returning id::text
  `;

  return NextResponse.json({ queued: Boolean(inserted.length) }, { status: 202 });
}
