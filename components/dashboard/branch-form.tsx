// components/dashboard/branch-form.tsx
// Sheet-based form component for creating and updating branches.

"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { z } from "zod";

import { branchSchema, branchUpdateSchema } from "@/lib/validations/branch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type BranchFormValues = z.infer<typeof branchSchema>;
type BranchUpdateFormValues = z.infer<typeof branchUpdateSchema>;

interface BranchFormProps {
  branch?: {
    id: string;
    name: string;
    town: string;
    address?: string | null;
    contactNumber?: string | null;
    isActive: boolean;
  };
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function BranchForm({ branch, trigger, onSuccess }: BranchFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditMode = !!branch;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<BranchUpdateFormValues>({
    resolver: zodResolver(isEditMode ? branchUpdateSchema : branchSchema),
    defaultValues: {
      name: branch?.name ?? "",
      town: branch?.town ?? "",
      address: branch?.address ?? "",
      contactNumber: branch?.contactNumber ?? "",
      isActive: branch?.isActive ?? true,
    },
  });

  const isActiveValue = watch("isActive") ?? true;

  async function onSubmit(data: BranchUpdateFormValues) {
    setIsSubmitting(true);
    try {
      const url = isEditMode
        ? `/api/dashboard/branches/${branch.id}`
        : "/api/dashboard/branches";
      const method = isEditMode ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
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
            : "Failed to save branch details.";
        toast.error(errorMessage);
        return;
      }

      toast.success(
        isEditMode
          ? "Branch details updated successfully!"
          : "Branch created successfully!"
      );
      
      reset();
      setOpen(false);
      router.refresh();
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      console.error("[branch-form] Error saving branch:", message);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(val) => {
      setOpen(val);
      if (!val && !isEditMode) {
        reset();
      }
    }}>
      <SheetTrigger asChild>
        {trigger || (
          <Button id="add-branch-btn" className="rounded-xl">
            Add branch
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditMode ? "Edit Branch" : "Add New Branch"}</SheetTitle>
          <SheetDescription>
            {isEditMode
              ? "Update settings and information for this branch."
              : "Create a new branch in the inventory management system."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-4">
          {/* Branch Name */}
          <div className="space-y-2">
            <Label htmlFor="branch-name">Branch Name</Label>
            <Input
              id="branch-name"
              placeholder="e.g. Westlands Central"
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Town */}
          <div className="space-y-2">
            <Label htmlFor="branch-town">Town / City</Label>
            <Input
              id="branch-town"
              placeholder="e.g. Nairobi"
              aria-invalid={!!errors.town}
              {...register("town")}
            />
            {errors.town && (
              <p className="text-xs text-destructive">{errors.town.message}</p>
            )}
          </div>

          {/* Address */}
          <div className="space-y-2">
            <Label htmlFor="branch-address">Street Address (Optional)</Label>
            <Input
              id="branch-address"
              placeholder="e.g. Mpaka Rd, Woodvale Grove"
              aria-invalid={!!errors.address}
              {...register("address")}
            />
            {errors.address && (
              <p className="text-xs text-destructive">{errors.address.message}</p>
            )}
          </div>

          {/* Contact Number */}
          <div className="space-y-2">
            <Label htmlFor="branch-contact">Contact Number (Optional)</Label>
            <Input
              id="branch-contact"
              placeholder="e.g. +254712345678 or 0712345678"
              aria-invalid={!!errors.contactNumber}
              {...register("contactNumber")}
            />
            {errors.contactNumber && (
              <p className="text-xs text-destructive">
                {errors.contactNumber.message}
              </p>
            )}
          </div>

          {/* isActive (Edit Mode Only) */}
          {isEditMode && (
            <div className="flex items-center justify-between rounded-2xl border p-4 bg-muted/20">
              <div className="space-y-0.5">
                <Label htmlFor="branch-status">Active Status</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive branches restrict operations but retain audit trails.
                </p>
              </div>
              <Switch
                id="branch-status"
                checked={isActiveValue}
                onCheckedChange={(checked) => setValue("isActive", checked, { shouldDirty: true })}
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              id="branch-form-cancel"
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              id="branch-form-submit"
              type="submit"
              className="rounded-xl"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
