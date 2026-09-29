"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { checkbox, formAction, optionalUuid, requiredText, text, UserError, uuid, type ActionState } from "@/lib/actions";
import { db } from "@/lib/db";

const partnerSchema = z.object({
  partner_id: optionalUuid,
  name: requiredText(120),
  business_name: text(120),
  phone: text(40),
  city: requiredText(80),
  address: text(500),
  "services[]": z.array(z.string().trim().max(40)).default([]),
  service_radius_km: z.coerce.number().int().min(0).max(300).default(10),
  extra_cities: text(1000),
  rating: z.coerce.number().int().min(0).max(5).default(0),
  bank_details: text(1000),
  notes: text(2000),
});

export async function savePartner(state: ActionState, formData: FormData): Promise<ActionState> {
  let partnerId: string | null = null;
  const result = await formAction(partnerSchema, async (input, user) => {
    const fields = {
      name: input.name,
      business_name: input.business_name,
      phone: input.phone,
      city: input.city,
      address: input.address,
      services: input["services[]"],
      service_radius_km: input.service_radius_km,
      extra_cities: input.extra_cities.split(/[,\n]/).map((city) => city.trim()).filter(Boolean),
      rating: input.rating || null,
      bank_details: input.bank_details,
      notes: input.notes,
    };
    const sql = db();
    if (input.partner_id) {
      const rows = await sql`update partners set ${sql(fields)}, updated_at = now() where id = ${input.partner_id} returning id`;
      if (!rows.length) throw new UserError("That partner no longer exists.");
      partnerId = input.partner_id;
    } else {
      const [row] = await sql<{ id: string }[]>`insert into partners ${sql(fields)} returning id`;
      partnerId = row.id;
    }
    await audit(user.id, input.partner_id ? "partner.updated" : "partner.created", "partner", partnerId);
    revalidatePath("/partners");
    revalidatePath(`/partners/${partnerId}`);
  })(state, formData);
  if (result.ok && partnerId) redirect(`/partners/${partnerId}`);
  return result;
}

export const setPartnerActive = formAction(z.object({ partner_id: uuid, active: checkbox }), async ({ partner_id, active }, user) => {
  await db()`update partners set active = ${active}, updated_at = now() where id = ${partner_id}`;
  await audit(user.id, active ? "partner.activated" : "partner.deactivated", "partner", partner_id);
  revalidatePath("/partners");
  revalidatePath(`/partners/${partner_id}`);
  return active ? "Partner is active again." : "Partner archived. Their history is kept.";
});
