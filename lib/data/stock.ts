import "server-only";
import { db } from "@/lib/db";

export type StockItemRow = {
  id: string;
  name: string;
  unit: string;
  low_stock_at: number;
  notes: string;
  active: boolean;
  on_hand: number;
  value: number;
  bought: number;
  used: number;
  written_off: number;
};

export const isLow = (item: Pick<StockItemRow, "on_hand" | "low_stock_at" | "active">) => item.active && item.on_hand <= item.low_stock_at;

export async function listStock(options: { includeInactive?: boolean } = {}) {
  const sql = db();
  return sql<StockItemRow[]>`
    select i.id, i.name, i.unit, i.low_stock_at, i.notes, i.active, l.on_hand, l.value, l.bought, l.used, l.written_off
    from stock_items i join stock_levels l on l.item_id = i.id
    where true ${options.includeInactive ? sql`` : sql`and i.active`}
    order by i.active desc, lower(i.name)
  `;
}

/** Items that have something on hand, for "Use from stock" on an order. */
export async function stockOptions() {
  return db()<{ id: string; name: string; unit: string; on_hand: number; value: number }[]>`
    select i.id, i.name, i.unit, l.on_hand, l.value
    from stock_items i join stock_levels l on l.item_id = i.id
    where i.active and l.on_hand > 0
    order by lower(i.name)
  `;
}

export async function lowStock() {
  return db()<{ id: string; name: string; unit: string; on_hand: number }[]>`
    select i.id, i.name, i.unit, l.on_hand
    from stock_items i join stock_levels l on l.item_id = i.id
    where i.active and l.on_hand <= i.low_stock_at
    order by l.on_hand, lower(i.name)
  `;
}

export async function stockOnHandValue() {
  const [row] = await db()<{ value: number; items: number }[]>`
    select coalesce(sum(l.value), 0) as value, count(*) filter (where l.on_hand > 0)::int as items
    from stock_levels l
  `;
  return row;
}

export type StockActivity = {
  id: string;
  type: "bought" | "used" | "written_off";
  on_date: string;
  item_id: string;
  item_name: string;
  unit: string;
  quantity: number;
  amount: number;
  detail: string;
  order_id: string | null;
  order_number: string | null;
  created_at: Date;
};

/** Purchases, uses and write-offs in one list, newest first. */
export async function stockActivity(options: { month?: string; itemId?: string } = {}) {
  const sql = db();
  const start = options.month ? `${options.month}-01` : null;
  return sql<StockActivity[]>`
    select * from (
      select p.id, 'bought' as type, p.bought_on as on_date, p.item_id, i.name as item_name, i.unit, p.quantity,
        p.total_cost as amount, concat_ws(' · ', nullif(p.supplier, ''), nullif(p.notes, '')) as detail,
        null::uuid as order_id, null as order_number, p.created_at
      from stock_purchases p join stock_items i on i.id = p.item_id
      union all
      select m.id, m.kind, m.moved_on, m.item_id, i.name, i.unit, m.quantity, m.cost, m.notes,
        m.order_id, o.number, m.created_at
      from stock_moves m join stock_items i on i.id = m.item_id left join orders o on o.id = m.order_id
    ) a
    where true
      ${start ? sql`and date_trunc('month', a.on_date) = ${start}::date` : sql``}
      ${options.itemId ? sql`and a.item_id = ${options.itemId}` : sql``}
    order by a.on_date desc, a.created_at desc
    limit 200
  `;
}

export async function stockUsedOnOrder(orderId: string) {
  return db()<{ id: string; item_name: string; unit: string; quantity: number; cost: number; moved_on: string }[]>`
    select m.id, i.name as item_name, i.unit, m.quantity, m.cost, m.moved_on
    from stock_moves m join stock_items i on i.id = m.item_id
    where m.order_id = ${orderId}
    order by m.moved_on, m.created_at
  `;
}
