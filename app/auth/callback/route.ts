import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { acceptInvitation } from "@/lib/server/members";
import { getStaff } from "@/lib/server/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {data}=await supabase.auth.getClaims();
      const email=typeof data?.claims?.email==='string'?data.claims.email.toLowerCase():null;
      const subject=String(data?.claims?.sub||'');
      if(email&&subject) await acceptInvitation(email,subject);
      if(!(await getStaff())) return NextResponse.redirect(new URL('/access-denied',url.origin));
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=callback", url.origin));
}
