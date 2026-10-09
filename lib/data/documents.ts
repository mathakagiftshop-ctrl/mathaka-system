import "server-only";
import type postgres from "postgres";
import { randomBytes } from "node:crypto";
import { audit } from "@/lib/audit";
import { db, type Tx } from "@/lib/db";
import type { DocumentKind, DocumentSnapshot } from "@/lib/document-types";
import { round } from "@/lib/money";
import { today } from "@/lib/format";

export type DocumentRow = {
  id: string;
  order_id: string;
  kind: DocumentKind;
  number: string | null;
  status: "draft" | "issued" | "void";
  payment_id: string | null;
  amount_requested: number | null;
  due_date: string | null;
  term_ids: string[];
  extra_terms: string;
  notes: string;
  snapshot: DocumentSnapshot | null;
  share_token: string | null;
  share_expires_at: Date | null;
  created_at: Date;
  issued_at: Date | null;
  voided_at: Date | null;
  void_reason: string | null;
};

/** Build a document's contents from the current order, settings and terms. */
export async function buildSnapshot(sql: postgres.Sql | postgres.TransactionSql, doc: DocumentRow, number: string | null): Promise<DocumentSnapshot> {
  const [[settings], [order], items, terms, payments] = await Promise.all([
    sql`select * from settings where id = 1`,
    sql`select o.*, c.name as customer_name, c.phone as customer_phone, c.country as customer_country, s.items_subtotal, s.total, s.paid
        from orders o join customers c on c.id = o.customer_id join order_summary s on s.order_id = o.id where o.id = ${doc.order_id}`,
    sql<{ description: string; quantity: number }[]>`
      select description, quantity from order_items where order_id = ${doc.order_id} order by sort_order, id`,
    doc.term_ids.length
      ? sql<{ title: string; body: string }[]>`select title, body from terms where id in ${sql(doc.term_ids)} order by sort_order, created_at`
      : Promise.resolve([] as { title: string; body: string }[]),
    doc.payment_id
      ? sql<{ amount: number; method: string; reference: string; received_on: string }[]>`
          select amount, method, reference, received_on from customer_payments where id = ${doc.payment_id}`
      : Promise.resolve([] as { amount: number; method: string; reference: string; received_on: string }[]),
  ]);
  const extra = doc.extra_terms.trim() ? [{ title: "", body: doc.extra_terms.trim() }] : [];
  return {
    kind: doc.kind,
    number,
    issueDate: today(),
    dueDate: doc.kind === "receipt" ? null : doc.due_date,
    currency: settings.currency,
    business: {
      name: settings.business_name, tagline: settings.tagline, phone: settings.phone, email: settings.email,
      address: settings.address, website: settings.website, logoKey: settings.logo_key,
    },
    customer: { name: order.customer_name, phone: order.customer_phone, country: order.customer_country },
    recipient: { name: order.recipient_name, city: order.city, address: order.delivery_address },
    order: { number: order.number, occasion: order.occasion, deliveryDate: order.delivery_date },
    // Customers see one package price with free delivery; our costs and markup stay internal.
    items: items.map((item) => ({ description: item.description, quantity: item.quantity })),
    packagePrice: round(order.total + order.discount),
    subtotal: round(order.total + order.discount),
    deliveryFee: 0,
    discount: order.discount,
    total: order.total,
    paidToDate: order.paid,
    balance: round(order.total - order.paid),
    amountRequested: doc.kind === "invoice" ? doc.amount_requested : null,
    payment: payments[0] ? { amount: payments[0].amount, method: payments[0].method, reference: payments[0].reference, receivedOn: payments[0].received_on } : null,
    terms: [...terms, ...extra],
    paymentInstructions: doc.kind === "receipt" ? "" : settings.payment_instructions,
    bankDetails: doc.kind === "receipt" ? "" : settings.bank_details,
    footer: settings.invoice_footer,
    notes: doc.notes,
  };
}

export async function getDocument(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sql = db();
  const [doc] = await sql<DocumentRow[]>`select * from documents where id = ${id}`;
  if (!doc) return null;
  const [snapshot, [live]] = await Promise.all([
    doc.snapshot ?? buildSnapshot(sql, doc, null),
    sql<{ paid: number; balance: number; total: number }[]>`select paid, balance, total from order_summary where order_id = ${doc.order_id}`,
  ]);
  return { doc, snapshot, live };
}

/** Public lookup by share token. Returns null for unknown, expired, draft or void links. */
export async function getSharedDocument(token: string) {
  const sql = db();
  const [doc] = await sql<DocumentRow[]>`
    select * from documents where share_token = ${token} and status = 'issued' and (share_expires_at is null or share_expires_at > now())`;
  if (!doc?.snapshot) return null;
  const [live] = await sql<{ paid: number; balance: number }[]>`select paid, balance from order_summary where order_id = ${doc.order_id}`;
  return { doc, snapshot: doc.snapshot, live };
}

export async function listDocuments(options: { kind?: string; status?: string; q?: string } = {}) {
  const sql = db();
  const q = options.q?.trim() ? `%${options.q.trim()}%` : null;
  return sql<{ id: string; kind: DocumentKind; number: string | null; status: string; order_id: string; order_number: string; customer_name: string; recipient_name: string; amount: number; created_at: Date; issued_at: Date | null }[]>`
    select d.id, d.kind, d.number, d.status, d.order_id, o.number as order_number, c.name as customer_name, o.recipient_name,
      coalesce(case d.kind when 'receipt' then (d.snapshot->'payment'->>'amount')::numeric
                            else coalesce((d.snapshot->>'amountRequested')::numeric, (d.snapshot->>'total')::numeric) end,
               d.amount_requested, s.total) as amount,
      d.created_at, d.issued_at
    from documents d join orders o on o.id = d.order_id join customers c on c.id = o.customer_id join order_summary s on s.order_id = o.id
    where true
      ${options.kind ? sql`and d.kind = ${options.kind}` : sql``}
      ${options.status ? sql`and d.status = ${options.status}` : sql``}
      ${q ? sql`and (d.number ilike ${q} or o.number ilike ${q} or c.name ilike ${q} or o.recipient_name ilike ${q})` : sql``}
    order by d.created_at desc limit 300
  `;
}

/** Allocates the next number and freezes the document's contents. */
export async function issueDocument(tx: Tx, doc: DocumentRow, userId: string) {
  const column = { quote: "next_quote_number", invoice: "next_invoice_number", receipt: "next_receipt_number" }[doc.kind];
  const prefix = { quote: "quote_prefix", invoice: "invoice_prefix", receipt: "receipt_prefix" }[doc.kind];
  const [settings] = await tx.unsafe<{ prefix: string; next: number; padding: number }[]>(
    `update settings set ${column} = ${column} + 1 where id = 1 returning ${prefix} as prefix, ${column} - 1 as next, number_padding as padding`,
  );
  const number = `${settings.prefix}-${String(settings.next).padStart(settings.padding, "0")}`;
  const snapshot = await buildSnapshot(tx, doc, number);
  await tx`update documents set number = ${number}, status = 'issued', snapshot = ${tx.json(snapshot as never)},
           issued_by = ${userId}, issued_at = now(), share_token = coalesce(share_token, ${randomBytes(18).toString("base64url")})
           where id = ${doc.id}`;
  await audit(userId, "document.issued", "document", doc.id, { number }, tx);
}
