// proxy.ts  (Next.js 16+ uses "proxy" instead of the deprecated "middleware" convention)
// Route protection proxy using NextAuth v4's withAuth helper.
//
// DIVISION OF RESPONSIBILITY:
//   This proxy handles only two questions:
//   1. "Is the user authenticated?" — if not, redirect to /auth/login.
//   2. "Does the user need to change their password?" — if so, redirect to /dashboard/change-password.
//
// IMPORTANT: Branch-level (resource-level) authorization is NOT performed here.
// The proxy cannot access resource ownership data (e.g. UserBranchAssignment rows).
// That check is the responsibility of lib/authz.ts (built in Stage 2), called explicitly
// inside each API route or server action that reads/writes branch-scoped data.

import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth(function middleware(req) {
  const { nextUrl } = req;
  const session = req.auth;

  const isLoggedIn = !!session;
  const isDashboardRoute = nextUrl.pathname.startsWith("/dashboard");
  const isChangePasswordRoute = nextUrl.pathname === "/dashboard/change-password";
  const isAuthRoute = nextUrl.pathname.startsWith("/auth");
  const isApiAuthRoute = nextUrl.pathname.startsWith("/api/auth");

  if (isApiAuthRoute) {
    return NextResponse.next();
  }

  if (isDashboardRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL("/auth/login", nextUrl));
  }

  if (
    isDashboardRoute &&
    isLoggedIn &&
    session.user?.mustChangePassword &&
    !isChangePasswordRoute
  ) {
    return NextResponse.redirect(new URL("/dashboard/change-password", nextUrl));
  }

  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // Match all paths except Next.js internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
