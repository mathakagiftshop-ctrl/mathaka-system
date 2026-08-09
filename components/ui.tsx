"use client";

import Link from "next/link";
import { ArrowUpRight, Check, CircleAlert, Clock3, MapPin } from "lucide-react";
import type { CelebrationOrder } from "@/lib/types";
import { formatLkr } from "@/lib/demo-data";

export function StatusDot({ tone, children }: { tone: "raspberry" | "gold" | "sage" | "blue"; children: React.ReactNode }) {
  return <span className={`status-dot ${tone}`}><i />{children}</span>;
}

export function OrderCard({ order }: { order: CelebrationOrder }) {
  const statusTone = order.attention === "urgent" ? "raspberry" : order.attention === "watch" ? "gold" : "sage";
  return (
    <article className="order-card">
      <div className="order-card-top">
        <StatusDot tone={statusTone}>{order.status}</StatusDot>
        <span className="countdown"><Clock3 size={14} />{order.countdown}</span>
      </div>
      <Link href={`/celebrations/${order.id}`} className="order-title"><small>{order.occasion}</small><strong>{order.recipient}</strong></Link>
      <p className="order-meta"><MapPin size={15}/>{order.district}<span>•</span>{order.dateLabel.split("·")[0]}</p>
      <div className="stitched-rule" />
      <div className="order-progress"><span><b>{order.progress}%</b> journey complete</span><div><i style={{ width: `${order.progress}%` }} /></div></div>
      <div className="order-foot"><div><small>Next touch</small><strong>{order.nextAction}</strong></div><Link href={`/celebrations/${order.id}`} aria-label={`Open ${order.recipient}'s order`}><ArrowUpRight size={20}/></Link></div>
      <div className="order-tags"><span>{order.mode}</span><span>{formatLkr(order.paid)}</span></div>
    </article>
  );
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return <div className="toast" role="status"><Check size={18}/><span>{message}</span><button onClick={onClose} aria-label="Dismiss">×</button></div>;
}

export function EmptyState() {
  return <div className="empty-state"><CircleAlert size={28}/><h3>No celebrations match</h3><p>Try clearing a filter or searching for another name or district.</p></div>;
}
