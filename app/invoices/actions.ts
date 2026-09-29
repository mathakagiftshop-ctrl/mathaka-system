"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { formAction, optionalDate, requiredText, text, UserError, uuid, type ActionState } from "@/lib/actions";
import { db } from "@/lib/db";
import { issueDocument, type DocumentRow } from "@/lib/data/documents";

const touch = (doc: { id: string; order_id: string }) => {
  revalidatePath(`/invoices/${doc.id}`);
  revalidatePath("/invoices");
  revalidatePath(`/orders/${doc.order_id}`);
};

async function draft(id: string) {
  const [doc] = await db()<DocumentRow[]>`select * from documents where id = ${id}`;
  if (!doc) throw new UserError("That document no longer exists.");
  if (doc.status !== "draft") throw new UserError("Issued documents can't be changed. Void it and create a new one.");
  return doc;
}

export const updateDraft = formAction(z.object({
  document_id: uuid,
  amount_requested: z.coerce.number().min(0).max(100_000_000).default(0),
  due_date: optionalDate,
  "term_ids[]": z.array(z.uuid()).default([]),
  extra_terms: text(3000),
  notes: text(2000),
}), async (input, user) => {
  const doc = await draft(input.document_id);
  await db()`update documents set amount_requested = ${input.amount_requested > 0 ? input.amount_requested : null},
             due_date = ${input.due_date}, term_ids = ${input["term_ids[]"]}, extra_terms = ${input.extra_terms}, notes = ${input.notes}
             where id = ${doc.id}`;
  await audit(user.id, "document.edited", "document", doc.id);
  touch(doc);
  return "Draft updated.";
}, "finance");

export const issue = formAction(z.object({ document_id: uuid }), async ({ document_id }, user) => {
  await db().begin(async (tx) => {
    const [doc] = await tx<DocumentRow[]>`select * from documents where id = ${document_id} for update`;
    if (!doc || doc.status !== "draft") throw new UserError("Only drafts can be issued.");
    const [{ items }] = await tx<{ items: number }[]>`select count(*)::int as items from order_items where order_id = ${doc.order_id}`;
    if (doc.kind !== "receipt" && items === 0) throw new UserError("Add items to the order first.");
    await issueDocument(tx, doc, user.id);
    touch(doc);
  });
  return "Issued. Share it with the customer below.";
}, "finance");

export const voidDocument = formAction(z.object({ document_id: uuid, reason: requiredText(300) }), async ({ document_id, reason }, user) => {
  const [doc] = await db()<{ id: string; order_id: string }[]>`
    update documents set status = 'void', voided_at = now(), void_reason = ${reason}, share_token = null
    where id = ${document_id} and status = 'issued' returning id, order_id`;
  if (!doc) throw new UserError("Only issued documents can be voided.");
  await audit(user.id, "document.voided", "document", document_id, { reason });
  touch(doc);
  return "Voided. The customer link no longer works.";
}, "finance");

export async function deleteDraft(state: ActionState, formData: FormData): Promise<ActionState> {
  let orderId: string | null = null;
  const result = await formAction(z.object({ document_id: uuid }), async ({ document_id }, user) => {
    const doc = await draft(document_id);
    await db()`delete from documents where id = ${doc.id} and status = 'draft'`;
    await audit(user.id, "document.deleted", "document", doc.id);
    orderId = doc.order_id;
    touch(doc);
  }, "finance")(state, formData);
  if (result.ok && orderId) redirect(`/orders/${orderId}`);
  return result;
}
