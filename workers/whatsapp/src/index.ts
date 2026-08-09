import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, type WASocket } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { config } from "./config.js";
import { databaseAuthState } from "./auth-state.js";
import { clearConnectionAuth, ensureConnection, heartbeat, sql, updateConnection } from "./database.js";
import { processOutbox, storeMessage } from "./messages.js";
import { extractConversationDraft } from "./gemini.js";

const logger = pino({ level: config.logLevel });
let socket: WASocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let stopped = false;
let heartbeatTimer: NodeJS.Timeout | null = null;
let pollTimer: NodeJS.Timeout | null = null;

async function processCommands(connectionId: string) {
  const commands = await sql<{
    id: string; command: string; payload: Record<string, unknown>; attempts: number; max_attempts: number;
  }[]>`
    update public.integration_commands
    set status = 'processing', attempts = attempts + 1, last_attempt_at = now()
    where id in (
      select id from public.integration_commands
      where integration = 'whatsapp' and status = 'pending' and available_at <= now()
      order by created_at limit 1 for update skip locked
    )
    returning id::text, command, payload, attempts, max_attempts
  `;

  for (const item of commands) {
    try {
      if (item.command === "request_pairing_code") {
        const phone = String(item.payload.phone || "").replace(/\D/g, "");
        if (!phone || !socket) throw new Error("A phone number and active worker socket are required");
        const code = await socket.requestPairingCode(phone);
        await updateConnection(connectionId, {
          status: "pairing",
          phoneNumber: phone,
          pairingPayload: { type: "code", code },
          pairingExpiresAt: new Date(Date.now() + 5 * 60_000),
        });
      } else if (item.command === "reconnect") {
        socket?.end(undefined);
        await connect();
      } else if (item.command === "logout") {
        await socket?.logout();
      } else if (item.command === "extract_conversation") {
        const conversationId = String(item.payload.conversationId || "");
        if (!conversationId) throw new Error("Conversation ID is required for extraction");
        await extractConversationDraft({ conversationId });
      } else {
        throw new Error(`Unsupported command: ${item.command}`);
      }
      await sql`update public.integration_commands set status = 'completed', completed_at = now() where id = ${item.id}::uuid`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sql`
        update public.integration_commands set
          status = case when attempts >= max_attempts then 'failed' else 'pending' end,
          available_at = case when attempts >= max_attempts then available_at else now() + (interval '5 seconds' * power(2, least(attempts, 6))) end,
          completed_at = case when attempts >= max_attempts then now() else null end,
          last_error = ${message}
        where id = ${item.id}::uuid
      `;
    }
  }
}

async function connect() {
  if (stopped) return;
  const connection = await ensureConnection();
  const { state, saveCreds } = await databaseAuthState(connection.id, connection.encrypted_auth_state);
  const { version } = await fetchLatestBaileysVersion();

  socket = makeWASocket({
    version,
    auth: state,
    logger: logger.child({ module: "baileys" }),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: true,
    browser: ["Mathaka Celebration Studio", "Chrome", "1.0.0"],
    getMessage: async () => undefined,
  });

  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("messages.upsert", async ({ messages }) => {
    for (const message of messages) {
      await storeMessage(connection.id, message).catch((error) => logger.error({ error }, "message ingest failed"));
    }
  });
  socket.ev.on("messaging-history.set", async ({ messages }) => {
    logger.info({ count: messages.length }, "importing WhatsApp message history");
    for (const message of messages) {
      // Historical messages populate the inbox, but must not create hundreds of
      // Gemini extraction jobs. Only new inbound messages trigger extraction.
      await storeMessage(connection.id, message, { extract: false }).catch((error) => logger.error({ error }, "history message ingest failed"));
    }
  });
  socket.ev.on("connection.update", async ({ connection: status, lastDisconnect, qr }) => {
    if (qr) {
      await updateConnection(connection.id, {
        status: "pairing",
        pairingPayload: { type: "qr", value: qr },
        pairingExpiresAt: new Date(Date.now() + 60_000),
        lastError: null,
      });
    }
    if (status === "open") {
      const phone = socket?.user?.id?.split(":")[0] ?? null;
      await updateConnection(connection.id, {
        status: "connected",
        phoneNumber: phone,
        pairingPayload: null,
        pairingExpiresAt: null,
        lastConnectedAt: new Date(),
        lastError: null,
      });
      logger.info({ phone }, "WhatsApp connected");
    }
    if (status === "close") {
      const code = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      if (loggedOut) {
        // A remote unlink invalidates the stored Signal credentials. Clear them
        // and immediately create a new pairing session instead of getting stuck.
        await clearConnectionAuth(connection.id);
      } else {
        await updateConnection(connection.id, {
          status: "reconnecting",
          lastError: `Connection closed (${code ?? "unknown"})`,
        });
      }
      if (!stopped) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => void connect().catch((error) => logger.error({ error }, "reconnect failed")), 5_000);
      }
    }
  });

  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (pollTimer) clearInterval(pollTimer);
  heartbeatTimer = setInterval(() => void heartbeat(connection.id).catch((error) => logger.error({ error }, "heartbeat failed")), config.heartbeatMs);
  heartbeatTimer.unref();
  pollTimer = setInterval(() => {
    if (!socket) return;
    void processCommands(connection.id).catch((error) => logger.error({ error }, "command poll failed"));
    void processOutbox(connection.id, socket).catch((error) => logger.error({ error }, "outbox poll failed"));
  }, config.pollMs);
  pollTimer.unref();
}

async function shutdown(signal: string) {
  stopped = true;
  logger.info({ signal }, "worker shutting down");
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (pollTimer) clearInterval(pollTimer);
  socket?.end(undefined);
  await sql.end({ timeout: 5 });
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

connect().catch((error) => {
  logger.fatal({ error }, "worker failed to start");
  process.exit(1);
});
