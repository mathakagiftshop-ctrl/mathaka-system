import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Empty, Money, PageHeader, Stat } from "@/components/bits";
import { ActionButton, ActionForm, Field, Select, Submit } from "@/components/form";
import { addExpense, decideMetaCampaign, deleteExpense, syncMetaAdsNow, unskipMetaDay } from "@/app/expenses/actions";
import { EXPENSE_CATEGORIES, expenseLabel } from "@/lib/constants";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data/settings";
import { currentMonth, formatDate, formatDateTime, formatMoney, monthLabel, today } from "@/lib/format";
import { metaSyncConfigured } from "@/lib/meta-ads";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string; category?: string }> }) {
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : currentMonth();
  const category = EXPENSE_CATEGORIES.some((item) => item.value === params.category) ? params.category! : null;
  const sql = db();
  const [expenses, totals, [stock], campaigns, settings, skippedDays] = await Promise.all([
    sql<{ id: string; spent_on: string; category: string; description: string; amount: number; order_id: string | null; order_number: string | null; meta_campaign_id: string | null }[]>`
      select e.id, e.spent_on, e.category, e.description, e.amount, e.order_id, o.number as order_number, e.meta_campaign_id
      from expenses e left join orders o on o.id = e.order_id
      where date_trunc('month', e.spent_on) = ${`${month}-01`}::date ${category ? sql`and e.category = ${category}` : sql``}
      order by e.spent_on desc, e.created_at desc`,
    sql<{ category: string; amount: number }[]>`
      select category, sum(amount) as amount from expenses where date_trunc('month', spent_on) = ${`${month}-01`}::date group by category`,
    sql<{ bought: number }[]>`
      select coalesce(sum(total_cost), 0) as bought from stock_purchases where date_trunc('month', bought_on) = ${`${month}-01`}::date`,
    sql<{ id: string; name: string; counted: boolean | null; first_seen_on: string }[]>`
      select id, name, counted, first_seen_on from meta_campaigns order by counted nulls first, first_seen_on desc`,
    getSettings(),
    sql<{ campaign_id: string; name: string; day: string; amount: number }[]>`
      select s.campaign_id, c.name, s.day, s.amount from meta_skipped_days s join meta_campaigns c on c.id = s.campaign_id
      where date_trunc('month', s.day) = ${`${month}-01`}::date order by s.day`,
  ]);
  const undecided = campaigns.filter((campaign) => campaign.counted === null);
  const synced = expenses.some((expense) => expense.meta_campaign_id);
  const handEnteredAds = expenses.filter((expense) => expense.category === "meta_ads" && !expense.meta_campaign_id);
  const total = totals.reduce((sum, row) => sum + row.amount, 0);
  const ads = totals.find((row) => row.category === "meta_ads")?.amount ?? 0;

  return (
    <AppShell permission="finance">
      <PageHeader eyebrow="Expenses" title={monthLabel(month)} description={<>Business costs like Meta ads, packaging and phone bills. Costs for one order are added on that order&apos;s page. Things bought in bulk to use on orders (frames etc.) go in <Link className="link" href="/stock">Stock</Link>.</>} />
      <form className="filters" action="/expenses">
        <label className="field"><span>Month</span><input type="month" name="month" defaultValue={month} /></label>
        <label className="field"><span>Category</span>
          <select name="category" defaultValue={category ?? ""}>
            <option value="">All</option>
            {EXPENSE_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <button className="btn" type="submit">Show</button>
      </form>

      {undecided.map((campaign) => (
        <p key={campaign.id} className="notice warn row" style={{ marginBottom: 12 }}>
          <span>New Meta campaign <strong>{campaign.name}</strong> (since {formatDate(campaign.first_seen_on)}). Is it a Mathaka cost? Its spend isn&apos;t counted until you choose.</span>
          <ActionButton action={decideMetaCampaign} fields={{ campaign_id: campaign.id, counted: "yes" }} className="btn small primary">Count it</ActionButton>
          <ActionButton action={decideMetaCampaign} fields={{ campaign_id: campaign.id, counted: "no" }} className="btn small ghost">Ignore</ActionButton>
        </p>
      ))}
      {synced && handEnteredAds.length > 0 && (
        <p className="notice warn" style={{ marginBottom: 12 }}>
          Meta ads are synced for this month, and there {handEnteredAds.length === 1 ? "is also a hand-entered Meta ads expense" : `are also ${handEnteredAds.length} hand-entered Meta ads expenses`} ({handEnteredAds.map((expense) => `${formatDate(expense.spent_on)} ${formatMoney(expense.amount)}`).join(", ")}). Delete {handEnteredAds.length === 1 ? "it" : "them"} if the same days are synced, or ads are counted twice.
        </p>
      )}

      <div className="stats">
        <Stat label="Spent this month" value={<Money value={total} />} tone="dark" />
        {stock.bought > 0 && <Stat label="Stock bought" value={<Money value={stock.bought} />} note={<Link className="link" href={`/stock?month=${month}`}>Not in this list →</Link>} />}
        <Stat label="Meta ads" value={<Money value={ads} />} note={<Link className="link" href={`/reports?month=${month}`}>Cost per order →</Link>} />
        {totals.filter((row) => row.category !== "meta_ads").slice(0, 3).map((row) => (
          <Stat key={row.category} label={expenseLabel(row.category)} value={<Money value={row.amount} />} />
        ))}
      </div>

      <div className="grid sidebar-right">
        <div>
          {expenses.length === 0 ? <Empty title="No expenses this month" /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>What</th><th>Category</th><th className="right">Amount</th><th /></tr></thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td className="num">{formatDate(expense.spent_on)}</td>
                      <td>{expense.description}{expense.order_id && <small>for <Link className="link" href={`/orders/${expense.order_id}`}>{expense.order_number}</Link></small>}{expense.meta_campaign_id && <small>Synced from Meta</small>}</td>
                      <td>{expenseLabel(expense.category)}</td>
                      <td className="right"><Money value={expense.amount} /></td>
                      <td className="right"><ActionButton action={deleteExpense} fields={{ expense_id: expense.id }} className="btn small ghost"
                        confirm={expense.meta_campaign_id ? "Don't count this day's Meta spend? The sync will skip it from now on (you can undo below)." : "Delete this expense?"}>
                        {expense.meta_campaign_id ? "Skip" : "Delete"}
                      </ActionButton></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="stack">
        <section className="card">
          <h2>Meta ads sync</h2>
          {!metaSyncConfigured() ? (
            <p className="muted">Not set up yet. Add META_ACCESS_TOKEN and META_AD_ACCOUNT_ID to the app&apos;s environment.</p>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 13 }}>Daily spend per campaign, synced every morning. {settings.meta_synced_at ? `Last synced ${formatDateTime(settings.meta_synced_at)}.` : "Not synced yet."}</p>
              {settings.meta_sync_error && <p className="notice error" style={{ marginTop: 8 }}>{settings.meta_sync_error}</p>}
              <div className="row" style={{ marginTop: 10 }}><ActionButton action={syncMetaAdsNow}>Sync now</ActionButton></div>
              {skippedDays.length > 0 && (
                <div style={{ marginTop: 12, fontSize: 13 }}>
                  <strong>Skipped days this month</strong> <small className="muted">not counted</small>
                  <ul style={{ listStyle: "none", padding: 0, marginTop: 6 }}>
                    {skippedDays.map((skip) => (
                      <li key={`${skip.campaign_id}-${skip.day}`} className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                        <span>{formatDate(skip.day)} · {formatMoney(skip.amount)}<small>{skip.name}</small></span>
                        <ActionButton action={unskipMetaDay} fields={{ campaign_id: skip.campaign_id, day: skip.day }} className="btn small ghost">Count again</ActionButton>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {campaigns.length > 0 && (
                <ul style={{ listStyle: "none", padding: 0, marginTop: 12, fontSize: 13 }}>
                  {campaigns.map((campaign) => (
                    <li key={campaign.id} className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                      <span>{campaign.name}<small> · {campaign.counted === null ? "not decided" : campaign.counted ? "counted" : "ignored"}</small></span>
                      {campaign.counted !== null && (
                        <ActionButton action={decideMetaCampaign} fields={{ campaign_id: campaign.id, counted: campaign.counted ? "no" : "yes" }} className="btn small ghost"
                          confirm={campaign.counted ? `Stop counting ${campaign.name}? Its spend leaves open months.` : `Count ${campaign.name} as a Mathaka cost?`}>
                          {campaign.counted ? "Ignore" : "Count"}
                        </ActionButton>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
        <section className="card">
          <h2>Add an expense</h2>
          <ActionForm action={addExpense}>
            <Select label="Category" name="category" options={EXPENSE_CATEGORIES} defaultValue="meta_ads" />
            <Field label="What" name="description" required placeholder="e.g. Facebook ads — Birthday campaign" />
            <div className="form-grid">
              <Field label="Amount" name="amount" type="number" min="1" step="0.01" required />
              <Field label="Date" name="spent_on" type="date" defaultValue={today()} required />
            </div>
            <Submit>Add expense</Submit>
          </ActionForm>
        </section>
        </div>
      </div>
    </AppShell>
  );
}
