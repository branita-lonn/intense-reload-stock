// components/dashboard/convert-to-variants-dialog.tsx
// Dialog component to handle transitioning a product from product-level stock to variant-level tracking.

"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import * as z from "zod";

import { convertToVariantTrackingSchema } from "@/lib/validations/product";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface InventoryRecord {
  id: string;
  branchId: string;
  quantity: number;
  isReferenceSnapshot: boolean;
  branch: {
    name: string;
  };
}

interface ProductForConversion {
  id: string;
  name: string;
  inventoryRecords: InventoryRecord[];
}

interface ConvertToVariantsDialogProps {
  product: ProductForConversion;
  enableStockValueTracking?: boolean;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

type ConvertFormValues = z.input<typeof convertToVariantTrackingSchema>;

export function ConvertToVariantsDialog({
  product,
  enableStockValueTracking = false,
  trigger,
  onSuccess,
}: ConvertToVariantsDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"build" | "success">("build");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    suggestedStockCountUrl: string;
    previousQuantities: Array<{
      branchId: string;
      branchName: string;
      quantity: number;
    }>;
  } | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    reset,
    formState: { errors, isValid },
  } = useForm<ConvertFormValues>({
    resolver: zodResolver(convertToVariantTrackingSchema),
    mode: "onChange",
    defaultValues: {
      productId: product.id,
      initialVariants: [
        {
          sku: "",
          size: "",
          colour: "",
          brand: "",
          costPrice: undefined,
          sellingPrice: undefined,
          isActive: true,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "initialVariants",
  });

  const activeInventories = product.inventoryRecords.filter((r) => !r.isReferenceSnapshot);
  const currentStockSummary = activeInventories.length > 0
    ? activeInventories.map((inv) => `${inv.branch.name}: ${inv.quantity}`).join(", ")
    : "No stock recorded";

  const handleReset = () => {
    setStep("build");
    setIsSubmitting(false);
    setResult(null);
    reset({
      productId: product.id,
      initialVariants: [
        {
          sku: "",
          size: "",
          colour: "",
          brand: "",
          costPrice: undefined,
          sellingPrice: undefined,
          isActive: true,
        },
      ],
    });
  };

  const handleOpenChange = (val: boolean) => {
    setOpen(val);
    if (!val) {
      handleReset();
    }
  };

  async function onSubmit(data: ConvertFormValues) {
    if (fields.length === 0) {
      toast.error("At least one variant is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/dashboard/products/convert-to-variants", {
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
            : "Failed to convert to variants.";
        toast.error(errorMessage);
        return;
      }

      const parsedData = json as {
        suggestedStockCountUrl: string;
        previousQuantities: Array<{
          branchId: string;
          branchName: string;
          quantity: number;
        }>;
      };

      setResult({
        suggestedStockCountUrl: parsedData.suggestedStockCountUrl,
        previousQuantities: parsedData.previousQuantities,
      });

      toast.success("Converted to variant tracking successfully!");
      setStep("success");
      router.refresh();
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      console.error("[convert-to-variants-dialog] Error:", message);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="rounded-xl">
            Track by variant
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        {step === "build" ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>Track '{product.name}' by variant</span>
              </DialogTitle>
              <DialogDescription>
                Convert this product to use variant-level stock tracking. This process is irreversible.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="rounded-2xl border p-4 bg-muted/15 space-y-1 text-sm">
                <span className="font-semibold text-muted-foreground block text-xs uppercase tracking-wider">
                  Current Product-Level Stock
                </span>
                <span className="text-foreground font-medium">{currentStockSummary}</span>
              </div>

              <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/50 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div>
                  <span className="font-semibold block mb-0.5">Reference Snapshot Note</span>
                  <span>
                    Existing stock numbers will be preserved in a historical reference snapshot. All new variants will start with 0 stock. You can initialize stock via a stock count afterwards.
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    Define initial variants:
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl flex items-center gap-1"
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
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Variant
                  </Button>
                </div>

                <div className="space-y-3 max-h-80 overflow-y-auto border rounded-2xl p-4 bg-card">
                  {fields.map((field, idx) => (
                    <div
                      key={field.id}
                      className="p-3.5 rounded-xl border bg-muted/10 space-y-3 relative group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Variant #{idx + 1}
                        </span>
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => remove(idx)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label className="text-xs" htmlFor={`conv-sku-${idx}`}>SKU (Letters, Numbers, -)</Label>
                          <Input
                            id={`conv-sku-${idx}`}
                            className="h-8 text-xs"
                            placeholder="e.g. AF-WHT-40"
                            {...register(`initialVariants.${idx}.sku`)}
                          />
                          {errors.initialVariants?.[idx]?.sku && (
                            <p className="text-[10px] text-destructive">
                              {errors.initialVariants[idx]?.sku?.message}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs" htmlFor={`conv-size-${idx}`}>Size (Optional)</Label>
                          <Input
                            id={`conv-size-${idx}`}
                            className="h-8 text-xs"
                            placeholder="e.g. 40"
                            {...register(`initialVariants.${idx}.size`)}
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs" htmlFor={`conv-colour-${idx}`}>Colour (Optional)</Label>
                          <Input
                            id={`conv-colour-${idx}`}
                            className="h-8 text-xs"
                            placeholder="e.g. White"
                            {...register(`initialVariants.${idx}.colour`)}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                        <div className="space-y-1 sm:col-span-1">
                          <Label className="text-xs" htmlFor={`conv-brand-${idx}`}>Brand Override</Label>
                          <Input
                            id={`conv-brand-${idx}`}
                            className="h-8 text-xs"
                            placeholder="If different"
                            {...register(`initialVariants.${idx}.brand`)}
                          />
                        </div>

                        {enableStockValueTracking && (
                          <div className="space-y-1">
                            <Label className="text-xs" htmlFor={`conv-cost-${idx}`}>Cost Price ($)</Label>
                            <Input
                              id={`conv-cost-${idx}`}
                              className="h-8 text-xs"
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              {...register(`initialVariants.${idx}.costPrice`, { valueAsNumber: true })}
                            />
                            {errors.initialVariants?.[idx]?.costPrice && (
                              <p className="text-[10px] text-destructive">
                                {errors.initialVariants[idx]?.costPrice?.message}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="space-y-1">
                          <Label className="text-xs" htmlFor={`conv-sell-${idx}`}>Selling Price ($)</Label>
                          <Input
                            id={`conv-sell-${idx}`}
                            className="h-8 text-xs"
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            {...register(`initialVariants.${idx}.sellingPrice`, { valueAsNumber: true })}
                          />
                          {errors.initialVariants?.[idx]?.sellingPrice && (
                            <p className="text-[10px] text-destructive">
                              {errors.initialVariants[idx]?.sellingPrice?.message}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between sm:justify-center gap-2 pt-5">
                          <Label className="text-[11px]" htmlFor={`conv-active-${idx}`}>Active</Label>
                          <Switch
                            id={`conv-active-${idx}`}
                            checked={watch(`initialVariants.${idx}.isActive`) ?? true}
                            onCheckedChange={(checked) =>
                              setValue(`initialVariants.${idx}.isActive`, checked, { shouldValidate: true })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t mt-4">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="rounded-xl"
                disabled={isSubmitting || !isValid || fields.length === 0}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Converting...
                  </>
                ) : (
                  <>
                    Continue <ArrowRight className="ml-1.5 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                <span>Tracking Configured!</span>
              </DialogTitle>
              <DialogDescription>
                The inventory tracking setup for '{product.name}' has been updated successfully.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-3">
              <div className="text-sm text-muted-foreground space-y-2">
                <p>
                  The previous stock counts for '{product.name}' have been preserved as a historical reference snapshot.
                </p>
                <p>
                  All variants are now marked to track stock separately. You should run a guided stock count to initialize the starting quantities for each.
                </p>
              </div>

              {result && (
                <div className="space-y-3 pt-2">
                  <Button asChild className="w-full rounded-xl">
                    <Link href={result.suggestedStockCountUrl} onClick={() => setOpen(false)}>
                      {/* This link will 404 until Stage 7 is implemented. This is expected. */}
                      Start stock count for these items now
                    </Link>
                  </Button>

                  <Button
                    variant="ghost"
                    className="w-full rounded-xl text-muted-foreground"
                    onClick={() => setOpen(false)}
                  >
                    I'll do this later
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
