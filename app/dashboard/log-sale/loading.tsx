// app/dashboard/log-sale/loading.tsx
// Loading skeleton state for the counter sale logging page.

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function LogSaleLoading() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Branch selector skeleton */}
      <Card className="rounded-3xl border bg-card p-5 shadow-sm space-y-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </Card>

      {/* Node picker skeleton */}
      <Card className="rounded-3xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-11 w-full rounded-xl" />
      </Card>

      {/* Bottom status skeleton */}
      <Skeleton className="h-24 w-full rounded-3xl" />
    </div>
  );
}
