import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

export type Settings = {
  business_name: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  logo_key: string | null;
  currency: string;
  invoice_prefix: string;
  receipt_prefix: string;
  quote_prefix: string;
  number_padding: number;
  next_invoice_number: number;
  next_receipt_number: number;
  next_quote_number: number;
  default_due_days: number;
  default_advance_percent: number;
  payment_instructions: string;
  bank_details: string;
  invoice_footer: string;
  split_owner_label: string;
  split_partner_label: string;
  split_owner_percent: number;
};

export const getSettings = cache(async () => {
  const [row] = await db()<Settings[]>`select * from settings where id = 1`;
  return row;
});

export type Term = { id: string; title: string; body: string; is_default: boolean; active: boolean; sort_order: number };

export async function listTerms(options: { activeOnly?: boolean } = {}) {
  const sql = db();
  return sql<Term[]>`select id, title, body, is_default, active, sort_order from terms
    where ${options.activeOnly ? sql`active` : sql`true`} order by sort_order, created_at`;
}

export async function listUsers() {
  return db()<{ id: string; email: string; name: string; role: string; active: boolean; last_login_at: Date | null }[]>`
    select id, email, name, role, active, last_login_at from users order by created_at`;
}
