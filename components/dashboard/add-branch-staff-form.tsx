// components/dashboard/add-branch-staff-form.tsx
// Sheet component allowing managers to assign existing staff members to a branch.

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Users } from "lucide-react";
import { UserRole } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  branchAssignments: { branchId: string }[];
}

interface AddBranchStaffFormProps {
  branchId: string;
  assignedUserIds: string[];
}

export function AddBranchStaffForm({
  branchId,
  assignedUserIds,
}: AddBranchStaffFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  // Fetch all staff members when the sheet opens
  useEffect(() => {
    if (!open) return;

    async function fetchStaff() {
      setLoadingStaff(true);
      try {
        const response = await fetch("/api/dashboard/staff");
        if (!response.ok) throw new Error("Failed to load staff list.");
        const data = (await response.json()) as StaffMember[];
        setStaffList(data);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unexpected error";
        toast.error(msg);
      } finally {
        setLoadingStaff(false);
      }
    }

    void fetchStaff();
  }, [open]);

  // Filter out staff members who are already assigned or inactive
  const assignableStaff = staffList.filter(
    (member) => member.isActive && !assignedUserIds.includes(member.id)
  );

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserId) {
      toast.error("Please select a staff member to assign.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/dashboard/staff/${selectedUserId}/branches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId }),
      });

      const json = (await response.json()) as unknown;

      if (!response.ok) {
        const errorMessage =
          json !== null &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : "Failed to assign staff member.";
        toast.error(errorMessage);
        return;
      }

      toast.success("Staff assigned to branch successfully!");
      setOpen(false);
      setSelectedUserId("");
      router.refresh();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unexpected error";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button id="add-staff-to-branch-btn" className="rounded-xl">
          <Plus className="h-4 w-4 mr-2" />
          Add Staff
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Assign Staff to Branch</SheetTitle>
          <SheetDescription>
            Select an active staff member to grant them administrative access to this branch.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleAssign} className="space-y-6 pt-6">
          <div className="space-y-2">
            <Label htmlFor="assign-staff-select">Select Staff Member</Label>
            {loadingStaff ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 border rounded-xl">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading staff list...
              </div>
            ) : assignableStaff.length === 0 ? (
              <div className="text-sm text-muted-foreground p-3 border border-dashed rounded-xl bg-muted/20">
                No assignable staff members found. Ensure staff accounts are active and not already assigned.
              </div>
            ) : (
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger id="assign-staff-select" className="rounded-xl">
                  <SelectValue placeholder="Select a staff member" />
                </SelectTrigger>
                <SelectContent>
                  {assignableStaff.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name} ({member.email}) — {member.role === "BRANCH_MANAGER" ? "Manager" : "Staff"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              id="assign-staff-cancel"
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              id="assign-staff-submit"
              type="submit"
              className="rounded-xl"
              disabled={submitting || !selectedUserId || loadingStaff}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Assigning...
                </>
              ) : (
                "Assign Staff"
              )}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
