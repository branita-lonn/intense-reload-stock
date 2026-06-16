// app/dashboard/stock-in/loading.tsx
// Loading skeleton for the Stock-In page.

export default function StockInLoading() {
  return (
    <div className="animate-pulse space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-8 w-40 bg-muted rounded-xl" />
        <div className="h-4 w-72 bg-muted rounded-lg" />
      </div>

      {/* Branch indicator */}
      <div className="h-12 w-full bg-muted rounded-xl" />

      {/* Form card */}
      <div className="rounded-3xl border bg-card p-6 space-y-5">
        <div className="h-5 w-32 bg-muted rounded-lg" />
        <div className="h-11 w-full bg-muted rounded-xl" />
        <div className="h-11 w-full bg-muted rounded-xl" />
        <div className="h-11 w-full bg-muted rounded-xl" />
        <div className="h-11 w-full bg-muted rounded-xl" />
        <div className="h-11 w-1/2 bg-muted rounded-xl" />
      </div>
    </div>
  );
}
