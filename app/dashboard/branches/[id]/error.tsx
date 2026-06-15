// app/dashboard/branches/[id]/error.tsx
// Error boundary component for the branch detail dashboard view.

"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function BranchDetailError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[branch-detail/error]", error.digest ?? "unknown error");
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Branch details failed to load</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        Something went wrong while retrieving the branch details or staff assignments.
      </p>
      <div className="flex gap-3 mt-2">
        <Button onClick={reset} className="rounded-2xl" variant="outline">
          Try again
        </Button>
        <Button asChild className="rounded-2xl" variant="ghost">
          <Link href="/dashboard/branches">Back to Branches</Link>
        </Button>
      </div>
    </div>
  );
}
