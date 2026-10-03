import { describe, expect, it } from "vitest";
import { isMathakaCampaign, spendRows } from "@/lib/meta-spend";

describe("isMathakaCampaign", () => {
  it("counts Mataka / Mathaka campaigns", () => {
    expect(isMathakaCampaign("Mataka | Gulf Birthday | Sinhala | Test Sep 2026")).toBe(true);
    expect(isMathakaCampaign("mathaka anniversary")).toBe(true);
  });
  it("leaves other businesses' campaigns undecided", () => {
    expect(isMathakaCampaign("Pimple patches lead")).toBe(false);
    expect(isMathakaCampaign("New Engagement Campaign")).toBe(false);
  });
});

describe("spendRows", () => {
  it("parses Meta insights rows", () => {
    expect(spendRows([{ campaign_id: "1", campaign_name: "Mataka", date_start: "2026-09-28", date_stop: "2026-09-28", spend: "996.81" }]))
      .toEqual([{ campaignId: "1", name: "Mataka", day: "2026-09-28", spend: 996.81 }]);
  });
  it("skips malformed rows", () => {
    expect(spendRows([{ campaign_id: "1", date_start: "bad", spend: "5" }, { campaign_id: "2", date_start: "2026-10-01", spend: "x" }, null])).toEqual([]);
  });
});
