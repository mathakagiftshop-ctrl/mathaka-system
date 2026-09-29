import { requireUser, can, type Permission } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { NavLinks, MobileShell } from "@/components/nav";
import Link from "next/link";
import { LogOut } from "lucide-react";

/** Authenticated page frame. Server component: checks the session first. */
export async function AppShell({ children, permission }: { children: React.ReactNode; permission?: Permission }) {
  const user = await requireUser(permission);
  const initials = user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <MobileShell>
      <aside className="sidebar" id="navigation">
        <div className="brand">
          <span className="brand-mark"><span /></span>
          <div><strong>Mathaka</strong><small>Celebration studio</small></div>
        </div>
        <NavLinks finance={can(user, "finance")} settings={can(user, "settings")} />
        <div className="sidebar-foot">
          <span className="avatar">{initials}</span>
          <Link href="/account" style={{ flex: 1, minWidth: 0 }}><p>{user.name}<small>{user.role} · account</small></p></Link>
          <form action={signOut}>
            <button type="submit" aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
          </form>
        </div>
      </aside>
      <main className="main">
        <div className="page">
          {user.mustChangePassword && <p className="notice warn" style={{ marginBottom: 16 }}>You&apos;re using a temporary password. <Link className="link" href="/account">Choose your own</Link>.</p>}
          {children}
        </div>
      </main>
    </MobileShell>
  );
}
