import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { celebrationBucket, ensureCelebrationBucket, isStorageConfigured } from "@/lib/server/storage";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStorageConfigured()) return NextResponse.json({ error: "Media storage needs a Supabase service-role key before uploads can be enabled" }, { status: 503 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid celebration" }, { status: 400 });
  const body = await request.json().catch(() => null) as { fileName?: unknown; mimeType?: unknown; size?: unknown } | null;
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
  const size = typeof body?.size === "number" ? body.size : 0;
  if ((!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) || size <= 0 || size > 100 * 1024 * 1024) {
    return NextResponse.json({ error: "Only images and videos up to 100 MB are supported" }, { status: 400 });
  }
  const sql = getDatabase();
  const exists = await sql`select id from public.invoices where id=${Number(id)} limit 1`;
  if (!exists.length) return NextResponse.json({ error: "Celebration not found" }, { status: 404 });
  const extension = typeof body?.fileName === "string" ? body.fileName.split(".").pop()?.replace(/[^a-z0-9]/gi, "").slice(0, 10) : "bin";
  const path = `celebrations/${id}/${randomUUID()}.${extension || "bin"}`;
  const admin = await ensureCelebrationBucket();
  const { data, error } = await admin.storage.from(celebrationBucket).createSignedUploadUrl(path);
  if (error) return NextResponse.json({ error: "An upload URL could not be created" }, { status: 503 });
  return NextResponse.json({ path, token: data.token, signedUrl: data.signedUrl });
}
