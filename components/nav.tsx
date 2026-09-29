"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, CalendarHeart, FileText, Home, Menu, Receipt, Settings, Store, Users, X } from "lucide-react";

const links = [
  { href: "/", label: "Today", icon: Home },
  { href: "/orders", label: "Orders", icon: CalendarHeart },
  { href: "/partners", label: "Partners", icon: Store },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/invoices", label: "Invoices", icon: FileText, finance: true },
  { href: "/expenses", label: "Expenses", icon: Receipt, finance: true },
  { href: "/reports", label: "Reports & map", icon: BarChart3, finance: true },
  { href: "/settings", label: "Settings", icon: Settings, settings: true },
];

export function NavLinks({ finance, settings }: { finance: boolean; settings: boolean }) {
  const pathname = usePathname();
  const visible = links.filter((link) => (!link.finance || finance) && (!link.settings || settings));
  return (
    <nav className="nav" aria-label="Main">
      {visible.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
            <Icon size={18} />{label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Handles the slide-in menu on phones. */
export function MobileShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className={`shell${open ? " open" : ""}`} onClickCapture={(event) => {
      if (open && (event.target as HTMLElement).closest("a")) setOpen(false);
    }}>
      <div className="topbar">
        <button type="button" aria-label="Open menu" aria-expanded={open} aria-controls="navigation" onClick={() => setOpen(true)}><Menu size={22} /></button>
        <strong>Mathaka</strong>
        {open && <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} style={{ marginLeft: "auto" }}><X size={22} /></button>}
      </div>
      <div className="scrim" onClick={() => setOpen(false)} key={pathname} />
      {children}
    </div>
  );
}
