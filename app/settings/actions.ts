"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/auth";
import { checkbox, errorMessage, formAction, optionalUuid, requiredText, text, UserError, uuid, type ActionState } from "@/lib/actions";
import { db } from "@/lib/db";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/password";
import { IMAGE_TYPES, uploadFile } from "@/lib/storage";

const refresh = () => revalidatePath("/", "layout");

export const saveBusiness = formAction(z.object({
  business_name: requiredText(120),
  tagline: text(120),
  phone: text(60),
  email: text(120),
  address: text(500),
  website: text(200),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "must be a 3-letter code like LKR"),
}), async (input, user) => {
  await db()`update settings set ${db()(input)}, updated_at = now() where id = 1`;
  await audit(user.id, "settings.business", "settings", "1");
  refresh();
  return "Business details saved. New documents will use them.";
}, "settings");

export async function uploadLogo(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await authorize("settings");
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first.", at: Date.now() };
    const key = await uploadFile(file, "logos", IMAGE_TYPES.filter((type) => !type.includes("hei")));
    await db()`update settings set logo_key = ${key}, updated_at = now() where id = 1`;
    await audit(user.id, "settings.logo", "settings", "1");
    refresh();
    // Old logos are kept: issued invoices still point at them.
    return { ok: true, message: "Logo uploaded.", at: Date.now() };
  } catch (error) {
    unstable_rethrow(error);
    return { error: errorMessage(error), at: Date.now() };
  }
}

export const removeLogo = formAction(z.object({}), async (_input, user) => {
  await db()`update settings set logo_key = null where id = 1`;
  await audit(user.id, "settings.logo_removed", "settings", "1");
  refresh();
  return "Logo removed from new documents.";
}, "settings");

const prefix = z.string().trim().min(1).max(10).regex(/^[A-Za-z0-9-]+$/, "use letters, numbers or dashes");

export const saveInvoiceSettings = formAction(z.object({
  invoice_prefix: prefix,
  receipt_prefix: prefix,
  quote_prefix: prefix,
  number_padding: z.coerce.number().int().min(3).max(8),
  default_due_days: z.coerce.number().int().min(0).max(90),
  default_advance_percent: z.coerce.number().min(0).max(100),
  payment_instructions: text(2000),
  bank_details: text(2000),
  invoice_footer: text(500),
}), async (input, user) => {
  await db()`update settings set ${db()(input)}, updated_at = now() where id = 1`;
  await audit(user.id, "settings.invoices", "settings", "1");
  refresh();
  return "Invoice settings saved.";
}, "settings");

export const saveSplit = formAction(z.object({
  split_owner_label: requiredText(40),
  split_partner_label: requiredText(40),
  split_owner_percent: z.coerce.number().min(0).max(100),
}), async (input, user) => {
  await db()`update settings set ${db()(input)}, updated_at = now() where id = 1`;
  await audit(user.id, "settings.split", "settings", "1", input);
  refresh();
  return "Profit split saved. Closed months keep their original split.";
}, "settings");

export const saveTerm = formAction(z.object({
  term_id: optionalUuid,
  title: requiredText(80),
  body: requiredText(2000),
  sort_order: z.coerce.number().int().min(0).max(999).default(0),
  is_default: checkbox,
  active: checkbox,
}), async (input, user) => {
  const sql = db();
  const fields = { title: input.title, body: input.body, sort_order: input.sort_order, is_default: input.is_default, active: input.term_id ? input.active : true };
  if (input.term_id) await sql`update terms set ${sql(fields)} where id = ${input.term_id}`;
  else await sql`insert into terms ${sql(fields)}`;
  await audit(user.id, "settings.term", "term", input.term_id);
  refresh();
  return "Term saved.";
}, "settings");

export const deleteTerm = formAction(z.object({ term_id: uuid }), async ({ term_id }, user) => {
  // Issued documents keep their own copy of terms, so deleting is safe.
  await db()`delete from terms where id = ${term_id}`;
  await audit(user.id, "settings.term_deleted", "term", term_id);
  refresh();
  return "Term deleted.";
}, "settings");

const password = z.string().min(MIN_PASSWORD_LENGTH, `must be at least ${MIN_PASSWORD_LENGTH} characters`).max(200);

export const addUser = formAction(z.object({
  name: requiredText(80),
  email: z.string().trim().toLowerCase().email("is not valid"),
  role: z.enum(["owner", "manager", "staff"]),
  password,
}), async (input, user) => {
  const sql = db();
  const [existing] = await sql`select 1 from users where lower(email) = ${input.email}`;
  if (existing) throw new UserError("Someone with that email already has an account.");
  await sql`insert into users (email, name, role, password_hash, must_change_password)
            values (${input.email}, ${input.name}, ${input.role}, ${await hashPassword(input.password)}, true)`;
  await audit(user.id, "team.added", "user", null, { email: input.email, role: input.role });
  refresh();
  return `Account created. Share the temporary password with ${input.name} privately.`;
}, "team");

export const updateUser = formAction(z.object({
  user_id: uuid,
  role: z.enum(["owner", "manager", "staff"]),
  active: checkbox,
  new_password: z.string().max(200).default(""),
}), async (input, user) => {
  if (input.user_id === user.id && (input.role !== "owner" || !input.active)) throw new UserError("You can't remove your own owner access.");
  if (input.new_password && input.new_password.length < MIN_PASSWORD_LENGTH) throw new UserError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  const sql = db();
  await sql.begin(async (tx) => {
    await tx`update users set role = ${input.role}, active = ${input.active} where id = ${input.user_id}`;
    if (input.new_password) {
      await tx`update users set password_hash = ${await hashPassword(input.new_password)}, must_change_password = true where id = ${input.user_id}`;
    }
    if (!input.active || input.new_password) await tx`delete from sessions where user_id = ${input.user_id}`;
    const [{ owners }] = await tx<{ owners: number }[]>`select count(*)::int as owners from users where role = 'owner' and active`;
    if (owners === 0) throw new UserError("There must always be at least one active owner.");
  });
  await audit(user.id, "team.updated", "user", input.user_id, { role: input.role, active: input.active, passwordReset: Boolean(input.new_password) });
  refresh();
  return "Team member updated.";
}, "team");

export const changePassword = formAction(z.object({ current: z.string().min(1, "is required"), next: password }), async (input, user) => {
  const sql = db();
  const [row] = await sql<{ password_hash: string }[]>`select password_hash from users where id = ${user.id}`;
  if (!(await verifyPassword(input.current, row.password_hash))) throw new UserError("Your current password is wrong.");
  await sql`update users set password_hash = ${await hashPassword(input.next)}, must_change_password = false where id = ${user.id}`;
  await audit(user.id, "account.password_changed", "user", user.id);
  refresh();
  return "Password changed.";
});

