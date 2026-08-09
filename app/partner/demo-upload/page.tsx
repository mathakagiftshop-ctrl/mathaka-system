"use client";

import { useState } from "react";
import { Camera, Check, Gift, LockKeyhole, MapPin, UploadCloud, Video } from "lucide-react";
import { Toast } from "@/components/ui";

const checklist = [
  "Vanilla raspberry cake is ready",
  "Bouquet is safely packed",
  "Called Mathaka before leaving",
];

export default function PartnerUploadPage() {
  const [checks, setChecks] = useState([false, true, false]);
  const [ready, setReady] = useState(false);
  const [delivered, setDelivered] = useState(false);
  const [media, setMedia] = useState(false);
  const [toast, setToast] = useState("");

  return (
    <main className="partner-portal">
      <header>
        <div className="portal-brand"><span className="brand-mark"><span /></span><div><strong>Mathaka</strong><small>Partner delivery page</small></div></div>
        <span><LockKeyhole size={13} />Private link</span>
      </header>
      <section className="portal-hero">
        <span className="eyebrow">Sunday · 6:30 PM</span>
        <h1>Isuri’s birthday surprise</h1>
        <p><MapPin size={15} />Colombo 05 · Havelock Road</p>
        <div className="portal-ref">ORDER MTK–2084</div>
      </section>
      <section className="portal-card">
        <h2>Your simple checklist</h2>
        <p>Tap each step when it’s done. That’s all you need.</p>
        {checklist.map((task, index) => (
          <label key={task}>
            <input type="checkbox" checked={checks[index]} onChange={() => setChecks((current) => current.map((value, itemIndex) => itemIndex === index ? !value : value))} />
            <span>{checks[index] && <Check size={15} />}</span>{task}
          </label>
        ))}
      </section>
      <section className="portal-money">
        <div><small>Agreed total</small><strong>LKR 11,300</strong></div>
        <div><small>Advance received</small><strong>LKR 7,800</strong></div>
        <div><small>Balance after delivery</small><strong>LKR 3,500</strong></div>
      </section>
      <section className="portal-card upload-card">
        <h2>Capture the happy moment</h2><p>We need at least 3 photos and 1 short video after delivery.</p>
        <label><input type="file" multiple accept="image/*,video/*" onChange={() => { setMedia(true); setToast("Files ready — thank you!"); }} /><UploadCloud size={32} /><strong>{media ? "Media added!" : "Tap to add photos & video"}</strong><small>{media ? "3 photos · 1 video" : "Camera or gallery"}</small></label>
        <div className="requirement-row"><span className={media ? "done" : ""}><Camera />Photos {media ? "3/3" : "0/3"}</span><span className={media ? "done" : ""}><Video />Video {media ? "1/1" : "0/1"}</span></div>
      </section>
      <div className="portal-actions">
        <button className={ready ? "complete" : ""} onClick={() => { setReady(true); setToast("Marked ready — Mathaka has been notified"); }}>{ready ? <Check /> : <Gift />}{ready ? "Ready confirmed" : "Mark order ready"}</button>
        <button className={delivered ? "complete" : ""} disabled={!ready} onClick={() => { setDelivered(true); setToast("Delivery complete — beautiful work!"); }}>{delivered ? <Check /> : <MapPin />}{delivered ? "Delivered" : "Mark delivered"}</button>
      </div>
      <footer>Need help? Call or WhatsApp Mathaka · <strong>077 000 2084</strong></footer>
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </main>
  );
}
