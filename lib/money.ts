// Pure money rules. Everything that decides a number shown to the user lives here
// so it can be unit-tested (see tests/money.test.ts).

export type Item = { quantity: number; unitPrice: number };

/** Round to cents to avoid floating point drift (0.1 + 0.2). */
export function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function itemsSubtotal(items: Item[]) {
  return round(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
}

/** Our estimated cost for an order: item costs + delivery cost. Internal only. */
export function plannedCost(input: { items: Item[]; deliveryFee: number }) {
  return round(itemsSubtotal(input.items) + input.deliveryFee);
}

/** The package price the customer pays: estimated cost + our profit − discount. */
export function orderTotal(input: { items: Item[]; deliveryFee: number; markup?: number; discount: number }) {
  return round(Math.max(plannedCost(input) + (input.markup ?? 0) - input.discount, 0));
}

/** Commission on one order = price − what partners charge − extra costs for that order. */
export function orderProfit(input: { total: number; partnerCosts: number; orderExpenses: number }) {
  return round(input.total - input.partnerCosts - input.orderExpenses);
}

export function customerBalance(total: number, paid: number) {
  return round(total - paid);
}

/**
 * What we owe a partner: agreed job amounts minus what we've paid.
 * Negative means we've advanced them more than their jobs are worth so far.
 */
export function partnerBalance(agreed: number, paid: number) {
  return round(agreed - paid);
}

/**
 * Split net profit between the two owners. Rounds the owner share and gives the
 * remainder to the other side so the two always add up to the profit exactly.
 * A loss is split in the same proportion.
 */
export function splitProfit(netProfit: number, ownerPercent: number) {
  const percent = Math.min(Math.max(ownerPercent, 0), 100);
  const owner = round((netProfit * percent) / 100);
  return { owner, partner: round(netProfit - owner) };
}

export type MonthFigures = {
  revenue: number;
  partnerCosts: number;
  orderExpenses: number;
  businessExpenses: number;
  /** Stock used on this month's orders, at the cost it was bought for. */
  stockCosts?: number;
  /** Stock written off (broken, unsellable) this month. */
  stockWrittenOff?: number;
};

export function monthNetProfit(figures: MonthFigures) {
  return round(figures.revenue - figures.partnerCosts - figures.orderExpenses - (figures.stockCosts ?? 0)
    - figures.businessExpenses - (figures.stockWrittenOff ?? 0));
}

/**
 * Cost of taking `quantity` out of stock, at the average cost of what's on hand
 * (5 frames bought for 10,000 → each one costs 2,000). Taking the last of it
 * uses up exactly the value left, so rounding never leaves cents behind.
 */
export function stockOutCost(onHand: { quantity: number; value: number }, quantity: number) {
  if (quantity <= 0 || onHand.quantity <= 0) return 0;
  if (quantity >= onHand.quantity) return round(Math.max(onHand.value, 0));
  return round(Math.max(onHand.value, 0) * quantity / onHand.quantity);
}

/** Average cost per unit of what's on hand, or null when there's none. */
export function stockUnitCost(onHand: { quantity: number; value: number }) {
  return onHand.quantity > 0 ? round(onHand.value / onHand.quantity) : null;
}

/** Amount for an advance request, e.g. 50% of 12,345 → 6,173 (rounded up to the rupee). */
export function advanceAmount(total: number, percent: number) {
  return Math.ceil((total * percent) / 100);
}

/** Meta ads spend per order that actually happened. Null when there were no orders. */
export function costPerOrder(adSpend: number, orders: number) {
  return orders > 0 ? round(adSpend / orders) : null;
}
