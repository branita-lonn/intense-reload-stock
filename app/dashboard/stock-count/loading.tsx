// app/dashboard/stock-count/loading.tsx
// Loading skeleton UI for the stock count history page

import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-36 rounded-2xl" />
      </div>

      {/* Toolbar skeleton */}
      <div className="flex items-center justify-between gap-4 py-2">
        <Skeleton className="h-10 w-64 rounded-2xl" />
      </div>

      {/* History table skeleton */}
      <div className="rounded-3xl border bg-card overflow-hidden shadow-sm">
        <div className="p-6 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-3 border-b">
              <Skeleton className="h-6 w-1/4" />
              <Skeleton className="h-6 w-1/4" />
              <Skeleton className="h-6 w-24 rounded-xl" />
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-8 w-20 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
