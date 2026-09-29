import { DOCUMENT_LABELS, type DocumentSnapshot } from "@/lib/document-types";
import { methodLabel } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";

/** The printable invoice / quote / receipt. Used internally and on the public link. */
export function DocumentPaper({ snapshot, status, logoUrl, live }: {
  snapshot: DocumentSnapshot;
  status: "draft" | "issued" | "void";
  logoUrl: string | null;
  live?: { paid: number; balance: number };
}) {
  const money = (value: number) => formatMoney(value, snapshot.currency);
  const { business } = snapshot;
  const paid = live?.paid ?? snapshot.paidToDate;
  const balance = live?.balance ?? snapshot.balance;
  // An invoice asks the customer to reach a paid-to-date target (e.g. the advance on top of
  // what was already paid when it was issued). Later payments reduce what's still due.
  const target = snapshot.amountRequested ? Math.min(snapshot.paidToDate + snapshot.amountRequested, snapshot.total) : snapshot.total;
  const due = snapshot.kind === "invoice" ? Math.max(target - paid, 0) : null;

  return (
    <article className="paper">
      <header>
        <div className="biz">
          {logoUrl && <img src={logoUrl} alt="" />}
          <div>
            <strong>{business.name}</strong>
            <small>{business.tagline}</small>
          </div>
        </div>
        <div className="doc-title">
          <strong>{DOCUMENT_LABELS[snapshot.kind]}</strong>
          <span>{snapshot.number ?? "Draft"}</span>
          <small>Date: {formatDate(snapshot.issueDate)}</small>
          {snapshot.dueDate && <small style={{ display: "block" }}>{snapshot.kind === "quote" ? "Valid until" : "Due"}: {formatDate(snapshot.dueDate)}</small>}
          {status === "void" && <p style={{ marginTop: 8 }}><span className="stamp-void">VOID</span></p>}
          {status === "draft" && <p style={{ marginTop: 8 }}><span className="draft-flag">DRAFT</span></p>}
        </div>
      </header>

      <section className="parties">
        <div>
          <small>From</small>
          <strong>{business.name}</strong>
          <p className="pre">{[business.address, business.phone, business.email, business.website].filter(Boolean).join("\n")}</p>
        </div>
        <div>
          <small>Bill to</small>
          <strong>{snapshot.customer.name}</strong>
          <p className="pre">{[snapshot.customer.phone, snapshot.customer.country].filter(Boolean).join("\n")}</p>
        </div>
        <div>
          <small>Celebration</small>
          <strong>{snapshot.recipient.name}</strong>
          <p className="pre">{[snapshot.order.occasion, snapshot.recipient.city, snapshot.order.deliveryDate && `Delivery ${formatDate(snapshot.order.deliveryDate)}`, `Order ${snapshot.order.number}`].filter(Boolean).join("\n")}</p>
        </div>
      </section>

      {snapshot.kind === "receipt" && snapshot.payment ? (
        <>
          <div className="due-box paid-box">
            <div><small>Amount received</small><p>{formatDate(snapshot.payment.receivedOn)} · {methodLabel(snapshot.payment.method)}{snapshot.payment.reference && ` · Ref ${snapshot.payment.reference}`}</p></div>
            <strong>{money(snapshot.payment.amount)}</strong>
          </div>
          <div className="totals">
            <dl>
              <dt>Order total</dt><dd>{money(snapshot.total)}</dd>
              <dt>Paid to date</dt><dd>{money(snapshot.paidToDate)}</dd>
              <dt className="grand">Balance</dt><dd className="grand">{money(Math.max(snapshot.balance, 0))}</dd>
            </dl>
          </div>
        </>
      ) : (
        <>
          <table>
            <thead><tr><th>Description</th><th className="right">Qty</th><th className="right">Price</th><th className="right">Amount</th></tr></thead>
            <tbody>
              {snapshot.items.map((item, index) => (
                <tr key={index}><td>{item.description}</td><td className="right num">{item.quantity}</td><td className="right num">{money(item.unitPrice)}</td><td className="right num">{money(item.amount)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="totals">
            <dl>
              <dt>Subtotal</dt><dd>{money(snapshot.subtotal)}</dd>
              {snapshot.deliveryFee > 0 && <><dt>Delivery</dt><dd>{money(snapshot.deliveryFee)}</dd></>}
              {snapshot.discount > 0 && <><dt>Discount</dt><dd>−{money(snapshot.discount)}</dd></>}
              <dt className="grand">Total</dt><dd className="grand">{money(snapshot.total)}</dd>
              {snapshot.kind === "invoice" && paid > 0 && <><dt>Paid</dt><dd>−{money(paid)}</dd><dt>Balance</dt><dd>{money(Math.max(balance, 0))}</dd></>}
            </dl>
          </div>
          {snapshot.kind === "invoice" && (
            due && due > 0 ? (
              <div className="due-box">
                <div><small>{snapshot.amountRequested && snapshot.amountRequested < snapshot.total ? "Advance due now" : "Amount due"}</small>{snapshot.dueDate && <p>Please pay by {formatDate(snapshot.dueDate)}</p>}</div>
                <strong>{money(due)}</strong>
              </div>
            ) : (
              <div className="due-box paid-box"><div><small>Status</small><p>Thank you — this invoice is paid.</p></div><strong>PAID</strong></div>
            )
          )}
        </>
      )}

      {(snapshot.bankDetails || snapshot.paymentInstructions) && (
        <section className="block">
          <h4>How to pay</h4>
          {snapshot.paymentInstructions && <p className="pre">{snapshot.paymentInstructions}</p>}
          {snapshot.bankDetails && <p className="pre" style={{ marginTop: 6, fontWeight: 600 }}>{snapshot.bankDetails}</p>}
        </section>
      )}
      {snapshot.notes && <section className="block"><h4>Notes</h4><p className="pre">{snapshot.notes}</p></section>}
      {snapshot.terms.length > 0 && (
        <section className="block">
          <h4>Terms & conditions</h4>
          <ol>{snapshot.terms.map((term, index) => <li key={index}>{term.title && <strong>{term.title}: </strong>}<span className="pre">{term.body}</span></li>)}</ol>
        </section>
      )}
      {snapshot.footer && <footer>{snapshot.footer}</footer>}
    </article>
  );
}
