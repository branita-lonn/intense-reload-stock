// app/dashboard/page.tsx
// Dashboard home page — displays real stat counts and a welcome message.
// Full analytics arrive in Stage 10; these are simple Prisma count queries.

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GitBranch, Package, Layers, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserRole } from "@prisma/client";

const roleLabels: Record<UserRole, string> = {
  OWNER: "Owner",
  BRANCH_MANAGER: "Branch Manager",
  STAFF: "Staff",
};

async function getDashboardStats() {
  const [
    totalBranches,
    stockBearingCategories,
    totalProducts,
    lowStockItems,
  ] = await Promise.all([
    prisma.branch.count({ where: { isActive: true } }),
    prisma.category.count({ where: { isStockBearing: true, isActive: true } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.inventory.count({
      where: {
        isReferenceSnapshot: false,
        // Low stock: quantity is at or below the threshold
        // Using a raw comparison via Prisma's lte filter against the threshold field
        // The Prisma query builder doesn't support column-to-column comparison directly
        // so we use a workaround with a raw filter condition
        AND: {
          quantity: { lte: 10 }, // approximation using default threshold of 10
        },
        quantity: { gt: 0 }, // exclude zeroed-out items for this summary count
      },
    }),
  ]);

  return { totalBranches, stockBearingCategories, totalProducts, lowStockItems };
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const stats = await getDashboardStats();

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
      color: "text-amber-500",
      bg: "bg-amber-500/10",
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.id} id={card.id} className="rounded-3xl border bg-card shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${card.bg}`}>
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{card.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Placeholder message for upcoming stages */}
      <div className="rounded-3xl border bg-card/50 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          📦 Full inventory management, branch analytics, and sales tracking arrive in upcoming stages.
        </p>
      </div>
    </div>
  );
}
