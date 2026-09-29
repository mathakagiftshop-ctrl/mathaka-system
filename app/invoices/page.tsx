import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Empty, Money, PageHeader } from "@/components/bits";
import { listDocuments } from "@/lib/data/documents";
import { DOCUMENT_LABELS } from "@/lib/document-types";
import { formatDate, titleCase } from "@/lib/format";

export const metadata: Metadata = { title: "Invoices" };

const kinds = [
  { value: "", label: "All" },
  { value: "invoice", label: "Invoices" },
  { value: "receipt", label: "Receipts" },
  { value: "quote", label: "Quotes" },
];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string; q?: string }> }) {
  const params = await searchParams;
  const kind = kinds.some((item) => item.value === params.kind) ? params.kind : "";
  const documents = await listDocuments({ kind: kind || undefined, status: params.status || undefined, q: params.q });

  return (
    <AppShell permission="finance">
      <PageHeader eyebrow="Billing" title="Invoices & receipts" description="Create invoices from an order's page. Every issued document has a link you can send on WhatsApp." />
      <nav className="tabs">
        {kinds.map((item) => (
          <Link key={item.value} href={item.value ? `/invoices?kind=${item.value}` : "/invoices"} className={item.value === kind ? "active" : undefined}>{item.label}</Link>
        ))}
      </nav>
      <form className="filters" action="/invoices">
        {kind && <input type="hidden" name="kind" value={kind} />}
        <label className="field grow"><span>Search</span><input name="q" defaultValue={params.q} placeholder="INV-0001, customer or recipient" /></label>
        <label className="field"><span>Status</span>
          <select name="status" defaultValue={params.status ?? ""}>
            <option value="">Any</option><option value="draft">Draft</option><option value="issued">Issued</option><option value="void">Void</option>
          </select>
        </label>
        <button className="btn" type="submit">Filter</button>
      </form>
      {documents.length === 0 ? (
        <Empty title="Nothing here yet"><p>Open an order and choose “Advance invoice” or “Full invoice”.</p></Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Number</th><th>Type</th><th>Customer</th><th>Order</th><th>Date</th><th>Status</th><th className="right">Amount</th></tr></thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="clickable">
                  <td><Link className="row-link" href={`/invoices/${doc.id}`}>{doc.number ?? "Draft"}</Link></td>
                  <td>{DOCUMENT_LABELS[doc.kind]}</td>
                  <td>{doc.customer_name}<small>for {doc.recipient_name}</small></td>
                  <td><Link className="link" href={`/orders/${doc.order_id}`}>{doc.order_number}</Link></td>
                  <td className="num">{formatDate(doc.issued_at ?? doc.created_at)}</td>
                  <td><Badge tone={doc.status === "issued" ? "sage" : doc.status === "void" ? "ribbon" : ""}>{titleCase(doc.status)}</Badge></td>
                  <td className="right"><Money value={doc.amount} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
