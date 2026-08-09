"use client";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, OrderCard } from "@/components/ui";
import { useOrders } from "@/lib/use-orders";
import { AlertCircle, Filter, LoaderCircle, MessageCircle, Plus, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";

export default function CelebrationsPage(){
  const [search,setSearch]=useState(""); const [mode,setMode]=useState("All"); const [attention,setAttention]=useState(false);
  const {orders,source,error,refetch}=useOrders();
  const shown=useMemo(()=>orders.filter(o=>(`${o.recipient} ${o.sender} ${o.district} ${o.occasion}`.toLowerCase().includes(search.toLowerCase()))&&(mode==="All"||o.mode===mode)&&(!attention||o.attention==="urgent")),[orders,search,mode,attention]);
  return <AppShell><div className="page celebrations-page">
    <header className="page-header"><div><span className="eyebrow">Celebration room · {source === "supabase" ? "Live data" : source === "loading" ? "Syncing" : source === "error" ? "Connection needs attention" : "Preview"}</span><h1>Every journey, in view.</h1><p>Search, filter and open any celebration—from first hello to final memory.</p></div><div className="compact-actions"><Link className="secondary-button" href="/chats"><MessageCircle size={18}/>From chat</Link><Link className="primary-button" href="/celebrations/new"><Plus size={18}/>New celebration</Link></div></header>
    {error&&<div className="operational-notice error" role="alert"><AlertCircle size={18}/><span>{error}</span><button onClick={refetch}><RefreshCw size={14}/>Try again</button></div>}
    <section className="filter-bar"><label className="search-field"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, district or occasion…"/></label><label><Filter size={16}/><select value={mode} onChange={e=>setMode(e.target.value)}><option>All</option><option>Self</option><option>Partner</option><option>Hybrid</option></select></label><button className={attention?"active":""} onClick={()=>setAttention(!attention)}>Needs attention</button><span>{shown.length} journeys</span></section>
    <div className="celebration-board-labels"><span>On the worktable</span><i/></div>
    <section className="order-grid">{source==="loading"?<div className="directory-loading"><LoaderCircle className="spin"/>Loading live celebrations…</div>:shown.length?shown.map(o=><OrderCard key={o.id} order={o}/>):<EmptyState/>}</section>
  </div></AppShell>
}
