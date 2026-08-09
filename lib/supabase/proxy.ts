import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set(["/login"]);
const PUBLIC_PREFIXES = ["/auth/", "/gallery/", "/partner/", "/api/public/"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLowerCase() : null;
  const ownerEmail = process.env.MATHAKA_OWNER_EMAIL?.trim().toLowerCase();
  const isOwner = Boolean(email && ownerEmail && email === ownerEmail);
  const pathname = request.nextUrl.pathname;

  if (!isOwner && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (isOwner && pathname === "/login") {
    const target = request.nextUrl.searchParams.get("next");
    const safeTarget = target?.startsWith("/") && !target.startsWith("//") ? target : "/";
    return NextResponse.redirect(new URL(safeTarget, request.url));
  }

  return response;
}
