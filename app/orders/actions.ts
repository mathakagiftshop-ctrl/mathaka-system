"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/auth";
import { formAction, money, optionalDate, optionalUuid, positiveMoney, requiredDate, requiredText, text, UserError, uuid, errorMessage, type ActionState } from "@/lib/actions";
import { EXPENSE_CATEGORY_VALUES, JOB_STATUS_VALUES, ORDER_SOURCE_VALUES, ORDER_STATUS_VALUES, PAYMENT_METHOD_VALUES } from "@/lib/constants";
import { db, type Tx } from "@/lib/db";
import { phoneDigits } from "@/lib/whatsapp";
import { PROOF_TYPES, uploadFile, directUploadUrl } from "@/lib/storage";
import { issueDocument, type DocumentRow } from "@/lib/data/documents";
import { addDays, today } from "@/lib/format";
import { getSettings } from "@/lib/data/settings";
import { unstable_rethrow } from "next/navigation";

const touch = (orderId?: string) => {
  revalidatePath("/", "layout");
  if (orderId) revalidatePath(`/orders/${orderId}`);
};

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------

const orderSchema = z.object({
  order_id: optionalUuid,
  customer_id: optionalUuid,
  customer_name: text(120),
  customer_phone: text(40),
  customer_country: text(80),
  recipient_name: requiredText(120),
  recipient_phone: text(40),
  delivery_address: text(500),
  city: requiredText(80),
  occasion: text(120),
  delivery_date: optionalDate,
  delivery_time: text(40),
  status: z.enum(ORDER_STATUS_VALUES).default("confirmed"),
  source: z.enum(ORDER_SOURCE_VALUES).default("facebook_ad"),
  delivery_fee: money.default(0),
  markup: money.default(0),
  discount: money.default(0),
  special_request: text(2000),
  internal_notes: text(2000),
  "item_description[]": z.array(z.string().trim().max(300)).default([]),
  "item_quantity[]": z.array(z.coerce.number().positive().max(10000)).default([]),
  "item_price[]": z.array(z.coerce.number().min(0).max(100_000_000)).default([]),
});

async function resolveCustomer(tx: Tx, input: z.infer<typeof orderSchema>) {
  if (input.customer_id) {
    const [row] = await tx<{ id: string }[]>`select id from customers where id = ${input.customer_id}`;
    if (!row) throw new UserError("That customer no longer exists.");
    return row.id;
  }
  if (!input.customer_name) throw new UserError("Choose a customer or enter the new customer's name.");
  const digits = phoneDigits(input.customer_phone);
  if (digits.length >= 8) {
    const [existing] = await tx<{ id: string }[]>`
      select id from customers where regexp_replace(phone, '\\D', '', 'g') in (${digits}, ${input.customer_phone.replace(/\D/g, "")}) limit 1`;
    if (existing) return existing.id;
  }
  const [created] = await tx<{ id: string }[]>`
    insert into customers (name, phone, country) values (${input.customer_name}, ${input.customer_phone}, ${input.customer_country}) returning id`;
  return created.id;
}

export const saveOrder = async (state: ActionState, formData: FormData): Promise<ActionState> => {
  let orderId: string | null = null;
  const result = await formAction(orderSchema, async (input, user) => {
    const items = input["item_description[]"]
      .map((description, index) => ({ description, quantity: input["item_quantity[]"][index] ?? 1, unitPrice: input["item_price[]"][index] ?? 0 }))
      .filter((item) => item.description);
    if (!items.length) throw new UserError("Add at least one item (for example the cake).");
    orderId = await db().begin(async (tx) => {
      const customerId = await resolveCustomer(tx, input);
      const fields = {
        customer_id: customerId, recipient_name: input.recipient_name, recipient_phone: input.recipient_phone,
        delivery_address: input.delivery_address, city: input.city, occasion: input.occasion, delivery_date: input.delivery_date,
        delivery_time: input.delivery_time, source: input.source, delivery_fee: input.delivery_fee, markup: input.markup, discount: input.discount,
        special_request: input.special_request, internal_notes: input.internal_notes,
      };
      let id = input.order_id;
      if (id) {
        const updated = await tx`update orders set ${tx(fields)}, updated_at = now() where id = ${id} returning id`;
        if (!updated.length) throw new UserError("That order no longer exists.");
        await tx`delete from order_items where order_id = ${id}`;
      } else {
        const [created] = await tx<{ id: string }[]>`insert into orders ${tx({ ...fields, status: input.status, created_by: user.id })} returning id`;
        id = created.id;
      }
      for (const [index, item] of items.entries()) {
        await tx`insert into order_items (order_id, description, quantity, unit_price, sort_order)
                 values (${id}, ${item.description}, ${item.quantity}, ${item.unitPrice}, ${index})`;
      }
      await audit(user.id, input.order_id ? "order.updated" : "order.created", "order", id, {}, tx);
      return id;
    });
    touch(orderId ?? undefined);
    return "Order saved.";
  })(state, formData);
  if (result.ok && orderId) redirect(`/orders/${orderId}`);
  return result;
};

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const setOrderStatus = formAction(z.object({ order_id: uuid, status: z.enum(ORDER_STATUS_VALUES) }), async ({ order_id, status }, user) => {
  const sql = db();
  if (status === "completed") {
    const [check] = await sql<{ balance: number; pending: number; open_jobs: number; partner_due: number }[]>`
      select s.balance, s.pending,
        (select count(*)::int from partner_jobs where order_id = ${order_id} and status in ('assigned','accepted','ready')) as open_jobs,
        s.partner_costs - s.partner_paid as partner_due
      from order_summary s where s.order_id = ${order_id}`;
    const blockers = [
      check.balance > 0 && "the customer still owes money",
      check.pending > 0 && "a customer payment is waiting to be verified",
      check.open_jobs > 0 && "a partner job isn't marked delivered",
      check.partner_due > 0 && "a partner hasn't been paid in full",
    ].filter(Boolean);
    if (blockers.length) throw new UserError(`Can't complete yet: ${blockers.join(", ")}.`);
  }
  await sql`
    update orders set status = ${status}, updated_at = now(),
      delivered_at = case when ${status} in ('delivered','completed') then coalesce(delivered_at, now()) else delivered_at end,
      completed_at = case when ${status} = 'completed' then now() else null end,
      cancelled_at = case when ${status} = 'cancelled' then now() else null end
    where id = ${order_id}`;
  await audit(user.id, "order.status", "order", order_id, { status });
  touch(order_id);
  return "Status updated.";
});

// ---------------------------------------------------------------------------
// Customer payments
// ---------------------------------------------------------------------------

const paymentSchema = z.object({
  order_id: uuid,
  amount: positiveMoney,
  method: z.enum(PAYMENT_METHOD_VALUES).default("bank_transfer"),
  reference: text(120),
  received_on: requiredDate,
  notes: text(500),
  verified: z.string().optional(),
});

export async function addPayment(_state: ActionState, formData: FormData): Promise<ActionState> {
  // Handled outside formAction because it can carry a file.
  try {
    const user = await authorize("finance");
    const parsed = paymentSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([, value]) => typeof value === "string")));
    if (!parsed.success) return { error: `${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}`, at: Date.now() };
    const input = parsed.data;
    const proof = formData.get("proof");
    const proofKey = proof instanceof File && proof.size > 0 ? await uploadFile(proof, `payments/${input.order_id}`, PROOF_TYPES) : null;
    const verified = input.verified === "on";
    await db()`
      insert into customer_payments (order_id, amount, method, reference, received_on, notes, proof_key, status, recorded_by, verified_by, verified_at)
      values (${input.order_id}, ${input.amount}, ${input.method}, ${input.reference}, ${input.received_on}, ${input.notes}, ${proofKey},
              ${verified ? "verified" : "pending"}, ${user.id}, ${verified ? user.id : null}, ${verified ? new Date() : null})`;
    await audit(user.id, "payment.recorded", "order", input.order_id, { amount: input.amount, verified });
    touch(input.order_id);
    return { ok: true, message: verified ? "Payment recorded. You can now issue a receipt." : "Payment saved as pending — verify it once it shows in the bank.", at: Date.now() };
  } catch (error) {
    unstable_rethrow(error);
    return { error: errorMessage(error), at: Date.now() };
  }
}

export const verifyPayment = formAction(z.object({ payment_id: uuid }), async ({ payment_id }, user) => {
  const rows = await db()<{ order_id: string }[]>`
    update customer_payments set status = 'verified', verified_by = ${user.id}, verified_at = now()
    where id = ${payment_id} and status = 'pending' returning order_id`;
  if (!rows[0]) throw new UserError("That payment is not waiting for verification.");
  await audit(user.id, "payment.verified", "payment", payment_id);
  touch(rows[0].order_id);
  return "Payment verified.";
}, "finance");

export const reversePayment = formAction(z.object({ payment_id: uuid, reason: requiredText(300) }), async ({ payment_id, reason }, user) => {
  const rows = await db()<{ order_id: string }[]>`
    update customer_payments set status = 'reversed', reversed_at = now(), reversal_reason = ${reason}
    where id = ${payment_id} and status <> 'reversed' returning order_id`;
  if (!rows[0]) throw new UserError("That payment was already reversed.");
  await db()`update documents set status = 'void', voided_at = now(), void_reason = 'Payment reversed' where payment_id = ${payment_id} and status <> 'void'`;
  await audit(user.id, "payment.reversed", "payment", payment_id, { reason });
  touch(rows[0].order_id);
  return "Payment reversed (and its receipt voided).";
}, "finance");

// ---------------------------------------------------------------------------
// Partner jobs & partner payments
// ---------------------------------------------------------------------------

const jobSchema = z.object({
  order_id: uuid,
  partner_id: uuid,
  description: requiredText(300),
  agreed_amount: money,
  advance: money.default(0),
  advance_method: z.enum(PAYMENT_METHOD_VALUES).default("bank_transfer"),
  advance_reference: text(120),
});

export const assignPartner = formAction(jobSchema, async (input, user) => {
  await db().begin(async (tx) => {
    const [job] = await tx<{ id: string }[]>`
      insert into partner_jobs (order_id, partner_id, description, agreed_amount)
      values (${input.order_id}, ${input.partner_id}, ${input.description}, ${input.agreed_amount}) returning id`;
    if (input.advance > 0) {
      await tx`insert into partner_payments (partner_id, job_id, amount, kind, method, reference, created_by)
               values (${input.partner_id}, ${job.id}, ${input.advance}, 'advance', ${input.advance_method}, ${input.advance_reference}, ${user.id})`;
    }
    await tx`update orders set status = 'in_progress', updated_at = now() where id = ${input.order_id} and status in ('enquiry','confirmed')`;
    await audit(user.id, "job.assigned", "order", input.order_id, { partner: input.partner_id, amount: input.agreed_amount, advance: input.advance }, tx);
  });
  touch(input.order_id);
  revalidatePath(`/partners/${input.partner_id}`);
  return "Partner assigned.";
}, "finance");

export const updateJob = formAction(z.object({ job_id: uuid, status: z.enum(JOB_STATUS_VALUES).optional(), agreed_amount: money.optional() }), async (input, user) => {
  const [job] = await db()<{ order_id: string; partner_id: string }[]>`
    update partner_jobs set
      status = coalesce(${input.status ?? null}, status),
      agreed_amount = coalesce(${input.agreed_amount ?? null}, agreed_amount),
      updated_at = now()
    where id = ${input.job_id} returning order_id, partner_id`;
  if (!job) throw new UserError("That job no longer exists.");
  await audit(user.id, "job.updated", "job", input.job_id, input);
  touch(job.order_id);
  revalidatePath(`/partners/${job.partner_id}`);
  return "Job updated.";
});

const partnerPaymentSchema = z.object({
  partner_id: uuid,
  job_id: optionalUuid,
  amount: positiveMoney,
  kind: z.enum(["advance", "final", "other"]).default("advance"),
  method: z.enum(PAYMENT_METHOD_VALUES).default("bank_transfer"),
  reference: text(120),
  paid_on: requiredDate,
  notes: text(500),
});

export const payPartner = formAction(partnerPaymentSchema, async (input, user) => {
  const sql = db();
  if (input.job_id) {
    const [job] = await sql<{ partner_id: string; order_id: string }[]>`select partner_id, order_id from partner_jobs where id = ${input.job_id}`;
    if (!job || job.partner_id !== input.partner_id) throw new UserError("That job belongs to a different partner.");
    touch(job.order_id);
  }
  await sql`insert into partner_payments (partner_id, job_id, amount, kind, method, reference, paid_on, notes, created_by)
            values (${input.partner_id}, ${input.job_id}, ${input.amount}, ${input.kind}, ${input.method}, ${input.reference}, ${input.paid_on}, ${input.notes}, ${user.id})`;
  await audit(user.id, "partner.paid", "partner", input.partner_id, { amount: input.amount, kind: input.kind, job: input.job_id });
  revalidatePath(`/partners/${input.partner_id}`);
  revalidatePath("/partners");
  return `${input.kind === "advance" ? "Advance" : "Payment"} recorded.`;
}, "finance");

export const voidPartnerPayment = formAction(z.object({ payment_id: uuid, reason: requiredText(300) }), async ({ payment_id, reason }, user) => {
  const [row] = await db()<{ partner_id: string }[]>`
    update partner_payments set voided_at = now(), void_reason = ${reason} where id = ${payment_id} and voided_at is null returning partner_id`;
  if (!row) throw new UserError("That payment was already voided.");
  await audit(user.id, "partner_payment.voided", "partner", row.partner_id, { payment_id, reason });
  touch();
  return "Payment voided.";
}, "finance");

/** A link the partner can open to see the job and upload delivery photos. */
export const sharePartnerJob = formAction(z.object({ job_id: uuid }), async ({ job_id }) => {
  const token = randomBytes(18).toString("base64url");
  const [job] = await db()<{ order_id: string }[]>`
    update partner_jobs set share_token = coalesce(share_token, ${token}), share_expires_at = now() + interval '30 days'
    where id = ${job_id} returning order_id`;
  if (!job) throw new UserError("That job no longer exists.");
  touch(job.order_id);
  return "Partner link is ready.";
});

// ---------------------------------------------------------------------------
// Order expenses (extra costs: packaging, delivery rider, etc.)
// ---------------------------------------------------------------------------

export const addOrderExpense = formAction(z.object({
  order_id: uuid,
  category: z.enum(EXPENSE_CATEGORY_VALUES),
  description: requiredText(300),
  amount: positiveMoney,
  spent_on: requiredDate,
}), async (input, user) => {
  await db()`insert into expenses (order_id, category, description, amount, spent_on, created_by)
             values (${input.order_id}, ${input.category}, ${input.description}, ${input.amount}, ${input.spent_on}, ${user.id})`;
  await audit(user.id, "expense.added", "order", input.order_id, { amount: input.amount });
  touch(input.order_id);
  return "Cost added.";
}, "finance");

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const createDocument = async (state: ActionState, formData: FormData): Promise<ActionState> => {
  let documentId: string | null = null;
  const result = await formAction(z.object({
    order_id: uuid,
    kind: z.enum(["quote", "invoice"]),
    amount_requested: z.coerce.number().min(0).max(100_000_000).default(0),
  }), async (input, user) => {
    const settings = await getSettings();
    const termIds = (await db()<{ id: string }[]>`select id from terms where active and is_default order by sort_order`).map((row) => row.id);
    const [doc] = await db()<{ id: string }[]>`
      insert into documents (order_id, kind, amount_requested, due_date, term_ids, created_by)
      values (${input.order_id}, ${input.kind}, ${input.amount_requested > 0 ? input.amount_requested : null},
              ${addDays(today(), settings.default_due_days)}, ${termIds}, ${user.id})
      returning id`;
    documentId = doc.id;
    touch(input.order_id);
  }, "finance")(state, formData);
  if (result.ok && documentId) redirect(`/invoices/${documentId}`);
  return result;
};

export const createReceipt = async (state: ActionState, formData: FormData): Promise<ActionState> => {
  let documentId: string | null = null;
  const result = await formAction(z.object({ payment_id: uuid }), async ({ payment_id }, user) => {
    documentId = await db().begin(async (tx) => {
      const [payment] = await tx<{ order_id: string; status: string }[]>`select order_id, status from customer_payments where id = ${payment_id}`;
      if (!payment || payment.status !== "verified") throw new UserError("Only verified payments can get a receipt.");
      const termIds = (await tx<{ id: string }[]>`select id from terms where active and is_default order by sort_order`).map((row) => row.id);
      const [doc] = await tx<DocumentRow[]>`
        insert into documents (order_id, kind, payment_id, term_ids, created_by)
        values (${payment.order_id}, 'receipt', ${payment_id}, ${termIds}, ${user.id}) returning *`;
      await issueDocument(tx, doc, user.id);
      touch(payment.order_id);
      return doc.id;
    });
  }, "finance")(state, formData);
  if (result.ok && documentId) redirect(`/invoices/${documentId}`);
  return result;
};

// ---------------------------------------------------------------------------
// Media & gallery
// ---------------------------------------------------------------------------

export async function startOrderUpload(orderId: string, contentType: string, size: number) {
  await authorize();
  if (!z.uuid().safeParse(orderId).success) throw new Error("Invalid order");
  return directUploadUrl(`orders/${orderId}`, contentType, size);
}

export async function finishOrderUpload(orderId: string, key: string, contentType: string, caption: string) {
  const user = await authorize();
  if (!key.startsWith(`orders/${orderId}/`)) throw new Error("Invalid upload");
  await db()`insert into order_media (order_id, kind, storage_key, content_type, caption, uploaded_by)
             values (${orderId}, ${contentType.startsWith("video/") ? "video" : "photo"}, ${key}, ${contentType}, ${caption.slice(0, 200)}, ${user.name})`;
  touch(orderId);
}

export const shareGallery = formAction(z.object({ order_id: uuid }), async ({ order_id }) => {
  await db()`update orders set gallery_token = coalesce(gallery_token, ${randomBytes(18).toString("base64url")}) where id = ${order_id}`;
  touch(order_id);
  return "Gallery link is ready.";
});

export const deleteMedia = formAction(z.object({ media_id: uuid }), async ({ media_id }, user) => {
  const [row] = await db()<{ order_id: string }[]>`delete from order_media where id = ${media_id} returning order_id`;
  if (!row) throw new UserError("Already removed.");
  await audit(user.id, "media.removed", "order", row.order_id, { media_id });
  touch(row.order_id);
  return "Removed.";
});
