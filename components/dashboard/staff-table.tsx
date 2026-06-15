// components/dashboard/staff-table.tsx
// Interactive staff table: inline active toggle, role-change (OWNER), temp password display.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { UserRole } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StaffForm } from "@/components/dashboard/staff-form";
import { TempPasswordAlert } from "@/components/dashboard/temp-password-alert";

interface BranchChip {
  id: string;
  branchId: string;
  branch: { id: string; name: string };
}

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  branchAssignments: BranchChip[];
}

interface Branch {
  id: string;
  name: string;
  town: string;
}

interface StaffTableProps {
  staff: StaffMember[];
  isOwner: boolean;
  availableBranches: Branch[];
}

const roleLabels: Record<UserRole, string> = {
  OWNER: "Owner",
  BRANCH_MANAGER: "Branch Manager",
  STAFF: "Staff",
};

const roleBadgeClass: Record<UserRole, string> = {
  OWNER: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  BRANCH_MANAGER: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  STAFF: "bg-muted text-muted-foreground border-border",
};

export function StaffTable({ staff, isOwner, availableBranches }: StaffTableProps) {
  const router = useRouter();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [newAccountAlert, setNewAccountAlert] = useState<{
    name: string;
    temporaryPassword: string;
  } | null>(null);

  async function handleToggleActive(userId: string, currentValue: boolean) {
    setTogglingId(userId);
    try {
      const response = await fetch(`/api/dashboard/staff/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentValue }),
      });

      const json = (await response.json()) as unknown;
      if (!response.ok) {
        const msg =
          json !== null &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : "Failed to update account status.";
        toast.error(msg);
        return;
      }

      toast.success(
        currentValue ? "Account deactivated." : "Account reactivated."
      );
      router.refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      console.error("[staff-table] toggle error:", message);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Temp password alert — shown immediately after account creation */}
      {newAccountAlert && (
        <TempPasswordAlert
          staffName={newAccountAlert.name}
          temporaryPassword={newAccountAlert.temporaryPassword}
          onDismiss={() => setNewAccountAlert(null)}
        />
      )}

      {/* Header row with Add staff button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {staff.length} {staff.length === 1 ? "member" : "members"}
        </p>
        <StaffForm
          branches={availableBranches}
          onSuccess={(data) => setNewAccountAlert(data)}
        />
      </div>

      {staff.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed p-12 text-center bg-card/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <ShieldCheck className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">No staff found</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm">
            Add your first staff member using the button above.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Branches</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="pl-6">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {member.name}
                      </span>
                      {member.mustChangePassword && (
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          Awaiting password change
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {member.email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={roleBadgeClass[member.role]}
                    >
                      {roleLabels[member.role]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {member.branchAssignments.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        member.branchAssignments.map((a) => (
                          <Badge
                            key={a.id}
                            variant="secondary"
                            className="rounded-lg text-xs"
                          >
                            {a.branch.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {togglingId === member.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Switch
                          id={`toggle-active-${member.id}`}
                          checked={member.isActive}
                          onCheckedChange={() =>
                            handleToggleActive(member.id, member.isActive)
                          }
                          disabled={!isOwner && member.role === "BRANCH_MANAGER"}
                          aria-label={
                            member.isActive
                              ? `Deactivate ${member.name}`
                              : `Activate ${member.name}`
                          }
                        />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {member.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
