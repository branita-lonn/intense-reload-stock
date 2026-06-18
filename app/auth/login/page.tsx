// app/auth/login/page.tsx
// Login page server component wrapper that redirects to setup if no users exist.

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
