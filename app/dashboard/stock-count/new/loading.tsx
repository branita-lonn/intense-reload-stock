// app/dashboard/stock-count/new/loading.tsx
// Loading skeleton UI for the new stock count route

import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Preparing session...</p>
    </div>
  );
}
