import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "./config.js";

type EncryptedPayload = { version: 1; iv: string; tag: string; data: string };

function encryptionKey() {
  const key = Buffer.from(config.authEncryptionKey, "base64");
  if (key.length !== 32) throw new Error("WHATSAPP_AUTH_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return key;
}

export function encryptJson(value: unknown): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  };
}

export function decryptJson<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== "object") return null;
  const encrypted = payload as Partial<EncryptedPayload>;
  if (encrypted.version !== 1 || !encrypted.iv || !encrypted.tag || !encrypted.data) return null;
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  const clear = Buffer.concat([decipher.update(Buffer.from(encrypted.data, "base64")), decipher.final()]);
  return JSON.parse(clear.toString("utf8")) as T;
}
