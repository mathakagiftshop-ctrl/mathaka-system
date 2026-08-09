import type { CelebrationOrder, Partner } from "./types";

const baseTasks = [
  { id: "gift", title: "Pick up the keepsake gift", assignee: "Sachin", due: "Today", complete: true, kind: "gift" as const },
  { id: "cake", title: "Finish raspberry ribbon cake", assignee: "Sweet Bloom", due: "Tomorrow · 10:00", complete: false, kind: "cake" as const },
  { id: "flowers", title: "Arrange marigold & blush bouquet", assignee: "Nimali", due: "Tomorrow · 12:00", complete: true, kind: "flowers" as const },
  { id: "packing", title: "Pack gifts and handwritten card", assignee: "You", due: "Tomorrow · 14:00", complete: false, kind: "packing" as const },
  { id: "address", title: "Confirm recipient is at home", assignee: "You", due: "Tomorrow · 16:00", complete: true, kind: "address" as const },
  { id: "delivery", title: "Deliver the surprise", assignee: "Kasun", due: "Aug 09 · 18:00", complete: false, kind: "delivery" as const },
  { id: "media", title: "Upload 3 photos and 1 video", assignee: "Kasun", due: "After delivery", complete: false, kind: "media" as const },
];

export const orders: CelebrationOrder[] = [
  {
    id: "isuri-birthday", recipient: "Isuri Perera", sender: "Nadeesha Perera", senderCountry: "Dubai, UAE", occasion: "Birthday surprise", date: "2026-08-09", dateLabel: "Sun, 9 Aug · 6:30 PM", countdown: "2 days", district: "Colombo 05", address: "42 Havelock Road, Colombo 05", mode: "Hybrid", status: "Preparing", progress: 62, attention: "urgent", nextAction: "Choose cake quote", paid: 48500, currencyNote: "AED 590 · settled LKR 48,500", estimatedProfit: 12850, moneyStatus: "Payment verified", items: ["1 kg vanilla raspberry cake", "Marigold & blush bouquet", "Silver initial necklace", "Handwritten message card"], specialRequest: "Please call the recipient only after reaching the gate. Keep the sender anonymous until the card is opened.", tasks: baseTasks, photos: 3, videos: 0, requiredPhotos: 3, requiredVideos: 1,
    ledger: [
      { id: "r1", label: "Customer settlement", amount: 48500, type: "revenue", status: "actual" },
      { id: "e1", label: "Keepsake gift", amount: 9200, type: "expense", status: "actual" },
      { id: "e2", label: "Flowers", amount: 4800, type: "partner", status: "actual" },
      { id: "e3", label: "Cake", amount: 6500, type: "partner", status: "estimated" },
      { id: "e4", label: "Packing & delivery", amount: 4300, type: "expense", status: "estimated" },
      { id: "e5", label: "Gateway & ad allocation", amount: 850, type: "expense", status: "actual" },
    ],
  },
  { id: "amal-anniversary", recipient: "Amal & Ruwani", sender: "Dilan Fernando", senderCountry: "Doha, Qatar", occasion: "Anniversary", date: "2026-08-08", dateLabel: "Sat, 8 Aug · 7:00 PM", countdown: "Tomorrow", district: "Kandy", address: "Peradeniya Road, Kandy", mode: "Partner", status: "Delivery", progress: 84, attention: "urgent", nextAction: "Verify payment receipt", paid: 62000, currencyNote: "QAR 760 · receipt pending", estimatedProfit: 17400, moneyStatus: "Receipt needs review", items: ["Dinner table arrangement", "Chocolate cake", "Red rose bouquet"], specialRequest: "Photograph the table before the couple arrives.", tasks: baseTasks.map((t, i) => ({ ...t, id: `a-${t.id}`, complete: i < 5 })), ledger: [], photos: 0, videos: 0, requiredPhotos: 4, requiredVideos: 1 },
  { id: "sahan-graduation", recipient: "Sahan Jayasinghe", sender: "Thilini Jayasinghe", senderCountry: "Abu Dhabi, UAE", occasion: "Graduation", date: "2026-08-14", dateLabel: "Fri, 14 Aug · 4:00 PM", countdown: "7 days", district: "Galle", address: "Fort, Galle", mode: "Self", status: "Confirmed", progress: 28, attention: "watch", nextAction: "Buy fountain pen", paid: 36000, currencyNote: "AED 438 · settled", estimatedProfit: 11200, moneyStatus: "Paid in full", items: ["Engraved fountain pen", "Congratulations cake", "Photo garland"], specialRequest: "Use university colors for the cake accent.", tasks: baseTasks.map(t => ({ ...t, id: `s-${t.id}`, complete: false })), ledger: [], photos: 0, videos: 0, requiredPhotos: 3, requiredVideos: 1 },
  { id: "naomi-birthday", recipient: "Naomi Raj", sender: "Arun Raj", senderCountry: "Muscat, Oman", occasion: "Birthday", date: "2026-08-22", dateLabel: "Sat, 22 Aug · 11:00 AM", countdown: "15 days", district: "Jaffna", address: "Temple Road, Jaffna", mode: "Partner", status: "Preparing", progress: 45, attention: "watch", nextAction: "Partner confirmation", paid: 42000, currencyNote: "OMR 52 · settled", estimatedProfit: 9700, moneyStatus: "Advance received", items: ["Pastel cake", "Books gift box", "Fresh flowers"], specialRequest: "Include one Tamil message card and one English card.", tasks: baseTasks.map(t => ({ ...t, id: `n-${t.id}`, complete: t.kind === "address" })), ledger: [], photos: 0, videos: 0, requiredPhotos: 3, requiredVideos: 1 },
  { id: "vinu-welcome", recipient: "Vinu Silva", sender: "Ishara Silva", senderCountry: "Kuwait City, Kuwait", occasion: "Welcome home", date: "2026-08-27", dateLabel: "Thu, 27 Aug · 9:00 AM", countdown: "20 days", district: "Kurunegala", address: "Lake Road, Kurunegala", mode: "Hybrid", status: "Draft", progress: 10, attention: "clear", nextAction: "Confirm delivery time", paid: 0, currencyNote: "Quote LKR 55,000", estimatedProfit: 13800, moneyStatus: "Awaiting confirmation", items: ["Breakfast hamper", "Welcome banner", "Sunflower arrangement"], specialRequest: "Use low-sugar items in the hamper.", tasks: baseTasks.map(t => ({ ...t, id: `v-${t.id}`, complete: false })), ledger: [], photos: 0, videos: 0, requiredPhotos: 3, requiredVideos: 1 },
];

export const partners: Partner[] = [
  { id: "sweet-bloom", name: "Sweet Bloom Cakes", location: "Colombo · 8 km", services: ["Cakes", "Dessert boxes"], reliability: 96, openOrders: 2, balance: 6500, response: "Quoted LKR 6,500 · available" },
  { id: "petal-post", name: "Petal Post", location: "Colombo · 5 km", services: ["Flowers", "Gift styling"], reliability: 98, openOrders: 1, balance: 4800, response: "Assigned · ready tomorrow" },
  { id: "kandy-moments", name: "Kandy Moments", location: "Kandy · 3 km", services: ["Full surprise", "Delivery"], reliability: 93, openOrders: 3, balance: 18500, response: "Needs final balance" },
  { id: "northern-bakes", name: "Northern Bakes", location: "Jaffna · 6 km", services: ["Cakes", "Flowers"], reliability: 91, openOrders: 1, balance: 0, response: "Awaiting quote reply" },
];

export const getOrder = (id: string) => orders.find((order) => order.id === id) ?? orders[0];
export const formatLkr = (amount: number) => `LKR ${amount.toLocaleString("en-LK")}`;
