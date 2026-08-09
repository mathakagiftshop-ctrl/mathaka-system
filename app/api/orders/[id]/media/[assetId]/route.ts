import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { celebrationBucket, getStorageAdmin, isStorageConfigured } from "@/lib/server/storage";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStorageConfigured()) return NextResponse.json({ error: "Media storage is not configured" }, { status: 503 });
  const { id, assetId } = await params;
  if (!/^\d+$/.test(id) || !/^[0-9a-f-]{36}$/i.test(assetId)) return NextResponse.json({ error: "Invalid media asset" }, { status: 400 });
  const sql = getDatabase();
  const rows = await sql<{ storage_path: string }[]>`delete from public.celebration_media where id=${assetId}::uuid and invoice_id=${Number(id)} returning storage_path`;
  if (!rows.length) return NextResponse.json({ error: "Media asset not found" }, { status: 404 });
  const { error } = await getStorageAdmin().storage.from(celebrationBucket).remove([rows[0].storage_path]);
  if (error) return NextResponse.json({ deleted: true, warning: "The media record was removed but storage cleanup needs attention" });
  return NextResponse.json({ deleted: true });
}
