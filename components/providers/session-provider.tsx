// components/providers/session-provider.tsx
// Client-side wrapper for NextAuth SessionProvider — required because SessionProvider
// uses React context and must be a Client Component, while the root layout is a Server Component.

"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

interface SessionProviderProps {
  children: React.ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
