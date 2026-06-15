// app/dashboard/branches/[id]/page.tsx
// Server component displaying detailed information and staff assignments for a specific branch.

import { prisma } from "@/lib/prisma";
import { requireSession, requireBranchAccess } from "@/lib/authz";
import { NotFoundError } from "@/lib/errors";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BranchForm } from "@/components/dashboard/branch-form";
import { BranchStaffList } from "@/components/dashboard/branch-staff-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranch, MapPin, Phone, ArrowLeft, Plus } from "lucide-react";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const branch = await prisma.branch.findUnique({
    where: { id },
    select: { name: true },
  });

  return {
    title: `${branch?.name ?? "Branch Details"} | Intense Reload`,
    description: "Manage branch information and staff assignments.",
  };
}

export default async function BranchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  // Direct server-side branch access check (preferred pattern over API fetches for RSCs)
  await requireBranchAccess(session.user.id, id);

  const branch = await prisma.branch.findUnique({
    where: { id },
    include: {
      userAssignments: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              isActive: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!branch) {
    throw new NotFoundError("Branch not found.");
  }

  const isOwner = session.user.role === "OWNER";
  const isOwnerOrManager = isOwner || session.user.role === "BRANCH_MANAGER";

  return (
    <div className="space-y-8">
      {/* Back link and Actions */}
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" className="rounded-xl -ml-2 text-muted-foreground hover:text-foreground">
          <Link href="/dashboard/branches">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Branches
          </Link>
        </Button>
      </div>

      {/* Main Info Card */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="rounded-3xl border bg-card shadow-sm lg:col-span-1 flex flex-col justify-between overflow-hidden">
          <div>
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1 pr-4">
                  <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                    Branch Overview
                  </span>
                  <CardTitle className="text-2xl font-bold tracking-tight text-foreground truncate">
                    {branch.name}
                  </CardTitle>
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
            <CardContent className="space-y-4 py-2 text-sm">
              {/* Town */}
              <div className="flex items-start gap-2.5">
                <MapPin className="h-4.5 w-4.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground">Location</p>
                  <p className="text-muted-foreground">{branch.town}</p>
                </div>
              </div>

              {/* Address */}
              {branch.address && (
                <div className="flex items-start gap-2.5 border-t pt-4">
                  <div className="h-4.5 w-4.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-foreground">Street Address</p>
                    <p className="text-muted-foreground">{branch.address}</p>
                  </div>
                </div>
              )}

              {/* Contact number */}
              {branch.contactNumber && (
                <div className="flex items-start gap-2.5 border-t pt-4">
                  <Phone className="h-4.5 w-4.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">Contact Number</p>
                    <p className="text-muted-foreground">{branch.contactNumber}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </div>
          {isOwner && (
            <div className="p-6 border-t bg-muted/5">
              <BranchForm
                branch={branch}
                trigger={
                  <Button id="edit-branch-btn" className="w-full rounded-2xl" variant="outline">
                    Edit Details
                  </Button>
                }
              />
            </div>
          )}
        </Card>

        {/* Staff Table Card */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Assigned Staff ({branch.userAssignments.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Staff members with administrative access to this branch&apos;s inventory.
              </p>
            </div>
            {isOwnerOrManager && (
              <Button
                id="add-staff-to-branch-disabled"
                disabled
                variant="outline"
                className="rounded-xl border-dashed"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Staff (Commit 4)
              </Button>
            )}
          </div>

          <BranchStaffList
            branchId={branch.id}
            userAssignments={branch.userAssignments}
            isOwnerOrManager={isOwnerOrManager}
          />
        </div>
      </div>
    </div>
  );
}
