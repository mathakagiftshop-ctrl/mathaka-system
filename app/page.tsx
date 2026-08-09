"use client";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { OrderCard } from "@/components/ui";
import { useOrders } from "@/lib/use-orders";
import { ArrowRight, CircleDollarSign, Film, Plus, ReceiptText, Sparkles, Store } from "lucide-react";

export default function TodayPage() {
  const { orders, source } = useOrders();
  const now = new Date(); const inTwoDays = now.getTime() + 2 * 86_400_000;
  const deliveries = orders.filter((order) => order.date && new Date(order.date).getTime() >= now.setHours(0,0,0,0) && new Date(order.date).getTime() <= inTwoDays).length;
  const openTasks = orders.flatMap((order) => order.tasks).filter((task) => !task.complete).length;
  const onSchedule = orders.length ? Math.round(orders.filter((order) => order.attention !== "urgent").length / orders.length * 100) : 100;
  const profit = orders.reduce((sum, order) => sum + order.estimatedProfit, 0);
  const attention = orders.filter((order) => order.attention !== "clear").slice(0, 5).map((order) => ({ icon: order.videos < order.requiredVideos ? Film : order.currencyNote.includes("remaining") ? ReceiptText : Store, label: order.nextAction, note: `${order.recipient} · ${order.countdown}`, tone: order.attention === "urgent" ? "raspberry" : "gold", href: `/celebrations/${order.id}` }));
  const today = new Intl.DateTimeFormat("en-LK", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return <AppShell><div className="page today-page">
    <header className="page-header">
      <div><span className="eyebrow">{today} · {source === "supabase" ? "Live studio" : source === "loading" ? "Syncing celebrations" : "Connection needs attention"}</span><h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, Sachin.</h1><p>{attention.length ? `${attention.length} celebrations need your touch.` : "Every celebration is moving beautifully."}</p></div>
      <Link className="primary-button" href="/celebrations/new"><Plus size={18}/>New celebration</Link>
    </header>
    <section className="today-ribbon" aria-label="Today summary">
      <div className="ribbon-lead"><Sparkles size={21}/><span><strong>Today at a glance</strong><small>Your studio is in good shape.</small></span></div>
      <div><strong>{deliveries}</strong><span>deliveries<br/><small>next 48 hours</small></span></div>
      <div><strong>{openTasks}</strong><span>open tasks<br/><small>across live journeys</small></span></div>
      <div><strong>{onSchedule}%</strong><span>on schedule<br/><small>across all celebrations</small></span></div>
      <div><CircleDollarSign size={22}/><span>LKR {profit.toLocaleString("en-LK")}<br/><small>estimated profit</small></span></div>
    </section>
    <div className="studio-columns">
      <section>
        <div className="section-title"><h2>Needs your touch</h2><span className="attention-count">3 little nudges</span></div>
        <div className="attention-list">{attention.length ? attention.map(({ icon:Icon, label, note, tone, href }, index)=><Link href={href} key={href} className="attention-row"><span className={`attention-icon ${tone}`}><Icon size={19}/></span><span className="attention-number">{String(index+1).padStart(2,"0")}</span><p><strong>{label}</strong><small>{note}</small></p><ArrowRight size={18}/></Link>) : <p className="panel-empty">Nothing needs immediate attention.</p>}</div>
      </section>
      <aside className="daily-note"><div className="pin"/><span className="eyebrow">Studio note</span><blockquote>“A celebration feels effortless to the customer because we remember every tiny thing.”</blockquote><p>— Mathaka way of working</p><div className="tape"/></aside>
    </div>
    <div className="section-title"><h2>Upcoming celebrations</h2><Link href="/celebrations">See all celebrations →</Link></div>
    <section className="order-grid">{orders.slice(0,3).map(order=><OrderCard key={order.id} order={order}/>)}</section>
  </div></AppShell>;
}
