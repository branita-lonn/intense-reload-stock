// app/dashboard/layout.tsx
// Dashboard layout — server component that checks session and renders the sidebar navigation.
// Uses getServerSession(authOptions) — the correct pattern for NextAuth v4 in App Router.
// Role-based nav filtering arrives in Stage 2. All authenticated users see all links here.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DashboardSidebar } from "@/components/dashboard/sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const session = await auth();

  if (!session) {
    redirect("/auth/login");
  }

  // Fetch store settings for sidebar header (store name)
  const storeSettings = await prisma.storeSettings.findFirst({
    select: { storeName: true, logoUrl: true },
  });

  const storeName = storeSettings?.storeName ?? "Intense Reload";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <DashboardSidebar
        storeName={storeName}
        user={{
          name: session.user.name ?? "User",
          email: session.user.email ?? "",
          role: session.user.role,
        }}
      />
      <main className="flex-1 overflow-y-auto lg:ml-0">
        <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8 max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
