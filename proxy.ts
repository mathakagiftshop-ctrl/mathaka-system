import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: send visitors without a session cookie to /login.
// Every page and action verifies the session against the database itself.
const PUBLIC = ["/login", "/i/", "/p/", "/g/"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((path) => pathname === path || pathname.startsWith(path))) return NextResponse.next();
  if (request.cookies.has("mathaka_session")) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
