import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase, isDatabaseConfigured } from "@/lib/server/database";

export const dynamic = "force-dynamic";

type ConversationRow = {
  id: string;
  phone: string;
  contact_kind: string;
  display_name: string | null;
  last_message: string | null;
  last_message_at: Date | string | null;
  message_count: number | string;
  text_message_count: number | string;
};

type MessageRow = {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  media_mime_type: string | null;
  sent_at: Date | string;
};

type DraftRow = {
  id: string;
  invoice_id: number | null;
  status: "draft" | "reviewed" | "confirmed" | "discarded";
  snapshot: Record<string, unknown>;
  missing_fields: string[];
  confidence: Record<string, number>;
  source_message_ids: string[];
  updated_at: Date | string;
  revision: number;
};

type ExtractionRow = { status: string; last_error: string | null };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function friendlyPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? `+${digits}` : "Unknown number";
}

export async function GET(request: Request) {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const sql = getDatabase();
  const url = new URL(request.url);
  const requestedConversation = url.searchParams.get("conversation");

  const connections = await sql<{ status: string; phone_number: string | null }[]>`
    select status, phone_number
    from public.whatsapp_connections
    where worker_id = 'mathaka-celebration-wa-v1'
    order by updated_at desc
    limit 1
  `;

  const rows = await sql<ConversationRow[]>`
    select
      c.id::text,
      split_part(c.external_chat_id, '@', 1) as phone,
      c.contact_kind,
      (
        select nullif(m.raw_payload->>'pushName', '')
        from public.whatsapp_messages m
        where m.conversation_id = c.id
          and nullif(m.raw_payload->>'pushName', '') is not null
        order by m.sent_at desc
        limit 1
      ) as display_name,
      latest.body as last_message,
      latest.sent_at as last_message_at,
      (select count(*) from public.whatsapp_messages total where total.conversation_id = c.id) as message_count
      ,(select count(*) from public.whatsapp_messages text_message where text_message.conversation_id = c.id and nullif(trim(text_message.body), '') is not null) as text_message_count
    from public.whatsapp_conversations c
    left join lateral (
      select m.body, m.sent_at
      from public.whatsapp_messages m
      where m.conversation_id = c.id
      order by m.sent_at desc
      limit 1
    ) latest on true
    where exists (
      select 1 from public.whatsapp_messages visible
      where visible.conversation_id = c.id
        and (nullif(trim(visible.body), '') is not null or visible.media_mime_type is not null)
    )
    order by latest.sent_at desc nulls last, c.created_at desc
    limit 200
  `;

  const conversations = rows.map((row) => {
    const phone = friendlyPhone(row.phone);
    return {
      id: row.id,
      displayName: row.display_name || phone,
      phone,
      contactKind: row.contact_kind,
      lastMessage: row.last_message,
      lastMessageAt: row.last_message_at ? new Date(row.last_message_at).toISOString() : null,
      messageCount: Number(row.message_count),
      textMessageCount: Number(row.text_message_count),
    };
  });

  const selectedId = requestedConversation && UUID_PATTERN.test(requestedConversation)
    && conversations.some((item) => item.id === requestedConversation)
    ? requestedConversation
    : conversations[0]?.id;

  const messageRows = selectedId
    ? await sql<MessageRow[]>`
        select id::text, direction, body, media_mime_type, sent_at
        from public.whatsapp_messages
        where conversation_id = ${selectedId}::uuid
        order by sent_at asc
        limit 500
      `
    : [];
  const selectedConversation = conversations.find((item) => item.id === selectedId) ?? null;
  const draftRows = selectedId
    ? await sql<DraftRow[]>`
        select id::text, invoice_id, status, snapshot, missing_fields, confidence, source_message_ids, revision, updated_at
        from public.ai_order_drafts
        where conversation_id = ${selectedId}::uuid
        limit 1
      `
    : [];
  const extractionRows = selectedId
    ? await sql<ExtractionRow[]>`
        select status, last_error
        from public.integration_commands
        where integration = 'whatsapp'
          and command = 'extract_conversation'
          and payload->>'conversationId' = ${selectedId}
        order by created_at desc
        limit 1
      `
    : [];
  const draft = draftRows[0];
  const command = extractionRows[0];
  const extractionStatus = command?.status === "pending" || command?.status === "processing" || command?.status === "failed"
    ? command.status
    : "idle";

  return NextResponse.json({
    connection: {
      status: connections[0]?.status ?? "disconnected",
      phone: connections[0]?.phone_number ? friendlyPhone(connections[0].phone_number) : null,
    },
    conversations,
    selectedConversation: selectedConversation ? {
      id: selectedConversation.id,
      displayName: selectedConversation.displayName,
      phone: selectedConversation.phone,
      textMessageCount: selectedConversation.textMessageCount,
    } : null,
    messages: messageRows.map((message) => ({
      id: message.id,
      direction: message.direction,
      body: message.body,
      mediaMimeType: message.media_mime_type,
      sentAt: new Date(message.sent_at).toISOString(),
    })),
    draft: draft ? {
      id: draft.id,
      invoiceId: draft.invoice_id,
      status: draft.status,
      snapshot: draft.snapshot,
      missingFields: draft.missing_fields,
      confidence: draft.confidence,
      sourceMessageCount: draft.source_message_ids.length,
      revision: draft.revision,
      updatedAt: new Date(draft.updated_at).toISOString(),
    } : null,
    extraction: {
      status: extractionStatus,
      error: extractionStatus === "failed" ? command?.last_error ?? "Extraction failed" : null,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
