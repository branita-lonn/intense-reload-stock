// types/next-auth.d.ts
// Custom type extensions for NextAuth sessions and JWT tokens to support roles and custom flags

import { UserRole } from "@prisma/client";
import NextAuth, { type DefaultSession } from "next-auth";
import { type DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    mustChangePassword: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    mustChangePassword: boolean;
  }
}
