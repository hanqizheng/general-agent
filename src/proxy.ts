import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

function buildLoginRedirect(request: Request) {
  const url = new URL(request.url);
  const loginUrl = new URL("/login", url.origin);
  const callbackPath = `${url.pathname}${url.search}`;
  loginUrl.searchParams.set("callbackUrl", callbackPath);
  return loginUrl;
}

export const proxy = auth((request) => {
  const pathname = request.nextUrl.pathname;
  const isAuthenticated = Boolean(request.auth);

  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  if (pathname === "/login" || pathname === "/register") {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/chat", request.url));
    }
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    return NextResponse.redirect(buildLoginRedirect(request));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
