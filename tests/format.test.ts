import { describe, expect, it } from "vitest";
import { addMonths, payoutDate, periodEnd, periodOf, periodStart } from "@/lib/format";

describe("addMonths", () => {
  it("moves across year ends both ways", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-09", 0)).toBe("2026-09");
  });
});

describe("periods", () => {
  it("run 21st to 20th, named by the month they end in", () => {
    expect(periodOf("2026-10-20")).toBe("2026-10");
    expect(periodOf("2026-10-21")).toBe("2026-11");
    expect(periodOf("2026-12-25")).toBe("2027-01");
    expect(periodStart("2026-11")).toBe("2026-10-21");
    expect(periodEnd("2026-11")).toBe("2026-11-20");
    expect(periodStart("2027-01")).toBe("2026-12-21");
  });

  it("keep calendar months before October 2026, then a short 1–20 Oct", () => {
    expect(periodOf("2026-09-25")).toBe("2026-09");
    expect(periodStart("2026-09")).toBe("2026-09-01");
    expect(periodEnd("2026-09")).toBe("2026-09-30");
    expect(periodOf("2026-10-01")).toBe("2026-10");
    expect(periodStart("2026-10")).toBe("2026-10-01");
    expect(periodEnd("2026-10")).toBe("2026-10-20");
  });
});

describe("payoutDate", () => {
  it("is a period's last day", () => {
    expect(payoutDate("2026-10")).toBe("2026-10-20");
    expect(payoutDate("2026-12")).toBe("2026-12-20");
  });

  it("is the 20th after a calendar month", () => {
    expect(payoutDate("2026-09")).toBe("2026-10-20");
  });
});
