"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, HandCoins, LogOut, Menu, MessageCircle, PartyPopper, PlugZap, Store, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/", label: "Today", icon: PartyPopper },
  { href: "/celebrations", label: "Celebrations", icon: CalendarDays },
  { href: "/chats", label: "Chats", icon: MessageCircle },
  { href: "/partners", label: "Partners", icon: Store },
  { href: "/money", label: "Money", icon: HandCoins },
  { href: "/settings/connections", label: "Connections", icon: PlugZap },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const signOut = async () => {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };
  useEffect(() => {
    const query = window.matchMedia("(max-width: 820px)");
    const sync = () => setMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (!mobile || !open) return;
    closeButtonRef.current?.focus();
    const drawer = drawerRef.current;
    const menuButton = menuButtonRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      menuButton?.focus();
    };
  }, [mobile, open]);
  const drawerHidden = mobile && !open;
  return (
    <div className="app-shell">
      <button ref={menuButtonRef} className="mobile-menu" aria-label="Open navigation" aria-expanded={open} aria-controls="studio-navigation" onClick={() => setOpen(true)}><Menu size={22} /></button>
      <aside ref={drawerRef} id="studio-navigation" className={`sidebar ${open ? "sidebar-open" : ""}`} aria-label="Studio navigation" aria-hidden={drawerHidden} aria-modal={mobile && open ? "true" : undefined} role={mobile && open ? "dialog" : undefined} inert={drawerHidden}>
        <button ref={closeButtonRef} className="sidebar-close" aria-label="Close navigation" onClick={() => setOpen(false)}><X size={20} /></button>
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark"><span /></span>
          <span><strong>Mathaka</strong><small>Celebration studio</small></span>
        </Link>
        <p className="nav-eyebrow">Your worktable</p>
        <nav aria-label="Main navigation">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return <Link key={href} href={href} className={active ? "active" : ""} onClick={() => setOpen(false)}><Icon size={19} strokeWidth={1.8} /><span>{label}</span>{active && <i />}</Link>;
          })}
        </nav>
        <div className="sidebar-note">
          <span className="stamp">07<br/><small>AUG</small></span>
          <p><strong>4 celebrations</strong><br/>need a little love this week.</p>
        </div>
        <div className="profile"><span>SP</span><p><strong>Sachin</strong><small>Owner · protected</small></p><button type="button" onClick={() => void signOut()} aria-label="Sign out"><LogOut size={15}/><b>Sign out</b></button></div>
      </aside>
      {open && <button className="scrim" onClick={() => setOpen(false)} aria-hidden="true" tabIndex={-1} />}
      <main className="main-content">{children}</main>
    </div>
  );
}
