import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle, Pencil } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, Money, Stars, Stat, StatusBadge } from "@/components/bits";
import { ActionButton, ActionForm, Field, Select, Submit } from "@/components/form";
import { payPartner, voidPartnerPayment } from "@/app/orders/actions";
import { setPartnerActive } from "@/app/partners/actions";
import { can, requireUser } from "@/lib/auth";
import { PAYMENT_METHODS, methodLabel } from "@/lib/constants";
import { getPartner, partnerScore } from "@/lib/data/partners";
import { formatDate, titleCase, today } from "@/lib/format";
import { whatsappLink } from "@/lib/whatsapp";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const partner = await getPartner((await params).id);
  return { title: partner?.name ?? "Partner" };
}

export default async function PartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, partner] = await Promise.all([requireUser(), getPartner(id)]);
  if (!partner) notFound();
  const finance = can(user, "finance");
  const openJobs = partner.jobs.filter((job) => !["delivered", "cancelled"].includes(job.status));
  const score = partnerScore(partner);
  const reviews = partner.jobs.filter((job) => job.stars);

  return (
    <AppShell>
      <Link className="back" href="/partners"><ArrowLeft size={15} />Partners</Link>
      <header className="page-header">
        <div>
          <span className="eyebrow">{partner.business_name || "Partner"}</span>
          <h1>{partner.name}</h1>
          <p>{partner.city} · delivers up to {partner.service_radius_km} km{partner.extra_cities.length ? ` · also ${partner.extra_cities.join(", ")}` : ""}</p>
        </div>
        <div className="row">
          {!partner.active && <Badge tone="ribbon">Archived</Badge>}
          {partner.phone && <a className="btn whatsapp" href={whatsappLink(partner.phone, `Hi ${partner.name}, `)} target="_blank" rel="noreferrer"><MessageCircle size={15} />WhatsApp</a>}
          <Link className="btn" href={`/partners/${partner.id}/edit`}><Pencil size={15} />Edit</Link>
        </div>
      </header>

      <div className="stats">
        <Stat label="Jobs done" value={partner.done_jobs} note={`${openJobs.length} open`} />
        <Stat label="Rating" value={score ? <Stars score={score} /> : "—"} note={score?.count ? `from ${score.count} order${score.count === 1 ? "" : "s"}` : score ? "Manual rating — no order ratings yet" : "Rated after each delivered order"} />
        {finance && <Stat label="Work agreed (all time)" value={<Money value={partner.agreed} />} />}
        {finance && <Stat label="Paid to them" value={<Money value={partner.paid} />} />}
        {finance && (
          <Stat
            label={partner.balance >= 0 ? "We owe them" : "Advance with them"}
            value={<Money value={Math.abs(partner.balance)} />}
            tone={partner.balance > 0 ? "warn" : partner.balance < 0 ? "good" : undefined}
            note={partner.balance < 0 ? "Paid ahead — will be used by upcoming jobs" : undefined}
          />
        )}
      </div>

      <div className="grid sidebar-right">
        <div className="stack">
          <section className="card">
            <h2>Jobs</h2>
            {partner.jobs.length === 0 ? <p className="muted">No jobs yet.</p> : (
              <div className="table-wrap table-plain">
                <table>
                  <thead><tr><th>Order</th><th>Delivery</th><th>Work</th><th>Status</th><th>Rating</th>{finance && <><th className="right">Agreed</th><th className="right">Paid</th></>}</tr></thead>
                  <tbody>
                    {partner.jobs.map((job) => (
                      <tr key={job.id}>
                        <td><Link className="row-link" href={`/orders/${job.order_id}`}>{job.order_number}</Link><small>{job.recipient_name}</small></td>
                        <td className="num">{formatDate(job.delivery_date)}<small>{job.city}</small></td>
                        <td>{job.description}</td>
                        <td><Badge tone={job.status === "delivered" ? "sage" : job.status === "cancelled" ? "ribbon" : "gold"}>{titleCase(job.status)}</Badge></td>
                        <td>{job.stars ? <Stars score={{ stars: job.stars, count: 0 }} /> : <small>—</small>}</td>
                        {finance && <><td className="right"><Money value={job.agreed_amount} /></td><td className="right"><Money value={job.paid} /></td></>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {reviews.length > 0 && (
            <section className="card">
              <h2>What we said after each order</h2>
              <div className="list">
                {reviews.map((job) => (
                  <div key={job.id} style={{ alignItems: "flex-start" }}>
                    <div>
                      <Stars score={{ stars: job.stars!, count: 0 }} />
                      {job.rating_comment && <p style={{ margin: "4px 0 0" }}>“{job.rating_comment}”</p>}
                      <small><Link className="link" href={`/orders/${job.order_id}`}>{job.order_number}</Link> · {job.recipient_name} · {formatDate(job.delivery_date)}</small>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {finance && (
            <section className="card">
              <h2>Payments & advances</h2>
              {partner.payments.length === 0 ? <p className="muted">No payments yet.</p> : (
                <div className="list">
                  {partner.payments.map((payment) => (
                    <div key={payment.id}>
                      <div>
                        <strong style={payment.voided_at ? { textDecoration: "line-through" } : undefined}><Money value={payment.amount} /> <small style={{ display: "inline" }}>{titleCase(payment.kind)}</small></strong>
                        <small>{formatDate(payment.paid_on)} · {methodLabel(payment.method)}{payment.reference && ` · ${payment.reference}`}{payment.order_number ? ` · for ${payment.order_number}` : " · general advance"}</small>
                        {payment.voided_at && <small>Voided: {payment.void_reason}</small>}
                        {payment.notes && <small>{payment.notes}</small>}
                      </div>
                      {!payment.voided_at && (
                        <details className="panel">
                          <summary>Void</summary>
                          <div className="panel-body">
                            <ActionForm action={voidPartnerPayment}>
                              <input type="hidden" name="payment_id" value={payment.id} />
                              <Field label="Reason" name="reason" required />
                              <Submit className="btn danger small">Void payment</Submit>
                            </ActionForm>
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <div className="stack">
          {finance && (
            <section className="card">
              <h2>Give an advance or pay</h2>
              <ActionForm action={payPartner}>
                <input type="hidden" name="partner_id" value={partner.id} />
                <div className="form-grid">
                  <Field label="Amount" name="amount" type="number" min="1" step="0.01" required />
                  <Select label="Type" name="kind" options={[{ value: "advance", label: "Advance" }, { value: "final", label: "Final payment" }, { value: "other", label: "Other" }]} />
                  <Select label="For job" name="job_id" className="full" options={[
                    { value: "", label: "No specific job (general advance)" },
                    ...partner.jobs.filter((job) => job.status !== "cancelled").map((job) => ({ value: job.id, label: `${job.order_number} · ${job.recipient_name} · owe ${(job.agreed_amount - job.paid).toLocaleString("en-LK")}` })),
                  ]} />
                  <Select label="Method" name="method" options={PAYMENT_METHODS} />
                  <Field label="Date" name="paid_on" type="date" required defaultValue={today()} />
                  <Field label="Reference" name="reference" className="full" />
                  <Field label="Note" name="notes" className="full" />
                </div>
                <Submit>Record</Submit>
              </ActionForm>
            </section>
          )}
          <section className="card">
            <h2>Details</h2>
            <dl className="kv">
              <dt>Phone</dt><dd>{partner.phone || "—"}</dd>
              <dt>Services</dt><dd>{partner.services.join(", ") || "—"}</dd>
              <dt>Manual rating</dt><dd>{partner.rating ? "★".repeat(partner.rating) : "—"}</dd>
              <dt>Address</dt><dd style={{ whiteSpace: "pre-wrap" }}>{partner.address || "—"}</dd>
              {finance && <><dt>Bank</dt><dd style={{ whiteSpace: "pre-wrap" }}>{partner.bank_details || "—"}</dd></>}
              <dt>Notes</dt><dd style={{ whiteSpace: "pre-wrap" }}>{partner.notes || "—"}</dd>
            </dl>
            <div style={{ marginTop: 14 }}>
              <ActionButton action={setPartnerActive} fields={partner.active ? { partner_id: partner.id } : { partner_id: partner.id, active: "on" }}
                className="btn small ghost" confirm={partner.active ? "Archive this partner? They'll be hidden from searches." : undefined}>
                {partner.active ? "Archive partner" : "Make active again"}
              </ActionButton>
            </div>
          </section>
          {openJobs.length > 0 && (
            <section className="card">
              <h2>Open jobs</h2>
              <div className="list">
                {openJobs.map((job) => (
                  <div key={job.id}><div><Link className="link" href={`/orders/${job.order_id}`}>{job.order_number}</Link><small>{formatDate(job.delivery_date)} · {job.city}</small></div><StatusBadge status="in_progress" /></div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
