// components/dashboard/stock-count-client.tsx
// Client workspace for performing stock counts, editing quantities with auto-save, and finalizing reconciliation sessions

"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  TrendingDown,
  TrendingUp,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface StockCountItem {
  id: string;
  stockCountId: string;
  categoryId: string | null;
  productId: string | null;
  productVariantId: string | null;
  expectedQty: number;
  countedQty: number | null;
  variance: number | null;
  displayName: string;
}

interface StockCount {
  id: string;
  branchId: string;
  status: "IN_PROGRESS" | "COMPLETED";
  scope: "FULL_BRANCH" | "DRILL_DOWN_MIGRATION" | "VARIANT_CONVERSION_MIGRATION";
  scopeCategoryIds: string[];
  scopeProductId: string | null;
  startedById: string;
  completedById: string | null;
  startedAt: string | Date;
  completedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  items: StockCountItem[];
  startedBy: { id: string; name: string | null; email: string | null };
  completedBy: { id: string; name: string | null; email: string | null } | null;
}

interface StockCountClientProps {
  initialStockCount: StockCount;
  branchName: string;
  migrationBannerText: string | null;
  userRole: string;
  currentUserId: string;
}

export function StockCountClient({
  initialStockCount,
  branchName,
  migrationBannerText,
  userRole,
  currentUserId,
}: StockCountClientProps) {
  const router = useRouter();
  const [stockCount, setStockCount] = useState<StockCount>(initialStockCount);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | "UNCOUNTED" | "DISCREPANCY">("ALL");

  // Local input values (maps item.id to text value)
  const [localQuantities, setLocalQuantities] = useState<Record<string, string>>(() => {
    const initialValues: Record<string, string> = {};
    initialStockCount.items.forEach((item) => {
      initialValues[item.id] = item.countedQty !== null ? item.countedQty.toString() : "";
    });
    return initialValues;
  });

  const [savingStatus, setSavingStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);

  const pendingUpdatesRef = useRef<Record<string, number>>({});
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isCompleted = stockCount.status === "COMPLETED";
  const isManager = userRole === "OWNER" || userRole === "BRANCH_MANAGER";

  // Calculate live statistics
  const totalItems = stockCount.items.length;
  const countedCount = stockCount.items.filter((item) => item.countedQty !== null).length;
  const progressPercent = totalItems > 0 ? Math.round((countedCount / totalItems) * 100) : 0;

  const shortageCount = stockCount.items.filter(
    (item) => item.countedQty !== null && (item.variance ?? 0) < 0
  ).length;

  const surplusCount = stockCount.items.filter(
    (item) => item.countedQty !== null && (item.variance ?? 0) > 0
  ).length;

  const totalAbsoluteVariance = stockCount.items.reduce(
    (sum, item) => sum + Math.abs(item.variance ?? 0),
    0
  );

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Handle local text input edits
  const handleInputChange = (itemId: string, value: string) => {
    if (isCompleted) return;

    // Allow empty string or digits only (integers)
    if (value !== "" && !/^\d+$/.test(value)) {
      return;
    }

    setLocalQuantities((prev) => ({ ...prev, [itemId]: value }));

    const parsedQty = value === "" ? null : parseInt(value, 10);

    // Update local visual states immediately
    setStockCount((prev) => {
      const updatedItems = prev.items.map((item) => {
        if (item.id === itemId) {
          const variance = parsedQty !== null ? parsedQty - item.expectedQty : null;
          return {
            ...item,
            countedQty: parsedQty,
            variance,
          };
        }
        return item;
      });
      return { ...prev, items: updatedItems };
    });

    if (parsedQty !== null) {
      pendingUpdatesRef.current[itemId] = parsedQty;
      triggerDebouncedSave();
    }
  };

  // Debounced auto-save handler
  const triggerDebouncedSave = () => {
    setSavingStatus("saving");

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      const updates = { ...pendingUpdatesRef.current };
      pendingUpdatesRef.current = {}; // Clear queue

      const itemsPayload = Object.entries(updates).map(([stockCountItemId, countedQty]) => ({
        stockCountItemId,
        countedQty,
      }));

      if (itemsPayload.length === 0) {
        setSavingStatus("idle");
        return;
      }

      try {
        const res = await fetch(`/api/dashboard/stock-count/${stockCount.id}/submit`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stockCountId: stockCount.id,
            items: itemsPayload,
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to auto-save counts");
        }

        setSavingStatus("saved");
        setTimeout(() => {
          setSavingStatus((curr) => (curr === "saved" ? "idle" : curr));
        }, 2000);
      } catch {
        setSavingStatus("error");
        toast.error("Auto-save failed. Check your connection.");
        // Put back the unsaved items into the queue
        itemsPayload.forEach((item) => {
          pendingUpdatesRef.current[item.stockCountItemId] = item.countedQty;
        });
      }
    }, 8000); // 800ms debounce
  };

  // Submit on blur to ensure immediate save when user moves focus
  const handleInputBlur = async (itemId: string) => {
    if (isCompleted) return;

    const val = localQuantities[itemId];
    if (val === "") return;

    const countedQty = parseInt(val, 10);
    if (isNaN(countedQty)) return;

    // Check if it's already saved or still in pending
    if (pendingUpdatesRef.current[itemId] !== undefined) {
      // Trigger save immediately
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      pendingUpdatesRef.current[itemId] = countedQty;
      await saveImmediately();
    }
  };

  const saveImmediately = async () => {
    const updates = { ...pendingUpdatesRef.current };
    pendingUpdatesRef.current = {};

    const itemsPayload = Object.entries(updates).map(([stockCountItemId, countedQty]) => ({
      stockCountItemId,
      countedQty,
    }));

    if (itemsPayload.length === 0) return;

    setSavingStatus("saving");
    try {
      const res = await fetch(`/api/dashboard/stock-count/${stockCount.id}/submit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockCountId: stockCount.id,
          items: itemsPayload,
        }),
      });

      if (!res.ok) throw new Error("Save failed");
      setSavingStatus("saved");
      setTimeout(() => {
        setSavingStatus((curr) => (curr === "saved" ? "idle" : curr));
      }, 2000);
    } catch {
      setSavingStatus("error");
      itemsPayload.forEach((item) => {
        pendingUpdatesRef.current[item.stockCountItemId] = item.countedQty;
      });
    }
  };

  // Finalize / Apply adjustments
  const handleApplyClick = () => {
    // Check if any items are uncounted
    const uncounted = stockCount.items.some((item) => item.countedQty === null);
    if (uncounted) {
      toast.error("All items must be counted before finalizing stock reconciliation.");
      return;
    }
    setApplyConfirmOpen(true);
  };

  const handleApplyConfirm = async () => {
    setApplyLoading(true);
    try {
      // Ensure any pending updates are saved first
      if (Object.keys(pendingUpdatesRef.current).length > 0) {
        await saveImmediately();
      }

      const res = await fetch(`/api/dashboard/stock-count/${stockCount.id}/apply`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to finalize stock count.");
      }

      toast.success("Stock count applied successfully!");
      setApplyConfirmOpen(false);
      router.refresh();

      // Refresh local page state to read-only view
      setStockCount((prev) => ({
        ...prev,
        status: "COMPLETED",
        completedById: currentUserId,
        completedAt: new Date(),
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error applying adjustments";
      toast.error(msg);
    } finally {
      setApplyLoading(false);
    }
  };

  // Filter and search logic
  const filteredItems = stockCount.items.filter((item) => {
    const matchesSearch = item.displayName.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filter === "UNCOUNTED") {
      return item.countedQty === null;
    }
    if (filter === "DISCREPANCY") {
      return item.countedQty !== null && item.variance !== 0;
    }
    return true;
  });

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Navigation & Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <Link
              href="/dashboard/inventory"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Inventory
            </Link>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
              <span>Stock count — {branchName}</span>
              {isCompleted ? (
                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 rounded-xl">
                  Completed
                </Badge>
              ) : (
                <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 rounded-xl flex items-center gap-1">
                  In Progress
                </Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              Scope:{" "}
              <span className="font-semibold">
                {stockCount.scope === "FULL_BRANCH"
                  ? "Full Branch"
                  : stockCount.scope === "DRILL_DOWN_MIGRATION"
                  ? "Drill-down Split Migration"
                  : "Variant Conversion Migration"}
              </span>
              {" • "}
              Started by {stockCount.startedBy.name || stockCount.startedBy.email} on{" "}
              {new Date(stockCount.startedAt).toLocaleDateString()}
              {isCompleted && stockCount.completedAt && (
                <>
                  {" • "} Completed on {new Date(stockCount.completedAt).toLocaleDateString()}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Auto-save status indicator */}
            {!isCompleted && (
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-muted/20">
                {savingStatus === "saving" && (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    <span>Saving...</span>
                  </>
                )}
                {savingStatus === "saved" && (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-600 font-medium">All changes saved</span>
                  </>
                )}
                {savingStatus === "error" && (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                    <span className="text-destructive font-medium">Error saving</span>
                  </>
                )}
                {savingStatus === "idle" && (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                    <span>Syncing automatically</span>
                  </>
                )}
              </div>
            )}

            {/* Complete & Apply button */}
            {!isCompleted && (
              <>
                {isManager ? (
                  <Button onClick={handleApplyClick} className="rounded-2xl shadow-sm">
                    Complete & Apply
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button disabled className="rounded-2xl opacity-60">
                          Complete & Apply
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Ask your manager to finalise this count
                    </TooltipContent>
                  </Tooltip>
                )}
              </>
            )}
          </div>
        </div>

        {/* Migration banner */}
        {migrationBannerText && (
          <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2.5 shadow-sm">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="space-y-0.5">
              <span className="font-bold block">Migration Reference Total</span>
              <span>{migrationBannerText}</span>
            </div>
          </div>
        )}

        {/* Statistics Widgets */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-3xl border bg-card shadow-sm">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground">
                  {countedCount} <span className="text-sm font-normal text-muted-foreground">/ {totalItems}</span>
                </span>
                <span className="text-xs font-semibold text-muted-foreground">{progressPercent}%</span>
              </div>
              <div className="mt-2.5 w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border bg-card shadow-sm">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5 text-destructive" /> Shortages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-destructive">{shortageCount} items</span>
              <p className="text-xs text-muted-foreground mt-1">Variance &lt; 0</p>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border bg-card shadow-sm">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Surpluses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {surplusCount} items
              </span>
              <p className="text-xs text-muted-foreground mt-1">Variance &gt; 0</p>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border bg-card shadow-sm">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Percent className="w-3.5 h-3.5 text-primary" /> Total Discrepancy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-foreground">
                {totalAbsoluteVariance} units
              </span>
              <p className="text-xs text-muted-foreground mt-1">Absolute variance sum</p>
            </CardContent>
          </Card>
        </div>

        {/* Count Table Area */}
        <div className="rounded-3xl border bg-card overflow-hidden shadow-sm">
          {/* Table Toolbar */}
          <div className="p-4 border-b bg-muted/10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search items by name..."
                className="pl-10 rounded-2xl h-10 text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex rounded-2xl border bg-muted/20 p-1 self-start sm:self-center">
              <button
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  filter === "ALL" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setFilter("ALL")}
              >
                All
              </button>
              <button
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  filter === "UNCOUNTED" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setFilter("UNCOUNTED")}
              >
                Uncounted Only
              </button>
              <button
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  filter === "DISCREPANCY" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setFilter("DISCREPANCY")}
              >
                Discrepancies
              </button>
            </div>
          </div>

          {/* Items Table */}
          {filteredItems.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No matching inventory items found for count.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/10">
                <TableRow>
                  <TableHead className="w-1/2">Item Name</TableHead>
                  <TableHead className="text-right">Expected Qty</TableHead>
                  <TableHead className="w-32 text-center">Counted Qty</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => {
                  let varianceBadge = null;

                  if (item.countedQty === null) {
                    varianceBadge = <span className="text-xs text-muted-foreground font-medium">—</span>;
                  } else if (item.variance === 0) {
                    varianceBadge = (
                      <Badge variant="secondary" className="font-semibold rounded-lg bg-muted text-muted-foreground">
                        0
                      </Badge>
                    );
                  } else if (item.variance !== null && item.variance > 0) {
                    varianceBadge = (
                      <Badge className="font-semibold rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                        +{item.variance}
                      </Badge>
                    );
                  } else if (item.variance !== null && item.variance < 0) {
                    varianceBadge = (
                      <Badge className="font-semibold rounded-lg bg-destructive/10 text-destructive border-destructive/20">
                        {item.variance}
                      </Badge>
                    );
                  }

                  return (
                    <TableRow key={item.id} className="hover:bg-muted/5 transition-colors">
                      <TableCell className="font-semibold text-foreground py-4">
                        <div className="space-y-0.5">
                          <span>{item.displayName}</span>
                          <div className="text-[10px] text-muted-foreground font-mono flex gap-1">
                            {item.categoryId && <span>Category Point</span>}
                            {item.productId && <span>Product Point</span>}
                            {item.productVariantId && <span>Variant Level</span>}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-right font-medium text-sm">
                        {item.expectedQty}
                      </TableCell>

                      <TableCell className="py-2.5">
                        {isCompleted ? (
                          <div className="text-center font-bold text-sm text-foreground">
                            {item.countedQty ?? "—"}
                          </div>
                        ) : (
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="Count..."
                            className="h-9 rounded-xl text-center font-bold text-sm"
                            value={localQuantities[item.id] || ""}
                            onChange={(e) => handleInputChange(item.id, e.target.value)}
                            onBlur={() => handleInputBlur(item.id)}
                          />
                        )}
                      </TableCell>

                      <TableCell className="text-right py-4">{varianceBadge}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Apply Confirmation Dialog */}
        <Dialog open={applyConfirmOpen} onOpenChange={setApplyConfirmOpen}>
          <DialogContent className="sm:max-w-md rounded-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <span>Apply Stock Reconciliation?</span>
              </DialogTitle>
              <DialogDescription>
                This will finalize this session, update live inventory quantities, and write audit movement entries.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-2">
              <div className="rounded-2xl border p-4 bg-muted/10 space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Items Counted</span>
                  <span className="font-semibold">{countedCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Items with Shortages</span>
                  <span className="font-semibold text-destructive">{shortageCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Items with Surpluses</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {surplusCount}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-muted-foreground font-bold">Total Absolute Variance</span>
                  <span className="font-bold text-foreground">{totalAbsoluteVariance} units</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Warning: Once applied, this action is permanent. Live stock levels will be locked to the counted numbers.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => setApplyConfirmOpen(false)}
                disabled={applyLoading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                onClick={handleApplyConfirm}
                disabled={applyLoading}
              >
                {applyLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Finalizing...
                  </>
                ) : (
                  "Confirm & Apply"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
