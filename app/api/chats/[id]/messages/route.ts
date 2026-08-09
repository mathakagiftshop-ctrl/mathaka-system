import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase, isDatabaseConfigured } from "@/lib/server/database";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });

  let body = "";
  try {
    const payload = await request.json() as { body?: unknown };
    body = typeof payload.body === "string" ? payload.body.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!body || body.length > 4000) {
    return NextResponse.json({ error: "Message must be between 1 and 4,000 characters" }, { status: 400 });
  }

  const sql = getDatabase();
  const conversations = await sql<{ connection_id: string; external_chat_id: string; connection_status: string }[]>`
    select c.connection_id::text, c.external_chat_id, connection.status as connection_status
    from public.whatsapp_conversations c
    join public.whatsapp_connections connection on connection.id = c.connection_id
    where c.id = ${id}::uuid
    limit 1
  `;
  const conversation = conversations[0];
  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  if (conversation.connection_status !== "connected") {
    return NextResponse.json({ error: "WhatsApp is not connected" }, { status: 409 });
  }

  await sql`
    insert into public.whatsapp_outbox (
      connection_id, chat_id, payload, idempotency_key
    ) values (
      ${conversation.connection_id}::uuid,
      ${conversation.external_chat_id},
      ${sql.json({ text: body })},
      ${`studio-${randomUUID()}`}
    )
  `;

  return NextResponse.json({ queued: true }, { status: 202 });
}
