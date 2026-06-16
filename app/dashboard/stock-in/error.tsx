// app/dashboard/stock-in/error.tsx
// Error boundary for the Stock-In page.

"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StockInErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function StockInError({ error, reset }: StockInErrorProps) {
  useEffect(() => {
    console.error("[stock-in-page-error]:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] border border-dashed rounded-3xl p-8 text-center bg-destructive/5 border-destructive/20 space-y-4 max-w-2xl mx-auto">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertCircle className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          An error occurred while loading the stock-in form. Please try again or contact support.
        </p>
      </div>
      <Button onClick={reset} className="rounded-xl">
        Try again
      </Button>
    </div>
  );
}
