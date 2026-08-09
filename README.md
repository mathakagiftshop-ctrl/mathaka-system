# Mathaka Celebration Studio

A production-oriented celebration operations system for Mathaka Gift Shop. It turns WhatsApp conversations into reviewed celebration drafts, coordinated orders, tasks, partner work, customer updates, finance records, delivery media, and private galleries.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `MATHAKA_OWNER_EMAIL` bootstraps the first owner account; the owner can then invite managers and staff from Settings. Supabase sends one-time sign-in links. Customer galleries, invoice approvals and tokenized partner upload pages remain public.

Useful checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

The WhatsApp worker is a separate process:

```bash
npm --prefix workers/whatsapp install
npm --prefix workers/whatsapp run typecheck
npm --prefix workers/whatsapp run build
npm --prefix workers/whatsapp start
```

## Main routes

- `/` — Today / operational control room
- `/celebrations` — searchable and filterable celebration list
- `/celebrations/new` — create a celebration without a chat
- `/celebrations/:id` — editable order journey, tasks, partners, money and media
- `/partners` — live partner capabilities, reliability and balances
- `/money` — estimated versus reconciled order finances
- `/billing` — quotes, proformas, invoices, advance requests, payment balances and secure sharing
- `/studio` — customers, catalogue, calendar, alerts, reports, stock and task templates
- `/settings` — business identity, invoice defaults, terms, team roles and invitations
- `/settings/connections` — live Supabase, WhatsApp worker and Gemini connection status
- `/approve/:token` — expiring customer quote/proforma review and approval
- `/partner/upload/:token` — scoped private partner work card and upload page
- `/gallery/:token` — expiring private customer gallery

## Architecture

### Vercel / Next.js

The Next.js App Router application hosts the staff UI, customer gallery, partner pages and request/response APIs. Privileged database and storage work remains in server-only modules. Operational pages use authenticated APIs and return explicit errors rather than substituting demo records.

### Supabase

This test project already contains the legacy Mathaka schema (`invoices`, `customers`, `recipients`, `vendors`, payments and expenses). The application reads those records server-side through the IPv4-compatible Supabase pooler and maps invoices into celebration journeys.

`supabase/migrations/202608070002_legacy_compatibility.sql` adds journey tasks, media requirements, private share links, WhatsApp connections/messages/outbox, AI-extracted facts and integration commands without duplicating the legacy order tables. `202608100005_team_billing_settings.sql` adds team membership, business/invoice settings, immutable customer-facing billing documents, payment verification/allocation, catalogue, inventory, task templates and audit records. Apply migrations in timestamp order. All newly added tables have RLS enabled and intentionally have no browser policies yet.

`supabase/migrations/202608070001_initial_schema.sql` is retained only for a brand-new empty Supabase project. Do not apply it to the legacy test project because its customer and recipient table names overlap.

The legacy tables currently have RLS disabled. The new application does not query them with the browser publishable key; reads go through owner-authenticated, server-only Next.js routes using `DATABASE_URL`. Cookie sessions are refreshed by the Next.js proxy and protected routes verify signed Supabase claims. Do not enable direct browser access until explicit RLS policies exist.

Use a private Supabase Storage bucket named `celebration-media` for photos, video and receipt images. Browser uploads use signed upload URLs, so large video does not flow through a Vercel function. `SUPABASE_SERVICE_ROLE_KEY` is required for upload and signed-read operations.

Partner and gallery URLs use high-entropy random tokens. Only a cryptographic hash is stored; purpose, expiry and revocation are checked server-side before returning narrowly scoped data or signed media URLs.

### Gemini 3.6 Flash

The WhatsApp worker uses the Vertex AI Gemini SDK to extract delivery details, sender, recipient, occasion, items, price/receipt metadata, missing fields, confidence and source message IDs. Model output is normalized and validated before it becomes a revisioned draft.

AI output creates or revises a draft. Human edits are audited, optimistic revisions prevent stale saves, and a confirmed or already-linked draft cannot be silently downgraded by re-extraction. Human confirmation remains required for prices, fulfilment assignment and payment verification.

### WhatsApp / Baileys worker

Baileys does **not** run inside a Vercel route. The isolated `mathaka-celebration-whatsapp` Cloud Run worker pool maintains the persistent connection with a dedicated service account and secrets:

1. Maintain the persistent WhatsApp WebSocket connection.
2. Store changing auth keys encrypted at rest—not in local ephemeral files.
3. Normalize inbound chats/media into Supabase `conversations` and `messages`.
4. Trigger extraction jobs and order-draft updates idempotently.
5. Poll or subscribe to `whatsapp_outbox` for approved outbound messages.
6. Record send attempts and failures with bounded exponential retries.

Hide this behind a provider interface so the system can migrate to Meta's official WhatsApp Business API. Use unique external message IDs and idempotency keys to prevent duplicate orders or sends.

## Environment

Copy `.env.example` to `.env.local` when connecting services. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` may be used by the browser. `MATHAKA_OWNER_EMAIL` is used only to bootstrap the first owner; active membership and role permissions control access afterward. `DATABASE_URL`, service-role and worker secrets must remain server-only. `SUPABASE_SERVICE_ROLE_KEY` is required to send team invitations. The worker uses Google Application Default Credentials with `GOOGLE_CLOUD_PROJECT`. Configure the deployed URL as an allowed Supabase Auth redirect before production login.

## Product notes

- Financial pages explicitly distinguish estimated and actual values.
- Advance payments remain pending until verified and are allocated separately from customer-facing invoices.
- Issued billing documents snapshot business details, customer details, items, terms and payment instructions so later settings changes cannot rewrite history.
- Document numbers are allocated transactionally at issue time and are never reused after voiding.
- A receipt image is extracted by AI but must still be verified or matched to a bank transaction.
- Profit is finalized only after delivery, refunds, partner balances and actual costs are reconciled.
- Customer updates are milestone-based and manually approved in this release.
- Media requirements default to three photos and one video and surface a missing-media alert.

## Original image asset

`public/assets/celebration-table.png` was generated specifically for this project using the built-in image generation tool. Prompt direction: an editorial, intimate Sri Lankan birthday surprise arrangement with an ivory cake, raspberry ribbon, marigold/blush flowers, wrapped gifts and warm evening light; no brands, text or watermark.
