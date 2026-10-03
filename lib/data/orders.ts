import "server-only";
import { db } from "@/lib/db";
import type { OrderStatus } from "@/lib/constants";

export type OrderRow = {
  id: string;
  number: string;
  status: OrderStatus;
  recipient_name: string;
  city: string;
  occasion: string;
  delivery_date: string | null;
  delivery_time: string;
  customer_name: string;
  customer_phone: string;
  customer_country: string;
  total: number;
  paid: number;
  pending: number;
  balance: number;
  partner_costs: number;
  order_expenses: number;
  profit: number;
  partners: string[] | null;
};

export type OrderView = "active" | "enquiries" | "done" | "cancelled" | "all";

export async function listOrders(options: { view?: OrderView; q?: string; city?: string; month?: string } = {}) {
  const sql = db();
  const view = options.view ?? "active";
  const statuses: Record<OrderView, string[] | null> = {
    active: ["confirmed", "in_progress", "out_for_delivery", "delivered"],
    enquiries: ["enquiry"],
    done: ["completed"],
    cancelled: ["cancelled"],
    all: null,
  };
  const wanted = statuses[view];
  const q = options.q?.trim() ? `%${options.q.trim()}%` : null;
  return sql<OrderRow[]>`
    select o.id, o.number, o.status, o.recipient_name, o.city, o.occasion, o.delivery_date, o.delivery_time,
      c.name as customer_name, c.phone as customer_phone, c.country as customer_country,
      s.total, s.paid, s.pending, s.balance, s.partner_costs, s.order_expenses, s.profit,
      (select array_agg(distinct p.name) from partner_jobs j join partners p on p.id = j.partner_id
        where j.order_id = o.id and j.status <> 'cancelled') as partners
    from orders o
    join customers c on c.id = o.customer_id
    join order_summary s on s.order_id = o.id
    where true
      ${wanted ? sql`and o.status in ${sql(wanted)}` : sql``}
      ${q ? sql`and (o.number ilike ${q} or o.recipient_name ilike ${q} or c.name ilike ${q} or c.phone ilike ${q} or o.city ilike ${q} or o.occasion ilike ${q})` : sql``}
      ${options.city ? sql`and lower(o.city) = lower(${options.city})` : sql``}
      ${options.month ? sql`and s.month = ${`${options.month}-01`}::date` : sql``}
    order by
      ${view === "active" || view === "enquiries" ? sql`o.delivery_date asc nulls last, o.created_at desc` : sql`coalesce(o.delivery_date, o.created_at::date) desc, o.created_at desc`}
    limit 300
  `;
}

export type OrderDetail = Awaited<ReturnType<typeof getOrder>>;

export async function getOrder(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sql = db();
  const [order] = await sql<(OrderRow & {
    customer_id: string; recipient_phone: string; delivery_address: string; special_request: string; internal_notes: string;
    source: string; discount: number; delivery_fee: number; markup: number; items_subtotal: number; partner_paid: number; revenue: number; stock_costs: number;
    customer_notes: string; created_at: Date; delivered_at: Date | null; completed_at: Date | null; gallery_token: string | null;
  })[]>`
    select o.*, c.name as customer_name, c.phone as customer_phone, c.country as customer_country, c.notes as customer_notes,
      s.items_subtotal, s.total, s.paid, s.pending, s.balance, s.partner_costs, s.partner_paid, s.order_expenses, s.profit, s.revenue, s.stock_costs
    from orders o join customers c on c.id = o.customer_id join order_summary s on s.order_id = o.id
    where o.id = ${id}
  `;
  if (!order) return null;

  const [items, jobs, payments, expenses, documents, media] = await Promise.all([
    sql<{ id: string; description: string; quantity: number; unit_price: number }[]>`
      select id, description, quantity, unit_price from order_items where order_id = ${id} order by sort_order, id`,
    sql<{ id: string; partner_id: string; partner_name: string; partner_phone: string; partner_city: string; description: string; agreed_amount: number; status: string; paid: number; share_token: string | null; stars: number | null; rating_comment: string | null }[]>`
      select j.id, j.partner_id, p.name as partner_name, p.phone as partner_phone, p.city as partner_city, j.description,
        j.agreed_amount, j.status, j.share_token,
        coalesce((select sum(amount) from partner_payments where job_id = j.id and voided_at is null), 0) as paid,
        r.stars, r.comment as rating_comment
      from partner_jobs j join partners p on p.id = j.partner_id left join partner_ratings r on r.job_id = j.id where j.order_id = ${id} order by j.created_at`,
    sql<{ id: string; amount: number; method: string; reference: string; received_on: string; status: string; notes: string; proof_key: string | null; reversal_reason: string | null; receipt_id: string | null }[]>`
      select cp.id, cp.amount, cp.method, cp.reference, cp.received_on, cp.status, cp.notes, cp.proof_key, cp.reversal_reason,
        (select d.id from documents d where d.payment_id = cp.id and d.status <> 'void' order by d.created_at desc limit 1) as receipt_id
      from customer_payments cp where cp.order_id = ${id} order by cp.received_on, cp.created_at`,
    sql<{ id: string; spent_on: string; category: string; description: string; amount: number }[]>`
      select id, spent_on, category, description, amount from expenses where order_id = ${id} order by spent_on`,
    sql<{ id: string; kind: string; number: string | null; status: string; amount_requested: number | null; created_at: Date; issued_at: Date | null }[]>`
      select id, kind, number, status, amount_requested, created_at, issued_at from documents where order_id = ${id} order by created_at desc`,
    sql<{ id: string; kind: "photo" | "video"; storage_key: string; content_type: string; caption: string; uploaded_by: string; created_at: Date }[]>`
      select id, kind, storage_key, content_type, caption, uploaded_by, created_at from order_media where order_id = ${id} order by created_at`,
  ]);

  return { ...order, items, jobs, payments, expenses, documents, media };
}

/** Upcoming work for the dashboard. */
export async function dashboardSummary(month: string) {
  const sql = db();
  const [counts] = await sql<{ today: number; next7: number; active: number; enquiries: number; undated: number }[]>`
    select
      count(*) filter (where delivery_date = (now() at time zone 'Asia/Colombo')::date and status in ('confirmed','in_progress','out_for_delivery'))::int as today,
      count(*) filter (where delivery_date between (now() at time zone 'Asia/Colombo')::date and (now() at time zone 'Asia/Colombo')::date + 7 and status in ('confirmed','in_progress','out_for_delivery'))::int as next7,
      count(*) filter (where status in ('confirmed','in_progress','out_for_delivery','delivered'))::int as active,
      count(*) filter (where status = 'enquiry')::int as enquiries,
      count(*) filter (where delivery_date is null and status in ('confirmed','in_progress'))::int as undated
    from orders
  `;
  const [money] = await sql<{ customer_owes: number; pending_verification: number; partners_owed: number; partner_advances: number; month_profit: number; month_orders: number }[]>`
    select
      (select coalesce(sum(greatest(s.balance, 0)), 0) from order_summary s join orders o on o.id = s.order_id where o.status not in ('enquiry','cancelled')) as customer_owes,
      (select coalesce(sum(amount), 0) from customer_payments where status = 'pending') as pending_verification,
      (select coalesce(sum(greatest(balance, 0)), 0) from partner_balances) as partners_owed,
      (select coalesce(sum(greatest(-balance, 0)), 0) from partner_balances) as partner_advances,
      (select coalesce(sum(s.profit), 0) from order_summary s join orders o on o.id = s.order_id where o.status not in ('enquiry') and s.month = ${`${month}-01`}::date) as month_profit,
      (select count(*)::int from order_summary s join orders o on o.id = s.order_id where o.status not in ('enquiry','cancelled') and s.month = ${`${month}-01`}::date) as month_orders
  `;
  return { counts, money };
}

export async function customerOptions() {
  return db()<{ id: string; name: string; phone: string; country: string }[]>`select id, name, phone, country from customers order by name limit 2000`;
}
