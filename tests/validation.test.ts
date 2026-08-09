import { describe, expect, it } from "vitest";
import { draftPatchSchema, draftSnapshotSchema, manualCelebrationSchema, mediaCreateSchema, orderPatchSchema, partnerCreateSchema, taskPatchSchema } from "@/lib/server/validation";

const validDraft = {
  sender: { name: "Nadeesha", phone: "+94770000000", country: "Australia" },
  recipient: { name: "Isuri", phone: "0770000000" },
  occasion: "Birthday",
  delivery: { date: "2026-08-09", time: "18:30", address: "Colombo 05", district: "Colombo" },
  items: [{ category: "cake", description: "Vanilla raspberry cake" }],
  agreedPrice: { amount: 15000, currency: "LKR" },
  receipt: { amount: null, currency: null, date: null, reference: null },
  specialRequest: "Keep it a surprise",
  fulfilmentMode: "hybrid",
};

describe("AI draft validation", () => {
  it("accepts a complete normalized draft", () => {
    expect(draftSnapshotSchema.parse(validDraft)).toEqual(validDraft);
  });

  it("rejects invalid dates, currencies, categories, and negative money", () => {
    expect(draftSnapshotSchema.safeParse({ ...validDraft, delivery: { ...validDraft.delivery, date: "09/08/2026" } }).success).toBe(false);
    expect(draftSnapshotSchema.safeParse({ ...validDraft, agreedPrice: { amount: -1, currency: "rupees" } }).success).toBe(false);
    expect(draftSnapshotSchema.safeParse({ ...validDraft, items: [{ category: "car", description: "Gift" }] }).success).toBe(false);
  });

  it("requires a mutation or transition and validates optimistic revisions", () => {
    expect(draftPatchSchema.safeParse({}).success).toBe(false);
    expect(draftPatchSchema.safeParse({ snapshot: validDraft, expectedRevision: 2 }).success).toBe(true);
    expect(draftPatchSchema.safeParse({ action: "confirm", expectedRevision: 0 }).success).toBe(false);
  });
});

describe("celebration mutation validation", () => {
  it("accepts an operational update", () => {
    expect(orderPatchSchema.safeParse({ status: "Preparing", mode: "Partner", deliveryDate: "2026-08-12", deliveryTime: "17:45" }).success).toBe(true);
  });

  it("rejects unknown fields and invalid task timestamps", () => {
    expect(orderPatchSchema.safeParse({ mystery: true }).success).toBe(false);
    expect(taskPatchSchema.safeParse({ dueAt: "tomorrow" }).success).toBe(false);
  });

  it("accepts a complete manual celebration and rejects an empty item list", () => {
    const manual = { sender: "Sachin", senderPhone: "+94770000000", recipient: "Amaya", occasion: "Anniversary", items: ["Flowers"], total: 12000 };
    expect(manualCelebrationSchema.safeParse(manual).success).toBe(true);
    expect(manualCelebrationSchema.safeParse({ ...manual, items: [] }).success).toBe(false);
  });

  it("validates partner quality data and media storage metadata", () => {
    expect(partnerCreateSchema.safeParse({ name: "Bloom Studio", services: ["flowers"], serviceAreas: ["Colombo"], reliability: 98 }).success).toBe(true);
    expect(partnerCreateSchema.safeParse({ name: "Bloom Studio", reliability: 120 }).success).toBe(false);
    expect(mediaCreateSchema.safeParse({ kind: "photo", storagePath: "celebrations/1/example.jpg" }).success).toBe(true);
    expect(mediaCreateSchema.safeParse({ kind: "document", storagePath: "receipt.pdf" }).success).toBe(false);
  });
});
