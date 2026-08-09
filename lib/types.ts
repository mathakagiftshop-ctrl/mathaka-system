export type FulfilmentMode = "Self" | "Partner" | "Hybrid";
export type OrderStatus = "Draft" | "Confirmed" | "Preparing" | "Delivery" | "Memories" | "Reconciled";
export type Attention = "urgent" | "watch" | "clear";

export interface OrderTask {
  id: string;
  title: string;
  assignee: string;
  due: string;
  complete: boolean;
  kind: "gift" | "cake" | "flowers" | "packing" | "address" | "delivery" | "media" | "other";
}

export interface CelebrationItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
}

export interface CelebrationUpdate {
  id: string;
  body: string;
  status: "draft" | "queued" | "sent" | "failed" | "cancelled";
  createdAt: string;
}

export interface CelebrationMedia {
  id: string;
  kind: "photo" | "video";
  storagePath: string;
  caption: string | null;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  label: string;
  amount: number;
  type: "revenue" | "expense" | "partner";
  status: "estimated" | "actual";
}

export interface CelebrationOrder {
  id: string;
  recipient: string;
  recipientPhone?: string;
  sender: string;
  senderCountry: string;
  occasion: string;
  date: string;
  dateLabel: string;
  countdown: string;
  district: string;
  address: string;
  deliveryTime?: string;
  mode: FulfilmentMode;
  status: OrderStatus;
  progress: number;
  attention: Attention;
  nextAction: string;
  paid: number;
  total?: number;
  currencyNote: string;
  estimatedProfit: number;
  moneyStatus: string;
  items: string[];
  itemDetails?: CelebrationItem[];
  specialRequest: string;
  tasks: OrderTask[];
  ledger: LedgerEntry[];
  photos: number;
  videos: number;
  requiredPhotos: number;
  requiredVideos: number;
  revision?: number;
  conversationId?: string | null;
  updates?: CelebrationUpdate[];
  media?: CelebrationMedia[];
}

export interface Partner {
  id: string;
  name: string;
  phone?: string | null;
  location: string;
  services: string[];
  reliability: number;
  openOrders: number;
  balance: number;
  response: string;
}

export interface ExtractionResult {
  delivery: { date?: string; time?: string; address?: string; district?: string };
  sender: { name?: string; phone?: string };
  recipient: { name?: string; phone?: string };
  occasion?: string;
  items: Array<{ category: "cake" | "flowers" | "gift" | "other"; description: string }>;
  agreedPrice?: { amount: number; currency: string };
  receipt?: { amount?: number; currency?: string; date?: string; reference?: string };
  missingFields: string[];
  confidence: Record<string, number>;
  sourceMessageIds: string[];
}
