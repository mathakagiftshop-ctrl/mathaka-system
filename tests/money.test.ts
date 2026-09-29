import { describe, expect, it } from "vitest";
import { advanceAmount, costPerOrder, customerBalance, itemsSubtotal, monthNetProfit, orderProfit, orderTotal, partnerBalance, round, splitProfit } from "@/lib/money";

describe("order totals", () => {
  it("adds items and delivery, subtracts discount", () => {
    expect(orderTotal({ items: [{ quantity: 1, unitPrice: 8500 }, { quantity: 2, unitPrice: 1250 }], deliveryFee: 750, discount: 500 })).toBe(11250);
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

  it("cost per order", () => {
    expect(costPerOrder(30000, 12)).toBe(2500);
    expect(costPerOrder(30000, 0)).toBeNull();
  });

  it("advance rounds up to the rupee", () => {
    expect(advanceAmount(12345, 50)).toBe(6173);
  });
});
