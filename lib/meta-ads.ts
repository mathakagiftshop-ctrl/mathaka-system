import "server-only";
import { UserError } from "@/lib/actions";
import { db } from "@/lib/db";
import { today } from "@/lib/format";
import { isMathakaCampaign, spendRows, type SpendRow } from "@/lib/meta-spend";

const GRAPH = "https://graph.facebook.com/v23.0";

function config() {
  const token = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID?.replace(/^act_/, "");
  // Spend before this day isn't synced (earlier campaigns were testing / hand-entered).
  const since = process.env.META_ADS_SINCE || "2026-10-01";
  return token && account ? { token, account, since } : null;
}

export const metaSyncConfigured = () => config() !== null;

/** Daily spend per campaign from the Meta Marketing API, in the ad account's currency. */
async function fetchDailySpend(token: string, account: string, since: string, until: string) {
  const params = new URLSearchParams({
    level: "campaign",
    fields: "campaign_id,campaign_name,spend",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    limit: "500",
  });
  let url: string | null = `${GRAPH}/act_${account}/insights?${params}`;
  const rows: unknown[] = [];
  while (url) {
    // Token in a header, not the URL, so it never ends up in logs.
    const response: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.error) throw new UserError(`Meta said: ${body.error?.message ?? response.statusText}`);
    rows.push(...(body.data ?? []));
    url = body.paging?.next ?? null;
  }
  return spendRows(rows);
}

/**
 * Pulls Meta spend from META_ADS_SINCE to today and makes Expenses match it:
 * one meta_ads row per counted campaign per day, except skipped days. Closed months are never touched.
 * New campaigns are remembered; "Mataka…" ones are counted straight away, others
 * wait for a decision on the Expenses page.
 */
export async function syncMetaAds() {
  const settings = config();
  if (!settings) throw new UserError("Meta ads sync isn't set up yet (META_ACCESS_TOKEN and META_AD_ACCOUNT_ID).");
  const sql = db();
  try {
    const rows = await fetchDailySpend(settings.token, settings.account, settings.since, today());
    const result = await sql.begin(async (tx) => {
      const campaigns = new Map<string, SpendRow>();
      for (const row of rows) {
        const seen = campaigns.get(row.campaignId);
        if (!seen || row.day < seen.day) campaigns.set(row.campaignId, row);
      }
      const added: string[] = [];
      for (const campaign of campaigns.values()) {
        const [saved] = await tx<{ inserted: boolean }[]>`
          insert into meta_campaigns (id, name, counted, first_seen_on)
          values (${campaign.campaignId}, ${campaign.name}, ${isMathakaCampaign(campaign.name) ? true : null}, ${campaign.day})
          on conflict (id) do update set name = excluded.name, first_seen_on = least(meta_campaigns.first_seen_on, excluded.first_seen_on)
          returning (xmax = 0) as inserted`;
        if (saved.inserted) added.push(campaign.name);
      }

      const counted = new Set((await tx<{ id: string }[]>`select id from meta_campaigns where counted`).map((row) => row.id));
      const skipped = new Set((await tx<{ key: string }[]>`select campaign_id || '|' || to_char(day, 'YYYY-MM-DD') as key from meta_skipped_days`).map((row) => row.key));
      const closed = new Set((await tx<{ month: string }[]>`select to_char(month, 'YYYY-MM') as month from month_closes`).map((row) => row.month));
      const keep = rows.filter((row) => counted.has(row.campaignId) && row.spend > 0
        && !closed.has(row.day.slice(0, 7)) && !skipped.has(`${row.campaignId}|${row.day}`));

      if (keep.length) {
        await tx`
          insert into expenses ${tx(keep.map((row) => ({
            category: "meta_ads",
            description: `Meta ads — ${row.name}`,
            amount: row.spend,
            spent_on: row.day,
            meta_campaign_id: row.campaignId,
            meta_day: row.day,
          })))}
          on conflict (meta_campaign_id, meta_day) where meta_campaign_id is not null
          do update set amount = excluded.amount, description = excluded.description`;
      }
      // Days Meta no longer reports spend for (revised to 0) in open months.
      const keys = keep.map((row) => `${row.campaignId}|${row.day}`);
      await tx`
        delete from expenses
        where meta_campaign_id is not null and meta_day >= ${settings.since}::date
          and not (to_char(meta_day, 'YYYY-MM') = any(${[...closed]}::text[]))
          and not ((meta_campaign_id || '|' || to_char(meta_day, 'YYYY-MM-DD')) = any(${keys}::text[]))`;
      await tx`update settings set meta_synced_at = now(), meta_sync_error = null where id = 1`;
      return { days: keep.length, added };
    });
    return result;
  } catch (error) {
    const message = error instanceof UserError ? error.message : "Sync failed. Check the Meta token and ad account.";
    await sql`update settings set meta_sync_error = ${message} where id = 1`;
    throw error;
  }
}
