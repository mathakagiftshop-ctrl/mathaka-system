import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase, isDatabaseConfigured } from "@/lib/server/database";
import { conflict, notFound, routeError } from "@/lib/server/errors";
import { draftPatchSchema, type DraftSnapshot } from "@/lib/server/validation";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request" }, { status: 400 });
  }
  const parsed = draftPatchSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid draft details", details: parsed.error.flatten() }, { status: 400 });

  const sql = getDatabase();
  try {
    const draft = await sql.begin(async (transaction) => {
      const rows = await transaction<{
        id: string; invoice_id: number | null; status: string; snapshot: DraftSnapshot; missing_fields: string[];
        confidence: Record<string, number>; source_message_ids: string[]; revision: number; updated_at: Date | string;
      }[]>`
        select id::text, invoice_id, status, snapshot, missing_fields, confidence, source_message_ids, revision, updated_at
        from public.ai_order_drafts where conversation_id = ${id}::uuid for update
      `;
      const current = rows[0];
      if (!current) throw notFound("Draft not found");
      if (parsed.data.expectedRevision && parsed.data.expectedRevision !== current.revision) {
        throw conflict("This draft changed while you were editing it. Reload the latest version before saving.");
      }
      if (current.invoice_id && parsed.data.action === "discard") {
        throw conflict("A draft linked to a celebration cannot be discarded");
      }

      const nextSnapshot = parsed.data.snapshot ?? current.snapshot;
      const nextMissing = parsed.data.snapshot ? missingFields(nextSnapshot) : current.missing_fields;
      const nextStatus = parsed.data.action === "confirm" ? "confirmed" : parsed.data.action === "discard" ? "discarded" : "reviewed";
      const nextRevision = current.revision + 1;
      const updated = await transaction<typeof rows>`
        update public.ai_order_drafts set
          snapshot = ${transaction.json(nextSnapshot)}, missing_fields = ${nextMissing},
          status = ${nextStatus}, revision = ${nextRevision}, reviewed_at = now(), reviewed_by = ${owner.subject}::uuid,
          confirmed_at = case when ${nextStatus} = 'confirmed' then now() else confirmed_at end,
          discarded_at = case when ${nextStatus} = 'discarded' then now() else null end,
          updated_at = now()
        where id = ${current.id}::uuid
        returning id::text, invoice_id, status, snapshot, missing_fields, confidence, source_message_ids, revision, updated_at
      `;
      await transaction`
        insert into public.ai_order_draft_revisions
          (draft_id, revision, snapshot, missing_fields, confidence, source_message_ids, source, actor_id)
        values (${current.id}::uuid, ${nextRevision}, ${transaction.json(nextSnapshot)}, ${nextMissing},
          ${transaction.json(current.confidence)}, ${current.source_message_ids},
          ${parsed.data.action === "confirm" ? "confirmation" : parsed.data.action === "discard" ? "discard" : "staff"}, ${owner.subject}::uuid)
      `;
      return updated[0];
    });
    return NextResponse.json({ draft: serializeDraft(draft) });
  } catch (error) {
    return routeError(error, "The draft could not be saved");
  }
}

function present(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function missingFields(snapshot: DraftSnapshot) {
  const missing: string[] = [];
  if (!present(snapshot.sender.name)) missing.push("sender.name");
  if (!present(snapshot.recipient.name)) missing.push("recipient.name");
  if (!present(snapshot.occasion)) missing.push("occasion");
  if (!present(snapshot.delivery.date)) missing.push("delivery.date");
  if (!present(snapshot.delivery.address)) missing.push("delivery.address");
  if (!present(snapshot.delivery.district)) missing.push("delivery.district");
  if (!snapshot.items.length) missing.push("items");
  if (snapshot.agreedPrice.amount == null) missing.push("agreedPrice.amount");
  return missing;
}

function serializeDraft(draft: {
  id: string; invoice_id: number | null; status: string; snapshot: DraftSnapshot; missing_fields: string[];
  confidence: Record<string, number>; source_message_ids: string[]; revision: number; updated_at: Date | string;
}) {
  return {
    id: draft.id, invoiceId: draft.invoice_id, status: draft.status, snapshot: draft.snapshot,
    missingFields: draft.missing_fields, confidence: draft.confidence,
    sourceMessageCount: draft.source_message_ids.length, revision: draft.revision,
    updatedAt: new Date(draft.updated_at).toISOString(),
  };
}
