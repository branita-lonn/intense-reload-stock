// app/dashboard/sales/loading.tsx
// Loading skeleton state for the sales history page.

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function SalesHistoryLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-11 w-[220px] rounded-xl" />
      </div>

      {/* Filter bar skeleton */}
      <Card className="rounded-3xl border bg-card p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </Card>

      {/* List skeleton */}
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="rounded-3xl border bg-card p-5 shadow-sm space-y-3">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4.5 w-60" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <div className="pt-3 border-t flex justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-24 rounded-xl" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
