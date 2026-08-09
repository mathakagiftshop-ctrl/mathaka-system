import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/database";
import { verifyShareToken } from "@/lib/server/share-links";
import { mediaCreateSchema } from "@/lib/server/validation";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await verifyShareToken(token, "partner");
  if (!link) return NextResponse.json({ error: "This upload link is invalid or expired" }, { status: 404 });
  const parsed = mediaCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.storagePath.startsWith(`celebrations/${link.invoice_id}/partner-`)) return NextResponse.json({ error: "Invalid media metadata" }, { status: 400 });
  const sql = getDatabase();
  const rows = await sql<{ id: string }[]>`
    insert into public.celebration_media (invoice_id,kind,storage_path,caption,uploaded_by)
    values (${link.invoice_id},${parsed.data.kind},${parsed.data.storagePath},${parsed.data.caption ?? null},'partner link') returning id::text
  `;
  return NextResponse.json({ mediaId: rows[0].id }, { status: 201 });
}
