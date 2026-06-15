// app/dashboard/branches/page.tsx
// Server component displaying the branch listing grid page for authorized users.

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAccessibleBranchIds } from "@/lib/authz";
import { BranchForm } from "@/components/dashboard/branch-form";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitBranch, MapPin, Phone, Users, Package } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Branch Management | Intense Reload",
  description: "View and manage system branches, staff assignments, and consolidated inventory metrics.",
};

export default async function BranchesPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  // Live database check for account deactivation
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true },
  });

  if (!user?.isActive) {
    redirect("/auth/login");
  }

  let branches;
  if (session.user.role === "OWNER") {
    branches = await prisma.branch.findMany({
      include: {
        _count: {
          select: { userAssignments: true },
        },
        inventoryRecords: {
          select: { quantity: true },
        },
      },
      orderBy: { name: "asc" },
    });
  } else {
    const accessibleBranchIds = await getAccessibleBranchIds(session);
    branches = await prisma.branch.findMany({
      where: {
        id: { in: accessibleBranchIds },
      },
      include: {
        _count: {
          select: { userAssignments: true },
        },
        inventoryRecords: {
          select: { quantity: true },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  const formattedBranches = branches.map((branch) => {
    const totalInventory = branch.inventoryRecords.reduce(
      (sum, inv) => sum + inv.quantity,
      0
    );
    return {
      ...branch,
      totalInventory,
    };
  });

  const isOwner = session.user.role === "OWNER";

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Branches
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isOwner
              ? "Oversee all corporate operations, locations, and staff assignments."
              : "Access and manage your assigned branch listings."}
          </p>
        </div>
        {isOwner && (
          <div className="flex items-center gap-3">
            <BranchForm />
          </div>
        )}
      </div>

      {/* Branches Grid */}
      {formattedBranches.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed p-12 text-center bg-card/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <GitBranch className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-foreground">No branches found</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm">
            {isOwner
              ? "You haven't created any branches yet. Click the button above to add your first branch."
              : "You are not currently assigned to any active branches."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {formattedBranches.map((branch) => (
            <Card
              key={branch.id}
              className="rounded-3xl border bg-card shadow-sm hover:shadow-md transition duration-200 flex flex-col justify-between overflow-hidden"
            >
              <CardHeader className="space-y-1 pb-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 pr-4">
                    <CardTitle className="text-xl font-bold tracking-tight text-foreground truncate">
                      {branch.name}
                    </CardTitle>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{branch.town}</span>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      branch.isActive
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                        : "bg-destructive/10 text-destructive border-destructive/20"
                    }
                  >
                    {branch.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 py-2">
                {/* Address and phone details */}
                <div className="space-y-2 text-sm text-muted-foreground">
                  {branch.address && (
                    <div className="flex items-start gap-2">
                      <span className="font-semibold text-foreground flex-shrink-0">Street:</span>
                      <span className="truncate">{branch.address}</span>
                    </div>
                  )}
                  {branch.contactNumber && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <span>{branch.contactNumber}</span>
                    </div>
                  )}
                </div>

                {/* Counts */}
                <div className="grid grid-cols-2 gap-4 border-t pt-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                      <Users className="h-4 w-4 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Staff</p>
                      <p className="text-sm font-semibold text-foreground">
                        {branch._count.userAssignments}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                      <Package className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Stock Qty</p>
                      <p className="text-sm font-semibold text-foreground">
                        {branch.totalInventory}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-4 border-t bg-muted/5">
                <Button id={`manage-branch-${branch.id}`} asChild variant="outline" className="w-full rounded-2xl">
                  <Link href={`/dashboard/branches/${branch.id}`}>
                    Manage Branch
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
