// app/dashboard/receipt/[id]/loading.tsx
// Loading skeleton state for the standalone receipt view.

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function ReceiptLoading() {
  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4 py-8">
      <Card className="w-full max-w-md p-6 bg-card border rounded-lg shadow-sm space-y-6">
        {/* Header Skeleton */}
        <div className="flex flex-col items-center space-y-2 pb-4 border-b border-dashed">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-40" />
        </div>

        {/* Metadata Skeleton */}
        <div className="space-y-2 pb-4 border-b border-dashed">
          <div className="flex justify-between">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="h-3.5 w-32" />
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-16" />
          </div>
        </div>

        {/* Items Skeleton */}
        <div className="space-y-3 pb-4 border-b border-dashed">
          <Skeleton className="h-3.5 w-16" />
          <div className="space-y-3">
            <div className="flex justify-between">
              <div className="space-y-1 w-2/3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="flex justify-between">
              <div className="space-y-1 w-2/3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
          </div>
        </div>

        {/* Total Skeleton */}
        <div className="flex justify-between items-center py-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-24" />
        </div>

        {/* Footer Skeleton */}
        <div className="flex flex-col items-center space-y-1 pt-4 border-t border-dashed">
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-3 w-36" />
        </div>
      </Card>
    </div>
  );
}
