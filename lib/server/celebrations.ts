import "server-only";
import { getDatabase } from "@/lib/server/database";
import { conflict, notFound } from "@/lib/server/errors";
import type { z } from "zod";
import type { orderPatchSchema } from "@/lib/server/validation";
import type { manualCelebrationSchema } from "@/lib/server/validation";

type OrderPatch = z.infer<typeof orderPatchSchema>;
type ManualCelebration = z.infer<typeof manualCelebrationSchema>;

const journeyStatus = {
  Draft: "details", Confirmed: "confirmed", Preparing: "preparing", Delivery: "delivery", Memories: "memories", Reconciled: "reconciled",
} as const;

function deliveryAt(date?: string | null, time?: string | null) {
  if (date === null) return null;
  if (!date) return undefined;
  const parsed = new Date(`${date}T${time || "12:00"}:00+05:30`);
  if (Number.isNaN(parsed.getTime()) || parsed.toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" }) !== date) {
    throw conflict("The delivery date or time is invalid");
  }
  return parsed;
}

export async function updateCelebration(id: number, patch: OrderPatch, actorId: string) {
  const sql = getDatabase();
  await sql.begin(async (transaction) => {
    const rows = await transaction<{
      invoice_id: number; customer_id: number; recipient_id: number | null; revision: number; delivery_at: Date | string | null;
    }[]>`
      select i.id as invoice_id, i.customer_id, i.recipient_id, coalesce(j.revision, 1) as revision, j.delivery_at
      from public.invoices i left join public.celebration_journeys j on j.invoice_id = i.id
      where i.id = ${id} for update of i
    `;
    const current = rows[0];
    if (!current) throw notFound("Celebration not found");
    if (patch.expectedRevision && patch.expectedRevision !== current.revision) {
      throw conflict("This celebration changed while you were editing it. Reload before saving.");
    }

    if (patch.sender !== undefined || patch.senderCountry !== undefined) {
      await transaction`
        update public.customers set
          name = coalesce(${patch.sender ?? null}, name),
          country = case when ${patch.senderCountry === undefined} then country else ${patch.senderCountry ?? null} end,
          updated_at = now()
        where id = ${current.customer_id}
      `;
    }
    if (current.recipient_id && (patch.recipient !== undefined || patch.recipientPhone !== undefined || patch.address !== undefined)) {
      await transaction`
        update public.recipients set
          name = coalesce(${patch.recipient ?? null}, name),
          phone = case when ${patch.recipientPhone === undefined} then phone else ${patch.recipientPhone ?? null} end,
          address = case when ${patch.address === undefined} then address else ${patch.address ?? null} end
        where id = ${current.recipient_id}
      `;
    }

    let deliveryZoneId: number | null | undefined;
    if (patch.district !== undefined) {
      if (!patch.district) deliveryZoneId = null;
      else {
        const zones = await transaction<{ id: number }[]>`
          select id from public.delivery_zones where lower(name) = lower(${patch.district}) order by id limit 1
        `;
        if (zones[0]) deliveryZoneId = zones[0].id;
        else {
          const created = await transaction<{ id: number }[]>`
            insert into public.delivery_zones (name, areas, delivery_fee, is_active)
            values (${patch.district}, ${patch.district}, 0, true) returning id
          `;
          deliveryZoneId = created[0].id;
        }
      }
    }
    if (patch.total !== undefined || deliveryZoneId !== undefined) {
      await transaction`
        update public.invoices set
          subtotal = coalesce(${patch.total ?? null}, subtotal),
          total = coalesce(${patch.total ?? null}, total),
          delivery_zone_id = case when ${deliveryZoneId === undefined} then delivery_zone_id else ${deliveryZoneId ?? null} end
        where id = ${id}
      `;
    }

    const needsJourney = patch.deliveryDate !== undefined || patch.deliveryTime !== undefined || patch.mode !== undefined || patch.status !== undefined || patch.specialRequest !== undefined;
    if (needsJourney) {
      const existingTime = current.delivery_at ? new Date(current.delivery_at).toLocaleTimeString("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit", hour12: false }) : "12:00";
      const dateForTimeOnly = current.delivery_at ? new Date(current.delivery_at).toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" }) : null;
      const resolvedDelivery = patch.deliveryDate === null ? null
        : patch.deliveryDate ? deliveryAt(patch.deliveryDate, patch.deliveryTime || existingTime)
        : patch.deliveryTime && dateForTimeOnly ? deliveryAt(dateForTimeOnly, patch.deliveryTime)
        : undefined;
      await transaction`
        insert into public.celebration_journeys (invoice_id, delivery_at, fulfilment_mode, journey_status, special_request, revision, updated_by)
        values (${id}, ${resolvedDelivery ?? null}, ${patch.mode?.toLowerCase() ?? "self"}, ${patch.status ? journeyStatus[patch.status] : "details"}, ${patch.specialRequest ?? null}, 1, ${actorId}::uuid)
        on conflict (invoice_id) do update set
          delivery_at = case when ${resolvedDelivery === undefined} then celebration_journeys.delivery_at else ${resolvedDelivery ?? null} end,
          fulfilment_mode = coalesce(${patch.mode?.toLowerCase() ?? null}, celebration_journeys.fulfilment_mode),
          journey_status = coalesce(${patch.status ? journeyStatus[patch.status] : null}, celebration_journeys.journey_status),
          special_request = case when ${patch.specialRequest === undefined} then celebration_journeys.special_request else ${patch.specialRequest ?? null} end,
          revision = celebration_journeys.revision + 1, updated_by = ${actorId}::uuid, updated_at = now(),
          reconciled_at = case when ${patch.status ?? null} = 'Reconciled' then now() else celebration_journeys.reconciled_at end
      `;
    } else {
      await transaction`update public.celebration_journeys set revision = revision + 1, updated_by = ${actorId}::uuid, updated_at = now() where invoice_id = ${id}`;
    }

    if (patch.occasion !== undefined && current.recipient_id) {
      const updatedDates = await transaction<{ id: number }[]>`
        update public.important_dates set title = ${patch.occasion}
        where id = (select id from public.important_dates where customer_id = ${current.customer_id} and recipient_id = ${current.recipient_id} order by id desc limit 1)
        returning id
      `;
      if (!updatedDates.length) {
        await transaction`
          insert into public.important_dates (customer_id, recipient_id, title, date, recurring, notes)
          values (${current.customer_id}, ${current.recipient_id}, ${patch.occasion}, ${patch.deliveryDate ?? new Date().toISOString().slice(0, 10)}, false, 'Celebration detail')
        `;
      }
    }

    if (patch.items) {
      await transaction`delete from public.invoice_items where invoice_id = ${id}`;
      for (const item of patch.items) {
        await transaction`
          insert into public.invoice_items (invoice_id, description, quantity, unit_price, total, cost_price)
          values (${id}, ${item.description}, ${item.quantity}, ${item.unitPrice}, ${item.quantity * item.unitPrice}, ${item.costPrice})
        `;
      }
      if (patch.total === undefined) {
        await transaction`
          update public.invoices set subtotal = (select coalesce(sum(total),0) from public.invoice_items where invoice_id = ${id}),
            total = (select coalesce(sum(total),0) from public.invoice_items where invoice_id = ${id}) + coalesce(delivery_fee,0) - coalesce(discount,0)
          where id = ${id}
        `;
      }
    }
    if (patch.requiredPhotos !== undefined || patch.requiredVideos !== undefined) {
      await transaction`
        insert into public.celebration_media_requirements (invoice_id, minimum_photos, minimum_videos)
        values (${id}, ${patch.requiredPhotos ?? 3}, ${patch.requiredVideos ?? 1})
        on conflict (invoice_id) do update set
          minimum_photos = coalesce(${patch.requiredPhotos ?? null}, celebration_media_requirements.minimum_photos),
          minimum_videos = coalesce(${patch.requiredVideos ?? null}, celebration_media_requirements.minimum_videos)
      `;
    }
  });
}

export async function createManualCelebration(input: ManualCelebration, actorId: string) {
  const sql = getDatabase();
  return sql.begin(async (transaction) => {
    const existing = await transaction<{ id: number }[]>`select id from public.customers where regexp_replace(whatsapp,'\\D','','g')=regexp_replace(${input.senderPhone},'\\D','','g') order by id limit 1`;
    let customerId = existing[0]?.id;
    if (customerId) await transaction`update public.customers set name=${input.sender},country=coalesce(${input.senderCountry ?? null},country),updated_at=now() where id=${customerId}`;
    else {
      const rows = await transaction<{ id: number }[]>`insert into public.customers (name,whatsapp,country,notes) values (${input.sender},${input.senderPhone},${input.senderCountry ?? null},'Created manually in Celebration Studio') returning id`;
      customerId = rows[0].id;
    }
    const recipients = await transaction<{ id: number }[]>`insert into public.recipients (customer_id,name,phone,address) values (${customerId},${input.recipient},${input.recipientPhone ?? null},${input.address ?? null}) returning id`;
    let zoneId: number | null = null;
    if (input.district) {
      const zones = await transaction<{ id: number }[]>`select id from public.delivery_zones where lower(name)=lower(${input.district}) limit 1`;
      if (zones[0]) zoneId = zones[0].id;
      else {
        const zones = await transaction<{ id: number }[]>`insert into public.delivery_zones (name,areas,delivery_fee,is_active) values (${input.district},${input.district},0,true) returning id`;
        zoneId = zones[0].id;
      }
    }
    const sequence = await transaction<{ id: number }[]>`select nextval('public.invoices_id_seq')::integer as id`;
    const invoiceId = sequence[0].id;
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "");
    const invoiceNumber = `MTH-${day}-${String(invoiceId).padStart(4, "0")}`;
    await transaction`insert into public.invoices (id,invoice_number,customer_id,recipient_id,subtotal,discount,total,status,notes,order_status,delivery_zone_id,delivery_fee,amount_paid) values (${invoiceId},${invoiceNumber},${customerId},${recipients[0].id},${input.total},0,${input.total},'pending','Created manually in Celebration Studio','received',${zoneId},0,0)`;
    const share = input.items.length ? Math.floor((input.total / input.items.length) * 100) / 100 : 0;
    for (const [index, description] of input.items.entries()) {
      const price = index === input.items.length - 1 ? input.total - share * (input.items.length - 1) : share;
      await transaction`insert into public.invoice_items (invoice_id,description,quantity,unit_price,total,cost_price) values (${invoiceId},${description},1,${price},${price},0)`;
    }
    const scheduled = input.deliveryDate ? deliveryAt(input.deliveryDate, input.deliveryTime) : null;
    await transaction`insert into public.celebration_journeys (invoice_id,delivery_at,fulfilment_mode,journey_status,special_request,updated_by) values (${invoiceId},${scheduled ?? null},${input.mode.toLowerCase()},'confirmed',${input.specialRequest ?? null},${actorId}::uuid)`;
    await transaction`insert into public.celebration_media_requirements (invoice_id,minimum_photos,minimum_videos) values (${invoiceId},3,1)`;
    await transaction`insert into public.important_dates (customer_id,recipient_id,title,date,recurring,notes) values (${customerId},${recipients[0].id},${input.occasion},${input.deliveryDate ?? new Date().toISOString().slice(0,10)},false,'Created manually')`;
    const tasks = ["Confirm order details with the customer", ...input.items.map((item) => `Arrange ${item}`), "Prepare and pack the celebration", "Confirm recipient and delivery access", "Complete the surprise delivery", "Upload at least 3 photos and 1 video"];
    for (const [index, title] of tasks.entries()) await transaction`insert into public.celebration_tasks (invoice_id,title,kind,due_at,sort_order) values (${invoiceId},${title},${index===tasks.length-1 ? "media" : index===tasks.length-2 ? "delivery" : "packing"},${scheduled ?? null},${index})`;
    return invoiceId;
  });
}
