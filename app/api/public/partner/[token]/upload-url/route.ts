import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyShareToken } from "@/lib/server/share-links";
import { celebrationBucket, ensureCelebrationBucket, isStorageConfigured } from "@/lib/server/storage";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await verifyShareToken(token, "partner");
  if (!link) return NextResponse.json({ error: "This upload link is invalid or expired" }, { status: 404 });
  if (!isStorageConfigured()) return NextResponse.json({ error: "Media storage is temporarily unavailable" }, { status: 503 });
  const body = await request.json().catch(() => null) as { fileName?: unknown; mimeType?: unknown; size?: unknown } | null;
  const mime = typeof body?.mimeType === "string" ? body.mimeType : "";
  const size = typeof body?.size === "number" ? body.size : 0;
  if ((!mime.startsWith("image/") && !mime.startsWith("video/")) || size <= 0 || size > 100 * 1024 * 1024) return NextResponse.json({ error: "Only images and videos up to 100 MB are supported" }, { status: 400 });
  const extension = typeof body?.fileName === "string" ? body.fileName.split(".").pop()?.replace(/[^a-z0-9]/gi, "").slice(0, 10) : "bin";
  const path = `celebrations/${link.invoice_id}/partner-${randomUUID()}.${extension || "bin"}`;
  const admin = await ensureCelebrationBucket();
  const { data, error } = await admin.storage.from(celebrationBucket).createSignedUploadUrl(path);
  if (error) return NextResponse.json({ error: "An upload URL could not be created" }, { status: 503 });
  return NextResponse.json({ path, token: data.token, signedUrl: data.signedUrl });
}
