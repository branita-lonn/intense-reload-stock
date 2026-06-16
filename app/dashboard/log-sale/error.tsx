// app/dashboard/log-sale/error.tsx
// Error boundary for the counter sale logging page. Shows a generic error message (OWASP A05).

"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function LogSaleError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[log-sale/error]", error.digest ?? "unknown error");
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Failed to load Sale Logger</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        An error occurred while loading the counter sales page. Please try refreshing or try again.
      </p>
      <Button onClick={reset} className="rounded-2xl" variant="outline">
        Try again
      </Button>
    </div>
  );
}
