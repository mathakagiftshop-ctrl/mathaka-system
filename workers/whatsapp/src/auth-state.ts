import { BufferJSON, initAuthCreds, proto, type AuthenticationState, type SignalDataTypeMap } from "@whiskeysockets/baileys";
import { decryptJson, encryptJson } from "./crypto.js";
import { sql } from "./database.js";

type StoredAuth = {
  creds: AuthenticationState["creds"];
  keys: Record<string, Record<string, unknown>>;
};

export async function databaseAuthState(connectionId: string, encryptedState: unknown) {
  const decoded = decryptJson<string>(encryptedState);
  const stored = decoded
    ? JSON.parse(decoded, BufferJSON.reviver) as StoredAuth
    : { creds: initAuthCreds(), keys: {} };

  let persistChain = Promise.resolve();
  const persist = () => {
    persistChain = persistChain.then(async () => {
      const serialized = JSON.stringify(stored, BufferJSON.replacer);
      await sql`
        update public.whatsapp_connections
        set encrypted_auth_state = ${sql.json(encryptJson(serialized))}, updated_at = now()
        where id = ${connectionId}::uuid
      `;
    });
    return persistChain;
  };

  const state: AuthenticationState = {
    creds: stored.creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const bucket = stored.keys[type] ?? {};
        const result: { [id: string]: SignalDataTypeMap[T] } = {};
        for (const id of ids) {
          let value = bucket[id] as unknown;
          if (type === "app-state-sync-key" && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value as Record<string, unknown>);
          }
          if (value) result[id] = value as SignalDataTypeMap[T];
        }
        return result;
      },
      set: async (data) => {
        for (const category of Object.keys(data) as Array<keyof SignalDataTypeMap>) {
          const bucket = stored.keys[category] ?? {};
          const values = data[category];
          if (!values) continue;
          for (const id of Object.keys(values)) {
            const value = values[id];
            if (value) bucket[id] = value;
            else delete bucket[id];
          }
          stored.keys[category] = bucket;
        }
        await persist();
      },
    },
  };

  return { state, saveCreds: persist };
}
