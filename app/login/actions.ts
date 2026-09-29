"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/password";
import type { ActionState } from "@/lib/actions";

const MAX_FAILURES = 8;
const WINDOW_MINUTES = 15;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

export async function signIn(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter your email and password." };
  const { email, password, next } = parsed.data;
  const sql = db();

  const [{ failures }] = await sql<{ failures: number }[]>`
    select count(*)::int as failures from login_attempts
    where lower(email) = ${email} and not succeeded and attempted_at > now() - make_interval(mins => ${WINDOW_MINUTES})`;
  if (failures >= MAX_FAILURES) return { error: `Too many attempts. Try again in ${WINDOW_MINUTES} minutes.` };

  const [user] = await sql<{ id: string; password_hash: string }[]>`
    select id, password_hash from users where lower(email) = ${email} and active`;
  // Always run a hash comparison so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(password, user?.password_hash ?? "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
  await sql`insert into login_attempts (email, succeeded) values (${email}, ${ok && Boolean(user)})`;
  if (!user || !ok) return { error: "That email and password don't match." };

  await createSession(user.id);
  redirect(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}

const setupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`).max(200),
});

/** Creates the first owner account. Only works while there are no users. */
export async function setupOwner(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const allowed = process.env.MATHAKA_OWNER_EMAIL?.trim().toLowerCase();
  if (!allowed) return { error: "Set MATHAKA_OWNER_EMAIL in the environment first." };
  if (parsed.data.email !== allowed) return { error: "Use the owner email configured for this studio." };
  const passwordHash = await hashPassword(parsed.data.password);
  const created = await db().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(682401)`;
    const [{ count }] = await tx<{ count: number }[]>`select count(*)::int as count from users`;
    if (count > 0) return null;
    const [user] = await tx<{ id: string }[]>`
      insert into users (email, name, role, password_hash) values (${parsed.data.email}, ${parsed.data.name}, 'owner', ${passwordHash}) returning id`;
    return user;
  });
  if (!created) return { error: "The studio is already set up. Please sign in." };
  await createSession(created.id);
  redirect("/");
}
