// app/dashboard/branches/loading.tsx
// Skeleton loader for the branches dashboard list view.

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";

export default function BranchesLoading() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="rounded-3xl border bg-card shadow-sm flex flex-col justify-between overflow-hidden">
            <CardHeader className="space-y-2 pb-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2 w-2/3">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4 py-2">
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-8" />
                  <Skeleton className="h-5 w-12" />
                </div>
                <div className="space-y-1">
                  <Skeleton className="h-3 w-8" />
                  <Skeleton className="h-5 w-12" />
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-4 border-t bg-muted/5">
              <Skeleton className="h-10 w-full rounded-2xl" />
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
