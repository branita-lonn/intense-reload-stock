// auth.ts
// NextAuth v5 configuration file

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { loginSchema } from "@/lib/validations/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials, req) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // Note: In a Server Action in Next.js 14+, headers() requires `next/headers`.
        // NextAuth passes the original request but we can also handle rate limits manually or here.
        // For local development, fallback to localhost IP if undefined.
        // (NextAuth v5 beta passes `req.headers` as a standard Headers object in some contexts)
        let ip = "127.0.0.1";
        if (req && req.headers && typeof req.headers.get === "function") {
          ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
        }

        const rateLimitResult = await checkRateLimit(ip);
        if (!rateLimitResult.success) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });

        const dummyHash = "$2b$12$LJy2M1/XJ7i/rZ6vTz5FNeNq0w9yW.rXJ2F3B6bHq.rV9s1.l7.K.";
        const hashToCompare = user?.password ?? dummyHash;
        const isValid = await bcrypt.compare(password, hashToCompare);

        if (!user || !user.isActive || !isValid) return null;

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
        token.id = user.id as string;
        token.role = user.role as any;
        token.mustChangePassword = user.mustChangePassword as boolean;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as any;
        session.user.mustChangePassword = token.mustChangePassword as boolean;
      }
      return session;
    },
  },
});
