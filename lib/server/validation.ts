import { z } from "zod";

const optionalText = (max = 500) => z.string().trim().max(max).nullable().optional();
const money = z.number().finite().nonnegative().max(100_000_000).nullable().optional();

export const draftSnapshotSchema = z.object({
  sender: z.object({ name: optionalText(160), phone: optionalText(80), country: optionalText(120) }).default({}),
  recipient: z.object({ name: optionalText(160), phone: optionalText(80) }).default({}),
  occasion: optionalText(160),
  delivery: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    address: optionalText(1000),
    district: optionalText(160),
  }).default({}),
  items: z.array(z.object({
    category: z.enum(["cake", "flowers", "gift", "other"]).default("other"),
    description: z.string().trim().min(1).max(500),
  })).max(50).default([]),
  agreedPrice: z.object({ amount: money, currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).nullable().optional() }).default({}),
  receipt: z.object({
    amount: money,
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).nullable().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    reference: optionalText(160),
  }).default({}),
  specialRequest: optionalText(2000),
  fulfilmentMode: z.enum(["self", "partner", "hybrid"]).default("self"),
}).strict();

export type DraftSnapshot = z.infer<typeof draftSnapshotSchema>;

export const draftPatchSchema = z.object({
  snapshot: draftSnapshotSchema.optional(),
  expectedRevision: z.number().int().positive().optional(),
  action: z.enum(["confirm", "discard"]).optional(),
}).refine((value) => value.snapshot || value.action, "A snapshot or action is required");

export const orderPatchSchema = z.object({
  sender: z.string().trim().min(1).max(160).optional(),
  senderCountry: z.string().trim().max(120).nullable().optional(),
  recipient: z.string().trim().min(1).max(160).optional(),
  recipientPhone: z.string().trim().max(80).nullable().optional(),
  occasion: z.string().trim().min(1).max(160).optional(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  deliveryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  district: z.string().trim().max(160).nullable().optional(),
  address: z.string().trim().max(1000).nullable().optional(),
  mode: z.enum(["Self", "Partner", "Hybrid"]).optional(),
  status: z.enum(["Draft", "Confirmed", "Preparing", "Delivery", "Memories", "Reconciled"]).optional(),
  specialRequest: z.string().trim().max(2000).nullable().optional(),
  total: z.number().finite().nonnegative().max(100_000_000).optional(),
  requiredPhotos: z.number().int().min(0).max(100).optional(),
  requiredVideos: z.number().int().min(0).max(20).optional(),
  expectedRevision: z.number().int().positive().optional(),
  items: z.array(z.object({
    id: z.string().optional(),
    description: z.string().trim().min(1).max(500),
    quantity: z.number().int().min(1).max(999).default(1),
    unitPrice: z.number().finite().nonnegative().max(100_000_000).default(0),
    costPrice: z.number().finite().nonnegative().max(100_000_000).default(0),
  })).max(100).optional(),
}).strict();

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  kind: z.enum(["gift", "cake", "flowers", "packing", "address", "delivery", "media", "other"]).default("other"),
  assignee: z.string().trim().max(160).nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export const taskPatchSchema = taskCreateSchema.partial().extend({ complete: z.boolean().optional() });
export const updateCreateSchema = z.object({ body: z.string().trim().min(1).max(4000) });
export const expenseCreateSchema = z.object({ description: z.string().trim().min(1).max(300), amount: z.number().positive().max(100_000_000), notes: optionalText(1000) });
export const paymentCreateSchema = z.object({ amount: z.number().positive().max(100_000_000), paymentMethod: z.string().trim().max(80).default("bank_transfer"), notes: optionalText(1000) });
export const partnerCreateSchema = z.object({ name: z.string().trim().min(1).max(160), phone: optionalText(80), address: optionalText(500), notes: optionalText(1000), services: z.array(z.string().trim().min(1).max(80)).max(30).default([]), serviceAreas: z.array(z.string().trim().min(1).max(120)).max(50).default([]), reliability: z.number().min(0).max(100).default(100) });
export const mediaCreateSchema = z.object({ kind: z.enum(["photo", "video"]), storagePath: z.string().trim().min(1).max(1000), caption: optionalText(500) });

export const manualCelebrationSchema = z.object({
  sender: z.string().trim().min(1).max(160), senderPhone: z.string().trim().min(3).max(80), senderCountry: optionalText(120),
  recipient: z.string().trim().min(1).max(160), recipientPhone: optionalText(80), occasion: z.string().trim().min(1).max(160),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), deliveryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  address: optionalText(1000), district: optionalText(160), mode: z.enum(["Self", "Partner", "Hybrid"]).default("Self"),
  specialRequest: optionalText(2000), total: z.number().finite().nonnegative().max(100_000_000).default(0),
  items: z.array(z.string().trim().min(1).max(500)).min(1).max(100),
});
