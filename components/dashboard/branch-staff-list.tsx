// components/dashboard/branch-staff-list.tsx
// Table component showing assigned staff members with inline removal action.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, ShieldAlert, Loader2, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserRole } from "@prisma/client";

interface AssignedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}

interface UserAssignment {
  id: string;
  userId: string;
  createdAt: Date;
  user: AssignedUser;
}

interface BranchStaffListProps {
  branchId: string;
  userAssignments: UserAssignment[];
  isOwnerOrManager: boolean;
}

const roleLabels: Record<UserRole, string> = {
  OWNER: "Owner",
  BRANCH_MANAGER: "Branch Manager",
  STAFF: "Staff",
};

export function BranchStaffList({
  branchId,
  userAssignments,
  isOwnerOrManager,
}: BranchStaffListProps) {
  const router = useRouter();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  async function handleRemove(assignmentId: string, userId: string) {
    setIsRemoving(true);
    try {
      // Send DELETE request to unassign the branch.
      // This endpoint is fully implemented in Commit 4.
      const response = await fetch(`/api/dashboard/staff/${userId}/branches`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId }),
      });

      if (response.status === 404) {
        // If the endpoint is not implemented yet (e.g. during Commit 3 testing)
        toast.info("Staff management endpoints will be fully operational in Commit 4.");
        setConfirmingId(null);
        return;
      }

      const json = (await response.json()) as unknown;

      if (!response.ok) {
        const errorMessage =
          json !== null &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : "Failed to remove staff assignment.";
        toast.error(errorMessage);
        return;
      }

      toast.success("Staff assignment removed successfully.");
      setConfirmingId(null);
      router.refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      console.error("[branch-staff-list] Error:", message);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsRemoving(false);
    }
  }

  if (userAssignments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed p-10 text-center bg-card/50">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
          <ShieldAlert className="h-5 w-5 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-sm font-semibold text-foreground">No staff assigned</h3>
        <p className="mt-1 text-xs text-muted-foreground max-w-xs">
          There are no staff members currently assigned to this branch.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-6">Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Assigned Date</TableHead>
            {isOwnerOrManager && <TableHead className="text-right pr-6">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {userAssignments.map((assignment) => (
            <TableRow key={assignment.id}>
              <TableCell className="font-medium pl-6">
                <div className="flex flex-col">
                  <span className="text-foreground">{assignment.user.name}</span>
                  {!assignment.user.isActive && (
                    <span className="text-[10px] font-semibold text-destructive mt-0.5">
                      Deactivated
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{assignment.user.email}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="text-xs">
                  {roleLabels[assignment.user.role]}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(assignment.createdAt).toLocaleDateString("en-KE", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </TableCell>
              {isOwnerOrManager && (
                <TableCell className="text-right pr-6">
                  {confirmingId === assignment.id ? (
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs text-destructive font-medium mr-1 animate-pulse">
                        Are you sure?
                      </span>
                      <Button
                        id={`confirm-remove-btn-${assignment.id}`}
                        size="icon-xs"
                        variant="destructive"
                        className="rounded-lg"
                        disabled={isRemoving}
                        onClick={() => handleRemove(assignment.id, assignment.userId)}
                      >
                        {isRemoving ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        id={`cancel-remove-btn-${assignment.id}`}
                        size="icon-xs"
                        variant="outline"
                        className="rounded-lg"
                        disabled={isRemoving}
                        onClick={() => setConfirmingId(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      id={`remove-staff-btn-${assignment.id}`}
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
                      onClick={() => setConfirmingId(assignment.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      Remove
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
