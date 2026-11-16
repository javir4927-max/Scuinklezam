import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const hostname = host.split(":")[0];

  // If user accesses via localhost in local dev, redirect to 127.0.0.1 with 307
  if (hostname === "localhost") {
    const port = host.split(":")[1] || "3000";
    const newUrl = new URL(request.url);
    newUrl.hostname = "127.0.0.1";
    newUrl.port = port;
    return NextResponse.redirect(newUrl, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for static files
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
