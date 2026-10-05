import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Money, PageHeader } from "@/components/bits";
import { can, requireUser } from "@/lib/auth";
import { statusInfo, type OrderStatus } from "@/lib/constants";
import { calendarOrders, undatedOrders, type CalendarOrder } from "@/lib/data/orders";
import { addDays, currentMonth, formatDate, monthLabel, today } from "@/lib/format";

export const metadata: Metadata = { title: "Order calendar" };

const UPCOMING: OrderStatus[] = ["confirmed", "in_progress", "out_for_delivery"];
const DONE: OrderStatus[] = ["delivered", "completed"];

const shows = [
  { value: "all", label: "All", statuses: null },
  { value: "upcoming", label: "Upcoming", statuses: UPCOMING },
  { value: "done", label: "Delivered", statuses: DONE },
  { value: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
] as const;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** 'YYYY-MM' shifted by whole months. */
function shiftMonth(month: string, by: number) {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}

/** Monday-to-Sunday weeks covering the whole month, as 'YYYY-MM-DD' dates. */
function monthGrid(month: string) {
  const first = `${month}-01`;
  const mondayOffset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(first, -mondayOffset);
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const days: string[] = [];
  for (let day = start; day <= last || days.length % 7 !== 0; day = addDays(day, 1)) days.push(day);
  return days;
}

export default async function OrderCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; show?: string }> }) {
  const params = await searchParams;
  const user = await requireUser();
  const finance = can(user, "finance");
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : currentMonth();
  const show = shows.find((item) => item.value === params.show) ?? shows[0];
  const days = monthGrid(month);
  const [orders, undated] = await Promise.all([calendarOrders(days[0], days[days.length - 1]), undatedOrders()]);

  const visible = show.statuses ? orders.filter((order) => (show.statuses as readonly string[]).includes(order.status)) : orders;
  const byDay = Map.groupBy(visible, (order) => order.delivery_date);
  const inMonth = orders.filter((order) => order.delivery_date.startsWith(month));
  const count = (statuses: readonly string[]) => inMonth.filter((order) => statuses.includes(order.status)).length;
  const todayDate = today();
  const link = (next: { month?: string; show?: string }) => {
    const search = new URLSearchParams({ month: next.month ?? month, ...((next.show ?? show.value) !== "all" ? { show: next.show ?? show.value } : {}) });
    return `/orders/calendar?${search}`;
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Orders"
        title="Delivery calendar"
        description="Every order on the day it's delivered. Cancelled orders stay on their day, crossed out."
        actions={<>
          <Link className="btn" href="/orders">List view</Link>
          <Link className="btn primary" href="/orders/new"><Plus size={16} />New order</Link>
        </>}
      />

      <div className="cal-toolbar">
        <div className="row">
          <Link className="btn small ghost" href={link({ month: shiftMonth(month, -1) })} aria-label="Previous month"><ChevronLeft size={16} /></Link>
          <h2>{monthLabel(month)}</h2>
          <Link className="btn small ghost" href={link({ month: shiftMonth(month, 1) })} aria-label="Next month"><ChevronRight size={16} /></Link>
          {month !== currentMonth() && <Link className="btn small" href={link({ month: currentMonth() })}>Today</Link>}
        </div>
        <nav className="tabs" aria-label="Which orders">
          {shows.map((item) => (
            <Link key={item.value} href={link({ show: item.value })} className={item.value === show.value ? "active" : undefined}>
              {item.label}
              <span>{item.statuses ? count(item.statuses) : inMonth.length}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="cal">
        {WEEKDAYS.map((day) => <div key={day} className="cal-weekday">{day}</div>)}
        {days.map((day) => {
          const dayOrders = byDay.get(day) ?? [];
          const classes = ["cal-day", day.startsWith(month) ? "" : "outside", day === todayDate ? "today" : "", day < todayDate ? "past" : "", dayOrders.length ? "" : "no-orders"];
          return (
            <div key={day} className={classes.filter(Boolean).join(" ")}>
              <div className="cal-date">
                <span className="cal-num">{Number(day.slice(8))}</span>
                <span className="cal-long">{formatDate(day, { weekday: "long", year: undefined })}</span>
              </div>
              {dayOrders.map((order) => <CalendarChip key={order.id} order={order} finance={finance} />)}
            </div>
          );
        })}
      </div>
      {visible.filter((order) => order.delivery_date.startsWith(month)).length === 0 && (
        <p className="muted" style={{ marginTop: 12 }}>No {show.value === "all" ? "" : `${show.label.toLowerCase()} `}orders delivering in {monthLabel(month)}.</p>
      )}

      <div className="cal-legend">
        <span><i className="blue" />Upcoming</span>
        <span><i className="gold" />Being prepared / on the way</span>
        <span><i className="sage" />Delivered</span>
        <span><i className="ribbon" />Cancelled</span>
        <span><b className="repeat-tag">R</b>Repeat customer</span>
      </div>

      {undated.length > 0 && (
        <p className="notice warn" style={{ marginTop: 14 }}>
          No delivery date yet, so not on the calendar:{" "}
          {undated.map((order, index) => (
            <span key={order.id}>{index > 0 && ", "}<Link className="link" href={`/orders/${order.id}/edit`}>{order.number}</Link> ({order.recipient_name})</span>
          ))}
        </p>
      )}
    </AppShell>
  );
}

function CalendarChip({ order, finance }: { order: CalendarOrder; finance: boolean }) {
  const info = statusInfo(order.status);
  return (
    <Link href={`/orders/${order.id}`} className={`cal-chip ${info.tone}${order.status === "cancelled" ? " cancelled" : ""}`}
      title={`${order.number} · ${info.label}${order.returning ? " · repeat customer" : ""}`}>
      <strong>
        {order.delivery_time && <span className="cal-time">{order.delivery_time}</span>}
        {order.recipient_name}
        {order.returning && <b className="repeat-tag" aria-label="Repeat customer">R</b>}
      </strong>
      <small>{order.number} · {order.city}{finance ? <> · <Money value={order.total} /></> : null}</small>
    </Link>
  );
}
