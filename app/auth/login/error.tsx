// app/auth/login/error.tsx
// Error boundary for the login route — shows a generic, friendly error message.
// Detailed errors are NOT surfaced to the client (OWASP A05).

"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function LoginError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error server-side (digest is safe to log — no stack trace exposed to client)
    console.error("[login/error]", error.digest ?? "unknown error");
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred on the login page. Please try again.
        </p>
        <Button onClick={reset} className="rounded-2xl" variant="outline">
          Try again
        </Button>
      </div>
    </main>
  );
}
