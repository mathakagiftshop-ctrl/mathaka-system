import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { mediaCreateSchema } from "@/lib/server/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid celebration" }, { status: 400 });
  const parsed = mediaCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.storagePath.startsWith(`celebrations/${id}/`)) return NextResponse.json({ error: "Invalid media metadata" }, { status: 400 });
  const sql = getDatabase();
  const rows = await sql<{ id: string; created_at: Date | string }[]>`
    insert into public.celebration_media (invoice_id, kind, storage_path, caption, uploaded_by)
    select ${Number(id)}, ${parsed.data.kind}, ${parsed.data.storagePath}, ${parsed.data.caption ?? null}, ${owner.email}
    where exists(select 1 from public.invoices where id=${Number(id)}) returning id::text, created_at
  `;
  if (!rows.length) return NextResponse.json({ error: "Celebration not found" }, { status: 404 });
  return NextResponse.json({ media: { id: rows[0].id, ...parsed.data, createdAt: new Date(rows[0].created_at).toISOString() } }, { status: 201 });
}
