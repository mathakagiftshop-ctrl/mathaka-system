import { describe, expect, it } from "vitest";
import { addMonths, payoutDate } from "@/lib/format";

describe("addMonths", () => {
  it("moves across year ends both ways", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-09", 0)).toBe("2026-09");
  });
});

describe("payoutDate", () => {
  it("is the 20th of the following month", () => {
    expect(payoutDate("2026-09")).toBe("2026-10-20");
    expect(payoutDate("2026-12")).toBe("2027-01-20");
  });
});
