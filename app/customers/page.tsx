import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Empty, Money, PageHeader } from "@/components/bits";
import { can, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { whatsappLink } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; repeat?: string }> }) {
  const params = await searchParams;
  const user = await requireUser();
  const finance = can(user, "finance");
  const sql = db();
  const q = params.q?.trim() ? `%${params.q.trim()}%` : null;
  const digits = params.q?.replace(/\D/g, "") ?? "";
  const customers = await sql<{ id: string; name: string; phone: string; country: string; orders: number; spent: number; last_order: string | null; recipients: string[] | null }[]>`
    select c.id, c.name, c.phone, c.country,
      count(o.id) filter (where o.status not in ('enquiry','cancelled'))::int as orders,
      coalesce(sum(s.revenue) filter (where o.status not in ('enquiry','cancelled')), 0) as spent,
      max(coalesce(o.delivery_date, o.created_at::date)) as last_order,
      array_agg(distinct o.recipient_name) filter (where o.recipient_name is not null) as recipients
    from customers c left join orders o on o.customer_id = c.id left join order_summary s on s.order_id = o.id
    where true
      ${q ? sql`and (c.name ilike ${q} or c.phone ilike ${q} or c.country ilike ${q} ${digits.length >= 5 ? sql`or regexp_replace(c.phone, '\\D', '', 'g') like ${`%${digits}%`}` : sql``})` : sql``}
    group by c.id
    ${params.repeat === "1" ? sql`having count(o.id) filter (where o.status not in ('enquiry','cancelled')) > 1` : sql``}
    order by last_order desc nulls last, c.created_at desc
    limit 500`;

  return (
    <AppShell>
      <PageHeader eyebrow="Customers" title="People who order" description="Everyone who has ordered, with the people they've celebrated. Repeat customers are your warmest leads." />
      <form className="filters" action="/customers">
        <label className="field grow"><span>Search</span><input name="q" defaultValue={params.q} placeholder="Name, phone or country" /></label>
        <label className="check" style={{ alignSelf: "center" }}><input type="checkbox" name="repeat" value="1" defaultChecked={params.repeat === "1"} />Repeat customers only</label>
        <button className="btn" type="submit">Search</button>
      </form>
      {customers.length === 0 ? <Empty title="No customers found"><p>Customers are added when you create an order.</p></Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Customer</th><th>Celebrated</th><th className="right">Orders</th>{finance && <th className="right">Spent</th>}<th>Last order</th><th /></tr></thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td><strong>{customer.name}</strong><small>{customer.phone} · {customer.country || "—"}</small></td>
                  <td>{customer.recipients?.slice(0, 4).join(", ") || "—"}</td>
                  <td className="right num"><Link className="link" href={`/orders?view=all&q=${encodeURIComponent(customer.phone || customer.name)}`}>{customer.orders}</Link></td>
                  {finance && <td className="right"><Money value={customer.spent} /></td>}
                  <td className="num">{formatDate(customer.last_order)}</td>
                  <td className="right">
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      {customer.phone && <a className="btn small whatsapp" href={whatsappLink(customer.phone, `Hi ${customer.name.split(" ")[0]}, `)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${customer.name}`}><MessageCircle size={14} /></a>}
                      <Link className="btn small" href={`/orders/new?customer=${customer.id}`}><Plus size={14} />Order</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
