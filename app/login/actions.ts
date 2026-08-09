"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { getDatabase } from "@/lib/server/database";

export type LoginState = { status: "idle" | "sent" | "error"; message: string };

export async function sendMagicLink(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const ownerEmail = process.env.MATHAKA_OWNER_EMAIL?.trim().toLowerCase();
  const genericMessage = "If that email has studio access, a secure sign-in link is on its way.";
  if (!email) {
    return { status: "sent", message: genericMessage };
  }
  const sql=getDatabase();
  const allowed=await sql`select 1 from public.studio_members where lower(email)=${email} and status='active' union all select 1 from public.studio_invitations where lower(email)=${email} and status='pending' and expires_at>now() limit 1`;
  const bootstrap=email===ownerEmail&&(await sql`select count(*)::int n from public.studio_members`)[0].n===0;
  if(!allowed.length&&!bootstrap)return {status:"sent",message:genericMessage};

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: bootstrap,
      emailRedirectTo: `${protocol}://${host}/auth/callback?next=/`,
    },
  });

  if (error) return { status: "error", message: "The sign-in email could not be sent. Please try again shortly." };
  return { status: "sent", message: genericMessage };
}
