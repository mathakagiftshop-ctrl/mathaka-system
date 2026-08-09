import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { getPartners } from "@/lib/server/partners";
import { partnerCreateSchema } from "@/lib/server/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid partner" }, { status: 400 });
  const parsed = partnerCreateSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid partner", details: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  const sql = getDatabase();
  const updated = await sql.begin(async (transaction) => {
    const rows = await transaction`
      update public.vendors set name=coalesce(${data.name ?? null},name), phone=case when ${data.phone === undefined} then phone else ${data.phone ?? null} end,
        address=case when ${data.address === undefined} then address else ${data.address ?? null} end, notes=case when ${data.notes === undefined} then notes else ${data.notes ?? null} end
      where id=${Number(id)} returning id
    `;
    if (!rows.length) return false;
    await transaction`
      insert into public.vendor_profiles (vendor_id,services,service_areas,reliability) values (${Number(id)},${data.services ?? []},${data.serviceAreas ?? []},${data.reliability ?? 100})
      on conflict (vendor_id) do update set services=coalesce(${data.services ?? null},vendor_profiles.services), service_areas=coalesce(${data.serviceAreas ?? null},vendor_profiles.service_areas), reliability=coalesce(${data.reliability ?? null},vendor_profiles.reliability), updated_at=now()
    `;
    return true;
  });
  if (!updated) return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  const partners = await getPartners();
  return NextResponse.json({ partner: partners.find((partner) => partner.id === id) });
}
