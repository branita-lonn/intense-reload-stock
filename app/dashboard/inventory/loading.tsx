// app/dashboard/inventory/loading.tsx
// Loading skeleton component for the Inventory Dashboard.

import { Loader2 } from "lucide-react";

export default function InventoryLoading() {
  return (
    <div className="flex flex-col gap-6 w-full animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted rounded-xl" />
          <div className="h-4 w-72 bg-muted rounded-lg" />
        </div>
        <div className="h-10 w-40 bg-muted rounded-xl" />
      </div>

      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-3xl border bg-card/50 p-6 space-y-3" />
        ))}
      </div>

      {/* Filters Bar Skeleton */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="h-10 flex-1 bg-muted rounded-xl" />
          <div className="h-10 w-full sm:w-[220px] bg-muted rounded-xl" />
          <div className="h-10 w-full sm:w-[200px] bg-muted rounded-xl" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="rounded-3xl border bg-card overflow-hidden">
        <div className="h-12 bg-muted/40 border-b" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 border-b bg-card/25" />
        ))}
      </div>
    </div>
  );
}
