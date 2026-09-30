import { describe, expect, it } from "vitest";
import { advanceAmount, costPerOrder, customerBalance, itemsSubtotal, monthNetProfit, orderProfit, orderTotal, partnerBalance, plannedCost, round, splitProfit, stockOutCost, stockUnitCost } from "@/lib/money";

describe("order totals", () => {
  it("adds items and delivery, subtracts discount", () => {
    expect(orderTotal({ items: [{ quantity: 1, unitPrice: 8500 }, { quantity: 2, unitPrice: 1250 }], deliveryFee: 750, discount: 500 })).toBe(11250);
  });

  it("adds our profit on top of the costs to make the package price", () => {
    const items = [{ quantity: 1, unitPrice: 6000 }, { quantity: 1, unitPrice: 2500 }];
    expect(plannedCost({ items, deliveryFee: 1500 })).toBe(10000);
    expect(orderTotal({ items, deliveryFee: 1500, markup: 4000, discount: 0 })).toBe(14000);
  });

  it("never goes below zero", () => {
    expect(orderTotal({ items: [{ quantity: 1, unitPrice: 100 }], deliveryFee: 0, discount: 500 })).toBe(0);
  });

  it("avoids floating point drift", () => {
    expect(itemsSubtotal([{ quantity: 3, unitPrice: 0.1 }])).toBe(0.3);
    expect(round(0.1 + 0.2)).toBe(0.3);
  });
});

describe("commission and balances", () => {
  it("commission is price minus partner cost minus extra costs", () => {
    expect(orderProfit({ total: 15000, partnerCosts: 9500, orderExpenses: 800 })).toBe(4700);
  });

  it("can be negative when costs exceed the price", () => {
    expect(orderProfit({ total: 5000, partnerCosts: 6000, orderExpenses: 0 })).toBe(-1000);
  });

  it("customer balance after an advance", () => {
    expect(customerBalance(15000, 7500)).toBe(7500);
  });

  it("partner balance is negative when we paid an advance ahead of the work", () => {
    expect(partnerBalance(0, 5000)).toBe(-5000);
    expect(partnerBalance(9500, 5000)).toBe(4500);
  });
});

describe("profit split", () => {
  it("splits 80/20", () => {
    expect(splitProfit(100000, 80)).toEqual({ owner: 80000, partner: 20000 });
  });

  it("the two shares always add up exactly", () => {
    const { owner, partner } = splitProfit(33333.33, 80);
    expect(round(owner + partner)).toBe(33333.33);
  });

  it("shares a loss in the same ratio", () => {
    expect(splitProfit(-10000, 80)).toEqual({ owner: -8000, partner: -2000 });
  });

  it("clamps odd percentages", () => {
    expect(splitProfit(1000, 150)).toEqual({ owner: 1000, partner: 0 });
  });
});

describe("month and ads", () => {
  it("net profit takes business costs off the commission", () => {
    expect(monthNetProfit({ revenue: 300000, partnerCosts: 180000, orderExpenses: 12000, businessExpenses: 40000 })).toBe(68000);
  });

  it("stock used and written off come off net profit", () => {
    expect(monthNetProfit({ revenue: 300000, partnerCosts: 180000, orderExpenses: 12000, businessExpenses: 40000, stockCosts: 6000, stockWrittenOff: 2000 })).toBe(60000);
  });

  it("cost per order", () => {
    expect(costPerOrder(30000, 12)).toBe(2500);
    expect(costPerOrder(30000, 0)).toBeNull();
  });

  it("advance rounds up to the rupee", () => {
    expect(advanceAmount(12345, 50)).toBe(6173);
  });
});

describe("stock", () => {
  it("uses the average cost of what's on hand", () => {
    expect(stockUnitCost({ quantity: 5, value: 10000 })).toBe(2000);
    expect(stockOutCost({ quantity: 5, value: 10000 }, 1)).toBe(2000);
    expect(stockOutCost({ quantity: 5, value: 10000 }, 2)).toBe(4000);
  });

  it("taking the last pieces uses exactly the value left", () => {
    // 3 for 1,000 → about 333.33 each, and the three always add up to 1,000.
    const first = stockOutCost({ quantity: 3, value: 1000 }, 1);
    const second = stockOutCost({ quantity: 2, value: 1000 - first }, 1);
    const last = stockOutCost({ quantity: 1, value: 1000 - first - second }, 1);
    expect(round(first + second + last)).toBe(1000);
  });

  it("nothing on hand costs nothing and has no unit cost", () => {
    expect(stockOutCost({ quantity: 0, value: 0 }, 1)).toBe(0);
    expect(stockUnitCost({ quantity: 0, value: 0 })).toBeNull();
  });
});
