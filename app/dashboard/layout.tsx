// app/dashboard/layout.tsx
// Dashboard layout — server component that validates session, fetches accessible branches,
// and renders the role-aware sidebar navigation with a branch switcher.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleBranchIds } from "@/lib/authz";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  // Re-check isActive against live DB — stale JWTs must not bypass deactivation
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true },
  });
  if (!currentUser?.isActive) redirect("/auth/login");

  // Fetch store settings for sidebar header
  const storeSettings = await prisma.storeSettings.findFirst({
    select: { storeName: true, logoUrl: true },
  });
  const storeName = storeSettings?.storeName ?? "Intense Reload";

  // Fetch accessible branches for the branch switcher.
  // OWNER receives all active branches; others receive only their assigned branches.
  // Design decision: branch selection stored in ?branch=<id> URL query param for
  // shareability and simplicity (no cookie/server-state required).
  const accessibleBranchIds = await getAccessibleBranchIds(session);
  const accessibleBranches = await prisma.branch.findMany({
    where: { id: { in: accessibleBranchIds }, isActive: true },
    select: { id: true, name: true, town: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-background focus:text-foreground focus:border focus:rounded-xl">
        Skip to main content
      </a>
      <DashboardSidebar
        storeName={storeName}
        user={{
          name: session.user.name ?? "User",
          email: session.user.email ?? "",
          role: session.user.role,
        }}
        accessibleBranches={accessibleBranches}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Spacer for mobile top bar */}
        <div className="lg:hidden h-14 w-full flex-shrink-0" />

        {/* Desktop Header — matches height of mobile top bar */}
        <header className="hidden lg:flex h-14 items-center justify-between border-b bg-card px-8 flex-shrink-0">
          <div className="text-sm font-medium text-muted-foreground">
            {/* Left empty for symmetry/cleanliness */}
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell />
          </div>
        </header>

        {/* Main Content Area */}
        <main id="main-content" className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8 max-w-7xl">
            {children}
          </div>
        </main>
      </div>
      <PwaInstallPrompt />
    </div>
  );
}
