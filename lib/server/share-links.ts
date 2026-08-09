import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getDatabase } from "@/lib/server/database";
import { notFound } from "@/lib/server/errors";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createShareLink(invoiceId: number, purpose: "partner" | "gallery", expiresInHours: number) {
  const sql = getDatabase();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
  const rows = await sql<{ id: string }[]>`
    insert into public.celebration_share_links (invoice_id, token_hash, purpose, expires_at)
    select ${invoiceId}, ${hashToken(token)}, ${purpose}, ${expiresAt}
    where exists(select 1 from public.invoices where id=${invoiceId}) returning id::text
  `;
  if (!rows.length) throw notFound("Celebration not found");
  return { token, expiresAt };
}

export async function verifyShareToken(token: string, purpose: "partner" | "gallery") {
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) return null;
  const sql = getDatabase();
  const rows = await sql<{ id: string; invoice_id: number; expires_at: Date | string }[]>`
    select id::text, invoice_id, expires_at from public.celebration_share_links
    where token_hash=${hashToken(token)} and purpose=${purpose} and revoked_at is null and expires_at > now() limit 1
  `;
  return rows[0] ?? null;
}
