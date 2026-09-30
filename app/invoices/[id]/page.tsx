import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, MessageCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/bits";
import { CopyButton, PrintButton } from "@/components/client-bits";
import { DocumentPaper } from "@/components/document-paper";
import { ActionButton, ActionForm, Field, Submit, TextArea } from "@/components/form";
import { deleteDraft, issue, updateDraft, voidDocument } from "@/app/invoices/actions";
import { getDocument } from "@/lib/data/documents";
import { listTerms } from "@/lib/data/settings";
import { DOCUMENT_LABELS } from "@/lib/document-types";
import { formatDate, formatMoney, titleCase } from "@/lib/format";
import { viewUrl } from "@/lib/storage";
import { baseUrl } from "@/lib/url";
import { whatsappLink } from "@/lib/whatsapp";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const found = await getDocument((await params).id);
  return { title: found ? found.doc.number ?? `Draft ${found.doc.kind}` : "Document" };
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getDocument(id);
  if (!found) notFound();
  const { doc, snapshot, live } = found;
  const [terms, logoUrl, site] = await Promise.all([
    doc.status === "draft" ? listTerms({ activeOnly: true }) : Promise.resolve([]),
    snapshot.business.logoKey ? viewUrl(snapshot.business.logoKey) : Promise.resolve(null),
    baseUrl(),
  ]);
  const publicUrl = doc.share_token ? `${site}/i/${doc.share_token}` : null;
  const label = DOCUMENT_LABELS[doc.kind];
  const first = snapshot.customer.name.split(" ")[0];
  const amount = doc.kind === "receipt" ? snapshot.payment?.amount ?? 0 : Math.max(Math.min(snapshot.amountRequested ?? live.balance, live.balance), 0);
  const message = doc.kind === "receipt"
    ? `Hi ${first}, thank you! We received ${formatMoney(amount, snapshot.currency)} for ${snapshot.recipient.name}'s celebration. Your receipt ${snapshot.number}: ${publicUrl}`
    : doc.kind === "quote"
      ? `Hi ${first}, here is your quotation ${snapshot.number} for ${snapshot.recipient.name}'s celebration (${formatMoney(snapshot.total, snapshot.currency)}): ${publicUrl}`
      : `Hi ${first}, here is your invoice ${snapshot.number} for ${snapshot.recipient.name}'s celebration.\nAmount due: ${formatMoney(amount, snapshot.currency)}${snapshot.dueDate ? ` by ${formatDate(snapshot.dueDate)}` : ""}.\nView & download: ${publicUrl}`;

  return (
    <AppShell permission="finance">
      <div className="no-print">
        <Link className="back" href={`/orders/${doc.order_id}`}><ArrowLeft size={15} />Order {snapshot.order.number}</Link>
        <header className="page-header">
          <div>
            <span className="eyebrow">{label}</span>
            <h1>{doc.number ?? `Draft ${label.toLowerCase()}`}</h1>
            <p>{snapshot.customer.name} · for {snapshot.recipient.name}</p>
          </div>
          <Badge tone={doc.status === "issued" ? "sage" : doc.status === "void" ? "ribbon" : ""}>{titleCase(doc.status)}</Badge>
        </header>
      </div>

      <div className="grid sidebar-right">
        <DocumentPaper snapshot={snapshot} status={doc.status} logoUrl={logoUrl} live={live} />

        <aside className="stack no-print">
          {doc.status === "draft" && (
            <>
              <section className="card">
                <h2>Ready to send?</h2>
                <p className="muted" style={{ marginBottom: 12 }}>Issuing gives it a number and freezes the prices, terms and bank details.</p>
                <div className="row">
                  <ActionButton action={issue} fields={{ document_id: doc.id }} className="btn primary">Issue {label.toLowerCase()}</ActionButton>
                  <ActionButton action={deleteDraft} fields={{ document_id: doc.id }} className="btn ghost small" confirm="Delete this draft?">Delete draft</ActionButton>
                </div>
              </section>
              <section className="card">
                <h2>Edit draft</h2>
                <ActionForm action={updateDraft} resetOnSuccess={false}>
                  <input type="hidden" name="document_id" value={doc.id} />
                  {doc.kind === "invoice" && (
                    <Field label="Amount to request now" name="amount_requested" type="number" min="0" step="0.01" defaultValue={doc.amount_requested ?? 0}
                      hint={`0 = full balance. Total is ${formatMoney(snapshot.total, snapshot.currency)}.`} />
                  )}
                  <Field label={doc.kind === "quote" ? "Valid until" : "Due date"} name="due_date" type="date" defaultValue={doc.due_date ?? ""} />
                  <fieldset>
                    <legend>Terms & conditions</legend>
                    <div className="stack" style={{ gap: 8 }}>
                      {terms.map((term) => (
                        <label key={term.id} className="check">
                          <input type="checkbox" name="term_ids[]" value={term.id} defaultChecked={doc.term_ids.includes(term.id)} />
                          <span><strong>{term.title}</strong><br /><small>{term.body}</small></span>
                        </label>
                      ))}
                      {terms.length === 0 && <small>No saved terms. <Link className="link" href="/settings#terms">Add some in Settings</Link>.</small>}
                    </div>
                  </fieldset>
                  <TextArea label="Extra condition for this document only" name="extra_terms" rows={2} defaultValue={doc.extra_terms} />
                  <TextArea label="Note to customer" name="notes" rows={2} defaultValue={doc.notes} />
                  <Submit>Update preview</Submit>
                </ActionForm>
              </section>
            </>
          )}

          {doc.status === "issued" && publicUrl && (
            <section className="card">
              <h2>Send to customer</h2>
              <div className="stack" style={{ gap: 8 }}>
                <a className="btn whatsapp" href={whatsappLink(snapshot.customer.phone, message)} target="_blank" rel="noreferrer"><MessageCircle size={16} />Send on WhatsApp</a>
                <CopyButton text={publicUrl} label="Copy customer link" className="btn" />
                <a className="btn ghost" href={publicUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />Open customer view</a>
                <PrintButton />
              </div>
              <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>The customer can open the link on their phone and save it as a PDF.</p>
            </section>
          )}

          {doc.status === "issued" && (
            <details className="panel">
              <summary>Void this {label.toLowerCase()}</summary>
              <div className="panel-body">
                <ActionForm action={voidDocument}>
                  <input type="hidden" name="document_id" value={doc.id} />
                  <Field label="Reason" name="reason" required />
                  <Submit className="btn danger">Void</Submit>
                </ActionForm>
              </div>
            </details>
          )}
          {doc.status === "void" && <p className="notice warn">Voided {formatDate(doc.voided_at)}: {doc.void_reason}</p>}
        </aside>
      </div>
    </AppShell>
  );
}
