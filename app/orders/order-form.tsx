"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, Field, Select, Submit, TextArea } from "@/components/form";
import { saveOrder } from "@/app/orders/actions";
import { CITIES } from "@/lib/cities";
import { GULF_COUNTRIES, ORDER_SOURCES, ORDER_STATUSES } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { orderTotal, plannedCost } from "@/lib/money";

type Customer = { id: string; name: string; phone: string; country: string };
type Item = { description: string; quantity: number; unitPrice: number };
export type OrderFormValues = {
  id: string;
  customer_id: string;
  recipient_name: string;
  recipient_phone: string;
  delivery_address: string;
  city: string;
  occasion: string;
  delivery_date: string | null;
  delivery_time: string;
  source: string;
  delivery_fee: number;
  markup: number;
  discount: number;
  special_request: string;
  internal_notes: string;
  items: Item[];
};

export function OrderForm({ customers, order, prefill }: { customers: Customer[]; order?: OrderFormValues; prefill?: Partial<OrderFormValues> & { customer_name?: string; customer_phone?: string; customer_country?: string } }) {
  const initial = order ?? prefill;
  const [mode, setMode] = useState<"existing" | "new">(order || (customers.length && !prefill?.customer_name) ? "existing" : "new");
  const [items, setItems] = useState<Item[]>(initial?.items?.length ? initial.items : [{ description: "", quantity: 1, unitPrice: 0 }]);
  const [fee, setFee] = useState(initial?.delivery_fee ?? 0);
  const [markup, setMarkup] = useState(initial?.markup ?? 0);
  const [discount, setDiscount] = useState(initial?.discount ?? 0);
  const cost = plannedCost({ items, deliveryFee: fee });
  const total = orderTotal({ items, deliveryFee: fee, markup, discount });
  const update = (index: number, patch: Partial<Item>) => setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <ActionForm action={saveOrder} resetOnSuccess={false} className="stack">
      {order && <input type="hidden" name="order_id" value={order.id} />}
      <datalist id="city-list">{CITIES.map((city) => <option key={city.name} value={city.name}>{city.district}</option>)}</datalist>

      <section className="card">
        <div className="card-head"><h2>Customer (who pays)</h2>
          <div className="row">
            <label className="check"><input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} disabled={!customers.length} />Existing</label>
            <label className="check"><input type="radio" checked={mode === "new"} onChange={() => setMode("new")} />New customer</label>
          </div>
        </div>
        {mode === "existing" ? (
          <Select label="Customer" name="customer_id" defaultValue={order?.customer_id ?? prefill?.customer_id} required
            options={[{ value: "", label: "Choose a customer…" }, ...customers.map((customer) => ({ value: customer.id, label: `${customer.name}${customer.phone ? ` · ${customer.phone}` : ""}${customer.country ? ` · ${customer.country}` : ""}` }))]} />
        ) : (
          <div className="form-grid three">
            <Field label="Name" name="customer_name" required defaultValue={prefill?.customer_name} />
            <Field label="WhatsApp number" name="customer_phone" placeholder="+971 50 123 4567" defaultValue={prefill?.customer_phone} hint="With country code, so WhatsApp links work." />
            <label className="field"><span>Lives in</span>
              <input name="customer_country" list="country-list" defaultValue={prefill?.customer_country ?? "United Arab Emirates"} />
              <datalist id="country-list">{GULF_COUNTRIES.map((country) => <option key={country} value={country} />)}</datalist>
            </label>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Recipient & delivery</h2>
        <div className="form-grid">
          <Field label="Recipient name" name="recipient_name" required defaultValue={initial?.recipient_name} />
          <Field label="Recipient phone" name="recipient_phone" defaultValue={initial?.recipient_phone} />
          <label className="field"><span>City / town</span>
            <input name="city" list="city-list" required defaultValue={initial?.city} autoComplete="off" />
            <small>Pick from the list so it shows on the map.</small>
          </label>
          <Field label="Occasion" name="occasion" placeholder="Birthday, anniversary…" defaultValue={initial?.occasion} />
          <Field label="Delivery date" name="delivery_date" type="date" defaultValue={initial?.delivery_date ?? ""} />
          <Field label="Delivery time" name="delivery_time" placeholder="e.g. 7:00 PM or evening" defaultValue={initial?.delivery_time} />
          <TextArea label="Delivery address" name="delivery_address" className="full" rows={2} defaultValue={initial?.delivery_address} />
        </div>
      </section>

      <section className="card">
        <h2>Package & price</h2>
        <p className="muted" style={{ marginBottom: 12 }}>Enter what each item costs us. The customer only sees the package price (with free delivery) — never these costs.</p>
        <div className="items-editor">
          <div className="item-row item-head"><span>Description</span><span>Qty</span><span>Our cost each</span><span /></div>
          {items.map((item, index) => (
            <div className="item-row" key={index}>
              <input className="input" name="item_description[]" value={item.description} placeholder="1 kg chocolate cake with message" onChange={(event) => update(index, { description: event.target.value })} aria-label="Item description" />
              <input className="input" name="item_quantity[]" type="number" min="1" step="1" value={item.quantity} onChange={(event) => update(index, { quantity: Number(event.target.value) })} aria-label="Quantity" />
              <input className="input" name="item_price[]" type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => update(index, { unitPrice: Number(event.target.value) })} aria-label="Our cost each" />
              <button type="button" className="btn ghost small" aria-label="Remove item" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, i) => i !== index))}><Trash2 size={15} /></button>
            </div>
          ))}
          <div><button type="button" className="btn small" onClick={() => setItems((current) => [...current, { description: "", quantity: 1, unitPrice: 0 }])}><Plus size={14} />Add item</button></div>
        </div>
        <div className="form-grid three" style={{ marginTop: 16 }}>
          <Field label="Delivery cost (ours)" name="delivery_fee" type="number" min="0" step="0.01" value={fee} onChange={(event) => setFee(Number(event.target.value))} hint="Customer sees free delivery." />
          <Field label="Our profit" name="markup" type="number" min="0" step="0.01" value={markup} onChange={(event) => setMarkup(Number(event.target.value))} hint="Added on top of the costs." />
          <Field label="Discount" name="discount" type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} />
        </div>
        <div className="money-lines" style={{ marginTop: 16, maxWidth: 360 }}>
          <div><span>Estimated cost (items + delivery)</span><span>{formatMoney(cost)}</span></div>
          <div><span>+ Our profit</span><span>{formatMoney(markup)}</span></div>
          {discount > 0 && <div><span>− Discount</span><span>{formatMoney(discount)}</span></div>}
          <div className="total"><span>Package price (customer pays)</span><strong style={{ fontSize: 22, fontFamily: "var(--font-serif)" }}>{formatMoney(total)}</strong></div>
        </div>
      </section>

      <section className="card">
        <h2>Notes</h2>
        <div className="form-grid">
          {!order && <Select label="Status" name="status" defaultValue="confirmed" options={ORDER_STATUSES.filter((status) => ["enquiry", "confirmed"].includes(status.value))} hint="Enquiry = not confirmed yet." />}
          <Select key={initial?.source ? "saved" : mode} label="Where did the order come from?" name="source"
            defaultValue={initial?.source ?? (mode === "existing" ? "repeat" : "facebook_ad")} options={ORDER_SOURCES} />
          <TextArea label="Special request / cake message" name="special_request" className="full" defaultValue={initial?.special_request} />
          <TextArea label="Internal notes (not shown to customer)" name="internal_notes" className="full" defaultValue={initial?.internal_notes} />
        </div>
      </section>

      <div className="form-actions"><Submit>{order ? "Save changes" : "Create order"}</Submit></div>
    </ActionForm>
  );
}
