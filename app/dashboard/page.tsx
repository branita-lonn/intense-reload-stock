// app/dashboard/page.tsx
// Dashboard home page — displays real stat counts and a welcome message.
// Full analytics arrive in Stage 10; these are simple Prisma count queries.

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleBranchIds } from "@/lib/authz";
import { GitBranch, Package, Layers, AlertTriangle, ClipboardCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { UserRole } from "@prisma/client";

const roleLabels: Record<UserRole, string> = {
  OWNER: "Owner",
  BRANCH_MANAGER: "Branch Manager",
  STAFF: "Staff",
};

async function getDashboardStats(accessibleBranchIds: string[]) {
  const [totalBranches, stockBearingCategories, totalProducts, lowStockItems, pendingApprovals] =
    await Promise.all([
      prisma.branch.count({ where: { isActive: true } }),
      prisma.category.count({ where: { isStockBearing: true, isActive: true } }),
      prisma.product.count({ where: { isActive: true } }),
      prisma.inventory.count({
        where: {
          isReferenceSnapshot: false,
          quantity: { gt: 0, lte: 10 },
          branchId: { in: accessibleBranchIds },
        },
      }),
      prisma.sale.count({
        where: {
          status: "PENDING",
          branchId: { in: accessibleBranchIds },
        },
      }),
    ]);

  return { totalBranches, stockBearingCategories, totalProducts, lowStockItems, pendingApprovals };
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  // STAFF is redirected to log-sale as their default landing page
  if (session.user.role === "STAFF") {
    redirect("/dashboard/log-sale");
  }

  const accessibleBranchIds = await getAccessibleBranchIds(session);
  const stats = await getDashboardStats(accessibleBranchIds);

  const statCards = [
    {
      id: "stat-total-branches",
      title: "Total Branches",
      value: stats.totalBranches,
      icon: GitBranch,
      description: "Active branches",
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      id: "stat-stock-bearing-categories",
      title: "Stock-Bearing Categories",
      value: stats.stockBearingCategories,
      icon: Layers,
      description: "Categories owning inventory",
      color: "text-violet-500",
      bg: "bg-violet-500/10",
    },
    {
      id: "stat-total-products",
      title: "Total Products",
      value: stats.totalProducts,
      icon: Package,
      description: "Active products",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      id: "stat-low-stock-items",
      title: "Low Stock Items",
      value: stats.lowStockItems,
      icon: AlertTriangle,
      description: "At or below threshold",
      color: "text-rose-500",
      bg: "bg-rose-500/10",
    },
    {
      id: "stat-pending-approvals",
      title: "Pending Approvals",
      value: stats.pendingApprovals,
      icon: ClipboardCheck,
      description: "Awaiting owner/manager review",
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      href: "/dashboard/approvals",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {session.user.name ?? "User"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {roleLabels[session.user.role]} · Here&apos;s an overview of your inventory.
        </p>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {statCards.map((card) => {
          const Icon = card.icon;
          const cardContent = (
            <Card
              id={card.id}
              className={cn(
                "rounded-3xl border bg-card shadow-sm h-full transition-all duration-200",
                card.href && "hover:border-primary/40 hover:shadow-md cursor-pointer group"
              )}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  {card.title}
                </CardTitle>
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200 group-hover:scale-105 ${card.bg}`}>
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{card.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
              </CardContent>
            </Card>
          );

          if (card.href) {
            return (
              <Link key={card.id} href={card.href} className="block">
                {cardContent}
              </Link>
            );
          }

          return <div key={card.id}>{cardContent}</div>;
        })}
      </div>
    </div>
  );
}
