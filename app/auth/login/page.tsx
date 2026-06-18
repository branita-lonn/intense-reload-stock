// app/auth/login/page.tsx
// Login page server component wrapper that redirects to setup if no users exist.
// force-dynamic: this page hits the database to check first-run state;
// it must never be statically prerendered at build time.
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { isFirstRunSetupAvailable } from "@/lib/first-run";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const setupAvailable = await isFirstRunSetupAvailable();
  if (setupAvailable) {
    redirect("/setup");
  }

  return <LoginForm />;
}
