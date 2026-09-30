import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge, Empty, Money, PageHeader, Stat } from "@/components/bits";
import { ActionButton, ActionForm, Field, Select, Submit } from "@/components/form";
import { addStockItem, addStockPurchase, deleteStockPurchase, returnStock, updateStockItem, writeOffStock } from "@/app/stock/actions";
import { PAYMENT_METHODS } from "@/lib/constants";
import { isLow, listStock, stockActivity, type StockItemRow } from "@/lib/data/stock";
import { currentMonth, formatDate, monthLabel, today } from "@/lib/format";
import { stockUnitCost } from "@/lib/money";

export const metadata: Metadata = { title: "Stock" };

const qty = (quantity: number, unit: string) => `${quantity} ${unit}`;

const ACTIVITY = {
  bought: { label: "Bought", tone: "blue" },
  used: { label: "Used", tone: "sage" },
  written_off: { label: "Written off", tone: "ribbon" },
} as const;

export default async function StockPage({ searchParams }: { searchParams: Promise<{ month?: string; all?: string }> }) {
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : currentMonth();
  const showAll = params.all === "1";
  const [items, activity] = await Promise.all([listStock({ includeInactive: showAll }), stockActivity({ month })]);
  const active = items.filter((item) => item.active);
  const low = active.filter(isLow);
  const onHandValue = active.reduce((sum, item) => sum + item.value, 0);
  const sum = (type: keyof typeof ACTIVITY) => activity.filter((row) => row.type === type).reduce((total, row) => total + row.amount, 0);

  return (
    <AppShell permission="finance">
      <PageHeader eyebrow="Stock" title="Things we buy in bulk"
        description="Record what you buy (e.g. 5 photo frames from Pettah). The money counts as spent the day you pay, but the cost only comes off profit when a piece is used on an order or written off." />

      {low.length > 0 && (
        <p className="notice warn" style={{ marginBottom: 16 }}>
          Running low: {low.map((item) => `${item.name} (${qty(item.on_hand, item.unit)} left)`).join(" · ")}
        </p>
      )}

      <div className="stats">
        <Stat label="Stock on hand" value={<Money value={onHandValue} />} tone="dark" note="Bought, not used yet" />
        <Stat label={`Bought in ${monthLabel(month)}`} value={<Money value={sum("bought")} />} note="Cash paid out" />
        <Stat label="Used on orders" value={<Money value={sum("used")} />} note="Counted in order costs" />
        <Stat label="Written off" value={<Money value={sum("written_off")} />} tone={sum("written_off") > 0 ? "warn" : undefined} note="Counted as a business cost" />
      </div>

      <div className="grid sidebar-right">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>Items</h2>
              <Link className="link" href={showAll ? `/stock?month=${month}` : `/stock?month=${month}&all=1`}>{showAll ? "Hide inactive" : "Show inactive"}</Link>
            </div>
            {items.length === 0 ? <Empty title="No stock yet">Use &ldquo;Record a purchase&rdquo; to add your first.</Empty> : (
              <div className="table-wrap table-plain">
                <table>
                  <thead><tr><th>Item</th><th className="right">On hand</th><th className="right">Each</th><th className="right">Value</th><th /></tr></thead>
                  <tbody>
                    {items.map((item) => <ItemRow key={item.id} item={item} />)}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>{monthLabel(month)} activity</h2>
              <form className="row" action="/stock">
                <input type="month" name="month" defaultValue={month} aria-label="Month" />
                {showAll && <input type="hidden" name="all" value="1" />}
                <button className="btn small" type="submit">Show</button>
              </form>
            </div>
            {activity.length === 0 ? <p className="muted">Nothing bought, used or written off this month.</p> : (
              <div className="table-wrap table-plain">
                <table>
                  <thead><tr><th>Date</th><th>What</th><th className="right">Qty</th><th className="right">Amount</th><th /></tr></thead>
                  <tbody>
                    {activity.map((row) => (
                      <tr key={`${row.type}-${row.id}`}>
                        <td className="num">{formatDate(row.on_date)}</td>
                        <td>
                          <Badge tone={ACTIVITY[row.type].tone}>{ACTIVITY[row.type].label}</Badge> {row.item_name}
                          {row.order_id && <small>for <Link className="link" href={`/orders/${row.order_id}`}>{row.order_number}</Link></small>}
                          {row.detail && <small>{row.detail}</small>}
                        </td>
                        <td className="right num">{qty(row.quantity, row.unit)}</td>
                        <td className="right"><Money value={row.amount} /></td>
                        <td className="right">
                          {row.type === "bought"
                            ? <ActionButton action={deleteStockPurchase} fields={{ purchase_id: row.id }} className="btn small ghost" confirm="Delete this purchase?">Delete</ActionButton>
                            : <ActionButton action={returnStock} fields={{ move_id: row.id }} className="btn small ghost" confirm="Put this back into stock?">Return</ActionButton>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <h2>Record a purchase</h2>
            <ActionForm action={addStockPurchase}>
              <Select key={active.map((item) => item.id).join()} label="Item" name="item_id" options={[{ value: "", label: "New item…" }, ...active.map((item) => ({ value: item.id, label: `${item.name} (${qty(item.on_hand, item.unit)} left)` }))]}
                defaultValue={active[0]?.id ?? ""} />
              <div className="form-grid">
                <Field label="New item name" name="new_item" placeholder="e.g. Photo frame 8×10" hint="Only if it's not in the list." />
                <Field label="Unit" name="unit" placeholder="pcs" />
                <Field label="How many" name="quantity" type="number" min="0.01" step="0.01" required />
                <Field label="Total paid" name="total_cost" type="number" min="1" step="0.01" required />
                <Field label="Date" name="bought_on" type="date" defaultValue={today()} required />
                <Select label="Paid by" name="method" options={PAYMENT_METHODS} defaultValue="cash" />
                <Field label="Where from" name="supplier" placeholder="e.g. Pettah" />
                <Field label="Note" name="notes" />
              </div>
              <Submit>Record purchase</Submit>
            </ActionForm>
            <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
              Already logged an earlier stock purchase as an expense? Record it here with the original date, then delete the old expense so it isn&apos;t counted twice.
            </p>
          </section>

          <details className="panel">
            <summary>Add an item without buying</summary>
            <div className="panel-body">
              <ActionForm action={addStockItem}>
                <Field label="Name" name="name" required />
                <div className="form-grid">
                  <Field label="Unit" name="unit" placeholder="pcs" />
                  <Field label="Warn when down to" name="low_stock_at" type="number" min="0" step="0.01" defaultValue={2} />
                </div>
                <Submit>Add item</Submit>
              </ActionForm>
            </div>
          </details>
        </div>
      </div>
    </AppShell>
  );
}

function ItemRow({ item }: { item: StockItemRow }) {
  const each = stockUnitCost({ quantity: item.on_hand, value: item.value });
  return (
    <tr>
      <td>
        <strong>{item.name}</strong> {!item.active ? <Badge>Inactive</Badge> : isLow(item) && <Badge tone="ribbon">Low</Badge>}
        <small>{qty(item.bought, item.unit)} bought · {item.used} used{item.written_off > 0 && ` · ${item.written_off} written off`}</small>
      </td>
      <td className="right num">{qty(item.on_hand, item.unit)}</td>
      <td className="right">{each === null ? "—" : <Money value={each} />}</td>
      <td className="right"><Money value={item.value} /></td>
      <td className="right">
        <div className="stack" style={{ gap: 4, justifyItems: "end" }}>
          {item.on_hand > 0 && (
            <details className="panel">
              <summary>Write off</summary>
              <div className="panel-body" style={{ textAlign: "left" }}>
                <ActionForm action={writeOffStock}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <Field label="How many" name="quantity" type="number" min="0.01" max={item.on_hand} step="0.01" defaultValue={1} required />
                  <Field label="Date" name="moved_on" type="date" defaultValue={today()} required />
                  <Field label="Why" name="notes" required placeholder="e.g. glass broke" />
                  <Submit className="btn danger small">Write off</Submit>
                </ActionForm>
              </div>
            </details>
          )}
          <details className="panel">
            <summary>Edit</summary>
            <div className="panel-body" style={{ textAlign: "left" }}>
              <ActionForm action={updateStockItem} resetOnSuccess={false}>
                <input type="hidden" name="item_id" value={item.id} />
                <Field label="Name" name="name" defaultValue={item.name} required />
                <Field label="Unit" name="unit" defaultValue={item.unit} />
                <Field label="Warn when down to" name="low_stock_at" type="number" min="0" step="0.01" defaultValue={item.low_stock_at} />
                <Field label="Notes" name="notes" defaultValue={item.notes} />
                <label className="check"><input type="checkbox" name="active" defaultChecked={item.active} />Still stocking this</label>
                <Submit className="btn small">Save</Submit>
              </ActionForm>
            </div>
          </details>
        </div>
      </td>
    </tr>
  );
}
