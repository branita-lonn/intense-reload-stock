// app/auth/login/actions.ts
// Server action for credentials sign-in — the definitive pattern for NextAuth v5 beta.
// Prevents CSRF issues and random redirects by returning JSON for the client to handle.

"use server";

import { signIn } from "@/auth";
import { loginSchema } from "@/lib/validations/auth";
import { AuthError } from "next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";

export interface LoginActionResult {
  success: boolean;
  error?: string;
}

export async function loginAction(
  email: string,
  password: string
): Promise<LoginActionResult> {
  const parsed = loginSchema.safeParse({ email, password });
  if (!parsed.success) {
    return { success: false, error: "Invalid email or password" };
  }

  try {
    // redirect: false is strictly required to prevent automatic navigation.
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });

    return { success: true };
  } catch (error: unknown) {
    // NextAuth v5 throws NEXT_REDIRECT on success even when redirect: false
    if (isRedirectError(error)) {
      return { success: true };
    }

    if (error instanceof AuthError) {
      // SECURITY (OWASP A07): Generic message for all auth failures
      return { success: false, error: "Invalid email or password" };
    }

    console.error("[loginAction] Unexpected error:", error);
    return { success: false, error: "Invalid email or password" };
  }
}
