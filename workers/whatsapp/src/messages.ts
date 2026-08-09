import { extractMessageContent, type WASocket, type WAMessage } from "@whiskeysockets/baileys";
import { sql } from "./database.js";

function messageText(message: WAMessage) {
  const content = extractMessageContent(message.message);
  return content?.conversation
    || content?.extendedTextMessage?.text
    || content?.imageMessage?.caption
    || content?.videoMessage?.caption
    || content?.buttonsResponseMessage?.selectedDisplayText
    || content?.listResponseMessage?.title
    || null;
}

function mimeType(message: WAMessage) {
  const content = extractMessageContent(message.message);
  return content?.imageMessage?.mimetype
    || content?.videoMessage?.mimetype
    || content?.audioMessage?.mimetype
    || content?.documentMessage?.mimetype
    || null;
}

export async function storeMessage(connectionId: string, message: WAMessage, options: { extract?: boolean } = {}) {
  const chatId = message.key.remoteJid;
  const externalId = message.key.id;
  if (!chatId || !externalId || chatId === "status@broadcast" || chatId.endsWith("@g.us") || chatId.endsWith("@newsletter")) return;
  const body = messageText(message);
  const media = mimeType(message);
  // History sync includes protocol/key-distribution records. They are not
  // customer-visible messages and must not create empty ghost conversations.
  if (!body?.trim() && !media) return;

  const conversations = await sql<{ id: string }[]>`
    insert into public.whatsapp_conversations (connection_id, external_chat_id)
    values (${connectionId}::uuid, ${chatId})
    on conflict (connection_id, external_chat_id) do update set external_chat_id = excluded.external_chat_id
    returning id::text
  `;
  const conversationId = conversations[0]?.id;
  if (!conversationId) return;
  const sentAt = message.messageTimestamp
    ? new Date(Number(message.messageTimestamp) * 1000)
    : new Date();

  const inserted = await sql<{ id: string }[]>`
    insert into public.whatsapp_messages (
      conversation_id, external_message_id, direction, body, media_mime_type, sent_at, raw_payload
    ) values (
      ${conversationId}::uuid,
      ${externalId},
      ${message.key.fromMe ? "outbound" : "inbound"},
      ${body},
      ${media},
      ${sentAt},
      ${sql.json(JSON.parse(JSON.stringify(message)))}
    )
    on conflict (external_message_id) do nothing
    returning id::text
  `;

  if (options.extract !== false && inserted.length && !message.key.fromMe && body?.trim()) {
    await sql`
      insert into public.integration_commands (integration, command, payload)
      select 'whatsapp', 'extract_conversation', ${sql.json({ conversationId, source: "automatic" })}
      where not exists (
        select 1 from public.integration_commands
        where integration = 'whatsapp'
          and command = 'extract_conversation'
          and status in ('pending', 'processing')
          and payload->>'conversationId' = ${conversationId}
      )
      on conflict do nothing
    `;
  }
}

export async function processOutbox(connectionId: string, socket: WASocket) {
  const claimed = await sql.begin(async (transaction) => {
    const rows = await transaction<{
      id: string; chat_id: string; payload: Record<string, unknown>;
    }[]>`
      select id::text, chat_id, payload
      from public.whatsapp_outbox
      where status = 'pending'
        and available_at <= now()
        and (connection_id is null or connection_id = ${connectionId}::uuid)
      order by created_at
      limit 10
      for update skip locked
    `;
    if (rows.length) {
      await transaction`
        update public.whatsapp_outbox
        set status = 'processing', attempts = attempts + 1
        where id = any(${rows.map((row) => row.id)}::uuid[])
      `;
    }
    return rows;
  });

  for (const item of claimed) {
    try {
      await socket.sendMessage(item.chat_id, item.payload as Parameters<WASocket["sendMessage"]>[1]);
      await sql`update public.whatsapp_outbox set status = 'sent', sent_at = now(), last_error = null where id = ${item.id}::uuid`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sql`
        update public.whatsapp_outbox
        set status = case when attempts >= 5 then 'failed' else 'pending' end,
            available_at = now() + (interval '5 seconds' * power(2, least(attempts, 6))), last_error = ${message}
        where id = ${item.id}::uuid
      `;
    }
  }
}
