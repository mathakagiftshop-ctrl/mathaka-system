import postgres from "postgres";
import { config } from "./config.js";

export const sql = postgres(config.databaseUrl, {
  max: 4,
  idle_timeout: 20,
  connect_timeout: 15,
  prepare: false,
  ssl: "require",
});

export type ConnectionRow = {
  id: string;
  status: string;
  phone_number: string | null;
  encrypted_auth_state: unknown;
};

export async function ensureConnection() {
  const rows = await sql<ConnectionRow[]>`
    insert into public.whatsapp_connections (label, status, worker_id, last_heartbeat_at)
    values ('Mathaka Celebration Studio', 'reconnecting', ${config.workerId}, now())
    on conflict (worker_id) where worker_id is not null
    do update set last_heartbeat_at = now(), updated_at = now()
    returning id::text, status, phone_number, encrypted_auth_state
  `;
  const connection = rows[0];
  if (!connection) throw new Error("Unable to initialize WhatsApp connection row");
  return connection;
}

export async function updateConnection(connectionId: string, values: {
  status?: string;
  phoneNumber?: string | null;
  pairingPayload?: Record<string, unknown> | null;
  pairingExpiresAt?: Date | null;
  lastConnectedAt?: Date | null;
  lastError?: string | null;
}) {
  await sql`
    update public.whatsapp_connections set
      status = coalesce(${values.status ?? null}, status),
      phone_number = case when ${values.phoneNumber === undefined} then phone_number else ${values.phoneNumber ?? null} end,
      pairing_payload = case when ${values.pairingPayload === undefined} then pairing_payload else ${sql.json(JSON.parse(JSON.stringify(values.pairingPayload ?? null)))} end,
      pairing_expires_at = case when ${values.pairingExpiresAt === undefined} then pairing_expires_at else ${values.pairingExpiresAt ?? null} end,
      last_connected_at = case when ${values.lastConnectedAt === undefined} then last_connected_at else ${values.lastConnectedAt ?? null} end,
      last_error = case when ${values.lastError === undefined} then last_error else ${values.lastError ?? null} end,
      last_heartbeat_at = now(),
      updated_at = now()
    where id = ${connectionId}::uuid
  `;
}

export async function heartbeat(connectionId: string) {
  await sql`
    update public.whatsapp_connections
    set last_heartbeat_at = now(), updated_at = now()
    where id = ${connectionId}::uuid
  `;
}

export async function clearConnectionAuth(connectionId: string) {
  await sql`
    update public.whatsapp_connections
    set encrypted_auth_state = null,
        phone_number = null,
        pairing_payload = null,
        pairing_expires_at = null,
        last_connected_at = null,
        status = 'reconnecting',
        last_error = null,
        last_heartbeat_at = now(),
        updated_at = now()
    where id = ${connectionId}::uuid
  `;
}
