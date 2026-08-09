"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

export type LoginState = { status: "idle" | "sent" | "error"; message: string };

export async function sendMagicLink(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const ownerEmail = process.env.MATHAKA_OWNER_EMAIL?.trim().toLowerCase();
  const genericMessage = "If that is the studio owner email, a secure sign-in link is on its way.";

  if (!email || !ownerEmail || email !== ownerEmail) {
    return { status: "sent", message: genericMessage };
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // This action is owner-email allowlisted, so the first successful request
      // safely provisions the single studio account.
      shouldCreateUser: true,
      emailRedirectTo: `${protocol}://${host}/auth/callback?next=/settings/connections`,
    },
  });

  if (error) return { status: "error", message: "The sign-in email could not be sent. Please try again shortly." };
  return { status: "sent", message: genericMessage };
}
