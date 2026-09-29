import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashToken, newToken } from "@/lib/password";

export const SESSION_COOKIE = "mathaka_session";
const SESSION_DAYS = 30;

export type Role = "owner" | "manager" | "staff";
export type Permission = "finance" | "settings" | "team";
export type User = { id: string; email: string; name: string; role: Role; mustChangePassword: boolean };

const grants: Record<Role, Permission[]> = {
  owner: ["finance", "settings", "team"],
  manager: ["finance"],
  staff: [],
};

export function can(user: Pick<User, "role">, permission: Permission) {
  return grants[user.role].includes(permission);
}

export async function createSession(userId: string) {
  const { token, hash } = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db()`insert into sessions (token_hash, user_id, expires_at) values (${hash}, ${userId}, ${expires})`;
  await db()`update users set last_login_at = now() where id = ${userId}`;
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db()`delete from sessions where token_hash = ${hashToken(token)}`;
  store.delete(SESSION_COOKIE);
}

/** The signed-in user for this request, or null. Cached per request. */
export const getUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db()<{ id: string; email: string; name: string; role: Role; must_change_password: boolean }[]>`
    select u.id, u.email, u.name, u.role, u.must_change_password
    from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${hashToken(token)} and s.expires_at > now() and u.active
  `;
  const row = rows[0];
  return row ? { id: row.id, email: row.email, name: row.name, role: row.role, mustChangePassword: row.must_change_password } : null;
});

/** For pages: redirect to login (or home) instead of rendering. */
export async function requireUser(permission?: Permission) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (permission && !can(user, permission)) redirect("/?denied=1");
  return user;
}

export class AuthError extends Error {}

/** For server actions: throw instead of redirecting so the form shows the message. */
export async function authorize(permission?: Permission) {
  const user = await getUser();
  if (!user) throw new AuthError("Your session has ended. Please sign in again.");
  if (permission && !can(user, permission)) throw new AuthError("You don't have permission to do that.");
  return user;
}
