// app/dashboard/branches/[id]/loading.tsx
// Skeleton loader for the branch detail dashboard view.

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function BranchDetailLoading() {
  return (
    <div className="space-y-8">
      {/* Back button skeleton */}
      <Skeleton className="h-9 w-32" />

      {/* Main layout skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left card skeleton */}
        <Card className="rounded-3xl border bg-card shadow-sm lg:col-span-1 p-6 space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-48" />
          </div>
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="space-y-2 pt-4 border-t">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-48" />
            </div>
          </div>
          <Skeleton className="h-10 w-full rounded-2xl pt-4" />
        </Card>

        {/* Right list skeleton */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-10 w-36 rounded-xl" />
          </div>
          {/* Table skeleton */}
          <div className="rounded-3xl border bg-card overflow-hidden">
            <div className="p-4 border-b">
              <Skeleton className="h-6 w-full" />
            </div>
            <div className="p-4 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
