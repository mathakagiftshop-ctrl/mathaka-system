import { NextResponse } from "next/server";
import { getOwner } from "@/lib/server/auth";
import { getDatabase, isDatabaseConfigured } from "@/lib/server/database";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DraftSnapshot = {
  sender?: { name?: unknown; phone?: unknown; country?: unknown };
  recipient?: { name?: unknown; phone?: unknown };
  occasion?: unknown;
  delivery?: { date?: unknown; time?: unknown; address?: unknown; district?: unknown };
  items?: Array<{ category?: unknown; description?: unknown }>;
  agreedPrice?: { amount?: unknown; currency?: unknown };
  receipt?: { amount?: unknown; currency?: unknown; date?: unknown; reference?: unknown };
  specialRequest?: unknown;
  fulfilmentMode?: unknown;
};

type DraftRow = {
  id: string;
  invoice_id: number | null;
  status: string;
  snapshot: DraftSnapshot;
  missing_fields: string[];
  external_chat_id: string;
  revision: number;
  confidence: Record<string, number>;
  source_message_ids: string[];
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function amount(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
}

function deliveryTimestamp(dateValue: unknown, timeValue: unknown) {
  const date = text(dateValue);
  const time = text(timeValue);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const safeTime = time && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "12:00";
  const parsed = new Date(`${date}T${safeTime}:00+05:30`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function missingTask(field: string) {
  const labels: Record<string, { title: string; kind: string }> = {
    "sender.name": { title: "Ask for the sender’s name", kind: "address" },
    "sender.phone": { title: "Confirm the sender’s phone number", kind: "address" },
    "sender.country": { title: "Confirm the sender’s country", kind: "address" },
    "recipient.name": { title: "Ask for the recipient’s name", kind: "address" },
    "recipient.phone": { title: "Ask for the recipient’s phone number", kind: "delivery" },
    "delivery.date": { title: "Confirm the delivery date", kind: "delivery" },
    "delivery.time": { title: "Confirm the delivery time", kind: "delivery" },
    "delivery.address": { title: "Confirm the complete delivery address", kind: "address" },
    "delivery.district": { title: "Confirm the delivery district", kind: "delivery" },
    occasion: { title: "Confirm the celebration occasion", kind: "other" },
    items: { title: "Confirm the requested gifts and items", kind: "gift" },
    "agreedPrice.amount": { title: "Agree the final customer price", kind: "other" },
  };
  return labels[field] ?? { title: `Clarify ${field.replace(/[._-]+/g, " ")}`, kind: "other" };
}

function itemKind(category: string | null) {
  if (category === "cake") return "cake";
  if (category === "flowers") return "flowers";
  if (category === "gift") return "gift";
  return "other";
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const { id: conversationId } = await params;
  if (!UUID_PATTERN.test(conversationId)) return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });

  const sql = getDatabase();
  try {
    const result = await sql.begin(async (transaction) => {
      const drafts = await transaction<DraftRow[]>`
        select d.id::text, d.invoice_id, d.status, d.snapshot, d.missing_fields, d.revision, d.confidence, d.source_message_ids, c.external_chat_id
        from public.ai_order_drafts d
        join public.whatsapp_conversations c on c.id = d.conversation_id
        where d.conversation_id = ${conversationId}::uuid
        for update of d
      `;
      const draft = drafts[0];
      if (!draft) throw new Error("NO_DRAFT");
      if (draft.invoice_id) return { orderId: draft.invoice_id, alreadyCreated: true };
      if (draft.status !== "confirmed") throw new Error("NOT_CONFIRMED");

      const snapshot = draft.snapshot || {};
      const senderName = text(snapshot.sender?.name) || "WhatsApp customer";
      const senderContact = text(snapshot.sender?.phone) || draft.external_chat_id;
      const senderCountry = text(snapshot.sender?.country);
      const recipientName = text(snapshot.recipient?.name) || "Recipient details pending";
      const recipientPhone = text(snapshot.recipient?.phone);
      const address = text(snapshot.delivery?.address);
      const district = text(snapshot.delivery?.district);
      const occasion = text(snapshot.occasion) || "Celebration";
      const deliveryDate = text(snapshot.delivery?.date);
      const deliveryAt = deliveryTimestamp(snapshot.delivery?.date, snapshot.delivery?.time);
      const agreedCurrency = text(snapshot.agreedPrice?.currency)?.toUpperCase() || "LKR";
      const extractedAmount = amount(snapshot.agreedPrice?.amount);
      const agreedTotal = agreedCurrency === "LKR" ? extractedAmount : 0;
      const items = Array.isArray(snapshot.items) ? snapshot.items.filter((item) => text(item?.description)) : [];
      const specialRequest = text(snapshot.specialRequest);
      const fulfilmentMode = ["self", "partner", "hybrid"].includes(text(snapshot.fulfilmentMode) || "") ? text(snapshot.fulfilmentMode)! : "self";

      let customerId: number;
      const customers = await transaction<{ id: number }[]>`
        select id from public.customers where whatsapp = ${senderContact} order by id limit 1
      `;
      if (customers[0]) {
        customerId = customers[0].id;
        await transaction`
          update public.customers set
            name = case when name = 'WhatsApp customer' and ${senderName} <> 'WhatsApp customer' then ${senderName} else name end,
            country = coalesce(country, ${senderCountry}),
            updated_at = now()
          where id = ${customerId}
        `;
      } else {
        const created = await transaction<{ id: number }[]>`
          insert into public.customers (name, whatsapp, country, notes)
          values (${senderName}, ${senderContact}, ${senderCountry}, ${`Created from WhatsApp AI draft ${draft.id}`})
          returning id
        `;
        customerId = created[0].id;
      }

      const recipients = await transaction<{ id: number }[]>`
        insert into public.recipients (customer_id, name, phone, address)
        values (${customerId}, ${recipientName}, ${recipientPhone}, ${address})
        returning id
      `;
      const recipientId = recipients[0].id;

      let deliveryZoneId: number | null = null;
      if (district) {
        await transaction`select pg_advisory_xact_lock(hashtext(lower(${district})))`;
        const zones = await transaction<{ id: number }[]>`
          select id from public.delivery_zones
          where lower(name) = lower(${district}) or lower(coalesce(areas, '')) like ${`%${district.toLowerCase()}%`}
          order by id limit 1
        `;
        if (zones[0]) {
          deliveryZoneId = zones[0].id;
        } else {
          const createdZone = await transaction<{ id: number }[]>`
            insert into public.delivery_zones (name, areas, delivery_fee, is_active)
            values (${district}, ${district}, 0, true)
            returning id
          `;
          deliveryZoneId = createdZone[0].id;
        }
      }

      const sequenceRows = await transaction<{ id: number }[]>`select nextval('public.invoices_id_seq')::integer as id`;
      const invoiceId = sequenceRows[0].id;
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "");
      const invoiceNumber = `MTH-${day}-${String(invoiceId).padStart(4, "0")}`;
      const receiptReference = text(snapshot.receipt?.reference);
      const invoiceNotes = [
        `Created from confirmed WhatsApp AI draft ${draft.id}.`,
        draft.missing_fields.length ? `Details still required: ${draft.missing_fields.join(", ")}.` : null,
        amount(snapshot.receipt?.amount) ? `Customer submitted receipt details${receiptReference ? ` (reference ${receiptReference})` : ""}; payment remains unverified.` : null,
        agreedCurrency !== "LKR" && extractedAmount ? `Agreed price ${agreedCurrency} ${extractedAmount}; convert and confirm the LKR invoice total.` : null,
      ].filter(Boolean).join(" ");

      await transaction`
        insert into public.invoices (
          id, invoice_number, customer_id, recipient_id, subtotal, discount, total,
          status, notes, order_status, delivery_zone_id, delivery_fee, amount_paid
        ) values (
          ${invoiceId}, ${invoiceNumber}, ${customerId}, ${recipientId}, ${agreedTotal}, 0, ${agreedTotal},
          'pending', ${invoiceNotes}, 'received', ${deliveryZoneId}, 0, 0
        )
      `;

      if (items.length) {
        for (const [itemIndex, item] of items.entries()) {
          const description = text(item.description)!;
          const category = text(item.category)?.toLowerCase() || null;
          const unitPrice = agreedTotal && items.length ? (itemIndex === items.length - 1 ? agreedTotal - Math.floor((agreedTotal / items.length) * 100) / 100 * (items.length - 1) : Math.floor((agreedTotal / items.length) * 100) / 100) : 0;
          const categoryRows = category ? await transaction<{ id: number }[]>`
            select id from public.categories where lower(name) = ${category} limit 1
          ` : [];
          await transaction`
            insert into public.invoice_items (invoice_id, category_id, description, quantity, unit_price, total, cost_price)
            values (${invoiceId}, ${categoryRows[0]?.id ?? null}, ${description}, 1, ${unitPrice}, ${unitPrice}, 0)
          `;
        }
      } else {
        await transaction`
          insert into public.invoice_items (invoice_id, description, quantity, unit_price, total, cost_price)
          values (${invoiceId}, 'Items to be confirmed', 1, 0, 0, 0)
        `;
      }

      await transaction`
        insert into public.celebration_journeys (invoice_id, delivery_at, journey_status, fulfilment_mode, special_request)
        values (${invoiceId}, ${deliveryAt}, 'confirmed', ${fulfilmentMode}, ${specialRequest})
      `;
      await transaction`
        insert into public.celebration_media_requirements (invoice_id, minimum_photos, minimum_videos)
        values (${invoiceId}, 3, 1)
      `;
      await transaction`
        insert into public.important_dates (customer_id, recipient_id, title, date, recurring, notes)
        values (${customerId}, ${recipientId}, ${occasion}, ${deliveryDate || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date())}, false, 'Created from confirmed WhatsApp conversation')
      `;

      const tasks: Array<{ title: string; kind: string; dueAt: Date | null }> = [];
      const seen = new Set<string>();
      const addTask = (title: string, kind: string, dueAt: Date | null = deliveryAt) => {
        if (seen.has(title)) return;
        seen.add(title);
        tasks.push({ title, kind, dueAt });
      };
      for (const field of draft.missing_fields) {
        const missing = missingTask(field);
        addTask(`URGENT · ${missing.title}`, missing.kind, new Date());
      }
      addTask("Confirm the extracted order details with the customer", "address");
      for (const item of items) {
        const description = text(item.description)!;
        const category = text(item.category)?.toLowerCase() || null;
        addTask(`Arrange ${description}`, itemKind(category));
      }
      if (amount(snapshot.receipt?.amount)) addTask("Verify the submitted receipt against the bank", "other", new Date());
      if (agreedCurrency !== "LKR" && extractedAmount) addTask(`Convert ${agreedCurrency} ${extractedAmount} and confirm the LKR total`, "other", new Date());
      addTask("Prepare and pack the celebration", "packing");
      addTask("Confirm recipient and delivery access", "delivery");
      addTask("Complete the surprise delivery", "delivery");
      addTask("Upload at least 3 photos and 1 video", "media");
      for (const [index, task] of tasks.entries()) {
        await transaction`
          insert into public.celebration_tasks (invoice_id, title, kind, due_at, sort_order)
          values (${invoiceId}, ${task.title}, ${task.kind}, ${task.dueAt}, ${index})
        `;
      }

      await transaction`update public.whatsapp_conversations set customer_id = ${customerId} where id = ${conversationId}::uuid`;
      await transaction`update public.whatsapp_messages set invoice_id = ${invoiceId} where conversation_id = ${conversationId}::uuid`;
      await transaction`update public.ai_order_drafts set invoice_id = ${invoiceId}, updated_at = now() where id = ${draft.id}::uuid`;

      const facts: Array<[string, unknown]> = [
        ["sender.name", snapshot.sender?.name], ["sender.phone", snapshot.sender?.phone], ["sender.country", snapshot.sender?.country],
        ["recipient.name", snapshot.recipient?.name], ["recipient.phone", snapshot.recipient?.phone], ["occasion", snapshot.occasion],
        ["delivery.date", snapshot.delivery?.date], ["delivery.time", snapshot.delivery?.time], ["delivery.address", snapshot.delivery?.address],
        ["delivery.district", snapshot.delivery?.district], ["items", snapshot.items], ["agreedPrice", snapshot.agreedPrice], ["receipt", snapshot.receipt],
        ["specialRequest", snapshot.specialRequest], ["fulfilmentMode", snapshot.fulfilmentMode],
      ];
      for (const [fieldPath, value] of facts) {
        if (value == null || value === "" || (Array.isArray(value) && !value.length)) continue;
        await transaction`
          insert into public.ai_extracted_facts (invoice_id, field_path, value, confidence, source_message_ids, confirmed_at)
          values (${invoiceId}, ${fieldPath}, ${transaction.json(JSON.parse(JSON.stringify(value)))}, ${draft.confidence[fieldPath] ?? null}, ${draft.source_message_ids}, now())
        `;
      }

      return { orderId: invoiceId, alreadyCreated: false };
    });
    return NextResponse.json(result, { status: result.alreadyCreated ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NO_DRAFT") return NextResponse.json({ error: "No extracted draft exists for this conversation" }, { status: 404 });
    if (message === "NOT_CONFIRMED") return NextResponse.json({ error: "Confirm the extracted details before creating a celebration" }, { status: 409 });
    console.error("Celebration creation failed", error);
    return NextResponse.json({ error: "The celebration could not be created. No partial records were saved." }, { status: 500 });
  }
}
