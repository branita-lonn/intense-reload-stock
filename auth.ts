// auth.ts
// NextAuth.js v5 configuration and credentials provider setup for authentication

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { loginSchema } from "@/lib/validations/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/login",
  },
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Validate credentials input with Zod
        const parsedCredentials = loginSchema.safeParse(credentials);
        if (!parsedCredentials.success) {
          return null;
        }

        const { email, password } = parsedCredentials.data;

        // Timing-leak and rate-limiting defense
        // Retrieve client IP for rate limiting
        let ip = "127.0.0.1";
        try {
          const reqHeaders = await headers();
          ip = reqHeaders.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";
        } catch (e) {
          // Fallback if headers cannot be fetched (e.g. static rendering contexts)
        }

        // 1. Check Rate Limit (5 attempts per 60s per IP)
        const rateLimitResult = await checkRateLimit(ip);
        if (!rateLimitResult.success) {
          // Wasted bcrypt work avoided. Return generic failure.
          return null;
        }

        // 2. Timing-leak resistant query & user validation
        const user = await prisma.user.findUnique({
          where: { email },
        });

        // Dummy hash comparison to keep timing uniform if user doesn't exist
        const dummyHash = "$2b$12$LJy2M1/XJ7i/rZ6vTz5FNeNq0w9yW.rXJ2F3B6bHq.rV9s1.l7.K.";
        const hashToCompare = user ? user.password : dummyHash;
        const isValid = await bcrypt.compare(password, hashToCompare);

        if (!user || !user.isActive || !isValid) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.mustChangePassword = token.mustChangePassword;
      }
      return session;
    },
  },
});
