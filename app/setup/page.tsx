// app/setup/page.tsx
// Server component wrapper for the one-time setup page.
// force-dynamic: this page hits the database to check first-run state;
// it must never be statically prerendered at build time.
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { isFirstRunSetupAvailable } from "@/lib/first-run";
import { SetupForm } from "@/components/setup/setup-form";

export default async function SetupPage() {
  const available = await isFirstRunSetupAvailable();

  if (!available) {
    redirect("/auth/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-medium mb-1">Welcome to Intense Reload</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Let&apos;s set up your owner account. This page can only be used
          once.
        </p>
        <SetupForm />
      </div>
    </div>
  );
}
