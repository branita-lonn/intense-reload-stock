// proxy.ts  (Next.js 16+ uses "proxy" instead of the deprecated "middleware" convention)
// Route protection proxy using NextAuth v5 — handles session checks and mustChangePassword redirects.
// IMPORTANT: Branch-level (resource-level) authorization is NOT performed here.
// Middleware cannot access resource ownership data (e.g. UserBranchAssignment).
// That check is the responsibility of lib/authz.ts (built in Stage 2), called explicitly
// inside each API route or server action that reads/writes branch-scoped data.
// Proxy handles only: "is there a session?" and "does the user need to change their password?"

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextAuthRequest } from "next-auth";

export default auth(function middleware(req: NextAuthRequest) {
  const { nextUrl } = req;
  const session = req.auth;

  const isLoggedIn = !!session;
  const isDashboardRoute = nextUrl.pathname.startsWith("/dashboard");
  const isChangePasswordRoute = nextUrl.pathname === "/dashboard/change-password";
  const isAuthRoute = nextUrl.pathname.startsWith("/auth");
  const isApiAuthRoute = nextUrl.pathname.startsWith("/api/auth");

  // Allow all API auth routes (NextAuth handlers)
  if (isApiAuthRoute) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users away from dashboard routes
  if (isDashboardRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL("/auth/login", nextUrl));
  }

  // If the user is authenticated and must change their password,
  // force them to the change-password page (unless they're already there).
  if (
    isDashboardRoute &&
    isLoggedIn &&
    session.user.mustChangePassword &&
    !isChangePasswordRoute
  ) {
    return NextResponse.redirect(new URL("/dashboard/change-password", nextUrl));
  }

  // If a logged-in user navigates to an auth page, send them to the dashboard
  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // Match all paths except Next.js internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
