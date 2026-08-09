import { createClient } from "@/lib/supabase/server";

export async function getOwner() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  const email = typeof data.claims.email === "string" ? data.claims.email.toLowerCase() : null;
  const ownerEmail = process.env.MATHAKA_OWNER_EMAIL?.trim().toLowerCase();
  if (!email || !ownerEmail || email !== ownerEmail) return null;

  return { email, subject: String(data.claims.sub) };
}
