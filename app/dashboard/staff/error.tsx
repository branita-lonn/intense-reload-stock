// app/dashboard/staff/error.tsx
// Error boundary for the staff management page.

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function StaffError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[staff/error]", error.digest ?? "unknown error");
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Staff page failed to load</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        Something went wrong while loading the staff list. Please try again.
      </p>
      <div className="flex gap-3 mt-2">
        <Button onClick={reset} className="rounded-2xl" variant="outline">
          Try again
        </Button>
        <Button asChild className="rounded-2xl" variant="ghost">
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
