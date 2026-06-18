// components/dashboard/inventory-client.tsx
// Client component managing inventory list view, filters, branch switcher, and variant conversion trigger.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FolderTree,
  Search,
  Filter,
  Layers,
  ArrowRight,
  Loader2,
  AlertTriangle,
  Boxes,
  HelpCircle,
  PlusCircle,
  TrendingDown,
} from "lucide-react";

import type { CategoryWithRelations } from "@/types";
import type { InventoryRow } from "@/lib/inventory-queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ConvertToVariantsDialog } from "@/components/dashboard/convert-to-variants-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface InventoryClientProps {
  initialCategories: CategoryWithRelations[];
  branches: Array<{ id: string; name: string }>;
  userRole: string;
  initialBranchId?: string;
  enableStockValueTracking: boolean;
  initialInventoryRows: InventoryRow[];
}

export function InventoryClient({
  initialCategories,
  branches,
  userRole,
  initialBranchId,
  enableStockValueTracking,
  initialInventoryRows,
}: InventoryClientProps) {
  const router = useRouter();

  // Core Stock List Data State
  const [rows, setRows] = useState<InventoryRow[]>(initialInventoryRows);
  const [loading, setLoading] = useState(false);

  // Filter States
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [branchId, setBranchId] = useState(initialBranchId ?? "all");
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Dynamic Aggregate Summary States (computed from visible rows)
  const [totalQuantity, setTotalQuantity] = useState(() =>
    initialInventoryRows.reduce((sum, r) => sum + r.quantity, 0)
  );
  const [totalItems, setTotalItems] = useState(initialInventoryRows.length);
  const [lowStockCount, setLowStockCount] = useState(() =>
    initialInventoryRows.filter((r) => r.isLowStock).length
  );

  const isOwner = userRole === "OWNER";

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

  const categoryOptions = getCategoryOptions(initialCategories);

  // ---------------------------------------------------------------------------
  // Load inventory list based on active filters
  // ---------------------------------------------------------------------------
  const fetchInventory = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (categoryId && categoryId !== "all") params.set("categoryId", categoryId);
      if (branchId && branchId !== "all") params.set("branchId", branchId);
      if (lowStockOnly) params.set("lowStockOnly", "true");

      const response = await fetch(`/api/dashboard/inventory?${params.toString()}`);
      if (response.ok) {
        const data = (await response.json()) as {
          rows: InventoryRow[];
          totalItems: number;
          totalQuantity: number;
          lowStockCount: number;
        };
        setRows(data.rows);
        setTotalItems(data.totalItems);
        setTotalQuantity(data.totalQuantity);
        setLowStockCount(data.lowStockCount);
      } else {
        toast.error("Failed to load inventory stock records.");
      }
    } catch (error: unknown) {
      console.error("[inventory-client] fetch error:", error);
      toast.error("Failed to fetch inventory details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Debounce the search input to avoid spamming the DB on keypresses
    const delayDebounceFn = setTimeout(() => {
      fetchInventory();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryId, branchId, lowStockOnly]);

  // Redirect to stock-in page prefilled with this item's context
  const handleStockIn = (row: InventoryRow) => {
    router.push(
      `/dashboard/stock-in?branchId=${row.branchId}&nodeType=${row.nodeType}&nodeId=${row.nodeId}`
    );
  };

  const showBranchColumn = branchId === "all";

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              Inventory Dashboard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Unified real-time stock view across category, product, and variant levels.
            </p>
          </div>

          {/* Branch Switcher */}
          <div className="flex items-center gap-2">
            {isOwner || branches.length > 1 ? (
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="w-[220px] rounded-xl shadow-sm">
                  <Filter className="w-4 h-4 text-muted-foreground mr-1.5" />
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="bg-card border px-4 py-2 rounded-xl text-sm font-semibold text-foreground shadow-sm">
                Branch: {branches[0]?.name || "N/A"}
              </div>
            )}
          </div>
        </div>

        {/* Stats Cards Section */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Total Stock Units */}
          <div className="rounded-3xl border bg-card p-6 shadow-sm flex items-center justify-between">
            <div className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Total Stock
              </span>
              <p className="text-3xl font-extrabold text-foreground tracking-tight">
                {totalQuantity} <span className="text-xs text-muted-foreground font-normal">units</span>
              </p>
            </div>
            <div className="p-3.5 bg-emerald-500/10 rounded-2xl text-emerald-600 dark:text-emerald-400">
              <Boxes className="h-6 w-6" />
            </div>
          </div>

          {/* Unique Items Count */}
          <div className="rounded-3xl border bg-card p-6 shadow-sm flex items-center justify-between">
            <div className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Monitored Items
              </span>
              <p className="text-3xl font-extrabold text-foreground tracking-tight">
                {totalItems}
              </p>
            </div>
            <div className="p-3.5 bg-blue-500/10 rounded-2xl text-blue-600 dark:text-blue-400">
              <Layers className="h-6 w-6" />
            </div>
          </div>

          {/* Low Stock Alerts */}
          <button
            onClick={() => setLowStockOnly((prev) => !prev)}
            className={`rounded-3xl border p-6 shadow-sm flex items-center justify-between text-left transition-all ${
              lowStockOnly
                ? "bg-amber-500/10 border-amber-500/30 dark:bg-amber-950/20"
                : "bg-card hover:bg-muted/10"
            }`}
          >
            <div className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Low Stock Alerts
              </span>
              <p className="text-3xl font-extrabold text-foreground tracking-tight flex items-baseline gap-1.5">
                {lowStockCount}
                {lowStockCount > 0 && (
                  <span className="inline-flex h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                )}
              </p>
            </div>
            <div className="p-3.5 bg-amber-500/10 rounded-2xl text-amber-600 dark:text-amber-400">
              <TrendingDown className="h-6 w-6" />
            </div>
          </button>
        </div>

        {/* Filters and Control Bar (Sticky on Scroll) */}
        <div className="sticky top-0 z-20 bg-background/90 backdrop-blur-md pb-4 pt-2 -mx-4 px-4 flex flex-col gap-3 md:flex-row md:items-center justify-between border-b border-border/40">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search stock by name or category path..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 rounded-xl shadow-sm h-11"
              />
            </div>

            {/* Category Filter */}
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-full sm:w-[240px] rounded-xl shadow-sm h-11">
                <FolderTree className="w-4 h-4 text-muted-foreground mr-1.5" />
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categoryOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {Array(opt.depth).fill("—").join(" ")} {opt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Low Stock Toggle Switch */}
          <div className="flex items-center gap-3.5 bg-card/50 border px-4 py-2.5 rounded-xl shadow-sm self-start md:self-auto h-11">
            <Switch
              id="low-stock-switch"
              checked={lowStockOnly}
              onCheckedChange={setLowStockOnly}
            />
            <Label htmlFor="low-stock-switch" className="text-sm font-semibold cursor-pointer text-foreground">
              Low Stock Only
            </Label>
          </div>
        </div>

        {/* Stock List Display */}
        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-3xl border border-dashed bg-card/20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed p-12 text-center bg-card/40">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Boxes className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">No inventory stock found</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm">
              Try adjusting your search query, selecting different categories, or toggling the low stock alert filter.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View (>= md breakpoint) */}
            <div className="hidden md:block rounded-3xl border bg-card overflow-hidden shadow-sm">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>Item details & Category path</TableHead>
                    <TableHead>Tracking level</TableHead>
                    {showBranchColumn && <TableHead>Branch</TableHead>}
                    <TableHead>Current stock</TableHead>
                    <TableHead>Low stock threshold</TableHead>
                    <TableHead className="text-right pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const threshold = row.lowStockThreshold;
                    const qty = row.quantity;

                    // Compute category details for drill-down action checks
                    const cat = initialCategories.find((c) => c.id === row.nodeId);
                    const hasChildren =
                      row.nodeType === "CATEGORY" &&
                      cat &&
                      initialCategories.some((c) => c.parentId === cat.id);

                    return (
                      <TableRow key={`${row.nodeType}-${row.nodeId}-${row.branchId}`} className="hover:bg-muted/5 transition-colors">
                        {/* Name + Category Breadcrumb */}
                        <TableCell className="max-w-[320px] py-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-foreground leading-snug">
                              {row.displayName}
                            </span>
                            <span className="text-xs text-muted-foreground font-medium truncate">
                              {row.categoryPath}
                            </span>
                          </div>
                        </TableCell>

                        {/* Tracking Level Badge */}
                        <TableCell>
                          {row.nodeType === "PRODUCT" && (
                            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-semibold shadow-none">
                              Product
                            </Badge>
                          )}
                          {row.nodeType === "VARIANT" && (
                            <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 font-semibold shadow-none">
                              Variant
                            </Badge>
                          )}
                          {row.nodeType === "CATEGORY" && (
                            <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 font-semibold shadow-none">
                              Category
                            </Badge>
                          )}
                        </TableCell>

                        {/* Branch Column */}
                        {showBranchColumn && (
                          <TableCell className="font-semibold text-muted-foreground text-sm">
                            {row.branchName}
                          </TableCell>
                        )}

                        {/* Current Stock Level */}
                        <TableCell>
                          {qty === 0 ? (
                            <Badge className="bg-destructive/10 text-destructive border-destructive/20 font-bold shadow-none">
                              Out of stock
                            </Badge>
                          ) : qty <= threshold ? (
                            <div className="flex items-center gap-1.5">
                              <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
                              <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                                {qty} units (Low)
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                              <span className="text-sm font-semibold text-foreground">
                                {qty} units
                              </span>
                            </div>
                          )}
                        </TableCell>

                        {/* Low Stock Threshold */}
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {threshold} units
                        </TableCell>

                        {/* Action Buttons */}
                        <TableCell className="text-right pr-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            {/* Stock In Trigger */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-xl h-9 px-3 text-xs font-semibold text-foreground hover:bg-muted"
                              onClick={() => handleStockIn(row)}
                            >
                              Stock in
                            </Button>

                            {/* Product-level convert to variant toggle */}
                            {row.nodeType === "PRODUCT" && !row.productHasVariants && isOwner && row.productDetails && (
                              <ConvertToVariantsDialog
                                product={row.productDetails}
                                enableStockValueTracking={enableStockValueTracking}
                                onSuccess={fetchInventory}
                                trigger={
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl h-9 px-3 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50/50"
                                  >
                                    Track by variant
                                  </Button>
                                }
                              />
                            )}

                            {/* Category-level drill down link (cross-navigation) */}
                            {row.nodeType === "CATEGORY" && hasChildren && (
                              <Link href={`/dashboard/categories?drilldown=${row.nodeId}`}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-xl h-9 px-3 text-xs font-semibold text-purple-600 hover:text-purple-700 hover:bg-purple-50/50"
                                  title="Drill down category"
                                >
                                  Drill down <ArrowRight className="w-3 h-3 ml-1" />
                                </Button>
                              </Link>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile View: Collapses to stack cards (< md breakpoint) */}
            <div className="md:hidden space-y-3.5">
              {rows.map((row) => {
                const threshold = row.lowStockThreshold;
                const qty = row.quantity;

                // Category children drill down check
                const cat = initialCategories.find((c) => c.id === row.nodeId);
                const hasChildren =
                  row.nodeType === "CATEGORY" &&
                  cat &&
                  initialCategories.some((c) => c.parentId === cat.id);

                return (
                  <div
                    key={`${row.nodeType}-${row.nodeId}-${row.branchId}`}
                    className="bg-card border rounded-3xl p-5 shadow-sm space-y-4"
                  >
                    {/* Item Name, Category, and Stock Indicator */}
                    <div className="flex justify-between items-start gap-3">
                      <div className="space-y-1">
                        <span className="font-extrabold text-foreground text-base leading-tight block">
                          {row.displayName}
                        </span>
                        <span className="text-xs text-muted-foreground font-medium block">
                          {row.categoryPath}
                        </span>
                        {showBranchColumn && (
                          <span className="inline-block mt-1 text-[10px] uppercase tracking-wider font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                            {row.branchName}
                          </span>
                        )}
                      </div>

                      {/* Stock Quantity Badge */}
                      <div className="flex-shrink-0">
                        {qty === 0 ? (
                          <Badge className="bg-destructive/10 text-destructive border-destructive/20 font-extrabold text-xs shadow-none py-1">
                            Out of stock
                          </Badge>
                        ) : qty <= threshold ? (
                          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 font-extrabold text-xs shadow-none py-1">
                            {qty} units (Low)
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-extrabold text-xs shadow-none py-1">
                            {qty} units
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Metadata & Actions row */}
                    <div className="flex items-center justify-between pt-3 border-t border-border/60">
                      {/* Tracking Level Badge */}
                      <div>
                        {row.nodeType === "PRODUCT" && (
                          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-semibold shadow-none text-[10px]">
                            Product level
                          </Badge>
                        )}
                        {row.nodeType === "VARIANT" && (
                          <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 font-semibold shadow-none text-[10px]">
                            Variant level
                          </Badge>
                        )}
                        {row.nodeType === "CATEGORY" && (
                          <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 font-semibold shadow-none text-[10px]">
                            Category level
                          </Badge>
                        )}
                      </div>

                      {/* Action Triggers (Touch targets >= 44px) */}
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-xl h-11 px-3.5 text-xs font-bold text-foreground hover:bg-muted min-w-[44px]"
                          onClick={() => handleStockIn(row)}
                        >
                          Stock in
                        </Button>

                        {row.nodeType === "PRODUCT" && !row.productHasVariants && isOwner && row.productDetails && (
                          <ConvertToVariantsDialog
                            product={row.productDetails}
                            enableStockValueTracking={enableStockValueTracking}
                            onSuccess={fetchInventory}
                            trigger={
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-xl h-11 px-3.5 text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50/50 min-w-[44px]"
                              >
                                Track
                              </Button>
                            }
                          />
                        )}

                        {row.nodeType === "CATEGORY" && hasChildren && (
                          <Link href={`/dashboard/categories?drilldown=${row.nodeId}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-xl h-11 px-3.5 text-xs font-bold text-purple-600 hover:text-purple-700 hover:bg-purple-50/50 min-w-[44px]"
                            >
                              Drill
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
