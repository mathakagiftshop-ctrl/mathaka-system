import { GoogleGenAI } from "@google/genai";
import { config } from "./config.js";
import { sql } from "./database.js";

const ai = new GoogleGenAI({
  vertexai: true,
  project: config.googleCloudProject,
  location: config.googleCloudLocation,
  apiVersion: "v1",
});

function extractionPrompt() { return `You extract a single draft gift order from a WhatsApp conversation for Mathaka Gift Shop in Sri Lanka.
Today is ${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())} in Sri Lanka.

Read the complete transcript and merge facts across messages. Later corrections override earlier details. Distinguish the customer/sender from the gift recipient. Resolve relative dates using today's Sri Lankan date when the transcript provides enough context.

Return JSON only with exactly this shape:
{
  "sender": {"name": null, "phone": null, "country": null},
  "recipient": {"name": null, "phone": null},
  "occasion": null,
  "delivery": {"date": null, "time": null, "address": null, "district": null},
  "items": [{"category": "cake|flowers|gift|other", "description": ""}],
  "agreedPrice": {"amount": null, "currency": null},
  "receipt": {"amount": null, "currency": null, "date": null, "reference": null},
  "missingFields": [],
  "confidence": {},
  "specialRequest": null,
  "fulfilmentMode": "self|partner|hybrid"
}

Rules:
- Do not invent facts. Use null for unknown values.
- Dates must be YYYY-MM-DD and times HH:mm when resolvable.
- A receipt is customer-submitted evidence, never verified bank payment.
- missingFields contains dot paths for operationally important facts still unknown.
- confidence maps populated dot paths to numbers from 0 to 1.`; }

type TranscriptMessage = {
  external_message_id: string;
  direction: "inbound" | "outbound";
  body: string;
  sent_at: Date | string;
};

function safeSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Gemini returned an invalid order draft");
  }
  const raw = value as Record<string, unknown>;
  const text = (input: unknown, max = 1000) => typeof input === "string" && input.trim() ? input.trim().slice(0, max) : null;
  const object = (input: unknown) => input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const numeric = (input: unknown) => typeof input === "number" && Number.isFinite(input) && input >= 0 ? input : null;
  const sender = object(raw.sender); const recipient = object(raw.recipient); const delivery = object(raw.delivery);
  const agreed = object(raw.agreedPrice); const receipt = object(raw.receipt);
  const date = (input: unknown) => { const result = text(input, 10); return result && /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null; };
  const time = (input: unknown) => { const result = text(input, 5); return result && /^([01]\d|2[0-3]):[0-5]\d$/.test(result) ? result : null; };
  const currency = (input: unknown) => { const result = text(input, 3)?.toUpperCase() ?? null; return result && /^[A-Z]{3}$/.test(result) ? result : null; };
  const items = Array.isArray(raw.items) ? raw.items.slice(0, 50).flatMap((input) => {
    const item = object(input); const description = text(item.description, 500); if (!description) return [];
    const category = ["cake", "flowers", "gift", "other"].includes(String(item.category)) ? String(item.category) : "other";
    return [{ category, description }];
  }) : [];
  const snapshot = {
    sender: { name: text(sender.name, 160), phone: text(sender.phone, 80), country: text(sender.country, 120) },
    recipient: { name: text(recipient.name, 160), phone: text(recipient.phone, 80) },
    occasion: text(raw.occasion, 160),
    delivery: { date: date(delivery.date), time: time(delivery.time), address: text(delivery.address), district: text(delivery.district, 160) },
    items, agreedPrice: { amount: numeric(agreed.amount), currency: currency(agreed.currency) },
    receipt: { amount: numeric(receipt.amount), currency: currency(receipt.currency), date: date(receipt.date), reference: text(receipt.reference, 160) },
    specialRequest: text(raw.specialRequest, 2000),
    fulfilmentMode: ["self", "partner", "hybrid"].includes(String(raw.fulfilmentMode)) ? String(raw.fulfilmentMode) : "self",
  };
  const missingFields = Array.isArray(raw.missingFields)
    ? raw.missingFields.map(String).slice(0, 100)
    : [];
  const rawConfidence = typeof raw.confidence === "object" && raw.confidence && !Array.isArray(raw.confidence)
    ? raw.confidence as Record<string, unknown>
    : {};
  const confidence = Object.fromEntries(Object.entries(rawConfidence).flatMap(([key, score]) => typeof score === "number" && Number.isFinite(score) ? [[key.slice(0, 100), Math.min(Math.max(score, 0), 1)]] : []));
  return { snapshot, missingFields, confidence };
}

export async function extractConversationDraft(params: { conversationId: string }) {
  const newestFirst = await sql<TranscriptMessage[]>`
    select external_message_id, direction, body, sent_at
    from public.whatsapp_messages
    where conversation_id = ${params.conversationId}::uuid
      and nullif(trim(body), '') is not null
    order by sent_at desc
    limit 180
  `;
  const messages = newestFirst.reverse();
  if (!messages.length) throw new Error("This conversation has no text messages to extract");

  const transcript = messages.map((message) => {
    const speaker = message.direction === "inbound" ? "Customer" : "Mathaka";
    return `[${new Date(message.sent_at).toISOString()}] ${speaker}: ${message.body}`;
  }).join("\n").slice(-60_000);

  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents: `${extractionPrompt()}\n\nWhatsApp transcript:\n${transcript}`,
    config: { responseMimeType: "application/json", temperature: 0.1 },
  });
  if (!response.text) throw new Error("Gemini returned no extraction text");
  const { snapshot, missingFields, confidence } = safeSnapshot(JSON.parse(response.text));

  return sql.begin(async (transaction) => {
    const sources = messages.map((message) => message.external_message_id);
    const current = await transaction<{ id: string; invoice_id: number | null; status: string; revision: number }[]>`
      select id::text, invoice_id, status, revision from public.ai_order_drafts where conversation_id=${params.conversationId}::uuid for update
    `;
    const protectedDraft = current[0] && (current[0].invoice_id != null || current[0].status === "confirmed");
    let row: { id: string; revision: number } | undefined;
    if (!current[0]) {
      [row] = await transaction<{ id: string; revision: number }[]>`
        insert into public.ai_order_drafts (conversation_id,snapshot,missing_fields,confidence,source_message_ids,status)
        values (${params.conversationId}::uuid,${transaction.json(snapshot)},${missingFields},${transaction.json(confidence)},${sources},'draft') returning id::text,revision
      `;
    } else if (protectedDraft) {
      [row] = await transaction<{ id: string; revision: number }[]>`
        update public.ai_order_drafts set revision=revision+1,updated_at=now() where id=${current[0].id}::uuid returning id::text,revision
      `;
    } else {
      [row] = await transaction<{ id: string; revision: number }[]>`
        update public.ai_order_drafts set snapshot=${transaction.json(snapshot)},missing_fields=${missingFields},confidence=${transaction.json(confidence)},source_message_ids=${sources},status='draft',revision=revision+1,updated_at=now()
        where id=${current[0].id}::uuid returning id::text,revision
      `;
    }
    if (!row) throw new Error("The AI draft could not be saved");
    await transaction`
      insert into public.ai_order_draft_revisions (draft_id,revision,snapshot,missing_fields,confidence,source_message_ids,source)
      values (${row.id}::uuid,${row.revision},${transaction.json(snapshot)},${missingFields},${transaction.json(confidence)},${sources},'ai')
      on conflict (draft_id,revision) do nothing
    `;
    return row.id;
  });
}
