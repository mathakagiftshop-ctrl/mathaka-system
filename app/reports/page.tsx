import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Money, PageHeader, Stat } from "@/components/bits";
import { ActionButton } from "@/components/form";
import { SriLankaMap, type MapMarker } from "@/components/sri-lanka-map";
import { closeMonth, reopenMonth } from "@/app/reports/actions";
import { can, requireUser } from "@/lib/auth";
import { findCity } from "@/lib/cities";
import { expenseLabel } from "@/lib/constants";
import { cityStats, monthReport, monthlyTrend, partnerLeaderboard, type CityStat } from "@/lib/data/reports";
import { addDays, currentMonth, formatDate, formatMoney, monthLabel, today } from "@/lib/format";

export const metadata: Metadata = { title: "Reports & map" };

const ranges = [
  { value: "all", label: "All time" },
  { value: "year", label: "Last 12 months" },
  { value: "90", label: "Last 90 days" },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string; range?: string }> }) {
  const params = await searchParams;
  const user = await requireUser("finance");
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : currentMonth();
  const range = ranges.find((item) => item.value === params.range)?.value ?? "all";
  const since = range === "90" ? addDays(today(), -90) : range === "year" ? addDays(today(), -365) : null;
  const [report, trend, cities, leaders] = await Promise.all([monthReport(month), monthlyTrend(12), cityStats(since), partnerLeaderboard(since)]);
  const isPast = month < currentMonth();
  const completedTotal = cities.reduce((sum, city) => sum + city.completed, 0);
  const unmapped = cities.filter((city) => city.orders > 0 && !findCity(city.city));
  const link = (next: { month?: string; range?: string }) => `/reports?month=${next.month ?? month}&range=${next.range ?? range}`;

  return (
    <AppShell permission="finance">
      <PageHeader eyebrow="Reports" title="How the business is doing" description="Profit counts orders once they're delivered, in the month of their delivery date. Business costs count in the month they're spent." />

      <form className="filters" action="/reports">
        <label className="field"><span>Month</span><input type="month" name="month" defaultValue={month} /></label>
        <input type="hidden" name="range" value={range} />
        <button className="btn" type="submit">Show</button>
      </form>

      <div className="grid two" style={{ marginBottom: 22 }}>
        <section className="card">
          <div className="card-head">
            <h2>{monthLabel(month)} profit</h2>
            {report.closedAt ? <span className="badge sage">Closed {formatDate(report.closedAt)}</span> : <span className="badge gold">Open — can still change</span>}
          </div>
          <div className="money-lines">
            <div><span>Sales ({report.delivered} delivered{report.cancelled ? `, ${report.cancelled} cancelled` : ""})</span><Money value={report.figures.revenue} /></div>
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
          <div className="row" style={{ marginTop: 14 }}>
            {!report.closedAt && isPast && <ActionButton action={closeMonth} fields={{ month }} className="btn primary small" confirm={`Close ${monthLabel(month)}? Its numbers and split will be fixed.`}>Close month & fix split</ActionButton>}
            {!report.closedAt && !isPast && <small>Close the month after it ends to lock the split.</small>}
            {report.closedAt && can(user, "settings") && <ActionButton action={reopenMonth} fields={{ month }} className="btn small ghost" confirm="Reopen this month? Numbers will be recalculated.">Reopen month</ActionButton>}
          </div>
        </section>

        <div className="stack">
          <div className="stats" style={{ marginBottom: 0 }}>
            <Stat label="Orders" value={report.orders} note={`${report.delivered} delivered · ${report.open.orders} to deliver · ${report.cancelled} cancelled`} />
            <Stat label="Meta ad spend" value={<Money value={report.adSpend} />} />
            <Stat label="Ad cost per order" value={report.costPerOrder === null ? "—" : <Money value={report.costPerOrder} />} note="Ad spend ÷ orders" />
            <Stat label="Stock on hand" value={<Money value={report.stockOnHand} />} note={<Link className="link" href="/stock">Bought, not used yet →</Link>} />
            <Stat label="Avg commission" value={report.delivered ? <Money value={Math.round(report.commission / report.delivered)} /> : "—"} note="per delivered order" />
          </div>
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
        </div>
      </div>

      <section className="card" style={{ marginBottom: 22 }}>
        <h2 style={{ marginBottom: 12 }}>Last 12 months</h2>
        <div className="table-wrap table-plain">
          <table>
            <thead><tr><th>Month</th><th className="right">Orders</th><th className="right">Sales</th><th className="right">Commission</th><th className="right">Business costs</th><th className="right">Meta ads</th><th className="right">Net profit</th></tr></thead>
            <tbody>
              {trend.slice().reverse().map((row) => (
                <tr key={row.month}>
                  <td><Link className="link" href={link({ month: row.month })}>{monthLabel(row.month)}</Link></td>
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
