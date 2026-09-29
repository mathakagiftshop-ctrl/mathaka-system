import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/bits";
import { ActionButton } from "@/components/form";
import { MediaUploader } from "@/components/uploader";
import { partnerFinishUpload, partnerSetStatus, partnerStartUpload } from "@/app/p/actions";
import { db } from "@/lib/db";
import { formatDate, formatMoney, titleCase } from "@/lib/format";
import { getSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Your Mathaka job" };

export default async function PartnerJobPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{20,64}$/.test(token)) notFound();
  const sql = db();
  const [job] = await sql<{
    id: string; order_id: string; description: string; agreed_amount: number; status: string; partner_name: string;
    recipient_name: string; recipient_phone: string; delivery_address: string; city: string; delivery_date: string | null;
    delivery_time: string; occasion: string; special_request: string; paid: number; photos: number;
  }[]>`
    select j.id, j.order_id, j.description, j.agreed_amount, j.status, p.name as partner_name,
      o.recipient_name, o.recipient_phone, o.delivery_address, o.city, o.delivery_date, o.delivery_time, o.occasion, o.special_request,
      coalesce((select sum(amount) from partner_payments where job_id = j.id and voided_at is null), 0) as paid,
      (select count(*)::int from order_media where order_id = o.id) as photos
    from partner_jobs j join partners p on p.id = j.partner_id join orders o on o.id = j.order_id
    where j.share_token = ${token} and (j.share_expires_at is null or j.share_expires_at > now())`;
  if (!job) notFound();
  const settings = await getSettings();
  const setStatus = partnerSetStatus.bind(null, token);

  return (
    <div className="public-page">
      <div className="public-narrow stack">
        <header>
          <span className="eyebrow">{settings.business_name} job</span>
          <h1 style={{ marginTop: 8 }}>Hi {job.partner_name} 👋</h1>
          <p className="muted">Thank you for working with us. Please keep this page updated.</p>
        </header>

        <section className="card">
          <div className="card-head"><h2>{job.description}</h2><Badge tone={job.status === "delivered" ? "sage" : job.status === "cancelled" ? "ribbon" : "gold"}>{titleCase(job.status)}</Badge></div>
          <dl className="kv">
            <dt>For</dt><dd>{job.recipient_name}{job.occasion && ` · ${job.occasion}`}</dd>
            <dt>When</dt><dd>{formatDate(job.delivery_date, { weekday: "long" })} {job.delivery_time}</dd>
            <dt>Town</dt><dd>{job.city}</dd>
            <dt>Address</dt><dd style={{ whiteSpace: "pre-wrap" }}>{job.delivery_address || "Mathaka will share"}</dd>
            <dt>Recipient phone</dt><dd>{job.recipient_phone || "—"}</dd>
            <dt>Special request</dt><dd style={{ whiteSpace: "pre-wrap" }}>{job.special_request || "—"}</dd>
            <dt>Agreed price</dt><dd>{formatMoney(job.agreed_amount, settings.currency)} <small>(paid so far {formatMoney(job.paid, settings.currency)})</small></dd>
          </dl>
        </section>

        {job.status !== "cancelled" && (
          <section className="card">
            <h2 style={{ marginBottom: 12 }}>Update Mathaka</h2>
            <div className="row">
              {job.status === "assigned" && <ActionButton action={setStatus} fields={{ status: "accepted" }} className="btn primary">I accept this job</ActionButton>}
              {["assigned", "accepted"].includes(job.status) && <ActionButton action={setStatus} fields={{ status: "ready" }} className="btn">It&apos;s ready</ActionButton>}
              {job.status !== "delivered" && <ActionButton action={setStatus} fields={{ status: "delivered" }} className="btn" confirm="Mark this as delivered?">Delivered ✓</ActionButton>}
              {job.status === "delivered" && <p className="notice success">Marked as delivered. Thank you!</p>}
            </div>
          </section>
        )}

        <section className="card">
          <h2>Delivery photos & video</h2>
          <p className="muted" style={{ margin: "6px 0 12px" }}>Please upload at least 3 photos and a short video of the surprise. {job.photos ? `${job.photos} uploaded so far.` : ""}</p>
          <MediaUploader start={partnerStartUpload.bind(null, token)} finish={partnerFinishUpload.bind(null, token)} />
        </section>
      </div>
    </div>
  );
}
