// The frozen contents of an issued quote/invoice/receipt. Drafts are rendered
// from the same shape, built from live data.

export type DocumentKind = "quote" | "invoice" | "receipt";

export type DocumentSnapshot = {
  kind: DocumentKind;
  number: string | null;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  business: { name: string; tagline: string; phone: string; email: string; address: string; website: string; logoKey: string | null };
  customer: { name: string; phone: string; country: string };
  recipient: { name: string; city: string; address: string };
  order: { number: string; occasion: string; deliveryDate: string | null };
  /** What's in the package. Older snapshots also carry per-item prices; they're never shown. */
  items: { description: string; quantity: number; unitPrice?: number; amount?: number }[];
  /** One price for the whole package, delivery included. Missing on older snapshots. */
  packagePrice?: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paidToDate: number;
  balance: number;
  /** Invoice asking for part of the total, e.g. a 50% advance. */
  amountRequested: number | null;
  payment: { amount: number; method: string; reference: string; receivedOn: string } | null;
  terms: { title: string; body: string }[];
  paymentInstructions: string;
  bankDetails: string;
  footer: string;
  notes: string;
};

export const DOCUMENT_LABELS: Record<DocumentKind, string> = { quote: "Quotation", invoice: "Invoice", receipt: "Payment receipt" };
