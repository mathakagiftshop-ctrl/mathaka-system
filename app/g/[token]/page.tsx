import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data/settings";
import { viewUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Your celebration" };

/** Public photo & video gallery for the customer abroad. */
export default async function GalleryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{20,64}$/.test(token)) notFound();
  const sql = db();
  const [order] = await sql<{ id: string; recipient_name: string; occasion: string }[]>`
    select id, recipient_name, occasion from orders where gallery_token = ${token}`;
  if (!order) notFound();
  const [settings, media] = await Promise.all([
    getSettings(),
    sql<{ id: string; kind: string; storage_key: string }[]>`select id, kind, storage_key from order_media where order_id = ${order.id} order by created_at`,
  ]);
  const items = await Promise.all(media.map(async (item) => ({ ...item, url: await viewUrl(item.storage_key, 6 * 3600) })));

  return (
    <div className="public-page">
      <div className="public-narrow" style={{ maxWidth: 1000 }}>
        <header style={{ textAlign: "center", marginBottom: 24 }}>
          <span className="eyebrow" style={{ justifyContent: "center" }}>{settings.business_name}</span>
          <h1 style={{ marginTop: 8 }}>{order.recipient_name}&apos;s {order.occasion || "celebration"}</h1>
          <p className="muted" style={{ marginTop: 6 }}>Delivered with love. Tap a photo to open it full size.</p>
        </header>
        {items.length === 0 ? <p className="empty">Photos will appear here soon.</p> : (
          <div className="gallery-grid">
            {items.map((item) => item.url && (item.kind === "video"
              ? <video key={item.id} src={item.url} controls playsInline preload="metadata" />
              : <a key={item.id} href={item.url} target="_blank" rel="noreferrer"><img src={item.url} alt="" loading="lazy" /></a>))}
          </div>
        )}
      </div>
    </div>
  );
}
