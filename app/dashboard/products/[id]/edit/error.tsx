// app/dashboard/products/[id]/edit/error.tsx
// Error boundary for the product editing page.

"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function EditProductError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[dashboard/products/edit/error]", error.digest ?? "unknown edit product error");
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Failed to load product edit page</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        We encountered an error loading the product specifications, category list, or store settings. Please try again.
      </p>
      <Button onClick={reset} className="rounded-2xl" variant="outline">
        Try again
      </Button>
    </div>
  );
}
