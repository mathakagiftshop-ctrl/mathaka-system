import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Money, PageHeader, Stat } from "@/components/bits";
import { ActionButton, ActionForm, Field, Select, Submit } from "@/components/form";
import { SriLankaMap, type MapMarker } from "@/components/sri-lanka-map";
import { addShareAdvance, closeMonth, deleteShareAdvance, markSharePaid, reopenMonth, unmarkSharePaid } from "@/app/reports/actions";
import { can, requireUser } from "@/lib/auth";
import { findCity } from "@/lib/cities";
import { PAYMENT_METHODS, expenseLabel, methodLabel } from "@/lib/constants";
import { cityStats, isMonthClosed, monthReport, monthlyTrend, partnerLeaderboard, shareAdvances, type CityStat } from "@/lib/data/reports";
import { sharePayout } from "@/lib/money";
import { addDays, addMonths, currentPeriod, formatDate, formatMoney, lastEndedPeriod, monthLabel, payoutDate, periodEnd, periodRange, today } from "@/lib/format";

export const metadata: Metadata = { title: "Reports & map" };

const ranges = [
  { value: "all", label: "All time" },
  { value: "year", label: "Last 12 months" },
  { value: "90", label: "Last 90 days" },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string; range?: string }> }) {
  const params = await searchParams;
  const user = await requireUser("finance");
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : currentPeriod();
  const range = ranges.find((item) => item.value === params.range)?.value ?? "all";
  const since = range === "90" ? addDays(today(), -90) : range === "year" ? addDays(today(), -365) : null;
  // A period's share is due on its last day and it closes that night; flag it if it's still open after.
  const overdue = [addMonths(lastEndedPeriod(), -1), lastEndedPeriod()].filter((period) => payoutDate(period) < today());
  const [report, trend, cities, leaders, dueClosed, advances] = await Promise.all([
    monthReport(month), monthlyTrend(12), cityStats(since), partnerLeaderboard(since), Promise.all(overdue.map(isMonthClosed)), shareAdvances(),
  ]);
  // Once paid, show what was actually taken off; until then, what would come off now.
  const payout = report.sharePaidAt
    ? { deducted: report.advancesDeducted, toPay: Math.max(report.split.partner, 0) - report.advancesDeducted }
    : sharePayout(report.split.partner, advances.owed);
  const ended = periodEnd(month) <= today();
  const dueOpen = overdue.filter((_, index) => !dueClosed[index]);
  const bridge = report.profitToCash;
  const completedTotal = cities.reduce((sum, city) => sum + city.completed, 0);
  const unmapped = cities.filter((city) => city.orders > 0 && !findCity(city.city));
  const link = (next: { month?: string; range?: string }) => `/reports?month=${next.month ?? month}&range=${next.range ?? range}`;

  return (
    <AppShell permission="finance">
      <PageHeader eyebrow="Reports" title="How the business is doing" description="Profit is counted from the 21st to the 20th, named by the month it ends in (November is 21 Oct – 20 Nov). Orders count once delivered, by their delivery date; business costs by the day they're spent." />

      {dueOpen.map((period) => (
        <p key={period} className="notice warn" style={{ marginBottom: 16 }}>
          {report.split.partnerLabel}&apos;s share for {monthLabel(period)} ({periodRange(period)}) was due on {formatDate(payoutDate(period))}, but that period couldn&apos;t close yet.
          {" "}<Link className="link" href={link({ month: period })}>See what&apos;s still open →</Link> It closes automatically each night once everything is delivered.
        </p>
      ))}

      <form className="filters" action="/reports">
        <label className="field"><span>Month</span><input type="month" name="month" defaultValue={month} /></label>
        <input type="hidden" name="range" value={range} />
        <button className="btn" type="submit">Show</button>
      </form>

      <div className="grid two" style={{ marginBottom: 22 }}>
        <section className="card">
          <div className="card-head">
            <h2>{monthLabel(month)} profit <small className="muted">{periodRange(month)}</small></h2>
            {report.closedAt ? <span className="badge sage">Closed {formatDate(report.closedAt)}</span> : <span className="badge gold">Open — can still change</span>}
          </div>
          <div className="money-lines">
            <div><span>Sales ({report.delivered} delivered{report.cancelled ? `, ${report.cancelled} cancelled` : ""})</span><Money value={report.figures.revenue} /></div>
            {report.cancelledKept > 0 && <div><small>incl. kept from {report.cancelled} cancelled order{report.cancelled === 1 ? "" : "s"} (non-refundable advances)</small><small><Money value={report.cancelledKept} /></small></div>}
            <div><span>Paid / owed to partners</span><Money value={-report.figures.partnerCosts} /></div>
            <div><span>Extra order costs</span><Money value={-report.figures.orderExpenses} /></div>
            {report.figures.stockCosts > 0 && <div><span>Stock used on orders</span><Money value={-report.figures.stockCosts} /></div>}
            <div className="total"><span>Commission</span><Money value={report.commission} /></div>
            <div style={{ marginTop: 6 }}><span>Business costs (ads, packaging…)</span><Money value={-report.figures.businessExpenses} /></div>
            {report.figures.stockWrittenOff > 0 && <div><span>Stock written off</span><Money value={-report.figures.stockWrittenOff} /></div>}
            <div className={`total ${report.netProfit >= 0 ? "profit" : "loss"}`}><span>Net profit</span><Money value={report.netProfit} /></div>
          </div>
          {report.open.orders > 0 && (
            <p className="notice warn" style={{ marginTop: 12 }}>
              Not counted yet: {report.open.orders} order{report.open.orders === 1 ? "" : "s"} still to deliver ({report.open.numbers.join(", ")}) —
              sales <Money value={report.open.revenue} />, costs entered so far <Money value={report.open.costsSoFar} />.
              {" "}They join the profit once delivered, with all their costs entered.
            </p>
          )}
          <div className="split" style={{ marginTop: 16 }}>
            <div><small>{report.split.ownerLabel} · {report.split.ownerPercent}%</small><strong>{formatMoney(report.split.owner)}</strong></div>
            <div><small>{report.split.partnerLabel} · {100 - report.split.ownerPercent}%</small><strong>{formatMoney(report.split.partner)}</strong></div>
          </div>
          {report.closedAt && (
            <div className="money-lines" style={{ marginTop: 14 }}>
              {payout.deducted > 0 && <>
                <div><span>{report.split.partnerLabel}&apos;s share</span><Money value={report.split.partner} /></div>
                <div><span>Advances already taken</span><Money value={-payout.deducted} /></div>
              </>}
              <div className="total">
                <span>
                  {report.split.partnerLabel}&apos;s payout · due {formatDate(payoutDate(month))}
                  {report.sharePaidAt && <small style={{ display: "block" }}>Paid {formatDate(report.sharePaidAt)}</small>}
                </span>
                {report.split.partner > 0 ? <Money value={payout.toPay} /> : <span>Nothing to pay (loss)</span>}
              </div>
            </div>
          )}
          <div className="row" style={{ marginTop: 14 }}>
            {report.closedAt && !report.sharePaidAt && report.split.partner > 0 && <ActionButton action={markSharePaid} fields={{ month }} className="btn primary small" confirm={payout.deducted > 0
              ? `Mark ${report.split.partnerLabel}'s share paid? Hand over ${formatMoney(payout.toPay)}; ${formatMoney(payout.deducted)} comes off for advances.`
              : `Mark ${formatMoney(report.split.partner)} as paid to ${report.split.partnerLabel}?`}>Mark {report.split.partnerLabel} paid</ActionButton>}
            {report.sharePaidAt && can(user, "settings") && <ActionButton action={unmarkSharePaid} fields={{ month }} className="btn small ghost" confirm="Undo this payment record?">Undo paid</ActionButton>}
            {!report.closedAt && ended && <ActionButton action={closeMonth} fields={{ month }} className="btn primary small" confirm={`Close ${monthLabel(month)} (${periodRange(month)})? Its numbers and split will be fixed.`}>Close month & fix split</ActionButton>}
            {!report.closedAt && !ended && <small>Closes automatically on the night of {formatDate(periodEnd(month))}, when {report.split.partnerLabel}&apos;s share is due. You can close it yourself from that morning.</small>}
            {report.closedAt && can(user, "settings") && <ActionButton action={reopenMonth} fields={{ month }} className="btn small ghost" confirm="Reopen this month? Numbers will be recalculated.">Reopen month</ActionButton>}
          </div>
        </section>

        <div className="stack">
          <div className="stats" style={{ marginBottom: 0 }}>
            <Stat label="Orders" value={report.orders} note={`${report.delivered} delivered · ${report.open.orders} to deliver · ${report.cancelled} cancelled`} />
            <Stat label="Meta ad spend" value={<Money value={report.adSpend} />} />
            <Stat label="Ad cost per new customer" value={report.customers.adCostPerNewOrder === null ? "—" : <Money value={report.customers.adCostPerNewOrder} />}
              note={`Ad spend ÷ ${report.customers.newOrders} new-customer order${report.customers.newOrders === 1 ? "" : "s"}`} />
            <Stat label="Stock on hand" value={<Money value={report.stockOnHand} />} note={<Link className="link" href="/stock">Bought, not used yet →</Link>} />
            <Stat label="Avg commission" value={report.delivered ? <Money value={Math.round(report.commission / report.delivered)} /> : "—"} note="per delivered order" />
          </div>
          <section className="card">
            <div className="card-head">
              <h2>{report.split.partnerLabel}&apos;s advances</h2>
              {advances.owed > 0 && <span className="badge gold">{formatMoney(advances.owed)} to take off</span>}
            </div>
            <p className="muted" style={{ fontSize: 13, margin: "4px 0 10px" }}>
              Money {report.split.partnerLabel} takes before payday. It comes off the next payout when you mark it paid; anything the payout doesn&apos;t cover waits for the one after. Not a business cost, so profit doesn&apos;t change.
            </p>
            {advances.recent.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", fontSize: 13 }}>
                {advances.recent.map((advance) => (
                  <li key={advance.id} className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                    <span>{formatDate(advance.paid_on)} · <Money value={advance.amount} /><small>{methodLabel(advance.method)}{advance.note ? ` · ${advance.note}` : ""}</small></span>
                    <ActionButton action={deleteShareAdvance} fields={{ advance_id: advance.id }} className="btn small ghost" confirm="Delete this advance?">Delete</ActionButton>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={addShareAdvance}>
              <div className="form-grid">
                <Field label="Amount" name="amount" type="number" min="1" step="0.01" required />
                <Field label="Date" name="paid_on" type="date" defaultValue={today()} required />
              </div>
              <div className="form-grid">
                <Select label="Paid by" name="method" options={PAYMENT_METHODS} defaultValue="cash" />
                <Field label="Note" name="note" placeholder="Optional" />
              </div>
              <Submit>Record advance</Submit>
            </ActionForm>
          </section>
          <section className="card">
            <h2>New vs repeat customers</h2>
            <p className="muted" style={{ fontSize: 13, margin: "4px 0 10px" }}>
              Repeat = the customer already had an order with us. Ads are a business cost for the whole month, so repeat orders carry no ad cost — their commission is all yours.
            </p>
            <div className="money-lines">
              <div><span>New customers ({report.customers.newOrders} order{report.customers.newOrders === 1 ? "" : "s"})</span><Money value={report.customers.newCommission} /></div>
              {report.adSpend > 0 && <div><span>− Meta ads to win them</span><Money value={-report.adSpend} /></div>}
              {report.adSpend > 0 && <div className="total"><span>New customers after ads</span><Money value={report.customers.newCommission - report.adSpend} tone="auto" /></div>}
              <div style={{ marginTop: 6 }}><span>Repeat customers ({report.customers.repeatOrders} order{report.customers.repeatOrders === 1 ? "" : "s"}) · no ad cost</span><Money value={report.customers.repeatCommission} tone="auto" /></div>
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Commission from delivered orders only.{" "}
              <Link className="link" href="/customers?repeat=1">See repeat customers →</Link></p>
          </section>
          <section className="card">
            <h2>Cash this month</h2>
            <div className="money-lines">
              <div><span>Money in (verified payments)</span><Money value={report.cash.in} /></div>
              <div><span>Paid to partners</span><Money value={-report.cash.paidPartners} /></div>
              <div><span>Expenses paid</span><Money value={-report.cash.paidExpenses} /></div>
              {report.cash.stockBought > 0 && <div><span>Stock bought</span><Money value={-report.cash.stockBought} /></div>}
              <div className="total"><span>Net cash</span><Money value={report.cash.in - report.cash.out} /></div>
            </div>
            {report.byCategory.length > 0 && (
              <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
                {report.byCategory.map((row) => `${expenseLabel(row.category)} ${formatMoney(row.amount)}`).join(" · ")}
              </p>
            )}
          </section>
          <section className="card">
            <h2>Profit vs cash</h2>
            <p className="muted" style={{ fontSize: 13, margin: "4px 0 10px" }}>
              Profit counts stock when it&apos;s used and orders when they&apos;re delivered; cash counts money when it moves. This is why they differ.
            </p>
            <div className="money-lines">
              <div><span>Net profit</span><Money value={bridge.profit} /></div>
              {bridge.stock !== 0 && <div><span>{bridge.stock < 0 ? "Stock bought, not used yet" : "Stock used from earlier months"}</span><Money value={bridge.stock} /></div>}
              {bridge.customers !== 0 && <div><span>{bridge.customers < 0 ? "Sales not collected yet" : "Collected ahead (advances, old balances)"}</span><Money value={bridge.customers} /></div>}
              {bridge.partners !== 0 && <div><span>{bridge.partners > 0 ? "Owed to partners, not paid yet" : "Paid to partners ahead / for other months"}</span><Money value={bridge.partners} /></div>}
              {bridge.expenses !== 0 && <div><span>{bridge.expenses > 0 ? "Order costs not paid this month" : "Order costs paid ahead / for other months"}</span><Money value={bridge.expenses} /></div>}
              <div className="total"><span>Net cash</span><Money value={bridge.cash} tone="auto" /></div>
            </div>
            {bridge.stock < 0 && (
              <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
                <Money value={-bridge.stock} /> of this month&apos;s profit is sitting on the shelf as stock, not cash. It comes back as those pieces are used on orders.
                {" "}<Link className="link" href={`/stock?month=${month}`}>See stock →</Link>
              </p>
            )}
          </section>
        </div>
      </div>

      <section className="card" style={{ marginBottom: 22 }}>
        <h2 style={{ marginBottom: 12 }}>Last 12 months</h2>
        <div className="table-wrap table-plain">
          <table>
            <thead><tr><th>Period</th><th className="right">Orders</th><th className="right">Sales</th><th className="right">Commission</th><th className="right">Business costs</th><th className="right">Meta ads</th><th className="right">Net profit</th></tr></thead>
            <tbody>
              {trend.slice().reverse().map((row) => (
                <tr key={row.month}>
                  <td><Link className="link" href={link({ month: row.month })}>{monthLabel(row.month)}</Link> <small className="muted">{periodRange(row.month)}</small></td>
                  <td className="right num">{row.orders}</td>
                  <td className="right"><Money value={row.revenue} /></td>
                  <td className="right"><Money value={row.commission} /></td>
                  <td className="right"><Money value={row.business_expenses} /></td>
                  <td className="right"><Money value={row.ad_spend} /></td>
                  <td className="right"><Money value={row.commission - row.business_expenses} tone="auto" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 22 }}>
        <div className="card-head">
          <h2>Orders across Sri Lanka</h2>
          <nav className="row">
            {ranges.map((item) => <Link key={item.value} className={`btn small ${item.value === range ? "" : "ghost"}`} href={link({ range: item.value })}>{item.label}</Link>)}
          </nav>
        </div>
        <p className="muted" style={{ marginBottom: 10 }}>{completedTotal} completed deliveries in {cities.filter((city) => city.completed > 0).length} towns. Circle size = number of orders.</p>
        <SriLankaMap markers={cityMarkers(cities)} className="map tall" />
        <div className="map-legend">
          <span><i style={{ background: "#d83a64" }} />Orders delivered to a town</span>
          <span><i style={{ background: "#382032" }} />Partners only, no orders yet</span>
        </div>
        {unmapped.length > 0 && <p className="notice warn" style={{ marginTop: 10 }}>Not on the map (unknown town names): {unmapped.map((city) => city.city).join(", ")}. Edit those orders to pick a town from the list.</p>}
      </section>

      <div className="grid two">
        <section className="card">
          <h2 style={{ marginBottom: 12 }}>Towns</h2>
          <div className="table-wrap table-plain">
            <table>
              <thead><tr><th>Town</th><th className="right">Orders</th><th className="right">Completed</th><th className="right">Sales</th><th className="right">Partners</th></tr></thead>
              <tbody>
                {cities.map((city) => (
                  <tr key={city.city}>
                    <td><Link className="link" href={`/orders?view=all&city=${encodeURIComponent(city.city)}`}>{city.city}</Link><small>{findCity(city.city)?.district ?? "Unknown town"}</small></td>
                    <td className="right num">{city.orders}</td>
                    <td className="right num">{city.completed}</td>
                    <td className="right"><Money value={city.revenue} /></td>
                    <td className="right num">{city.partners || <span style={{ color: city.orders ? "var(--ribbon-dark)" : undefined }}>0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cities.some((city) => city.orders > 0 && city.partners === 0) && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Red 0 = you get orders there but have no partner based in that town.</p>}
        </section>
        <section className="card">
          <h2 style={{ marginBottom: 12 }}>Busiest partners</h2>
          {leaders.length === 0 ? <p className="muted">No partner jobs yet.</p> : (
            <div className="table-wrap table-plain">
              <table>
                <thead><tr><th>Partner</th><th className="right">Jobs</th><th className="right">Delivered</th><th className="right">Paid work</th></tr></thead>
                <tbody>
                  {leaders.map((partner) => (
                    <tr key={partner.id}>
                      <td><Link className="link" href={`/partners/${partner.id}`}>{partner.name}</Link><small>{partner.city}</small></td>
                      <td className="right num">{partner.jobs}</td>
                      <td className="right num">{partner.delivered}{partner.cancelled ? <small>{partner.cancelled} cancelled</small> : null}</td>
                      <td className="right"><Money value={partner.agreed} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function cityMarkers(cities: CityStat[]): MapMarker[] {
  return cities.flatMap((stat) => {
    const city = findCity(stat.city);
    if (!city) return [];
    return [{
      lat: city.lat, lng: city.lng,
      weight: Math.max(stat.orders, 0.3),
      color: stat.orders > 0 ? "#d83a64" : "#382032",
      title: city.name,
      lines: [`${stat.orders} orders · ${stat.completed} completed`, `Sales ${formatMoney(stat.revenue)}`, `${stat.partners} partner(s) based here`],
      href: `/orders?view=all&city=${encodeURIComponent(city.name)}`,
    }];
  });
}
