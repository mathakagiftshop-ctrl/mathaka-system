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
export const businessSettingsSchema=z.object({name:z.string().trim().min(1).max(160),email:optionalText(160),phone:optionalText(80),address:optionalText(1000),registrationNumber:optionalText(120),taxIdentifier:optionalText(120),currency:z.string().regex(/^[A-Z]{3}$/).default("LKR"),timezone:z.string().trim().min(1).max(80).default("Asia/Colombo")}).strict();
export const invoiceSettingsSchema=z.object({numberPrefix:z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9-]+$/),numberPadding:z.number().int().min(3).max(12),defaultDueDays:z.number().int().min(0).max(365),defaultTerms:z.string().max(10000),paymentInstructions:z.string().max(5000),bankDetails:z.record(z.string(),z.string().max(500)),defaultDepositPercent:z.number().min(0).max(100),footerText:z.string().max(2000)}).strict();
export const memberInviteSchema=z.object({email:z.email().trim().toLowerCase(),displayName:optionalText(160),role:z.enum(["manager","staff"])}).strict();
export const memberPatchSchema=z.object({role:z.enum(["owner","manager","staff"]).optional(),status:z.enum(["active","suspended"]).optional()}).strict();
const billingItem=z.object({description:z.string().trim().min(1).max(500),quantity:z.number().positive().max(999),unitPrice:z.number().nonnegative().max(100_000_000),discount:z.number().nonnegative().default(0),taxAmount:z.number().nonnegative().default(0)});
export const billingDraftSchema=z.object({documentType:z.enum(["quote","proforma","invoice","receipt","credit_note"]).default("invoice"),currency:z.string().regex(/^[A-Z]{3}$/).default("LKR"),issueDate:z.string().date().optional(),dueDate:z.string().date().optional(),requestedPaymentAmount:money,items:z.array(billingItem).min(1).max(100).optional(),discount:z.number().nonnegative().default(0),deliveryFee:z.number().nonnegative().default(0),taxAmount:z.number().nonnegative().default(0),terms:z.string().max(10000).optional()}).strict();
export const billingPatchSchema=billingDraftSchema.partial().extend({expectedRevision:z.number().int().positive()}).strict();
export const billingVoidSchema=z.object({reason:z.string().trim().min(3).max(1000)});
export const billingShareSchema=z.object({expiresInHours:z.number().int().min(1).max(720).default(168)});
export const verifiedPaymentCreateSchema=z.object({amount:z.number().positive().max(100_000_000),paymentMethod:z.string().trim().max(80).default("bank_transfer"),receivedAt:z.string().datetime({offset:true}).optional(),reference:optionalText(160),proofStoragePath:optionalText(1000),verificationStatus:z.enum(["pending","verified"]).default("pending"),billingDocumentId:z.uuid().optional(),notes:optionalText(1000)}).strict();
export const studioSectionSchema=z.enum(["customers","catalogue","calendar","alerts","reports","inventory","templates"]);
export const catalogItemSchema=z.object({name:z.string().trim().min(1).max(160),category:z.string().trim().min(1).max(80).default("other"),description:optionalText(1000),unitPrice:z.number().nonnegative().max(100_000_000).default(0),costPrice:z.number().nonnegative().max(100_000_000).default(0),active:z.boolean().default(true)}).strict();
export const inventoryItemSchema=z.object({name:z.string().trim().min(1).max(160),catalogItemId:z.uuid().nullable().optional(),sku:optionalText(80),unit:z.string().trim().min(1).max(40).default("item"),quantityOnHand:z.number().min(-1_000_000).max(1_000_000).default(0),reorderLevel:z.number().nonnegative().max(1_000_000).default(0),active:z.boolean().default(true)}).strict();
export const inventoryAdjustmentSchema=z.object({inventoryItemId:z.uuid(),quantityDelta:z.number().min(-1_000_000).max(1_000_000).refine(v=>v!==0),reason:z.string().trim().min(1).max(300),reference:optionalText(160)}).strict();
export const taskTemplateSchema=z.object({name:z.string().trim().min(1).max(160),occasion:optionalText(160),active:z.boolean().default(true),steps:z.array(z.object({title:z.string().trim().min(1).max(300),kind:z.enum(["gift","cake","flowers","packing","address","delivery","media","other"]).default("other"),offsetHours:z.number().int().min(-8760).max(8760).default(0)})).min(1).max(100)}).strict();
export const publicApprovalSchema=z.object({decision:z.enum(["approved","declined"]),note:z.string().trim().max(1000).optional()}).strict();
export const termsTemplateSchema=z.object({name:z.string().trim().min(1).max(160),body:z.string().trim().min(1).max(10000),isDefault:z.boolean().default(false),active:z.boolean().default(true)}).strict();
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
