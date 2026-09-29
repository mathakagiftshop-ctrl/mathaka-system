import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/bits";
import { ActionForm, Field, Submit } from "@/components/form";
import { changePassword } from "@/app/settings/actions";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <AppShell>
      <PageHeader eyebrow="My account" title={user.name} description={`${user.email} · ${user.role}`} />
      {user.mustChangePassword && <p className="notice warn" style={{ marginBottom: 16 }}>You&apos;re using a temporary password. Please choose your own.</p>}
      <section className="card" style={{ maxWidth: 520 }}>
        <h2>Change password</h2>
        <ActionForm action={changePassword}>
          <Field label="Current password" name="current" type="password" required autoComplete="current-password" />
          <Field label="New password" name="next" type="password" required minLength={10} autoComplete="new-password" hint="At least 10 characters." />
          <Submit>Change password</Submit>
        </ActionForm>
      </section>
    </AppShell>
  );
}
