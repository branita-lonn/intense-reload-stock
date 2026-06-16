// app/dashboard/stock-count/new/error.tsx
// Error boundary UI for new stock count route

"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[new-stock-count/error]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Failed to initialize session</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        An error occurred while preparing your stock count session.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset} className="rounded-2xl" variant="outline">
          Try again
        </Button>
        <Link href="/dashboard/inventory">
          <Button className="rounded-2xl">Return to Inventory</Button>
        </Link>
      </div>
    </div>
  );
}
