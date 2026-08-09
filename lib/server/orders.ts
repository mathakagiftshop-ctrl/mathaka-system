import "server-only";
import type { CelebrationItem, CelebrationMedia, CelebrationOrder, CelebrationUpdate, FulfilmentMode, LedgerEntry, OrderStatus, OrderTask } from "@/lib/types";
import { getDatabase } from "@/lib/server/database";

type OrderRow = {
  id: string;
  invoice_number: string;
  sender: string;
  sender_country: string | null;
  recipient: string | null;
  recipient_phone: string | null;
  address: string | null;
  district: string | null;
  occasion: string | null;
  invoice_status: string | null;
  order_status: string | null;
  journey_status: string | null;
  fulfilment_mode: string | null;
  delivery_at: Date | string | null;
  created_at: Date | string;
  total: string | number;
  journey_revision: string | number;
  conversation_id: string | null;
  amount_paid: string | number | null;
  total_cost: string | number | null;
  special_request: string | null;
  items: string[] | null;
  photos: string | number;
  videos: string | number;
  required_photos: string | number;
  required_videos: string | number;
  completed_tasks: string | number;
  total_tasks: string | number;
  has_vendor: boolean;
};

const statusMap: Record<string, OrderStatus> = {
  details: "Draft",
  draft: "Draft",
  received: "Confirmed",
  confirmed: "Confirmed",
  processing: "Preparing",
  preparing: "Preparing",
  dispatched: "Delivery",
  delivery: "Delivery",
  delivered: "Memories",
  memories: "Memories",
  completed: "Reconciled",
  reconciled: "Reconciled",
};

const progressByStatus: Record<OrderStatus, number> = {
  Draft: 10,
  Confirmed: 25,
  Preparing: 55,
  Delivery: 80,
  Memories: 94,
  Reconciled: 100,
};

function datePresentation(value: Date | string | null) {
  if (!value) return { date: "", dateLabel: "Delivery date not set", countdown: "Needs scheduling" };
  const delivery = new Date(value);
  const now = new Date();
  const days = Math.ceil((delivery.getTime() - now.getTime()) / 86_400_000);
  const countdown = days < 0 ? `${Math.abs(days)} days ago` : days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`;
  return {
    date: delivery.toISOString().slice(0, 10),
    dateLabel: new Intl.DateTimeFormat("en-LK", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Colombo",
    }).format(delivery),
    countdown,
  };
}

function mapOrder(row: OrderRow): CelebrationOrder {
  const statusKey = (row.journey_status || row.order_status || "draft").toLowerCase();
  const status = statusMap[statusKey] ?? "Draft";
  const total = Number(row.total || 0);
  const paid = Number(row.amount_paid || 0);
  const totalCost = Number(row.total_cost || 0);
  const taskTotal = Number(row.total_tasks || 0);
  const taskComplete = Number(row.completed_tasks || 0);
  const progress = taskTotal ? Math.round((taskComplete / taskTotal) * 100) : progressByStatus[status];
  const delivery = datePresentation(row.delivery_at);
  const mode = ((row.fulfilment_mode || (row.has_vendor ? "partner" : "self"))) as string;
  const normalizedMode = `${mode.charAt(0).toUpperCase()}${mode.slice(1)}` as FulfilmentMode;
  const balance = Math.max(total - paid, 0);
  const needsDate = !row.delivery_at;

  return {
    id: row.id,
    recipient: row.recipient || "Recipient not named",
    recipientPhone: row.recipient_phone || "",
    sender: row.sender,
    senderCountry: row.sender_country || "Country not recorded",
    occasion: row.occasion || row.invoice_number,
    ...delivery,
    district: row.district || "Area not assigned",
    address: row.address || "Address not recorded",
    mode: normalizedMode,
    status,
    progress,
    attention: balance > 0 || needsDate ? "urgent" : status === "Preparing" ? "watch" : "clear",
    nextAction: balance > 0 ? "Verify remaining payment" : needsDate ? "Set delivery date" : status === "Memories" ? "Complete the gallery" : "Review journey",
    paid,
    total,
    currencyNote: balance > 0 ? `LKR ${balance.toLocaleString("en-LK")} remaining` : "Paid in full",
    estimatedProfit: total - totalCost,
    moneyStatus: balance > 0 ? `${row.invoice_status || "Payment"} · balance due` : "Payment recorded",
    items: row.items?.length ? row.items : ["Order items have not been added"],
    specialRequest: row.special_request || "No special request has been recorded yet.",
    tasks: [],
    ledger: [],
    photos: Number(row.photos || 0),
    videos: Number(row.videos || 0),
    requiredPhotos: Number(row.required_photos || 3),
    requiredVideos: Number(row.required_videos || 1),
    revision: Number(row.journey_revision || 1),
    conversationId: row.conversation_id,
    updates: [],
    media: [],
  };
}

const orderSelect = `
  select
    i.id::text,
    i.invoice_number,
    c.name as sender,
    c.country as sender_country,
    r.name as recipient,
    r.phone as recipient_phone,
    r.address,
    dz.name as district,
    coalesce(idt.title, i.invoice_number) as occasion,
    i.status as invoice_status,
    i.order_status,
    j.journey_status,
    j.fulfilment_mode,
    j.delivery_at,
    i.created_at,
    i.total,
    coalesce(j.revision, 1)::text as journey_revision,
    (select wc.id::text from public.whatsapp_messages wm join public.whatsapp_conversations wc on wc.id = wm.conversation_id where wm.invoice_id = i.id order by wm.sent_at desc limit 1) as conversation_id,
    coalesce(i.amount_paid, (select sum(p.amount) from public.payments p where p.invoice_id = i.id), 0) as amount_paid,
    coalesce(i.total_cost,
      (select sum(e.amount) from public.expenses e where e.invoice_id = i.id), 0
    ) as total_cost,
    coalesce(j.special_request, i.gift_message, i.notes) as special_request,
    (select array_agg(ii.description order by ii.id) from public.invoice_items ii where ii.invoice_id = i.id) as items,
    ((select count(*) from public.delivery_photos dp where dp.invoice_id = i.id) +
      (select count(*) from public.celebration_media cm where cm.invoice_id = i.id and cm.kind = 'photo'))::text as photos,
    (select count(*) from public.celebration_media cm where cm.invoice_id = i.id and cm.kind = 'video')::text as videos,
    coalesce(mr.minimum_photos, 3)::text as required_photos,
    coalesce(mr.minimum_videos, 1)::text as required_videos,
    (select count(*) from public.celebration_tasks ct where ct.invoice_id = i.id and ct.completed_at is not null)::text as completed_tasks,
    (select count(*) from public.celebration_tasks ct where ct.invoice_id = i.id)::text as total_tasks,
    exists(select 1 from public.vendor_orders vo where vo.invoice_id = i.id) as has_vendor
  from public.invoices i
  join public.customers c on c.id = i.customer_id
  left join public.recipients r on r.id = i.recipient_id
  left join public.delivery_zones dz on dz.id = i.delivery_zone_id
  left join public.important_dates idt on idt.customer_id = i.customer_id and idt.recipient_id is not distinct from i.recipient_id
  left join public.celebration_journeys j on j.invoice_id = i.id
  left join public.celebration_media_requirements mr on mr.invoice_id = i.id
`;

export async function getSupabaseOrders(): Promise<CelebrationOrder[]> {
  const sql = getDatabase();
  const rows = await sql.unsafe<OrderRow[]>(`${orderSelect} order by coalesce(j.delivery_at, i.created_at) desc limit 100`);
  return rows.map(mapOrder);
}

function defaultTasks(status: OrderStatus): OrderTask[] {
  const completeThrough = status === "Reconciled" ? 7 : status === "Memories" ? 6 : status === "Delivery" ? 5 : status === "Preparing" ? 2 : 0;
  const titles = [
    ["Confirm order details", "address"],
    ["Confirm gifts and custom items", "gift"],
    ["Confirm cake or partner", "cake"],
    ["Prepare flowers and packing", "flowers"],
    ["Verify recipient and delivery", "delivery"],
    ["Complete the surprise", "delivery"],
    ["Upload photos and video", "media"],
  ] as const;
  return titles.map(([title, kind], index) => ({
    id: `default-${index}`,
    title,
    assignee: "Unassigned",
    due: "Not scheduled",
    complete: index < completeThrough,
    kind,
  }));
}

export async function getSupabaseOrder(id: string): Promise<CelebrationOrder | null> {
  if (!/^\d+$/.test(id)) return null;
  const sql = getDatabase();
  const rows = await sql.unsafe<OrderRow[]>(`${orderSelect} where i.id = $1 limit 1`, [Number(id)]);
  if (!rows[0]) return null;
  const order = mapOrder(rows[0]);

  const taskRows = await sql<{
    id: string; title: string; kind: string; assignee_name: string | null; due_at: Date | string | null; completed_at: Date | string | null;
  }[]>`
    select id::text, title, kind, assignee_name, due_at, completed_at
    from public.celebration_tasks
    where invoice_id = ${Number(id)}
    order by sort_order, created_at
  `;
  order.tasks = taskRows.length ? taskRows.map((task) => ({
    id: task.id,
    title: task.title,
    assignee: task.assignee_name || "Unassigned",
    due: task.due_at ? datePresentation(task.due_at).dateLabel : "Not scheduled",
    complete: Boolean(task.completed_at),
    kind: (["gift", "cake", "flowers", "packing", "address", "delivery", "media", "other"].includes(task.kind) ? task.kind : "other") as OrderTask["kind"],
  })) : defaultTasks(order.status);

  const ledgerRows = await sql<{
    id: string; label: string; amount: string | number; entry_type: LedgerEntry["type"]; is_estimate: boolean;
  }[]>`
    select id::text, coalesce(notes, payment_method, 'Customer payment') as label, amount, 'revenue'::text as entry_type, false as is_estimate
    from public.payments where invoice_id = ${Number(id)}
    union all
    select id::text, description as label, amount, 'expense'::text as entry_type, false as is_estimate
    from public.expenses where invoice_id = ${Number(id)}
    union all
    select vp.id::text, coalesce(vp.notes, vp.payment_type, 'Partner payment') as label, vp.amount, 'partner'::text as entry_type, false as is_estimate
    from public.vendor_payments vp join public.vendor_orders vo on vo.id = vp.vendor_order_id
    where vo.invoice_id = ${Number(id)}
  `;
  order.ledger = ledgerRows.map((entry) => ({
    id: entry.id,
    label: entry.label,
    amount: Number(entry.amount),
    type: entry.entry_type,
    status: entry.is_estimate ? "estimated" : "actual",
  }));

  const itemRows = await sql<{
    id: string; description: string; quantity: string | number; unit_price: string | number; cost_price: string | number | null;
  }[]>`
    select id::text, description, quantity, unit_price, cost_price
    from public.invoice_items where invoice_id = ${Number(id)} order by id
  `;
  order.itemDetails = itemRows.map((item): CelebrationItem => ({
    id: item.id, description: item.description, quantity: Number(item.quantity || 1),
    unitPrice: Number(item.unit_price || 0), costPrice: Number(item.cost_price || 0),
  }));

  const updateRows = await sql<{
    id: string; body: string; status: CelebrationUpdate["status"]; created_at: Date | string;
  }[]>`
    select u.id::text, u.body,
      case when o.status in ('sent','failed','cancelled') then o.status else u.status end as status,
      u.created_at
    from public.celebration_updates u
    left join public.whatsapp_outbox o on o.id = u.outbox_id
    where u.invoice_id = ${Number(id)} order by u.created_at desc limit 50
  `;
  order.updates = updateRows.map((update) => ({ id: update.id, body: update.body, status: update.status, createdAt: new Date(update.created_at).toISOString() }));

  const mediaRows = await sql<{
    id: string; kind: "photo" | "video"; storage_path: string; caption: string | null; created_at: Date | string;
  }[]>`
    select id::text, kind, storage_path, caption, created_at
    from public.celebration_media where invoice_id = ${Number(id)} order by created_at desc
  `;
  order.media = mediaRows.map((asset): CelebrationMedia => ({ id: asset.id, kind: asset.kind, storagePath: asset.storage_path, caption: asset.caption, createdAt: new Date(asset.created_at).toISOString() }));

  return order;
}
