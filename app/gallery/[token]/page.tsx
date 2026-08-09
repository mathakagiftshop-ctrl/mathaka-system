import Image from "next/image";
import { notFound } from "next/navigation";
import { Heart, LockKeyhole } from "lucide-react";
import { getDatabase } from "@/lib/server/database";
import { verifyShareToken } from "@/lib/server/share-links";
import { celebrationBucket, getStorageAdmin, isStorageConfigured } from "@/lib/server/storage";

export default async function GalleryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await verifyShareToken(token, "gallery");
  if (!link) notFound();
  const sql = getDatabase();
  const orders = await sql<{ recipient: string; sender: string; occasion: string; special_request: string | null }[]>`
    select coalesce(r.name,'Someone special') as recipient, c.name as sender,
      coalesce(d.title, i.invoice_number) as occasion, coalesce(j.special_request, i.gift_message) as special_request
    from public.invoices i join public.customers c on c.id=i.customer_id
    left join public.recipients r on r.id=i.recipient_id
    left join public.important_dates d on d.customer_id=i.customer_id and d.recipient_id is not distinct from i.recipient_id
    left join public.celebration_journeys j on j.invoice_id=i.id where i.id=${link.invoice_id} limit 1
  `;
  const media = await sql<{ id: string; kind: string; storage_path: string; caption: string | null }[]>`
    select id::text, kind, storage_path, caption from public.celebration_media where invoice_id=${link.invoice_id} order by created_at
  `;
  const admin = isStorageConfigured() ? getStorageAdmin() : null;
  const signed = await Promise.all(media.map(async (asset) => {
    if (!admin) return { ...asset, url: null };
    const { data } = await admin.storage.from(celebrationBucket).createSignedUrl(asset.storage_path, 3600);
    return { ...asset, url: data?.signedUrl ?? null };
  }));
  const order = orders[0];
  if (!order) notFound();
  return <main className="memory-page public-memory-page">
    <header><div className="gallery-wordmark"><Heart/>mathaka</div><span><LockKeyhole size={14}/>Private memory</span></header>
    <div className="memory-intro"><span className="eyebrow">{order.occasion}</span><h1>For <em>{order.recipient}.</em></h1><p>{order.special_request || "A thoughtful surprise, brought to life with care."}</p><strong>With love, {order.sender}</strong></div>
    <section className="memory-mosaic">
      {signed.filter((asset) => asset.url).map((asset, index) => asset.kind === "photo" ?
        <figure className={index === 0 ? "memory-main" : "memory-crop crop-one"} key={asset.id}><Image src={asset.url!} alt={asset.caption || `Celebration memory ${index + 1}`} fill sizes="(max-width: 700px) 100vw, 65vw"/><figcaption>{asset.caption}</figcaption></figure> :
        <figure className="memory-video" key={asset.id}><video src={asset.url!} controls preload="metadata"/><figcaption>{asset.caption}</figcaption></figure>)}
      {!signed.some((asset) => asset.url) && <div className="gallery-empty"><Heart/><h2>The memories are being prepared.</h2><p>Please return to this private link soon.</p></div>}
    </section>
    <footer><span>Thoughtfully brought to life by</span><strong>Mathaka</strong><p>From a message to a memory.</p></footer>
  </main>;
}
