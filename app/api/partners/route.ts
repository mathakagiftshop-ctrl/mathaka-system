import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { getPartners } from "@/lib/server/partners";
import { partnerCreateSchema } from "@/lib/server/validation";

export async function GET() {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ partners: await getPartners() });
}

export async function POST(request: Request) {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = partnerCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid partner", details: parsed.error.flatten() }, { status: 400 });
  const sql = getDatabase();
  const id = await sql.begin(async (transaction) => {
    const rows = await transaction<{ id: number }[]>`insert into public.vendors (name,phone,address,notes) values (${parsed.data.name},${parsed.data.phone ?? null},${parsed.data.address ?? null},${parsed.data.notes ?? null}) returning id`;
    await transaction`insert into public.vendor_profiles (vendor_id,services,service_areas,reliability) values (${rows[0].id},${parsed.data.services},${parsed.data.serviceAreas},${parsed.data.reliability})`;
    return rows[0].id;
  });
  const partners = await getPartners();
  return NextResponse.json({ partner: partners.find((partner) => partner.id === String(id)) }, { status: 201 });
}
