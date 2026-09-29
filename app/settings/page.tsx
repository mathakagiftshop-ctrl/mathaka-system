import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { Badge, PageHeader } from "@/components/bits";
import { ActionButton, ActionForm, Field, Select, Submit, TextArea } from "@/components/form";
import {
  addUser, deleteTerm, removeLogo, saveBusiness, saveInvoiceSettings, saveSplit, saveTerm, updateUser, uploadLogo,
} from "@/app/settings/actions";
import { requireUser } from "@/lib/auth";
import { getSettings, listTerms, listUsers } from "@/lib/data/settings";
import { formatDateTime } from "@/lib/format";
import { isStorageConfigured, viewUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Settings" };

const roles = [
  { value: "owner", label: "Owner — everything" },
  { value: "manager", label: "Manager — orders, partners & money" },
  { value: "staff", label: "Staff — orders & partners, no money" },
];

export default async function SettingsPage() {
  const user = await requireUser("settings");
  const [settings, terms, users] = await Promise.all([getSettings(), listTerms(), listUsers()]);
  const storage = isStorageConfigured();
  const logoUrl = settings.logo_key ? await viewUrl(settings.logo_key) : null;
  const pad = (n: number) => String(n).padStart(settings.number_padding, "0");

  return (
    <AppShell permission="settings">
      <PageHeader eyebrow="Settings" title="Studio settings" description="Changes apply to new documents. Issued invoices keep the details they were issued with." />
      <nav className="tabs">
        <a href="#business">Business</a><a href="#invoices">Invoices</a><a href="#terms">Terms</a><a href="#split">Profit split</a><a href="#team">Team</a>
      </nav>

      <div className="stack">
        <section className="card" id="business">
          <h2>Business details</h2>
          <div className="grid sidebar-right">
            <ActionForm action={saveBusiness} resetOnSuccess={false}>
              <div className="form-grid">
                <Field label="Business name" name="business_name" required defaultValue={settings.business_name} />
                <Field label="Tagline" name="tagline" defaultValue={settings.tagline} />
                <Field label="Phone / WhatsApp" name="phone" defaultValue={settings.phone} />
                <Field label="Email" name="email" type="email" defaultValue={settings.email} />
                <Field label="Website / Facebook page" name="website" defaultValue={settings.website} />
                <Field label="Currency" name="currency" defaultValue={settings.currency} maxLength={3} />
                <TextArea label="Address" name="address" className="full" rows={2} defaultValue={settings.address} />
              </div>
              <Submit>Save details</Submit>
            </ActionForm>
            <div className="stack">
              <h3>Logo</h3>
              {logoUrl ? <img src={logoUrl} alt="Current logo" style={{ maxHeight: 90, maxWidth: 220, objectFit: "contain", background: "#fff", padding: 8, borderRadius: 6, border: "1px solid var(--line)" }} /> : <p className="muted">No logo yet.</p>}
              {storage ? (
                <ActionForm action={uploadLogo}>
                  <label className="field"><span>Upload logo</span><input type="file" name="logo" accept="image/png,image/jpeg,image/webp" required /><small>PNG with a transparent background looks best. Max 4 MB.</small></label>
                  <Submit>Upload</Submit>
                </ActionForm>
              ) : <p className="notice warn">File storage isn&apos;t configured, so logos can&apos;t be uploaded yet.</p>}
              {settings.logo_key && <ActionButton action={removeLogo} className="btn small ghost" confirm="Remove the logo from new documents?">Remove logo</ActionButton>}
            </div>
          </div>
        </section>

        <section className="card" id="invoices">
          <h2>Invoices & payments</h2>
          <ActionForm action={saveInvoiceSettings} resetOnSuccess={false}>
            <div className="form-grid three">
              <Field label="Invoice prefix" name="invoice_prefix" required defaultValue={settings.invoice_prefix} hint={`Next: ${settings.invoice_prefix}-${pad(settings.next_invoice_number)}`} />
              <Field label="Receipt prefix" name="receipt_prefix" required defaultValue={settings.receipt_prefix} hint={`Next: ${settings.receipt_prefix}-${pad(settings.next_receipt_number)}`} />
              <Field label="Quote prefix" name="quote_prefix" required defaultValue={settings.quote_prefix} hint={`Next: ${settings.quote_prefix}-${pad(settings.next_quote_number)}`} />
              <Field label="Number digits" name="number_padding" type="number" min="3" max="8" defaultValue={settings.number_padding} />
              <Field label="Days to pay" name="default_due_days" type="number" min="0" max="90" defaultValue={settings.default_due_days} />
              <Field label="Default advance %" name="default_advance_percent" type="number" min="0" max="100" step="0.5" defaultValue={settings.default_advance_percent} />
            </div>
            <div className="form-grid">
              <TextArea label="Bank details (shown on invoices)" name="bank_details" rows={4} defaultValue={settings.bank_details} placeholder={"Bank: Commercial Bank\nAccount name: …\nAccount no: …\nBranch: …"} />
              <TextArea label="Payment instructions" name="payment_instructions" rows={4} defaultValue={settings.payment_instructions} placeholder="Please send the payment slip on WhatsApp after transferring." />
              <Field label="Footer message" name="invoice_footer" className="full" defaultValue={settings.invoice_footer} />
            </div>
            <Submit>Save invoice settings</Submit>
          </ActionForm>
        </section>

        <section className="card" id="terms">
          <h2>Terms & conditions</h2>
          <p className="muted" style={{ marginBottom: 12 }}>Terms marked “default” are ticked on new invoices. You can tick or untick them on each draft before issuing.</p>
          <div className="stack">
            {terms.map((term) => (
              <details key={term.id} className="panel">
                <summary style={{ color: "var(--ink)" }}>{term.title} {term.is_default && <Badge tone="sage">Default</Badge>} {!term.active && <Badge>Hidden</Badge>}</summary>
                <div className="panel-body">
                  <ActionForm action={saveTerm} resetOnSuccess={false}>
                    <input type="hidden" name="term_id" value={term.id} />
                    <div className="form-grid">
                      <Field label="Title" name="title" required defaultValue={term.title} />
                      <Field label="Order" name="sort_order" type="number" min="0" defaultValue={term.sort_order} />
                      <TextArea label="Text" name="body" required className="full" defaultValue={term.body} />
                      <label className="check"><input type="checkbox" name="is_default" defaultChecked={term.is_default} />Tick on new documents</label>
                      <label className="check"><input type="checkbox" name="active" defaultChecked={term.active} />Available to use</label>
                    </div>
                    <div className="row"><Submit>Save term</Submit></div>
                  </ActionForm>
                  <div style={{ marginTop: 8 }}><ActionButton action={deleteTerm} fields={{ term_id: term.id }} className="btn small ghost" confirm="Delete this term?">Delete</ActionButton></div>
                </div>
              </details>
            ))}
            <details className="panel">
              <summary>Add a term</summary>
              <div className="panel-body">
                <ActionForm action={saveTerm}>
                  <div className="form-grid">
                    <Field label="Title" name="title" required placeholder="e.g. Photos" />
                    <Field label="Order" name="sort_order" type="number" min="0" defaultValue={terms.length + 1} />
                    <TextArea label="Text" name="body" required className="full" />
                    <label className="check"><input type="checkbox" name="is_default" defaultChecked />Tick on new documents</label>
                  </div>
                  <Submit>Add term</Submit>
                </ActionForm>
              </div>
            </details>
          </div>
        </section>

        <section className="card" id="split">
          <h2>Profit split</h2>
          <p className="muted" style={{ marginBottom: 12 }}>How net profit is shared each month. When you close a month in Reports, its split is saved, so changing this later won&apos;t rewrite old months.</p>
          <ActionForm action={saveSplit} resetOnSuccess={false}>
            <div className="form-grid three">
              <Field label="First person" name="split_owner_label" required defaultValue={settings.split_owner_label} />
              <Field label="Their share %" name="split_owner_percent" type="number" min="0" max="100" step="0.5" required defaultValue={settings.split_owner_percent} />
              <Field label="Second person" name="split_partner_label" required defaultValue={settings.split_partner_label} hint="Gets the rest." />
            </div>
            <Submit>Save split</Submit>
          </ActionForm>
        </section>

        <section className="card" id="team">
          <h2>Team</h2>
          <div className="stack">
            {users.map((member) => (
              <details key={member.id} className="panel">
                <summary style={{ color: "var(--ink)" }}>
                  {member.name} <small style={{ fontWeight: 500 }}>· {member.email}</small> <Badge tone={member.active ? "sage" : "ribbon"}>{member.active ? member.role : "Disabled"}</Badge>
                  {member.id === user.id && <Badge>You</Badge>}
                </summary>
                <div className="panel-body">
                  <p className="muted" style={{ marginBottom: 10, fontSize: 13 }}>Last sign-in: {member.last_login_at ? formatDateTime(member.last_login_at) : "never"}</p>
                  <ActionForm action={updateUser} resetOnSuccess={false}>
                    <input type="hidden" name="user_id" value={member.id} />
                    <div className="form-grid">
                      <Select label="Role" name="role" options={roles} defaultValue={member.role} />
                      <Field label="Set a new password" name="new_password" type="password" autoComplete="new-password" hint="Leave empty to keep. They'll be signed out." />
                      <label className="check"><input type="checkbox" name="active" defaultChecked={member.active} />Can sign in</label>
                    </div>
                    <Submit>Update</Submit>
                  </ActionForm>
                </div>
              </details>
            ))}
            <details className="panel">
              <summary>Add a team member</summary>
              <div className="panel-body">
                <ActionForm action={addUser}>
                  <div className="form-grid">
                    <Field label="Name" name="name" required />
                    <Field label="Email" name="email" type="email" required />
                    <Select label="Role" name="role" options={roles} defaultValue="manager" />
                    <Field label="Temporary password" name="password" type="text" required minLength={10} autoComplete="off" hint="Share it privately. They should change it after signing in." />
                  </div>
                  <Submit>Create account</Submit>
                </ActionForm>
              </div>
            </details>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
