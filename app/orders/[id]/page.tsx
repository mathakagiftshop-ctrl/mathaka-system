import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, MessageCircle, Pencil, Receipt } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, Money, StatusBadge } from "@/components/bits";
import { ActionButton, ActionForm, Field, Select, Submit } from "@/components/form";
import { CopyButton } from "@/components/client-bits";
import { MediaUploader } from "@/components/uploader";
import {
  addOrderExpense, addPayment, assignPartner, createDocument, createReceipt, deleteMedia, finishOrderUpload,
  payPartner, reversePayment, setOrderStatus, shareGallery, sharePartnerJob, startOrderUpload, updateJob, verifyPayment,
} from "@/app/orders/actions";
import { can, requireUser } from "@/lib/auth";
import { EXPENSE_CATEGORIES, JOB_STATUSES, ORDER_SOURCES, ORDER_STATUSES, PAYMENT_METHODS, expenseLabel, methodLabel } from "@/lib/constants";
import { getOrder, type OrderDetail } from "@/lib/data/orders";
import { findPartners, partnerOptions } from "@/lib/data/partners";
import { getSettings } from "@/lib/data/settings";
import { formatDate, formatMoney, relativeDay, titleCase, today } from "@/lib/format";
import { advanceAmount } from "@/lib/money";
import { viewUrl } from "@/lib/storage";
import { baseUrl } from "@/lib/url";
import { whatsappLink } from "@/lib/whatsapp";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const order = await getOrder((await params).id);
  return { title: order ? `${order.number} · ${order.recipient_name}` : "Order" };
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, order] = await Promise.all([requireUser(), getOrder(id)]);
  if (!order) notFound();
  const finance = can(user, "finance");
  const [settings, matches, allPartners, site] = await Promise.all([
    getSettings(),
    findPartners(order.city, { date: order.delivery_date, excludeOrderId: order.id }),
    partnerOptions(),
    baseUrl(),
  ]);
  const currency = settings.currency;
  const galleryUrl = order.gallery_token ? `${site}/g/${order.gallery_token}` : null;

  return (
    <AppShell>
      <Link className="back" href="/orders"><ArrowLeft size={15} />Orders</Link>
      <header className="page-header">
        <div>
          <span className="eyebrow">{order.number} · {order.occasion || "Order"}</span>
          <h1>{order.recipient_name}</h1>
          <p>
            {order.city} · {formatDate(order.delivery_date, { weekday: "short" })} {order.delivery_time && `· ${order.delivery_time}`} · <strong>{relativeDay(order.delivery_date)}</strong>
          </p>
        </div>
        <div className="row">
          <StatusBadge status={order.status} />
          <Link className="btn" href={`/orders/${order.id}/edit`}><Pencil size={15} />Edit</Link>
        </div>
      </header>

      <StatusSteps order={order} />

      <div className="grid sidebar-right">
        <div className="stack">
          <Delivery order={order} />
          <Items order={order} currency={currency} finance={finance} />
          <Partners order={order} matches={matches} allPartners={allPartners} currency={currency} finance={finance} site={site} />
          <Media order={order} galleryUrl={galleryUrl} />
        </div>
        <div className="stack">
          <CustomerCard order={order} currency={currency} galleryUrl={galleryUrl} />
          {finance && <MoneyCard order={order} currency={currency} />}
          {finance && <Payments order={order} currency={currency} />}
          {finance && <Documents order={order} currency={currency} advancePercent={settings.default_advance_percent} />}
          {finance && <Costs order={order} currency={currency} />}
        </div>
      </div>
    </AppShell>
  );
}

function StatusSteps({ order }: { order: NonNullable<OrderDetail> }) {
  const flow = ORDER_STATUSES.filter((status) => status.value !== "cancelled");
  const currentIndex = flow.findIndex((status) => status.value === order.status);
  return (
    <div className="status-steps" aria-label="Order status">
      {flow.map((status, index) => (
        <ActionButton key={status.value} action={setOrderStatus} fields={{ order_id: order.id, status: status.value }}
          className={status.value === order.status ? "current" : index < currentIndex ? "done" : ""}>
          {status.label}
        </ActionButton>
      ))}
      {order.status !== "cancelled"
        ? <ActionButton action={setOrderStatus} fields={{ order_id: order.id, status: "cancelled" }} confirm="Cancel this order?">Cancel order</ActionButton>
        : <ActionButton action={setOrderStatus} fields={{ order_id: order.id, status: "confirmed" }} className="current">Cancelled — reopen</ActionButton>}
    </div>
  );
}

function Delivery({ order }: { order: NonNullable<OrderDetail> }) {
  return (
    <section className="card">
      <h2>Delivery</h2>
      <dl className="kv">
        <dt>Recipient</dt><dd>{order.recipient_name}</dd>
        <dt>Phone</dt><dd>{order.recipient_phone || "—"}</dd>
        <dt>City</dt><dd>{order.city}</dd>
        <dt>Address</dt><dd style={{ whiteSpace: "pre-wrap" }}>{order.delivery_address || "—"}</dd>
        <dt>When</dt><dd>{formatDate(order.delivery_date, { weekday: "long" })} {order.delivery_time}</dd>
        <dt>Occasion</dt><dd>{order.occasion || "—"}</dd>
        <dt>Special request</dt><dd style={{ whiteSpace: "pre-wrap" }}>{order.special_request || "—"}</dd>
        {order.internal_notes && <><dt>Internal notes</dt><dd style={{ whiteSpace: "pre-wrap" }}>{order.internal_notes}</dd></>}
        <dt>Source</dt><dd>{ORDER_SOURCES.find((source) => source.value === order.source)?.label ?? order.source}</dd>
      </dl>
    </section>
  );
}

function Items({ order, currency, finance }: { order: NonNullable<OrderDetail>; currency: string; finance: boolean }) {
  return (
    <section className="card">
      <h2>Items</h2>
      <div className="table-wrap table-plain">
        <table>
          <thead><tr><th>Item</th><th className="right">Qty</th>{finance && <><th className="right">Our cost</th><th className="right">Amount</th></>}</tr></thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id}>
                <td>{item.description}</td><td className="right num">{item.quantity}</td>
                {finance && <><td className="right"><Money value={item.unit_price} currency={currency} /></td><td className="right"><Money value={item.quantity * item.unit_price} currency={currency} /></td></>}
              </tr>
            ))}
          </tbody>
          {finance && (
            <tfoot>
              {order.delivery_fee > 0 && <tr><td colSpan={3}>Delivery cost</td><td className="right"><Money value={order.delivery_fee} currency={currency} /></td></tr>}
              {order.markup > 0 && <tr><td colSpan={3}>Our profit</td><td className="right"><Money value={order.markup} currency={currency} /></td></tr>}
              {order.discount > 0 && <tr><td colSpan={3}>Discount</td><td className="right"><Money value={-order.discount} currency={currency} /></td></tr>}
              <tr><td colSpan={3}>Package price (customer pays)</td><td className="right"><Money value={order.total} currency={currency} /></td></tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

function Partners({ order, matches, allPartners, currency, finance, site }: {
  order: NonNullable<OrderDetail>; matches: Awaited<ReturnType<typeof findPartners>>; allPartners: Awaited<ReturnType<typeof partnerOptions>>;
  currency: string; finance: boolean; site: string;
}) {
  return (
    <section className="card">
      <div className="card-head"><h2>Partners</h2><Link className="link" href={`/partners?city=${encodeURIComponent(order.city)}${order.delivery_date ? `&date=${order.delivery_date}` : ""}`}>Open partner finder →</Link></div>
      {order.jobs.length > 0 ? (
        <div className="stack">
          {order.jobs.map((job) => {
            const jobUrl = job.share_token ? `${site}/p/${job.share_token}` : null;
            const message = `Hi ${job.partner_name}, new job from Mathaka 🎉\n${job.description}\nFor: ${order.recipient_name}, ${order.city}\nDelivery: ${formatDate(order.delivery_date, { weekday: "short" })} ${order.delivery_time}\n${order.special_request ? `Note: ${order.special_request}\n` : ""}${jobUrl ? `Job details & photo upload: ${jobUrl}` : ""}`;
            return (
              <div key={job.id} className="card" style={{ boxShadow: "none", padding: 14 }}>
                <div className="spread">
                  <div>
                    <Link className="link" href={`/partners/${job.partner_id}`}>{job.partner_name}</Link> <small>· {job.partner_city}</small>
                    <p>{job.description}</p>
                  </div>
                  <Badge tone={job.status === "delivered" ? "sage" : job.status === "cancelled" ? "ribbon" : "gold"}>{titleCase(job.status)}</Badge>
                </div>
                {finance && (
                  <p style={{ marginTop: 8, fontSize: 14 }}>
                    Agreed <strong><Money value={job.agreed_amount} currency={currency} /></strong> · Paid <strong><Money value={job.paid} currency={currency} /></strong>
                    {job.agreed_amount - job.paid > 0 && <> · Still owe <strong style={{ color: "var(--ribbon-dark)" }}><Money value={job.agreed_amount - job.paid} currency={currency} /></strong></>}
                  </p>
                )}
                <div className="row" style={{ marginTop: 10 }}>
                  {JOB_STATUSES.filter((status) => status.value !== job.status).map((status) => (
                    <ActionButton key={status.value} action={updateJob} fields={{ job_id: job.id, status: status.value }} className="btn small ghost"
                      confirm={status.value === "cancelled" ? "Cancel this partner job?" : undefined}>
                      {status.label}
                    </ActionButton>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <a className="btn small whatsapp" href={whatsappLink(job.partner_phone, message)} target="_blank" rel="noreferrer"><MessageCircle size={14} />Send job on WhatsApp</a>
                  {jobUrl ? <CopyButton text={jobUrl} label="Copy partner link" /> : <ActionButton action={sharePartnerJob} fields={{ job_id: job.id }}>Create partner link</ActionButton>}
                </div>
                {finance && (
                  <details className="panel" style={{ marginTop: 10 }}>
                    <summary>Pay {job.partner_name}</summary>
                    <div className="panel-body">
                      <ActionForm action={payPartner}>
                        <input type="hidden" name="partner_id" value={job.partner_id} />
                        <input type="hidden" name="job_id" value={job.id} />
                        <div className="form-grid">
                          <Field label="Amount" name="amount" type="number" min="1" step="0.01" required defaultValue={Math.max(job.agreed_amount - job.paid, 0) || undefined} />
                          <Select label="Type" name="kind" options={[{ value: "advance", label: "Advance" }, { value: "final", label: "Final payment" }, { value: "other", label: "Other" }]} defaultValue={job.paid > 0 ? "final" : "advance"} />
                          <Select label="Method" name="method" options={PAYMENT_METHODS} />
                          <Field label="Date" name="paid_on" type="date" defaultValue={today()} required />
                          <Field label="Reference" name="reference" className="full" />
                        </div>
                        <Submit>Record payment</Submit>
                      </ActionForm>
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted" style={{ marginBottom: 12 }}>No partner assigned yet.</p>
      )}

      {finance && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 6 }}>Partners for {order.city}{order.delivery_date && ` on ${formatDate(order.delivery_date)}`}</h3>
          {matches.length === 0 ? (
            <p className="muted">No partner covers {order.city} yet. <Link className="link" href="/partners/new">Add a partner</Link> or assign anyone below.</p>
          ) : (
            <div className="list">
              {matches.slice(0, 6).map((partner) => (
                <div key={partner.id}>
                  <div>
                    <strong>{partner.name} <small style={{ display: "inline" }}>· {partner.city}</small></strong>
                    <small>{partner.reason}{partner.covers && partner.distanceKm ? ` · ${Math.round(partner.distanceKm)} km` : ""} · {partner.services.join(", ") || "No services listed"}</small>
                    <small>{partner.jobsThatDay ? `⚠ Already has ${partner.jobsThatDay} other job(s) that day` : order.delivery_date ? "Free that day" : "Set a delivery date to check availability"}{partner.rating ? ` · ${"★".repeat(partner.rating)}` : ""}</small>
                  </div>
                  {partner.covers ? <Badge tone="sage">Covers</Badge> : <Badge>Nearby</Badge>}
                </div>
              ))}
            </div>
          )}
          <details className="panel" style={{ marginTop: 12 }}>
            <summary>Assign a partner</summary>
            <div className="panel-body">
              <ActionForm action={assignPartner}>
                <input type="hidden" name="order_id" value={order.id} />
                <div className="form-grid">
                  <Select label="Partner" name="partner_id" required className="full" options={[
                    { value: "", label: "Choose…" },
                    ...matches.map((partner) => ({ value: partner.id, label: `${partner.name} — ${partner.city} (${partner.reason})` })),
                    ...allPartners.filter((partner) => !matches.some((match) => match.id === partner.id)).map((partner) => ({ value: partner.id, label: `${partner.name} — ${partner.city}` })),
                  ]} />
                  <Field label="What they'll do" name="description" required className="full" defaultValue={order.items.map((item) => item.description).join(", ")} />
                  <Field label="Agreed amount (we pay them)" name="agreed_amount" type="number" min="0" step="0.01" required />
                  <Field label="Advance paid now" name="advance" type="number" min="0" step="0.01" defaultValue={0} hint="Leave 0 if you haven't paid yet." />
                  <Select label="Advance paid by" name="advance_method" options={PAYMENT_METHODS} />
                  <Field label="Advance reference" name="advance_reference" />
                </div>
                <Submit>Assign partner</Submit>
              </ActionForm>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

async function Media({ order, galleryUrl }: { order: NonNullable<OrderDetail>; galleryUrl: string | null }) {
  const media = await Promise.all(order.media.map(async (item) => ({ ...item, url: await viewUrl(item.storage_key) })));
  return (
    <section className="card">
      <div className="card-head">
        <h2>Photos & video</h2>
        <div className="row">
          {galleryUrl ? <CopyButton text={galleryUrl} label="Copy gallery link" /> : media.length > 0 && <ActionButton action={shareGallery} fields={{ order_id: order.id }}>Create gallery link</ActionButton>}
        </div>
      </div>
      {media.length ? (
        <div className="media-grid" style={{ marginBottom: 12 }}>
          {media.map((item) => (
            <figure key={item.id}>
              {item.url && (item.kind === "video" ? <video src={item.url} controls preload="metadata" /> : <img src={item.url} alt={item.caption || "Delivery photo"} loading="lazy" />)}
              <figcaption className="spread">
                <span>{item.uploaded_by}</span>
                <ActionButton action={deleteMedia} fields={{ media_id: item.id }} className="btn small ghost" confirm="Remove this file?">✕</ActionButton>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="muted" style={{ marginBottom: 12 }}>No photos yet. Partners can upload with their job link, or upload them here.</p>
      )}
      <MediaUploader start={startOrderUpload.bind(null, order.id)} finish={finishOrderUpload.bind(null, order.id)} />
    </section>
  );
}

function CustomerCard({ order, currency, galleryUrl }: { order: NonNullable<OrderDetail>; currency: string; galleryUrl: string | null }) {
  const first = order.customer_name.split(" ")[0];
  const when = `${formatDate(order.delivery_date, { weekday: "short" })}${order.delivery_time ? `, ${order.delivery_time}` : ""}`;
  const templates = [
    { label: "Order confirmed", text: `Hi ${first}, thank you for choosing Mathaka! 🎉\nYour order ${order.number} for ${order.recipient_name} (${order.city}) on ${when} is confirmed.\nTotal: ${formatMoney(order.total, currency)}\nPaid: ${formatMoney(order.paid, currency)}\nBalance: ${formatMoney(Math.max(order.balance, 0), currency)}` },
    { label: "Payment reminder", text: `Hi ${first}, a gentle reminder that the balance of ${formatMoney(Math.max(order.balance, 0), currency)} for ${order.recipient_name}'s surprise (${order.number}) is due before delivery on ${when}. Thank you!` },
    { label: "Out for delivery", text: `Hi ${first}, your surprise for ${order.recipient_name} is on the way! 🚗🎁` },
    { label: "Delivered", text: `Hi ${first}, your surprise for ${order.recipient_name} has been delivered! 🎉${galleryUrl ? `\nPhotos & video: ${galleryUrl}` : ""}\nThank you for celebrating with Mathaka ❤️` },
  ];
  return (
    <section className="card">
      <div className="card-head"><h2>Customer</h2><Link className="link" href={`/customers?q=${encodeURIComponent(order.customer_phone || order.customer_name)}`}>History →</Link></div>
      <p><strong>{order.customer_name}</strong></p>
      <p className="muted">{order.customer_phone || "No phone"} · {order.customer_country || "—"}</p>
      <div className="stack" style={{ gap: 6, marginTop: 12 }}>
        {templates.map((template) => (
          <a key={template.label} className="btn small whatsapp" href={whatsappLink(order.customer_phone, template.text)} target="_blank" rel="noreferrer">
            <MessageCircle size={14} />{template.label}
          </a>
        ))}
      </div>
    </section>
  );
}

function MoneyCard({ order, currency }: { order: NonNullable<OrderDetail>; currency: string }) {
  const planned = order.items_subtotal + order.delivery_fee;
  const actual = order.partner_costs + order.order_expenses;
  const overrun = actual - planned;
  return (
    <section className="card">
      <h2>Money</h2>
      <div className="money-lines">
        <div><span>Customer pays</span><Money value={order.total} currency={currency} /></div>
        <div><span>Received (verified)</span><Money value={order.paid} currency={currency} /></div>
        {order.pending > 0 && <div><span>Waiting to verify</span><Money value={order.pending} currency={currency} /></div>}
        <div className="total"><span>Customer balance</span><Money value={order.balance} currency={currency} /></div>
        <div style={{ marginTop: 8 }}><span>Partner costs</span><Money value={-order.partner_costs} currency={currency} /></div>
        <div><span>Extra costs</span><Money value={-order.order_expenses} currency={currency} /></div>
        <div className={`total ${order.profit >= 0 ? "profit" : "loss"}`}><span>Actual profit</span><Money value={order.profit} currency={currency} /></div>
        <small>Paid to partners so far: {formatMoney(order.partner_paid, currency)}</small>
        <div style={{ marginTop: 8 }}><span>Estimated cost</span><Money value={planned} currency={currency} /></div>
        <div><span>Actually spent so far</span><Money value={actual} currency={currency} /></div>
        {actual > 0 && overrun !== 0 && (
          <div className={overrun > 0 ? "loss" : "profit"}><span>{overrun > 0 ? "Over estimate by" : "Under estimate by"}</span><Money value={Math.abs(overrun)} currency={currency} /></div>
        )}
        <div><span>Planned profit</span><Money value={order.total - planned} currency={currency} /></div>
      </div>
    </section>
  );
}

function Payments({ order, currency }: { order: NonNullable<OrderDetail>; currency: string }) {
  return (
    <section className="card">
      <h2>Customer payments</h2>
      {order.payments.length ? (
        <div className="list" style={{ marginBottom: 12 }}>
          {order.payments.map((payment) => (
            <div key={payment.id} style={{ alignItems: "flex-start" }}>
              <div>
                <strong style={payment.status === "reversed" ? { textDecoration: "line-through" } : undefined}><Money value={payment.amount} currency={currency} /></strong>
                <small>{formatDate(payment.received_on)} · {methodLabel(payment.method)}{payment.reference && ` · ${payment.reference}`}</small>
                {payment.reversal_reason && <small>Reversed: {payment.reversal_reason}</small>}
              </div>
              <div className="stack" style={{ gap: 4, justifyItems: "end" }}>
                <Badge tone={payment.status === "verified" ? "sage" : payment.status === "pending" ? "gold" : "ribbon"}>{titleCase(payment.status)}</Badge>
                {payment.status === "pending" && <ActionButton action={verifyPayment} fields={{ payment_id: payment.id }}>Verify</ActionButton>}
                {payment.status === "verified" && (payment.receipt_id
                  ? <Link className="link" href={`/invoices/${payment.receipt_id}`}>Receipt</Link>
                  : <ActionButton action={createReceipt} fields={{ payment_id: payment.id }}><Receipt size={13} />Receipt</ActionButton>)}
                {payment.status !== "reversed" && (
                  <details className="panel">
                    <summary>Reverse</summary>
                    <div className="panel-body">
                      <ActionForm action={reversePayment}>
                        <input type="hidden" name="payment_id" value={payment.id} />
                        <Field label="Reason" name="reason" required />
                        <Submit className="btn danger small">Reverse payment</Submit>
                      </ActionForm>
                    </div>
                  </details>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : <p className="muted" style={{ marginBottom: 12 }}>No payments yet.</p>}
      <details className="panel">
        <summary>Record a payment</summary>
        <div className="panel-body">
          <ActionForm action={addPayment}>
            <input type="hidden" name="order_id" value={order.id} />
            <div className="form-grid">
              <Field label="Amount" name="amount" type="number" min="1" step="0.01" required defaultValue={order.balance > 0 ? order.balance : undefined} />
              <Field label="Received on" name="received_on" type="date" defaultValue={today()} required />
              <Select label="Method" name="method" options={PAYMENT_METHODS} />
              <Field label="Reference" name="reference" placeholder="Bank ref / slip no." />
              <label className="field full"><span>Payment slip (optional)</span><input type="file" name="proof" accept="image/*,application/pdf" /></label>
              <label className="check full"><input type="checkbox" name="verified" defaultChecked />I&apos;ve seen this money in our bank account</label>
            </div>
            <Submit>Save payment</Submit>
          </ActionForm>
        </div>
      </details>
    </section>
  );
}

function Documents({ order, currency, advancePercent }: { order: NonNullable<OrderDetail>; currency: string; advancePercent: number }) {
  const advance = advanceAmount(order.total, advancePercent);
  return (
    <section className="card">
      <h2>Invoices & quotes</h2>
      {order.documents.length ? (
        <div className="list" style={{ marginBottom: 12 }}>
          {order.documents.map((doc) => (
            <div key={doc.id}>
              <div>
                <Link className="link" href={`/invoices/${doc.id}`}><FileText size={13} /> {doc.number ?? `Draft ${doc.kind}`}</Link>
                <small>{titleCase(doc.kind)}{doc.amount_requested ? ` · ${formatMoney(doc.amount_requested, currency)} requested` : ""} · {formatDate(doc.issued_at ?? doc.created_at)}</small>
              </div>
              <Badge tone={doc.status === "issued" ? "sage" : doc.status === "void" ? "ribbon" : ""}>{titleCase(doc.status)}</Badge>
            </div>
          ))}
        </div>
      ) : <p className="muted" style={{ marginBottom: 12 }}>No documents yet.</p>}
      <div className="stack" style={{ gap: 6 }}>
        <ActionButton action={createDocument} fields={{ order_id: order.id, kind: "invoice", amount_requested: String(advance) }} className="btn small">
          Advance invoice ({advancePercent}% · {formatMoney(advance, currency)})
        </ActionButton>
        <ActionButton action={createDocument} fields={{ order_id: order.id, kind: "invoice", amount_requested: "0" }} className="btn small">Full invoice</ActionButton>
        <ActionButton action={createDocument} fields={{ order_id: order.id, kind: "quote", amount_requested: "0" }} className="btn small ghost">Quotation</ActionButton>
      </div>
    </section>
  );
}

function Costs({ order, currency }: { order: NonNullable<OrderDetail>; currency: string }) {
  return (
    <section className="card">
      <h2>Extra costs</h2>
      {order.expenses.length ? (
        <div className="list" style={{ marginBottom: 12 }}>
          {order.expenses.map((expense) => (
            <div key={expense.id}>
              <div><strong>{expense.description}</strong><small>{expenseLabel(expense.category)} · {formatDate(expense.spent_on)}</small></div>
              <Money value={expense.amount} currency={currency} />
            </div>
          ))}
        </div>
      ) : <p className="muted" style={{ marginBottom: 12 }}>Packaging, delivery riders and other costs for this order.</p>}
      <details className="panel">
        <summary>Add a cost</summary>
        <div className="panel-body">
          <ActionForm action={addOrderExpense}>
            <input type="hidden" name="order_id" value={order.id} />
            <div className="form-grid">
              <Field label="What" name="description" required className="full" />
              <Field label="Amount" name="amount" type="number" min="1" step="0.01" required />
              <Field label="Date" name="spent_on" type="date" defaultValue={today()} required />
              <Select label="Category" name="category" className="full" options={EXPENSE_CATEGORIES.filter((category) => category.value !== "meta_ads")} defaultValue="delivery" />
            </div>
            <Submit>Add cost</Submit>
          </ActionForm>
        </div>
      </details>
    </section>
  );
}

