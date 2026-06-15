// components/dashboard/category-form.tsx
// Sheet-based form component for creating and updating product categories.

"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { z } from "zod";

import { categorySchema } from "@/lib/validations/category";
import { getDescendantIds } from "@/lib/category-tree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type CategoryFormValues = z.input<typeof categorySchema>;

interface CategoryFlat {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  isStockBearing: boolean;
}

interface CategoryFormProps {
  category?: {
    id: string;
    name: string;
    description?: string | null;
    imageUrl?: string | null;
    parentId?: string | null;
    sortOrder: number;
    isActive: boolean;
  };
  categories: CategoryFlat[];
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

interface CategoryOption {
  id: string;
  name: string;
  depth: number;
}

export function CategoryForm({ category, categories, trigger, onSuccess }: CategoryFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditMode = !!category;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? "",
      description: category?.description ?? "",
      imageUrl: category?.imageUrl ?? "",
      parentId: category?.parentId ?? "",
      sortOrder: category?.sortOrder ?? 0,
      isActive: category?.isActive ?? true,
    },
  });

  const isActiveValue = watch("isActive") ?? true;
  const parentIdValue = watch("parentId") ?? "";

  // Recursively build list of hierarchically indented categories
  function getCategoryOptions(
    list: CategoryFlat[],
    parentId: string | null = null,
    depth = 0
  ): CategoryOption[] {
    const options: CategoryOption[] = [];
    const currentLevel = list.filter((c) => c.parentId === parentId);
    currentLevel.sort((a, b) => a.sortOrder - b.sortOrder);
    
    for (const cat of currentLevel) {
      options.push({ id: cat.id, name: cat.name, depth });
      options.push(...getCategoryOptions(list, cat.id, depth + 1));
    }
    
    return options;
  }

  const allOptions = getCategoryOptions(categories);

  // Filter out the category itself and its descendants from parent options in edit mode to prevent cycles
  const nonSelectableIds = isEditMode
    ? [category.id, ...getDescendantIds(category.id, categories as any)]
    : [];

  const parentOptions = allOptions.filter((opt) => !nonSelectableIds.includes(opt.id));

  async function onSubmit(data: CategoryFormValues) {
    setIsSubmitting(true);
    try {
      const url = isEditMode
        ? `/api/dashboard/categories/${category.id}`
        : "/api/dashboard/categories";
      const method = isEditMode ? "PUT" : "POST";

      const payload = {
        ...data,
        parentId: data.parentId === "" ? null : data.parentId,
        description: data.description === "" ? null : data.description,
        imageUrl: data.imageUrl === "" ? null : data.imageUrl,
      };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await response.json()) as unknown;

      if (!response.ok) {
        const errorMessage =
          json !== null &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : "Failed to save category details.";
        toast.error(errorMessage);
        return;
      }

      toast.success(
        isEditMode
          ? "Category updated successfully!"
          : "Category created successfully!"
      );

      reset();
      setOpen(false);
      router.refresh();
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      console.error("[category-form] Error saving category:", message);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(val) => {
        setOpen(val);
        if (!val && !isEditMode) {
          reset();
        }
      }}
    >
      <SheetTrigger asChild>
        {trigger || (
          <Button id="add-category-btn" className="rounded-xl">
            Add category
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditMode ? "Edit Category" : "Add New Category"}</SheetTitle>
          <SheetDescription>
            {isEditMode
              ? "Update details and settings for this product category."
              : "Create a new category in your product hierarchy."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-4">
          {/* Category Name */}
          <div className="space-y-2">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              placeholder="e.g. T-Shirts"
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="category-desc">Description (Optional)</Label>
            <Textarea
              id="category-desc"
              placeholder="Brief description of products in this category..."
              rows={3}
              aria-invalid={!!errors.description}
              {...register("description")}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>

          {/* Image URL (Placeholder for Stage 4 ImageUpload) */}
          {/* TODO: Swap this with ImageUpload component once Stage 4 lands */}
          <div className="space-y-2">
            <Label htmlFor="category-image">Image URL (Optional)</Label>
            <Input
              id="category-image"
              placeholder="https://example.com/image.jpg"
              aria-invalid={!!errors.imageUrl}
              {...register("imageUrl")}
            />
            {errors.imageUrl && (
              <p className="text-xs text-destructive">{errors.imageUrl.message}</p>
            )}
          </div>

          {/* Parent Category */}
          <div className="space-y-2">
            <Label htmlFor="category-parent">Parent Category (Optional)</Label>
            <Select
              value={parentIdValue || "none"}
              onValueChange={(val) => setValue("parentId", val === "none" ? "" : val)}
            >
              <SelectTrigger id="category-parent" className="rounded-xl">
                <SelectValue placeholder="Select a parent category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Parent (Root Category)</SelectItem>
                {parentOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {Array(opt.depth).fill("—").join(" ")} {opt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.parentId && (
              <p className="text-xs text-destructive">{errors.parentId.message}</p>
            )}
          </div>

          {/* Sort Order */}
          <div className="space-y-2">
            <Label htmlFor="category-sort">Sort Order</Label>
            <Input
              id="category-sort"
              type="number"
              aria-invalid={!!errors.sortOrder}
              {...register("sortOrder", { valueAsNumber: true })}
            />
            {errors.sortOrder && (
              <p className="text-xs text-destructive">{errors.sortOrder.message}</p>
            )}
          </div>

          {/* Active Status */}
          <div className="flex items-center justify-between rounded-2xl border p-4 bg-muted/20">
            <div className="space-y-0.5">
              <Label htmlFor="category-status">Active Status</Label>
              <p className="text-xs text-muted-foreground">
                Inactive categories hide from the catalog.
              </p>
            </div>
            <Switch
              id="category-status"
              checked={isActiveValue}
              onCheckedChange={(checked) => setValue("isActive", checked, { shouldDirty: true })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              id="category-form-cancel"
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              id="category-form-submit"
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
