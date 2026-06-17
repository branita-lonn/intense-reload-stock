// app/dashboard/settings/loading.tsx
// Skeleton loading UI for the store settings page.

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function SettingsLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Store name card skeleton */}
      <Card className="rounded-3xl border bg-card shadow-sm">
        <CardHeader className="pb-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Skeleton className="h-10 flex-1 rounded-xl" />
            <Skeleton className="h-10 w-20 rounded-xl" />
          </div>
        </CardContent>
      </Card>

      {/* Feature flags skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-6 w-36" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="rounded-3xl border bg-card shadow-sm">
            <CardContent className="flex items-start justify-between gap-4 py-6">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-80" />
              </div>
              <Skeleton className="h-6 w-11 flex-shrink-0 rounded-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
