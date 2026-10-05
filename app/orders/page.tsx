import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Empty, Money, PageHeader, StatusBadge } from "@/components/bits";
import { can, requireUser } from "@/lib/auth";
import { listOrders, type OrderView } from "@/lib/data/orders";
import { formatDate, relativeDay } from "@/lib/format";

export const metadata: Metadata = { title: "Orders" };

const views: { value: OrderView; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "enquiries", label: "Enquiries" },
  { value: "done", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; city?: string; month?: string }> }) {
  const params = await searchParams;
  const user = await requireUser();
  const finance = can(user, "finance");
  const view = (views.find((item) => item.value === params.view)?.value ?? "active") as OrderView;
  const orders = await listOrders({ view, q: params.q, city: params.city, month: params.month });
  const query = (next: Partial<typeof params>) => {
    const search = new URLSearchParams(Object.entries({ ...params, ...next }).filter(([, value]) => value) as [string, string][]);
    return `/orders${search.size ? `?${search}` : ""}`;
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Orders"
        title="Every celebration"
        description="Search by name, phone, order number or city."
        actions={<>
          <Link className="btn" href="/orders/calendar"><CalendarDays size={16} />Calendar</Link>
          <Link className="btn primary" href="/orders/new"><Plus size={16} />New order</Link>
        </>}
      />
      <nav className="tabs" aria-label="Order views">
        {views.map((item) => (
          <Link key={item.value} href={query({ view: item.value })} className={item.value === view ? "active" : undefined}>{item.label}</Link>
        ))}
      </nav>
      <form className="filters" action="/orders">
        <input type="hidden" name="view" value={view} />
        <label className="field grow"><span>Search</span><input name="q" defaultValue={params.q} placeholder="Name, phone, ORD-0012…" /></label>
        <label className="field"><span>City</span><input name="city" defaultValue={params.city} placeholder="Any" /></label>
        <label className="field"><span>Month</span><input name="month" type="month" defaultValue={params.month} /></label>
        <button className="btn" type="submit">Filter</button>
        {(params.q || params.city || params.month) && <Link className="btn ghost" href={`/orders?view=${view}`}>Clear</Link>}
      </form>

      {orders.length === 0 ? (
        <Empty title="No orders here">
          <p>{view === "active" ? "New orders you add will show here until they're completed." : "Try another tab or clear the filters."}</p>
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th><th>Delivery</th><th>Recipient</th><th>Customer</th><th>Status</th>
                {finance && <><th className="right">Total</th><th className="right">Balance</th><th className="right">Profit</th></>}
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="clickable">
                  <td><Link className="row-link" href={`/orders/${order.id}`}>{order.number}</Link><small>{order.occasion}</small></td>
                  <td className="num">{formatDate(order.delivery_date)}<small>{relativeDay(order.delivery_date)}</small></td>
                  <td>{order.recipient_name}<small>{order.city}</small></td>
                  <td>{order.customer_name}<small>{order.customer_country}</small></td>
                  <td><StatusBadge status={order.status} />{order.partners?.length ? <small>{order.partners.join(", ")}</small> : null}</td>
                  {finance && (
                    <>
                      <td className="right"><Money value={order.total} /></td>
                      <td className="right">{order.balance > 0 ? <Money value={order.balance} /> : <small>Paid</small>}</td>
                      <td className="right"><Money value={order.profit} tone="auto" /></td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
