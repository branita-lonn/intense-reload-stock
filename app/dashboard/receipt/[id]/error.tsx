// app/dashboard/receipt/[id]/error.tsx
// Error boundary for the standalone receipt view.

"use client";

import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ReceiptError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[receipt/error]", error.digest ?? "unknown error");
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 py-8 text-center gap-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Failed to load Receipt</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        An error occurred while loading this receipt. Please make sure you are logged in and have access to this branch.
      </p>
      <Button onClick={reset} className="rounded-2xl" variant="outline">
        Try again
      </Button>
    </div>
  );
}
