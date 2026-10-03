// Pure rules for Meta ads spend (see tests/meta-spend.test.ts).

import { round } from "@/lib/money";

export type SpendRow = { campaignId: string; name: string; day: string; spend: number };

/** Campaigns named "Mataka …" or "Mathaka …" are ours and count without asking. */
export function isMathakaCampaign(name: string) {
  return /\bmath?aka\b/i.test(name);
}

/** Meta insights rows (campaign level, one per day) → clean spend rows. Skips anything malformed. */
export function spendRows(data: unknown[]): SpendRow[] {
  return data.flatMap((item) => {
    const row = (item ?? {}) as { campaign_id?: unknown; campaign_name?: unknown; date_start?: unknown; spend?: unknown };
    const spend = Number(row.spend);
    if (typeof row.campaign_id !== "string" || typeof row.date_start !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.date_start) || !Number.isFinite(spend)) return [];
    return [{ campaignId: row.campaign_id, name: typeof row.campaign_name === "string" ? row.campaign_name : row.campaign_id, day: row.date_start, spend: round(spend) }];
  });
}
