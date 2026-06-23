// app/dashboard/inventory/stock-in-record/loading.tsx
// Loading skeleton for the Stock-In Record page.

export default function StockInRecordLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-56 bg-muted rounded-xl" />
          <div className="h-4 w-72 bg-muted rounded-lg" />
        </div>
        <div className="h-10 w-32 bg-muted rounded-xl" />
      </div>

      {/* Filter panel skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-card p-4 border rounded-3xl">
        <div className="h-10 bg-muted rounded-xl" />
        <div className="h-10 bg-muted rounded-xl" />
        <div className="h-10 bg-muted rounded-xl" />
        <div className="h-10 bg-muted rounded-xl" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-3xl border bg-card overflow-hidden">
        <div className="p-4 border-b bg-muted/20 h-12" />
        <div className="p-4 space-y-4">
          <div className="h-8 bg-muted rounded-xl" />
          <div className="h-8 bg-muted rounded-xl" />
          <div className="h-8 bg-muted rounded-xl" />
          <div className="h-8 bg-muted rounded-xl" />
          <div className="h-8 bg-muted rounded-xl" />
        </div>
      </div>
    </div>
  );
}
