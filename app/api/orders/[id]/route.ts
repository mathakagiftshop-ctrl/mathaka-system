import { NextResponse } from "next/server";
import { getSupabaseOrder } from "@/lib/server/orders";
import { getOwner } from "@/lib/server/auth";
import { updateCelebration } from "@/lib/server/celebrations";
import { orderPatchSchema } from "@/lib/server/validation";
import { routeError } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const order = await getSupabaseOrder(id);
    if (order) return NextResponse.json({ order, source: "supabase" });
    return NextResponse.json({ error: "Celebration not found" }, { status: 404 });
  } catch (error) {
    console.error(`Supabase order ${id} read failed`, error);
    return NextResponse.json({ error: "Celebration data is temporarily unavailable" }, { status: 503 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid celebration" }, { status: 400 });
  let json: unknown;
  try { json = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON request" }, { status: 400 }); }
  const parsed = orderPatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid celebration details", details: parsed.error.flatten() }, { status: 400 });
  try {
    await updateCelebration(Number(id), parsed.data, owner.subject);
    const order = await getSupabaseOrder(id);
    return NextResponse.json({ order });
  } catch (error) {
    return routeError(error, "The celebration could not be updated");
  }
}
