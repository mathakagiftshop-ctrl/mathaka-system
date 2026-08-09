import { NextResponse } from "next/server";
import { getSupabaseOrders } from "@/lib/server/orders";
import { getOwner } from "@/lib/server/auth";
import { createManualCelebration } from "@/lib/server/celebrations";
import { manualCelebrationSchema } from "@/lib/server/validation";
import { routeError } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const orders = await getSupabaseOrders();
    return NextResponse.json({ orders, source: "supabase" });
  } catch (error) {
    console.error("Supabase order read failed", error);
    return NextResponse.json({ error: "Celebrations are temporarily unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = manualCelebrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid celebration details", details: parsed.error.flatten() }, { status: 400 });
  try {
    const orderId = await createManualCelebration(parsed.data, owner.subject);
    return NextResponse.json({ orderId }, { status: 201 });
  } catch (error) {
    return routeError(error, "The celebration could not be created");
  }
}
