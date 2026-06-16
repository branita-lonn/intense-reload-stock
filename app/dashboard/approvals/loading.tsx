// app/dashboard/approvals/loading.tsx
// Loading skeleton state for the approvals page.

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function ApprovalsLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 rounded-xl" />
          <Skeleton className="h-4 w-64 rounded-xl" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36 rounded-xl" />
          <Skeleton className="h-10 w-48 rounded-xl" />
        </div>
      </div>

      {/* Summary card skeleton */}
      <Skeleton className="h-16 w-full rounded-2xl" />

      {/* Main List Table Skeleton */}
      <Card className="rounded-3xl border">
        <CardHeader className="border-b">
          <Skeleton className="h-6 w-36 rounded-xl" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-6 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1">
                  <Skeleton className="h-5 w-5 rounded" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-1/3 rounded-xl" />
                    <Skeleton className="h-4 w-1/4 rounded-xl" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-20 rounded-xl" />
                  <Skeleton className="h-9 w-20 rounded-xl" />
                  <Skeleton className="h-9 w-24 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
