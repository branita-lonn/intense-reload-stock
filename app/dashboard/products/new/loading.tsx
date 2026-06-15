// app/dashboard/products/new/loading.tsx
// Skeleton loading state for product creation page.

import { Skeleton } from "@/components/ui/skeleton";

export default function NewProductLoading() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="rounded-3xl border bg-card p-6 shadow-sm space-y-6">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
