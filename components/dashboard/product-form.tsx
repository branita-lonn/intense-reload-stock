// components/dashboard/product-form.tsx
// Multi-step product creation and modification form with validation, media uploading, and dynamic stock level configurations.

"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ArrowLeft, ArrowRight, Save, X } from "lucide-react";
import type { z } from "zod";

import { productWithVariantsSchema } from "@/lib/validations/product";
import type { CategoryWithRelations, ProductWithRelations, ProductFormValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUpload } from "@/components/dashboard/image-upload";

type FormSchemaType = z.input<typeof productWithVariantsSchema>;

interface ProductFormProps {
  initialProduct?: ProductWithRelations;
  categories: CategoryWithRelations[];
  enableStockValueTracking: boolean;
}

export function ProductForm({
  initialProduct,
  categories,
  enableStockValueTracking,
}: ProductFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState(1);
  const [tagInput, setTagInput] = useState("");

  const isEditMode = !!initialProduct;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    control,
    formState: { errors },
  } = useForm<FormSchemaType>({
    resolver: zodResolver(productWithVariantsSchema),
    defaultValues: {
      name: initialProduct?.name ?? "",
      description: initialProduct?.description ?? "",
      brand: initialProduct?.brand ?? "",
      tags: initialProduct?.tags ?? [],
      categoryId: initialProduct?.categoryId ?? "",
      isActive: initialProduct?.isActive ?? true,
      images: initialProduct?.images ?? [],
      variants:
        initialProduct?.variants?.map((v) => ({
          id: v.id,
          sku: v.sku ?? "",
          size: v.size ?? "",
          colour: v.colour ?? "",
          brand: v.brand ?? "",
          costPrice: v.costPrice ? Number(v.costPrice) : undefined,
          sellingPrice: v.sellingPrice ? Number(v.sellingPrice) : undefined,
          isActive: v.isActive,
        })) ?? [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "variants",
  });

  const categoryIdValue = watch("categoryId") ?? "";
  const nameValue = watch("name") ?? "";
  const tagsValue = watch("tags") ?? [];
  const imagesValue = watch("images") ?? [];
  const variantsValue = watch("variants") ?? [];

  // Determine selected category stock-bearing status
  const selectedCategory = categories.find((c) => c.id === categoryIdValue);
  const isCategoryStockBearing = selectedCategory?.isStockBearing ?? false;

  // Track stock setup selection type:
  // "whole" = track stock for this product as a whole (product-level stock)
  // "variant" = track stock by variants (size, colour, etc.)
  const [trackingType, setTrackingType] = useState<"whole" | "variant">(
    initialProduct?.variants && initialProduct.variants.length > 0 ? "variant" : "whole"
  );

  // ---------------------------------------------------------------------------
  // Step navigation configuration
  // ---------------------------------------------------------------------------
  const steps: { id: number; label: string }[] = [];
  steps.push({ id: 1, label: "Details" });
  if (!isEditMode) {
    steps.push({ id: 2, label: "Stock Setup" });
    if (trackingType === "variant" && !isCategoryStockBearing) {
      steps.push({ id: 3, label: "Variants" });
    }
  } else {
    // If product has variants, show Step 3 (Variants) in edit mode
    if (initialProduct?.variants && initialProduct.variants.length > 0) {
      steps.push({ id: 3, label: "Variants" });
    }
  }
  steps.push({ id: 4, label: "Media" });

  const currentStepIndex = steps.findIndex((s) => s.id === step);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  async function handleNext() {
    if (step === 1) {
      const isValid = await trigger(["name", "categoryId", "brand", "tags", "description", "isActive"]);
      if (!isValid) return;
    }

    if (step === 2) {
      if (trackingType === "variant" && !isCategoryStockBearing && fields.length === 0) {
        // Automatically add one empty variant row as a start
        append({
          sku: "",
          size: "",
          colour: "",
          brand: "",
          costPrice: undefined,
          sellingPrice: undefined,
          isActive: true,
        });
      }
    }

    if (step === 3) {
      const isValid = await trigger("variants");
      if (!isValid) return;
      if (fields.length === 0) {
        toast.error("At least one variant must be added to track stock by variant.");
        return;
      }
    }

    if (currentStepIndex < steps.length - 1) {
      setStep(steps[currentStepIndex + 1].id);
    }
  }

  function handleBack() {
    if (currentStepIndex > 0) {
      setStep(steps[currentStepIndex - 1].id);
    }
  }

  // ---------------------------------------------------------------------------
  // Tag Chip Input Actions
  // ---------------------------------------------------------------------------
  function addTag(tagText: string) {
    const trimmed = tagText.trim();
    if (!trimmed) return;
    if (trimmed.length > 30) {
      toast.error("Tag cannot exceed 30 characters.");
      return;
    }
    if (tagsValue.includes(trimmed)) {
      toast.error("Tag already added.");
      return;
    }
    if (tagsValue.length >= 15) {
      toast.error("You can add up to 15 tags only.");
      return;
    }
    setValue("tags", [...tagsValue, trimmed], { shouldDirty: true });
    setTagInput("");
  }

  function removeTag(tagToRemove: string) {
    setValue(
      "tags",
      tagsValue.filter((t) => t !== tagToRemove),
      { shouldDirty: true }
    );
  }

  // ---------------------------------------------------------------------------
  // Category indent options builder
  // ---------------------------------------------------------------------------
  interface CategoryOption {
    id: string;
    name: string;
    depth: number;
  }

  function getCategoryOptions(
    list: CategoryWithRelations[],
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

  const categoryOptions = getCategoryOptions(categories);

  // ---------------------------------------------------------------------------
  // Form submission handler
  // ---------------------------------------------------------------------------
  async function onSubmit(data: FormSchemaType) {
    setIsSubmitting(true);
    try {
      if (isEditMode) {
        // Edit mode PUT request
        const response = await fetch(`/api/dashboard/products/${initialProduct.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...data,
            description: data.description === "" ? null : data.description,
            brand: data.brand === "" ? null : data.brand,
            variants: trackingType === "variant" ? data.variants : [],
          }),
        });

        const json = (await response.json()) as unknown;

        if (!response.ok) {
          const errorMessage =
            json !== null &&
            typeof json === "object" &&
            "error" in json &&
            typeof (json as { error: unknown }).error === "string"
              ? (json as { error: string }).error
              : "Failed to save product details.";
          toast.error(errorMessage);
          return;
        }

        toast.success("Product updated successfully!");
        router.push("/dashboard/products");
        router.refresh();
      } else {
        // Create mode POST request
        // Step 1: Create the catalogue entry first (variants created too if selected)
        const response = await fetch("/api/dashboard/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...data,
            description: data.description === "" ? null : data.description,
            brand: data.brand === "" ? null : data.brand,
            variants: trackingType === "variant" && !isCategoryStockBearing ? data.variants : [],
          }),
        });

        const json = (await response.json()) as unknown;

        if (!response.ok) {
          const errorMessage =
            json !== null &&
            typeof json === "object" &&
            "error" in json &&
            typeof (json as { error: unknown }).error === "string"
              ? (json as { error: string }).error
              : "Failed to create product.";
          toast.error(errorMessage);
          return;
        }

        const createdProduct = json as { id: string };

        // Step 2: If "Track stock for this product as a whole" was chosen, enable stock bearing
        if (trackingType === "whole" && !isCategoryStockBearing) {
          const toggleResponse = await fetch("/api/dashboard/products/stock-bearing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productId: createdProduct.id,
              enable: true,
            }),
          });

          if (!toggleResponse.ok) {
            const toggleJson = (await toggleResponse.json()) as { error?: string };
            toast.error(
              toggleJson.error ?? "Product created, but failed to initialize stock-bearing rows."
            );
          }
        }

        toast.success("Product created successfully!");
        router.push("/dashboard/products");
        router.refresh();
      }
    } catch (error: unknown) {
      console.error("[product-form] Error saving product:", error);
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Progress Indicators */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-between">
          {steps.map((s, idx) => {
            const isActive = s.id === step;
            const isCompleted = steps.findIndex((val) => val.id === step) > idx;

            return (
              <div key={s.id} className="flex flex-col items-center bg-card px-4">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition-all ${
                    isActive
                      ? "border-primary bg-primary text-primary-foreground scale-110 shadow"
                      : isCompleted
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-muted bg-card text-muted-foreground"
                  }`}
                >
                  {s.id}
                </span>
                <span
                  className={`mt-2 text-xs font-medium ${
                    isActive ? "text-primary font-bold" : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-4">
        {/* ========================================================================= */}
        {/* STEP 1: CATALOGUE DETAILS                                                 */}
        {/* ========================================================================= */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Product Name */}
              <div className="space-y-2">
                <Label htmlFor="prod-name">Product Name</Label>
                <Input
                  id="prod-name"
                  placeholder="e.g. Graphic T-Shirt Flame"
                  aria-invalid={!!errors.name}
                  {...register("name")}
                />
                {errors.name && (
                  <p className="text-xs text-destructive">{errors.name.message}</p>
                )}
              </div>

              {/* Category Select */}
              <div className="space-y-2">
                <Label htmlFor="prod-category">Category</Label>
                <Select
                  value={categoryIdValue || undefined}
                  onValueChange={(val) => setValue("categoryId", val, { shouldDirty: true })}
                >
                  <SelectTrigger id="prod-category" className="rounded-xl">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {Array(opt.depth).fill("—").join(" ")} {opt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.categoryId && (
                  <p className="text-xs text-destructive">{errors.categoryId.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Brand */}
              <div className="space-y-2">
                <Label htmlFor="prod-brand">Brand / Brand Identifier (Optional)</Label>
                <Input
                  id="prod-brand"
                  placeholder="e.g. Nike, Converse"
                  aria-invalid={!!errors.brand}
                  {...register("brand")}
                />
                {errors.brand && (
                  <p className="text-xs text-destructive">{errors.brand.message}</p>
                )}
              </div>

              {/* Tag Chip Input */}
              <div className="space-y-2">
                <Label htmlFor="prod-tags">Tags (Optional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="prod-tags"
                    placeholder="Type tag and press Add"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag(tagInput);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => addTag(tagInput)}
                    className="rounded-xl"
                  >
                    Add
                  </Button>
                </div>

                {/* Display chips */}
                {tagsValue.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tagsValue.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 bg-muted px-2.5 py-0.5 rounded-full text-xs font-medium text-muted-foreground border border-border"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="hover:text-destructive text-muted-foreground/60 transition-colors"
                          aria-label={`Remove tag ${tag}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="prod-desc">Description (Optional)</Label>
              <Textarea
                id="prod-desc"
                placeholder="Product descriptions, specs, fabrics..."
                rows={4}
                aria-invalid={!!errors.description}
                {...register("description")}
              />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description.message}</p>
              )}
            </div>

            {/* Active Switch */}
            <div className="flex items-center justify-between rounded-2xl border p-4 bg-muted/20">
              <div className="space-y-0.5">
                <Label htmlFor="prod-status">Active Catalogue Entry</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive products are hidden from POS and storefront interfaces.
                </p>
              </div>
              <Switch
                id="prod-status"
                checked={watch("isActive") ?? true}
                onCheckedChange={(checked) => setValue("isActive", checked, { shouldDirty: true })}
              />
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 2: STOCK SETUP (CREATE FLOW ONLY)                                    */}
        {/* ========================================================================= */}
        {step === 2 && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-foreground">Stock Granularity Setup</h3>

            {isCategoryStockBearing ? (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-amber-800 dark:text-amber-300 space-y-2">
                <p className="text-sm font-semibold">Category-Level Tracking Enabled</p>
                <p className="text-xs leading-relaxed">
                  Stock for products in <strong>{selectedCategory?.name}</strong> is tracked at the
                  category level. This product won't have its own stock entries — it exists in
                  your catalogue for organization and future flexibility.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Configure where the inventory quantities for this product will be recorded.
                </p>

                <RadioGroup
                  value={trackingType}
                  onValueChange={(val) => setTrackingType(val as "whole" | "variant")}
                  className="grid grid-cols-1 gap-4 sm:grid-cols-2"
                >
                  {/* Option A: Product level stock */}
                  <Label
                    htmlFor="track-whole"
                    className={`flex flex-col gap-1 rounded-2xl border p-4 hover:bg-muted/30 cursor-pointer transition-all ${
                      trackingType === "whole" ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="whole" id="track-whole" />
                      <span className="font-bold text-sm">Product-Level Stock</span>
                    </div>
                    <span className="text-xs text-muted-foreground pl-6 font-normal mt-1">
                      One stock number per branch, e.g. "12 Canvas Bags in Nyali Branch". Ideal for simple items.
                    </span>
                  </Label>

                  {/* Option B: Variant level stock */}
                  <Label
                    htmlFor="track-variant"
                    className={`flex flex-col gap-1 rounded-2xl border p-4 hover:bg-muted/30 cursor-pointer transition-all ${
                      trackingType === "variant" ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="variant" id="track-variant" />
                      <span className="font-bold text-sm">Track by Variant</span>
                    </div>
                    <span className="text-xs text-muted-foreground pl-6 font-normal mt-1">
                      Separate stock quantities for each size/colour combination, e.g. "5 XL T-shirts, 3 Medium T-shirts".
                    </span>
                  </Label>
                </RadioGroup>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 3: VARIANTS MANAGEMENT                                               */}
        {/* ========================================================================= */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-foreground">Configure Variants</h3>
                <p className="text-xs text-muted-foreground">
                  Create size/colour variations. At least 1 variant is required to save.
                </p>
              </div>
              <Button
                type="button"
                onClick={() =>
                  append({
                    sku: "",
                    size: "",
                    colour: "",
                    brand: "",
                    costPrice: undefined,
                    sellingPrice: undefined,
                    isActive: true,
                  })
                }
                className="rounded-xl flex items-center gap-1.5"
                size="sm"
              >
                <Plus className="w-4 h-4" /> Add Variant
              </Button>
            </div>

            {fields.length === 0 ? (
              <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-8 bg-muted/20">
                <p className="text-sm font-medium text-muted-foreground">No variants added yet.</p>
                <p className="text-xs text-muted-foreground mt-0.5">Click the button above to create a variant.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {fields.map((field, idx) => (
                  <div
                    key={field.id}
                    className="flex flex-col gap-4 p-4 rounded-2xl border bg-muted/10 relative group"
                  >
                    {/* Header bar of variant card */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Variant #{idx + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => remove(idx)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      {/* SKU */}
                      <div className="space-y-1">
                        <Label className="text-xs" htmlFor={`v-sku-${idx}`}>SKU (Letters, Numbers, Hyphens)</Label>
                        <Input
                          id={`v-sku-${idx}`}
                          placeholder="e.g. AF-CLASSIC-WHT-40"
                          {...register(`variants.${idx}.sku`)}
                        />
                        {errors.variants?.[idx]?.sku && (
                          <p className="text-[10px] text-destructive">
                            {errors.variants[idx]?.sku?.message}
                          </p>
                        )}
                      </div>

                      {/* Size */}
                      <div className="space-y-1">
                        <Label className="text-xs" htmlFor={`v-size-${idx}`}>Size (Optional)</Label>
                        <Input
                          id={`v-size-${idx}`}
                          placeholder="e.g. 40, XL, 32W"
                          {...register(`variants.${idx}.size`)}
                        />
                        {errors.variants?.[idx]?.size && (
                          <p className="text-[10px] text-destructive">
                            {errors.variants[idx]?.size?.message}
                          </p>
                        )}
                      </div>

                      {/* Colour */}
                      <div className="space-y-1">
                        <Label className="text-xs" htmlFor={`v-colour-${idx}`}>Colour (Optional)</Label>
                        <Input
                          id={`v-colour-${idx}`}
                          placeholder="e.g. White, Camo Black"
                          {...register(`variants.${idx}.colour`)}
                        />
                        {errors.variants?.[idx]?.colour && (
                          <p className="text-[10px] text-destructive">
                            {errors.variants[idx]?.colour?.message}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                      {/* Brand Override */}
                      <div className="space-y-1 sm:col-span-1">
                        <Label className="text-xs" htmlFor={`v-brand-${idx}`}>Brand Override (Optional)</Label>
                        <Input
                          id={`v-brand-${idx}`}
                          placeholder="If different from product"
                          {...register(`variants.${idx}.brand`)}
                        />
                      </div>

                      {/* Cost Price - only shown if enableStockValueTracking is true */}
                      {enableStockValueTracking && (
                        <div className="space-y-1">
                          <Label className="text-xs" htmlFor={`v-cost-${idx}`}>Cost Price ($)</Label>
                          <Input
                            id={`v-cost-${idx}`}
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            {...register(`variants.${idx}.costPrice`, { valueAsNumber: true })}
                          />
                          {errors.variants?.[idx]?.costPrice && (
                            <p className="text-[10px] text-destructive">
                              {errors.variants[idx]?.costPrice?.message}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Selling Price */}
                      <div className="space-y-1">
                        <Label className="text-xs" htmlFor={`v-sell-${idx}`}>Selling Price ($)</Label>
                        <Input
                          id={`v-sell-${idx}`}
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          {...register(`variants.${idx}.sellingPrice`, { valueAsNumber: true })}
                        />
                        {errors.variants?.[idx]?.sellingPrice && (
                          <p className="text-[10px] text-destructive">
                            {errors.variants[idx]?.sellingPrice?.message}
                          </p>
                        )}
                      </div>

                      {/* Active Toggle */}
                      <div className="flex items-center justify-between sm:justify-center gap-2 pt-6">
                        <Label className="text-xs" htmlFor={`v-active-${idx}`}>Active</Label>
                        <Switch
                          id={`v-active-${idx}`}
                          checked={watch(`variants.${idx}.isActive`) ?? true}
                          onCheckedChange={(checked) =>
                            setValue(`variants.${idx}.isActive`, checked, { shouldDirty: true })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 4: MEDIA UPLOADS                                                     */}
        {/* ========================================================================= */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-foreground">Media Uploads</h3>
              <p className="text-xs text-muted-foreground">
                Drag-and-drop to reorder images. Max 8 files. First image will represent the product cover photo.
              </p>
            </div>

            <ImageUpload
              value={imagesValue}
              onChange={(urls) => setValue("images", urls, { shouldDirty: true })}
              onRemove={(url) =>
                setValue(
                  "images",
                  imagesValue.filter((i) => i !== url),
                  { shouldDirty: true }
                )
              }
              maxImages={8}
              folder="intense-reload/products"
            />
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP NAVIGATION CONTROLS                                                 */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-between pt-6 border-t border-border">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl flex items-center gap-1.5"
            onClick={handleBack}
            disabled={isFirstStep || isSubmitting}
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>

          {!isLastStep ? (
            <Button
              type="button"
              className="rounded-xl flex items-center gap-1.5"
              onClick={handleNext}
            >
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              className="rounded-xl flex items-center gap-1.5"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {isEditMode ? "Save changes" : "Create product"}
                </>
              )}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
