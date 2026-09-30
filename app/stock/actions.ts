"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { checkbox, formAction, money, optionalUuid, positiveMoney, requiredDate, requiredText, text, UserError, uuid } from "@/lib/actions";
import { PAYMENT_METHOD_VALUES } from "@/lib/constants";
import { db, type Tx } from "@/lib/db";
import { stockOutCost } from "@/lib/money";

const quantity = z.coerce.number().positive("must be more than zero").max(100_000);

const touch = (orderId?: string | null) => {
  revalidatePath("/stock");
  revalidatePath("/reports");
  revalidatePath("/expenses");
  revalidatePath("/");
  if (orderId) revalidatePath(`/orders/${orderId}`);
};

async function monthClosed(tx: Tx, date: string) {
  const [closed] = await tx`select 1 from month_closes where month = date_trunc('month', ${date}::date)::date`;
  return Boolean(closed);
}

/** Takes stock out at the average cost of what's on hand. Locks the item so two uses can't both take the last piece. */
async function takeOut(tx: Tx, input: { itemId: string; quantity: number; kind: "used" | "written_off"; orderId: string | null; movedOn: string; notes: string; userId: string }) {
  const [item] = await tx<{ name: string; unit: string }[]>`select name, unit from stock_items where id = ${input.itemId} for update`;
  if (!item) throw new UserError("That stock item doesn't exist.");
  const [level] = await tx<{ on_hand: number; value: number }[]>`select on_hand, value from stock_levels where item_id = ${input.itemId}`;
  if (input.quantity > level.on_hand) {
    throw new UserError(level.on_hand > 0 ? `Only ${level.on_hand} ${item.unit} of ${item.name} left.` : `No ${item.name} left in stock. Record a purchase first.`);
  }
  const cost = stockOutCost({ quantity: level.on_hand, value: level.value }, input.quantity);
  const [move] = await tx<{ id: string }[]>`
    insert into stock_moves (item_id, kind, order_id, quantity, cost, moved_on, notes, created_by)
    values (${input.itemId}, ${input.kind}, ${input.orderId}, ${input.quantity}, ${cost}, ${input.movedOn}, ${input.notes}, ${input.userId})
    returning id`;
  return { id: move.id, cost, item };
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

const itemFields = {
  name: requiredText(120),
  unit: text(20).transform((value) => value || "pcs"),
  low_stock_at: money.default(2),
  notes: text(500),
};

export const addStockItem = formAction(z.object(itemFields), async (input, user) => {
  const [existing] = await db()`select 1 from stock_items where lower(name) = lower(${input.name})`;
  if (existing) throw new UserError(`${input.name} is already in stock items.`);
  const [item] = await db()<{ id: string }[]>`
    insert into stock_items (name, unit, low_stock_at, notes) values (${input.name}, ${input.unit}, ${input.low_stock_at}, ${input.notes}) returning id`;
  await audit(user.id, "stock.item_added", "stock_item", item.id, input);
  touch();
  return "Item added.";
}, "finance");

export const updateStockItem = formAction(z.object({ item_id: uuid, ...itemFields, active: checkbox }), async (input, user) => {
  const [clash] = await db()`select 1 from stock_items where lower(name) = lower(${input.name}) and id <> ${input.item_id}`;
  if (clash) throw new UserError(`Another item is already called ${input.name}.`);
  const rows = await db()`
    update stock_items set name = ${input.name}, unit = ${input.unit}, low_stock_at = ${input.low_stock_at}, notes = ${input.notes}, active = ${input.active}
    where id = ${input.item_id} returning id`;
  if (!rows.length) throw new UserError("That stock item doesn't exist.");
  await audit(user.id, "stock.item_updated", "stock_item", input.item_id, input);
  touch();
  return "Item saved.";
}, "finance");

// ---------------------------------------------------------------------------
// Buying
// ---------------------------------------------------------------------------

export const addStockPurchase = formAction(z.object({
  item_id: optionalUuid,
  new_item: text(120),
  unit: text(20),
  quantity,
  total_cost: positiveMoney,
  bought_on: requiredDate,
  supplier: text(120),
  method: z.enum(PAYMENT_METHOD_VALUES),
  notes: text(300),
}), async (input, user) => {
  if (!input.item_id && !input.new_item) throw new UserError("Choose an item or type a new item name.");
  await db().begin(async (tx) => {
    let itemId = input.item_id;
    if (!itemId) {
      const [existing] = await tx<{ id: string }[]>`select id from stock_items where lower(name) = lower(${input.new_item})`;
      itemId = existing?.id
        ?? (await tx<{ id: string }[]>`insert into stock_items (name, unit) values (${input.new_item}, ${input.unit || "pcs"}) returning id`)[0].id;
      if (existing) await tx`update stock_items set active = true where id = ${itemId}`;
    }
    const [purchase] = await tx<{ id: string }[]>`
      insert into stock_purchases (item_id, quantity, total_cost, bought_on, supplier, method, notes, created_by)
      values (${itemId}, ${input.quantity}, ${input.total_cost}, ${input.bought_on}, ${input.supplier}, ${input.method}, ${input.notes}, ${user.id})
      returning id`;
    await audit(user.id, "stock.bought", "stock_purchase", purchase.id, { ...input, item_id: itemId }, tx);
  });
  touch();
  return "Purchase recorded.";
}, "finance");

/**
 * Only the latest purchase with nothing taken out since can be deleted: undoing
 * it then restores the item exactly, so no used piece ends up with the wrong cost.
 */
export const deleteStockPurchase = formAction(z.object({ purchase_id: uuid }), async ({ purchase_id }, user) => {
  await db().begin(async (tx) => {
    const [purchase] = await tx<{ item_id: string; created_at: Date }[]>`select item_id, created_at from stock_purchases where id = ${purchase_id}`;
    if (!purchase) throw new UserError("Already deleted.");
    await tx`select id from stock_items where id = ${purchase.item_id} for update`;
    const [later] = await tx`select 1 from stock_moves where item_id = ${purchase.item_id} and created_at >= ${purchase.created_at} limit 1`;
    if (later) throw new UserError("Some of this item was used or written off after this purchase. Undo those first.");
    await tx`delete from stock_purchases where id = ${purchase_id}`;
    await audit(user.id, "stock.purchase_deleted", "stock_purchase", purchase_id, {}, tx);
  });
  touch();
  return "Purchase deleted.";
}, "finance");

// ---------------------------------------------------------------------------
// Using and writing off
// ---------------------------------------------------------------------------

export const addStockToOrder = formAction(z.object({
  order_id: uuid,
  item_id: uuid,
  quantity,
  moved_on: requiredDate,
}), async (input, user) => {
  const result = await db().begin(async (tx) => {
    const [order] = await tx`select 1 from orders where id = ${input.order_id}`;
    if (!order) throw new UserError("That order doesn't exist.");
    const move = await takeOut(tx, { itemId: input.item_id, quantity: input.quantity, kind: "used", orderId: input.order_id, movedOn: input.moved_on, notes: "", userId: user.id });
    await audit(user.id, "stock.used", "order", input.order_id, { item_id: input.item_id, quantity: input.quantity, cost: move.cost }, tx);
    return move;
  });
  touch(input.order_id);
  return `${input.quantity} ${result.item.unit} of ${result.item.name} added to this order's costs.`;
}, "finance");

export const writeOffStock = formAction(z.object({
  item_id: uuid,
  quantity,
  moved_on: requiredDate,
  notes: requiredText(300),
}), async (input, user) => {
  await db().begin(async (tx) => {
    if (await monthClosed(tx, input.moved_on)) throw new UserError("That month is closed. Pick a date in an open month.");
    const move = await takeOut(tx, { itemId: input.item_id, quantity: input.quantity, kind: "written_off", orderId: null, movedOn: input.moved_on, notes: input.notes, userId: user.id });
    await audit(user.id, "stock.written_off", "stock_move", move.id, { ...input, cost: move.cost }, tx);
  });
  touch();
  return "Written off.";
}, "finance");

/** Puts used or written-off stock back, at the same cost it went out at. */
export const returnStock = formAction(z.object({ move_id: uuid }), async ({ move_id }, user) => {
  const orderId = await db().begin(async (tx) => {
    const [move] = await tx<{ kind: string; order_id: string | null; moved_on: string; month: string | null }[]>`
      select m.kind, m.order_id, m.moved_on, s.month
      from stock_moves m left join order_summary s on s.order_id = m.order_id
      where m.id = ${move_id}`;
    if (!move) throw new UserError("Already returned.");
    // A use counts in its order's month; a write-off in the month it happened.
    if (await monthClosed(tx, move.month ?? move.moved_on)) throw new UserError("That month is closed. Reopen it in Reports first.");
    await tx`delete from stock_moves where id = ${move_id}`;
    await audit(user.id, "stock.returned", "stock_move", move_id, { kind: move.kind, order_id: move.order_id }, tx);
    return move.order_id;
  });
  touch(orderId);
  return "Returned to stock.";
}, "finance");
