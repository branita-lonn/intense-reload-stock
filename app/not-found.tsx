// app/not-found.tsx
// Custom 404 page — displayed when a route is not matched by the Next.js router.
// Full dark/light mode support via semantic Tailwind tokens.

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PackageSearch } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      {/* Icon */}
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10">
        <PackageSearch className="h-12 w-12 text-primary" />
      </div>

      {/* Heading */}
      <h1 className="text-7xl font-extrabold tracking-tight text-foreground">404</h1>

      <h2 className="mt-4 text-2xl font-semibold text-foreground">Page not found</h2>

      <p className="mt-3 max-w-sm text-muted-foreground">
        Looks like this page went out of stock. Double-check the URL or head back to the
        dashboard.
      </p>

      {/* Action */}
      <Button asChild className="mt-8 rounded-3xl px-8" size="lg">
        <Link href="/dashboard">Back to Dashboard</Link>
      </Button>

      {/* Subtle brand footer */}
      <p className="mt-12 text-xs text-muted-foreground/50 tracking-widest uppercase">
        Intense Reload
      </p>
    </main>
  );
}
