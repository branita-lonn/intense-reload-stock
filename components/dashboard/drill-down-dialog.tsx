// components/dashboard/drill-down-dialog.tsx
// Dialog component to handle the owner-scoped category drill-down stock migration flow.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface BranchDetails {
  id: string;
  name: string;
}

interface InventoryRecord {
  id: string;
  branchId: string;
  quantity: number;
  isReferenceSnapshot: boolean;
  branch: BranchDetails;
}

interface CategoryChild {
  id: string;
  name: string;
  isStockBearing: boolean;
  hasStockBearingDescendants?: boolean; // client-side computed
}

interface CategoryWithStock {
  id: string;
  name: string;
  inventoryRecords: InventoryRecord[];
  children?: CategoryChild[];
}

interface FlatCategory {
  id: string;
  parentId: string | null;
  isStockBearing: boolean;
  name: string;
}

interface DrillDownDialogProps {
  category: CategoryWithStock;
  allCategories: FlatCategory[];
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function DrillDownDialog({
  category,
  allCategories,
  trigger,
  onSuccess,
}: DrillDownDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"select" | "success">("select");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    suggestedStockCountUrl: string;
    newInventoryRows: Array<{
      categoryId: string;
      categoryName: string;
      branchName: string;
      highlighted: boolean;
    }>;
  } | null>(null);

  const directChildren = category.children || [];
  const activeInventories = category.inventoryRecords.filter((r) => !r.isReferenceSnapshot);

  // Format quantities: "Mombasa 120, Nairobi 85, Kisumu 60"
  const currentStockSummary = activeInventories.length > 0
    ? activeInventories.map((inv) => `${inv.branch.name}: ${inv.quantity}`).join(", ")
    : "No stock recorded";

  // Check if child has a stock-bearing descendant to disable selection
  const childrenWithStatus = directChildren.map((child) => {
    // Recursive helper to check stock bearing in descendants
    const checkDescendants = (id: string): boolean => {
      const descendants = allCategories.filter((c) => c.parentId === id);
      return descendants.some((c) => c.isStockBearing || checkDescendants(c.id));
    };
    
    const hasDescendantConflict = checkDescendants(child.id);
    return {
      ...child,
      hasDescendantConflict,
    };
  });

  const isSelectionEmpty = selectedIds.length === 0;

  const handleToggleChild = (childId: string) => {
    setSelectedIds((prev) =>
      prev.includes(childId) ? prev.filter((id) => id !== childId) : [...prev, childId]
    );
  };

  const handleReset = () => {
    setStep("select");
    setSelectedIds([]);
    setIsSubmitting(false);
    setResult(null);
  };

  const handleOpenChange = (val: boolean) => {
    setOpen(val);
    if (!val) {
      handleReset();
    }
  };

  async function handleContinue() {
    if (isSelectionEmpty) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/dashboard/categories/drill-down", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentCategoryId: category.id,
          childCategoryIds: selectedIds,
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
            : "Failed to perform drill-down migration.";
        toast.error(errorMessage);
        return;
      }

      const parsedData = json as {
        suggestedStockCountUrl: string;
        newInventoryRows: any[];
      };

      setResult({
        suggestedStockCountUrl: parsedData.suggestedStockCountUrl,
        newInventoryRows: parsedData.newInventoryRows,
      });

      toast.success("Split tracking configured successfully!");
      setStep("success");
      router.refresh();
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      console.error("[drill-down-dialog] Error:", message);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasOrphanSiblings = selectedIds.length > 0 && selectedIds.length < directChildren.length;
  const orphanSiblingNames = directChildren
    .filter((c) => !selectedIds.includes(c.id))
    .map((c) => c.name)
    .join(", ");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="rounded-xl">
            Drill Down
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {step === "select" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>Split up tracking for '{category.name}'</span>
              </DialogTitle>
              <DialogDescription>
                Distribute consolidated category stock tracking into subcategories.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="rounded-2xl border p-4 bg-muted/15 space-y-1 text-sm">
                <span className="font-semibold text-muted-foreground block text-xs uppercase tracking-wider">
                  Current Stock Levels
                </span>
                <span className="text-foreground font-medium">{currentStockSummary}</span>
              </div>

              <div className="space-y-2">
                <span className="text-sm font-semibold text-foreground block">
                  Select subcategories to track separately:
                </span>
                <span className="text-xs text-muted-foreground block">
                  Subcategories you do not select will still start being tracked separately to prevent untracked inventory, but starting counts will be 0.
                </span>

                <TooltipProvider>
                  <div className="space-y-2.5 max-h-60 overflow-y-auto border rounded-2xl p-4 bg-card">
                    {childrenWithStatus.map((child) => {
                      if (child.hasDescendantConflict) {
                        return (
                          <div
                            key={child.id}
                            className="flex items-center space-x-3 opacity-60 cursor-not-allowed"
                          >
                            <Checkbox id={child.id} checked disabled />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <label
                                  htmlFor={child.id}
                                  className="text-sm font-medium leading-none text-muted-foreground cursor-not-allowed"
                                >
                                  {child.name} (Subcategory tracks stock)
                                </label>
                              </TooltipTrigger>
                              <TooltipContent>
                                This subcategory has descendants that are already stock-bearing.
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        );
                      }

                      return (
                        <div key={child.id} className="flex items-center space-x-3">
                          <Checkbox
                            id={child.id}
                            checked={selectedIds.includes(child.id)}
                            onCheckedChange={() => handleToggleChild(child.id)}
                            disabled={isSubmitting}
                          />
                          <label
                            htmlFor={child.id}
                            className="text-sm font-medium leading-none text-foreground cursor-pointer"
                          >
                            {child.name}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </TooltipProvider>
              </div>

              {hasOrphanSiblings && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/50 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <div>
                    <span className="font-semibold block mb-0.5">Note on sibling categories</span>
                    <span>
                      '{orphanSiblingNames}' will also start being tracked separately to prevent data loss. Their starting count will be 0.
                    </span>
                  </div>
                </div>
              )}
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
                type="button"
                className="rounded-xl"
                onClick={handleContinue}
                disabled={isSubmitting || isSelectionEmpty}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Migrating...
                  </>
                ) : (
                  <>
                    Continue <ArrowRight className="ml-1.5 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                <span>Tracking Split Configured!</span>
              </DialogTitle>
              <DialogDescription>
                The inventory tracking setup for '{category.name}' has been updated successfully.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-3">
              <div className="text-sm text-muted-foreground space-y-2">
                <p>
                  The previous stock counts for '{category.name}' have been preserved as a historical reference snapshot.
                </p>
                <p>
                  All subcategories are now marked to track stock separately. You should run a guided stock count to initialize the starting quantities for each.
                </p>
              </div>

              {result && (
                <div className="space-y-3 pt-2">
                  <Button asChild className="w-full rounded-xl">
                    <Link href={result.suggestedStockCountUrl} onClick={() => setOpen(false)}>
                      {/* This link will 404 until Stage 7 is implemented. This is expected — the drill-down operation itself has completed successfully and the data model is correctly updated; only the guided counting UI is pending. */}
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
