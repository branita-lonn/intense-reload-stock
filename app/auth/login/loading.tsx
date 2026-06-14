// app/auth/login/loading.tsx
// Skeleton loading state shown while the login page is being streamed.

import { Skeleton } from "@/components/ui/skeleton";

export default function LoginLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* Brand header skeleton */}
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="h-14 w-14 rounded-3xl" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-52" />
        </div>

        {/* Card skeleton */}
        <div className="rounded-3xl border bg-card p-6 shadow-sm space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          </div>
          <Skeleton className="h-11 w-full rounded-2xl" />
        </div>
      </div>
    </main>
  );
}
