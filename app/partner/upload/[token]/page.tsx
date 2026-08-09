"use client";

import { use, useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarClock, Camera, Check, FileText, Gift, LoaderCircle, LockKeyhole, MapPin, Package, RefreshCw, UploadCloud, Video } from "lucide-react";

type PartnerCard = {
  celebration: { recipient: string; occasion: string; dateLabel: string; deliveryTime?: string | null; district?: string | null; address?: string | null; reference: string; items: string[]; checklist?: string[] };
  status: "open" | "ready" | "delivered";
  mediaCounts: { photos: number; videos: number };
};

async function readJson<T>(response: Response): Promise<T> {
  if (response.redirected) throw new Error("This private link cannot be used right now. Ask Mathaka for a fresh link.");
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new Error("The partner service returned an unexpected response. Nothing was changed.");
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "That update could not be saved.");
  return payload;
}

async function jsonPost<T>(url: string, body: unknown): Promise<T> {
  return readJson<T>(await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), redirect: "error" }));
}

export default function PartnerUploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params); const base = `/api/public/partner/${encodeURIComponent(token)}`;
  const [card, setCard] = useState<PartnerCard | null>(null); const [loading, setLoading] = useState(true); const [invalid, setInvalid] = useState(false); const [uploading, setUploading] = useState(false); const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [note, setNote] = useState("");
  const load = useCallback(async (quiet = false) => { if (!quiet) setLoading(true); try { const payload = await readJson<PartnerCard>(await fetch(base, { cache: "no-store", headers: { Accept: "application/json" }, redirect: "error" })); if (!payload.celebration || !payload.mediaCounts || !["open", "ready", "delivered"].includes(payload.status)) throw new Error("This work card is incomplete. Ask Mathaka for a fresh link."); setCard(payload); setInvalid(false); setError(""); } catch (caught) { if (!quiet) setInvalid(true); setError(caught instanceof Error ? caught.message : "This private link is invalid or expired."); } finally { setLoading(false); } }, [base]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function upload(files: File[]) {
    if (!files.length) return; setUploading(true); setError(""); setNote("");
    try {
      for (const file of files) {
        const signed = await jsonPost<{ path: string; signedUrl: string }>(`${base}/upload-url`, { fileName: file.name, mimeType: file.type, size: file.size });
        if (!signed.path || !signed.signedUrl) throw new Error("The upload could not be authorized. Nothing was saved.");
        const response = await fetch(signed.signedUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file, redirect: "error" });
        if (!response.ok) throw new Error(`${file.name} could not be uploaded.`);
        const kind = file.type.startsWith("video/") ? "video" : "photo";
        const saved = await jsonPost<{ mediaId: string }>(`${base}/media`, { kind, storagePath: signed.path, caption: file.name });
        if (!saved.mediaId) throw new Error(`${file.name} uploaded, but Mathaka could not register it.`);
      }
      await load(true); setNote(`${files.length} ${files.length === 1 ? "memory" : "memories"} safely uploaded and confirmed.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Files could not be uploaded. Nothing was marked complete."); }
    finally { setUploading(false); }
  }

  async function updateStatus(next: "ready" | "delivered") {
    setBusy(next); setError(""); setNote("");
    try { const result = await jsonPost<{ status: string }>(`${base}/status`, { status: next }); if (result.status !== next) throw new Error("The status response could not be confirmed."); await load(true); setNote(next === "ready" ? "Mathaka confirmed that this celebration is ready." : "Mathaka confirmed the delivery is complete. Thank you!"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Status could not be updated. Nothing was marked complete."); }
    finally { setBusy(""); }
  }

  if (loading) return <main className="partner-portal portal-state"><LoaderCircle className="spin" size={31} /><h1>Opening your private work card…</h1><p>Checking the latest delivery and memory details with Mathaka.</p></main>;
  if (invalid || !card) return <main className="partner-portal portal-state invalid"><AlertCircle size={33} /><span className="eyebrow">Private link unavailable</span><h1>This work card has expired or is invalid.</h1><p>{error || "Ask Mathaka to send you a fresh partner link."}</p><button onClick={() => void load()}><RefreshCw size={16} />Check again</button></main>;

  const { celebration, mediaCounts, status } = card;
  return <main className="partner-portal production-portal"><header><div className="portal-brand"><span className="brand-mark"><span /></span><div><strong>Mathaka</strong><small>Partner delivery page</small></div></div><span><LockKeyhole size={13} />Private · expiring link</span></header><section className="portal-hero"><span className="eyebrow">{celebration.dateLabel}{celebration.deliveryTime ? ` · ${celebration.deliveryTime}` : ""}</span><h1>{celebration.recipient}’s {celebration.occasion.toLowerCase()}</h1><p><MapPin size={15} />{[celebration.district, celebration.address].filter(Boolean).join(" · ") || "Confirm the destination with Mathaka"}</p><div className="portal-ref">{celebration.reference}</div></section>
    {error && <div className="portal-feedback error" role="alert"><AlertCircle size={18} /><span>{error}</span></div>}{note && <div className="portal-feedback success" role="status"><Check size={18} /><span>{note}</span></div>}
    <section className="partner-work-card" aria-labelledby="partner-job-heading"><header><span><Gift size={18} /></span><div><small>Your scoped work card</small><h2 id="partner-job-heading">Prepare these celebration pieces</h2></div></header><div className="partner-job-facts"><p><CalendarClock /><span><small>Arrival</small><strong>{celebration.dateLabel}{celebration.deliveryTime ? ` at ${celebration.deliveryTime}` : ""}</strong></span></p><p><MapPin /><span><small>Delivery area</small><strong>{celebration.district || "Ask Mathaka"}</strong></span></p></div><div className="partner-item-list">{celebration.items.length ? celebration.items.map((item, index) => <p key={`${item}-${index}`}><Package size={16} /><span><small>Item {String(index + 1).padStart(2, "0")}</small><strong>{item}</strong></span></p>) : <p><FileText size={16} /><span><small>Preparation</small><strong>Follow the assignment shared by Mathaka</strong></span></p>}</div>{celebration.checklist?.length ? <ul>{celebration.checklist.map((step) => <li key={step}><Check size={14} />{step}</li>)}</ul> : null}</section>
    <section className="portal-card upload-card"><h2>Capture the happy moment</h2><p>Add clear delivery photos and at least one short video. Each file goes directly into the private celebration gallery.</p><label><input type="file" multiple accept="image/*,video/*" disabled={uploading || status === "delivered"} onChange={(event) => void upload(Array.from(event.target.files || []))} />{uploading ? <LoaderCircle className="spin" size={32} /> : <UploadCloud size={32} />}<strong>{uploading ? "Uploading safely…" : "Tap to add photos & video"}</strong><small>Images and videos up to 100 MB each</small></label><div className="requirement-row"><span className={mediaCounts.photos ? "done" : ""}><Camera />Photos {mediaCounts.photos}</span><span className={mediaCounts.videos ? "done" : ""}><Video />Videos {mediaCounts.videos}</span></div></section>
    <div className="portal-actions"><button className={status === "ready" || status === "delivered" ? "complete" : ""} disabled={Boolean(busy) || status === "delivered"} onClick={() => void updateStatus("ready")}>{busy === "ready" ? <LoaderCircle className="spin" /> : status !== "open" ? <Check /> : <Gift />}{status !== "open" ? "Ready confirmed" : "Mark order ready"}</button><button className={status === "delivered" ? "complete" : ""} disabled={Boolean(busy) || status === "open" || status === "delivered"} onClick={() => void updateStatus("delivered")}>{busy === "delivered" ? <LoaderCircle className="spin" /> : status === "delivered" ? <Check /> : <MapPin />}{status === "delivered" ? "Delivered" : "Mark delivered"}</button></div><footer>This private link only permits this celebration’s updates. Contact Mathaka directly if any delivery detail is unclear.</footer></main>;
}
