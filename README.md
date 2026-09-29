# Mathaka Celebration Studio

The back office for Mathaka: Sri Lankans working in the Gulf order surprise cakes and gifts for family at home (via Meta ads and WhatsApp). Partners, usually home cake makers found on Facebook, make and deliver them, and Mathaka keeps the commission. Profit is split between the two owners (80/20 by default).

## What it does

| Area | What you can do |
|---|---|
| **Today** | Deliveries this week, who still owes money, orders without a partner, orders to close |
| **Orders** | Take an order (customer abroad, recipient in Sri Lanka, items, delivery fee, discount), move it through *Enquiry → Confirmed → Being prepared → Out for delivery → Delivered → Completed*, one-tap WhatsApp messages to the customer |
| **Partners** | Partner profiles with home town, delivery radius and extra towns; **partner finder** by town + date (who covers it, how far, already busy that day); coverage map; assign jobs with an agreed price; **advances** (for a job or general) and payments; running balance (we owe them / advance with them) |
| **Partner link** | A private page partners open from WhatsApp to accept the job, mark it ready or delivered and upload photos and video. No login needed |
| **Invoices** | Advance invoice (e.g. 50%), full invoice, quotation, payment receipts; logo, bank details and footer from Settings; tick terms on or off per invoice and add a one-off condition; issued documents are frozen and numbered (INV-0001); **Send on WhatsApp** with a link the customer opens and saves as PDF |
| **Payments** | Record customer payments (with slip upload), verify when they show in the bank, reverse mistakes |
| **Expenses** | Business costs by category (Meta ads, packaging, phone…) plus extra costs per order |
| **Reports & map** | Monthly sales → partner costs → commission → business costs → net profit and the **80/20 split**; close a month to lock its numbers; Meta ad cost per order; 12-month history; **Sri Lanka map** of orders and completed deliveries per town; towns with orders but no partner; busiest partners |
| **Customers** | Everyone who ordered and who they celebrated; repeat customers; start a new order for them |
| **Settings** | Business details and logo, invoice numbering and bank details, terms library, profit split, team accounts (owner / manager / staff) |

Staff accounts see orders and partners but no money.

## How money is counted

Rules live in `lib/money.ts` (unit-tested) and the `order_summary` / `partner_balances` views in `db/migrations/0002_money_views.sql`.

- **Order commission** = what the customer pays − agreed partner amounts − extra costs for that order.
- An order counts in the month of its **delivery date**. A cancelled order counts only money you kept.
- **Net profit** for a month = commissions − business expenses (ads, packaging…) spent that month.
- **Split**: the first person gets the % set in Settings and the other gets the rest. **Closing a month** stores its figures and split, so later edits or a new ratio don't change it.
- **Partner balance** = agreed job amounts − payments. A negative balance is an advance you've paid ahead.

## Run it locally

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, MATHAKA_OWNER_EMAIL, storage keys
npm run db:migrate
npm run dev
```

Open the app and go to `/login`. On an empty database it asks you to create the owner account. The email must match `MATHAKA_OWNER_EMAIL`. Add your team from Settings → Team.

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Storage (logo, payment slips, photos)

Any S3-compatible bucket works (Cloudflare R2, Backblaze B2, Supabase Storage S3, Tigris…). Set the `S3_*` variables. The bucket should be **private**: the app hands out short-lived signed links.

Photos and videos upload straight from the browser to the bucket, so the bucket needs a **CORS rule** allowing `PUT` from your site:

```json
[{ "AllowedOrigins": ["https://your-domain", "http://localhost:3000"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600 }]
```

## Deploy (Vercel + Neon)

1. Import the repo into Vercel.
2. Add the variables from `.env.example`. Use Neon's **pooled** connection string (host contains `-pooler`).
3. Run `npm run db:migrate` against the production database (from your machine with the production `DATABASE_URL`) before the first deploy and after pulling new migrations.
4. Open `/login` on the live site and create the owner account.

Backups: Neon keeps point-in-time history (the length depends on the plan). Check it covers at least 7 days before storing real money records.

## Code map

- `app/`: pages and server actions (`actions.ts` next to each area)
- `lib/data/`: database queries
- `lib/money.ts`, `lib/cities.ts`, `lib/whatsapp.ts`: pure logic (tested in `tests/`)
- `lib/auth.ts`, `lib/password.ts`: email and password sign-in with database sessions (scrypt hashes, httpOnly cookie, lockout after repeated failures)
- `db/migrations/`: SQL schema, applied in order by `scripts/migrate.mjs`
- `components/`: shared UI, including the Leaflet map (`sri-lanka-map.tsx`) and the invoice layout (`document-paper.tsx`)
