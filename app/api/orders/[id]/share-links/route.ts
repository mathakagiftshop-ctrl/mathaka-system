import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { createShareLink } from "@/lib/server/share-links";
import { routeError } from "@/lib/server/errors";
import { getDatabase } from "@/lib/server/database";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid celebration" }, { status: 400 });
  const body = await request.json().catch(() => null) as { purpose?: unknown; expiresInHours?: unknown } | null;
  if (body?.purpose !== "partner" && body?.purpose !== "gallery") return NextResponse.json({ error: "Purpose must be partner or gallery" }, { status: 400 });
  const expiresInHours = typeof body.expiresInHours === "number" ? Math.min(Math.max(Math.round(body.expiresInHours), 1), 24 * 90) : 24 * 14;
  try {
    const result = await createShareLink(Number(id), body.purpose, expiresInHours);
    const origin = new URL(request.url).origin;
    return NextResponse.json({ url: `${origin}/${body.purpose === "gallery" ? "gallery" : "partner/upload"}/${result.token}`, expiresAt: result.expiresAt.toISOString() }, { status: 201 });
  } catch (error) {
    return routeError(error, "The secure link could not be created");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid celebration" }, { status: 400 });
  const body = await request.json().catch(() => null) as { purpose?: unknown } | null;
  if (body?.purpose !== "partner" && body?.purpose !== "gallery") return NextResponse.json({ error: "Purpose must be partner or gallery" }, { status: 400 });
  const sql = getDatabase();
  const rows = await sql`update public.celebration_share_links set revoked_at=now() where invoice_id=${Number(id)} and purpose=${body.purpose} and revoked_at is null returning id`;
  return NextResponse.json({ revoked: rows.length });
}
