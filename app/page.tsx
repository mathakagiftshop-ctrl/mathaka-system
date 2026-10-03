import Link from "next/link";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Empty, Money, Stat, StatusBadge } from "@/components/bits";
import { can, requireUser } from "@/lib/auth";
import { dashboardSummary, listOrders } from "@/lib/data/orders";
import { unratedJobs } from "@/lib/data/partners";
import { lowStock } from "@/lib/data/stock";
import { addDays, currentMonth, formatDate, monthLabel, relativeDay, today } from "@/lib/format";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  const user = await requireUser();
  const finance = can(user, "finance");
  const month = currentMonth();
  const [{ counts, money }, active, low, toRate] = await Promise.all([dashboardSummary(month), listOrders({ view: "active" }), finance ? lowStock() : [], unratedJobs(5)]);
  const date = today();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Colombo" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const upcoming = active.filter((order) => order.status !== "delivered" && order.delivery_date && order.delivery_date <= addDays(date, 7));
  const unpaid = active.filter((order) => order.balance > 0 && order.delivery_date && order.delivery_date <= addDays(date, 7));
  const needsClosing = active.filter((order) => order.status === "delivered");
  const noPartner = active.filter((order) => !order.partners?.length && order.status !== "delivered");

  return (
    <AppShell>
      {denied && <p className="notice warn" style={{ marginBottom: 16 }}>You don&apos;t have access to that page.</p>}
      <header className="page-header">
        <div>
          <span className="eyebrow">{formatDate(date, { weekday: "long", year: undefined })}</span>
          <h1>{greeting}, {user.name.split(" ")[0]}.</h1>
          <p>{counts.today ? `${counts.today} deliver${counts.today === 1 ? "y" : "ies"} today` : "No deliveries today"} · {counts.next7} in the next 7 days · {counts.enquiries} open enquir{counts.enquiries === 1 ? "y" : "ies"}</p>
        </div>
        <Link className="btn primary" href="/orders/new"><Plus size={16} />New order</Link>
      </header>

      {low.length > 0 && (
        <p className="notice warn" style={{ marginBottom: 16 }}>
          Stock running low: {low.map((item) => `${item.name} (${item.on_hand} ${item.unit} left)`).join(" · ")} · <Link className="link" href="/stock">Stock →</Link>
        </p>
      )}

      <div className="stats">
        <Stat label="Active orders" value={counts.active} tone="dark" note={counts.undated ? `${counts.undated} without a date` : undefined} />
        {finance && <Stat label="Customers owe" value={<Money value={money.customer_owes} />} note={money.pending_verification ? `+ ${money.pending_verification.toLocaleString("en-LK")} to verify` : undefined} />}
        {finance && <Stat label="We owe partners" value={<Money value={money.partners_owed} />} note={money.partner_advances ? `${money.partner_advances.toLocaleString("en-LK")} advanced` : undefined} />}
        {finance && <Stat label={`${monthLabel(month)} commission`} value={<Money value={money.month_profit} />} note={`${money.month_orders} delivered · before ads`} tone="good" />}
      </div>

      <div className="grid two">
        <section className="card">
          <div className="card-head"><h2>Next 7 days</h2><Link className="link" href="/orders">All orders →</Link></div>
          {upcoming.length === 0 ? <Empty title="Nothing scheduled this week" /> : (
            <div className="list">
              {upcoming.map((order) => (
                <Link key={order.id} href={`/orders/${order.id}`}>
                  <div>
                    <strong>{order.recipient_name} <small style={{ display: "inline" }}>· {order.occasion}</small></strong>
                    <small>{relativeDay(order.delivery_date)} · {formatDate(order.delivery_date, { weekday: "short", year: undefined })} {order.delivery_time} · {order.city}{order.partners?.length ? ` · ${order.partners.join(", ")}` : ""}</small>
                  </div>
                  <StatusBadge status={order.status} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2>Needs your attention</h2>
          <div className="list">
            {noPartner.slice(0, 5).map((order) => (
              <Link key={`p-${order.id}`} href={`/orders/${order.id}`}>
                <div><strong>Find a partner</strong><small>{order.number} · {order.recipient_name} · {order.city} · {relativeDay(order.delivery_date)}</small></div>
                <span className="badge gold">Partner</span>
              </Link>
            ))}
            {finance && unpaid.slice(0, 5).map((order) => (
              <Link key={`u-${order.id}`} href={`/orders/${order.id}`}>
                <div><strong>Collect <Money value={order.balance} /></strong><small>{order.customer_name} · for {order.recipient_name} · {relativeDay(order.delivery_date)}</small></div>
                <span className="badge ribbon">Balance</span>
              </Link>
            ))}
            {needsClosing.slice(0, 5).map((order) => (
              <Link key={`c-${order.id}`} href={`/orders/${order.id}`}>
                <div><strong>Send photos & complete</strong><small>{order.number} · {order.recipient_name} was delivered</small></div>
                <span className="badge sage">Delivered</span>
              </Link>
            ))}
            {toRate.map((job) => (
              <Link key={`r-${job.job_id}`} href={`/orders/${job.order_id}`}>
                <div><strong>Rate {job.partner_name}</strong><small>{job.order_number} · {job.recipient_name}</small></div>
                <span className="badge gold">★ Rate</span>
              </Link>
            ))}
            {!noPartner.length && !(finance && unpaid.length) && !needsClosing.length && !toRate.length && <p className="muted">All clear. 🎉</p>}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

