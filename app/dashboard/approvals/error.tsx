// app/dashboard/approvals/error.tsx
// Error component for the approvals page.

"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function ApprovalsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Approvals Error Page]:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6 bg-card border rounded-3xl gap-4 max-w-lg mx-auto mt-12 shadow-sm">
      <div className="p-3 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
        <AlertCircle className="h-6 w-6" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Something went wrong!
        </h2>
        <p className="text-sm text-muted-foreground leading-normal">
          An error occurred while loading the approvals queue. Please make sure you have appropriate access and try again.
        </p>
      </div>
      <div className="flex gap-3 mt-2">
        <Button variant="outline" className="rounded-xl" onClick={() => window.location.reload()}>
          Reload Page
        </Button>
        <Button className="rounded-xl" onClick={() => reset()}>
          Try Again
        </Button>
      </div>
    </div>
  );
}
