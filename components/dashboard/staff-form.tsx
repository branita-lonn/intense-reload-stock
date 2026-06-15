// components/dashboard/staff-form.tsx
// Sheet-based form for creating new staff accounts with branch assignment.

"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import type { z } from "zod";

import { createStaffSchema } from "@/lib/validations/user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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

type CreateStaffValues = z.infer<typeof createStaffSchema>;

interface Branch {
  id: string;
  name: string;
  town: string;
}

interface StaffFormProps {
  branches: Branch[];
  onSuccess: (data: { name: string; temporaryPassword: string }) => void;
}

export function StaffForm({ branches, onSuccess }: StaffFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateStaffValues>({
    resolver: zodResolver(createStaffSchema),
    defaultValues: {
      branchIds: [],
      role: "STAFF",
    },
  });

  const selectedBranchIds = watch("branchIds") ?? [];
  const selectedRole = watch("role");

  function toggleBranch(branchId: string) {
    const current = selectedBranchIds;
    const updated = current.includes(branchId)
      ? current.filter((id) => id !== branchId)
      : [...current, branchId];
    setValue("branchIds", updated, { shouldValidate: true });
  }

  async function onSubmit(data: CreateStaffValues) {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/dashboard/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = (await response.json()) as unknown;

      if (!response.ok) {
        const errorMessage =
          json !== null &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : "Failed to create staff account.";
        toast.error(errorMessage);
        return;
      }

      const created = json as { name: string; temporaryPassword: string };
      reset();
      setOpen(false);
      router.refresh();
      onSuccess({ name: created.name, temporaryPassword: created.temporaryPassword });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      console.error("[staff-form] Error:", message);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(val) => { setOpen(val); if (!val) reset(); }}>
      <SheetTrigger asChild>
        <Button id="add-staff-btn" className="rounded-xl">
          <Plus className="h-4 w-4 mr-2" />
          Add staff
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add New Staff Member</SheetTitle>
          <SheetDescription>
            Create an account for a new staff member. They will be prompted to
            set their own password on first login.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pt-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="staff-name">Full Name</Label>
            <Input id="staff-name" placeholder="e.g. Jane Njoroge" {...register("name")} />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="staff-email">Email Address</Label>
            <Input
              id="staff-email"
              type="email"
              placeholder="jane@intensereload.co.ke"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label htmlFor="staff-role">Role</Label>
            <Select
              value={selectedRole}
              onValueChange={(val) =>
                setValue("role", val as "BRANCH_MANAGER" | "STAFF", { shouldValidate: true })
              }
            >
              <SelectTrigger id="staff-role" className="rounded-xl">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STAFF">Staff</SelectItem>
                <SelectItem value="BRANCH_MANAGER">Branch Manager</SelectItem>
              </SelectContent>
            </Select>
            {errors.role && (
              <p className="text-xs text-destructive">{errors.role.message}</p>
            )}
          </div>

          {/* Branch assignments */}
          <div className="space-y-2">
            <Label>Assign to Branches</Label>
            <div className="space-y-2 rounded-xl border p-3 bg-muted/20 max-h-48 overflow-y-auto">
              {branches.length === 0 ? (
                <p className="text-xs text-muted-foreground py-1">No branches available.</p>
              ) : (
                branches.map((branch) => (
                  <label
                    key={branch.id}
                    htmlFor={`branch-check-${branch.id}`}
                    className="flex items-center gap-2.5 cursor-pointer rounded-lg p-1.5 hover:bg-muted/40 transition-colors"
                  >
                    <Checkbox
                      id={`branch-check-${branch.id}`}
                      checked={selectedBranchIds.includes(branch.id)}
                      onCheckedChange={() => toggleBranch(branch.id)}
                    />
                    <span className="text-sm text-foreground">{branch.name}</span>
                    <span className="text-xs text-muted-foreground">— {branch.town}</span>
                  </label>
                ))
              )}
            </div>
            {errors.branchIds && (
              <p className="text-xs text-destructive">{errors.branchIds.message}</p>
            )}
          </div>

          {/* Temporary password */}
          <div className="space-y-2">
            <Label htmlFor="staff-temp-password">Temporary Password</Label>
            <Input
              id="staff-temp-password"
              type="text"
              placeholder="Min. 8 characters"
              {...register("temporaryPassword")}
            />
            <p className="text-xs text-muted-foreground">
              Staff will be required to change this on their first login.
            </p>
            {errors.temporaryPassword && (
              <p className="text-xs text-destructive">
                {errors.temporaryPassword.message}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              id="staff-form-cancel"
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              id="staff-form-submit"
              type="submit"
              className="rounded-xl"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create account"
              )}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
