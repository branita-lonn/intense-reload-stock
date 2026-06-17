// components/dashboard/products-client.tsx
// Client Component for managing product list interactions, search/filters, status toggling, and bulk deletion confirmations.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import dynamic from "next/dynamic";

const CsvImportDialog = dynamic(
  () => import("./csv-import-dialog").then((mod) => mod.CsvImportDialog),
  {
    loading: () => (
      <Button variant="outline" className="rounded-xl gap-2" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
        CSV Import
      </Button>
    ),
    ssr: false,
  }
);
import {
  FolderTree,
  Trash2,
  Edit,
  Plus,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Search,
  Filter,
  Layers,
  ChevronDown,
  Clock,
  Info,
} from "lucide-react";

import type { CategoryWithRelations, ProductWithRelations } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ProductsClientProps {
  initialCategories: CategoryWithRelations[];
  branches: Array<{ id: string; name: string }>;
  userRole: string;
  initialCategoryId?: string;
  initialSearch?: string;
  initialBranchId?: string;
  userId: string;
}

export function ProductsClient({
  initialCategories,
  branches,
  userRole,
  initialCategoryId,
  initialSearch,
  initialBranchId,
}: ProductsClientProps) {
  const router = useRouter();
  const [products, setProducts] = useState<ProductWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [search, setSearch] = useState(initialSearch ?? "");
  const [categoryId, setCategoryId] = useState(initialCategoryId ?? "all");
  const [branchId, setBranchId] = useState(initialBranchId ?? "all");

  // Selection states for bulk delete
  const [selectedProductIds, setSelectedProductIds] = useState<Record<string, boolean>>({});
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const isOwner = userRole === "OWNER";
  const isManager = userRole === "BRANCH_MANAGER";
  const hasMutationRights = isOwner || isManager;

  // ---------------------------------------------------------------------------
  // Load products list based on active filters
  // ---------------------------------------------------------------------------
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (categoryId && categoryId !== "all") params.set("categoryId", categoryId);
      if (branchId && branchId !== "all") params.set("branchId", branchId);

      const response = await fetch(`/api/dashboard/products?${params.toString()}`);
      if (response.ok) {
        const data = (await response.json()) as ProductWithRelations[];
        setProducts(data);
      } else {
        toast.error("Failed to load products catalogue.");
      }
    } catch (error) {
      console.error("[products-client] fetch error:", error);
      toast.error("Failed to fetch products list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Debounce the search input to avoid spamming the DB on keypresses
    const delayDebounceFn = setTimeout(() => {
      fetchProducts();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryId, branchId]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  async function handleToggleActive(id: string, currentActiveStatus: boolean) {
    setActionLoadingId(id);
    try {
      const response = await fetch(`/api/dashboard/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActiveStatus }),
      });

      if (response.ok) {
        toast.success("Product active status toggled!");
        fetchProducts();
      } else {
        const data = (await response.json()) as { error?: string };
        toast.error(data.error ?? "Failed to update product status.");
      }
    } catch (error) {
      toast.error("Failed to toggle status.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDeleteProduct(id: string) {
    setActionLoadingId(id);
    try {
      const response = await fetch(`/api/dashboard/products/${id}`, {
        method: "DELETE",
      });

      const json = (await response.json()) as unknown;

      if (!response.ok) {
        const errorMessage =
          json !== null &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : "Failed to delete product.";
        toast.error(errorMessage);
        return;
      }

      toast.success("Product deleted successfully!");
      setDeletingId(null);
      fetchProducts();
    } catch (error) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setActionLoadingId(null);
    }
  }

  // Bulk deletion logic
  // Note: Bulk delete calls the same per-product DELETE guards individually
  // and reports which (if any) were blocked, rather than failing the entire batch silently.
  async function handleBulkDelete() {
    const selectedIds = Object.keys(selectedProductIds).filter(
      (id) => selectedProductIds[id]
    );
    if (selectedIds.length === 0) return;

    setIsBulkDeleting(true);
    const successes: string[] = [];
    const failures: { name: string; reason: string }[] = [];

    for (const id of selectedIds) {
      const product = products.find((p) => p.id === id);
      const label = product?.name ?? id;
      try {
        const response = await fetch(`/api/dashboard/products/${id}`, {
          method: "DELETE",
        });
        const data = (await response.json()) as { error?: string };

        if (response.ok) {
          successes.push(label);
        } else {
          failures.push({ name: label, reason: data.error ?? "Blocked by stock guard" });
        }
      } catch {
        failures.push({ name: label, reason: "Network error" });
      }
    }

    if (successes.length > 0) {
      toast.success(`Successfully deleted ${successes.length} product(s).`);
    }
    if (failures.length > 0) {
      failures.forEach((f) => {
        toast.error(`Failed to delete "${f.name}": ${f.reason}`);
      });
    }

    setSelectedProductIds({});
    fetchProducts();
    setIsBulkDeleting(false);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function getCategoryBreadcrumb(
    catId: string,
    allCategories: CategoryWithRelations[]
  ): string {
    const chain: string[] = [];
    let currentId: string | null = catId;

    while (currentId) {
      const cat = allCategories.find((c) => c.id === currentId);
      if (cat) {
        chain.unshift(cat.name);
        currentId = cat.parentId;
      } else {
        break;
      }
    }

    return chain.join(" › ");
  }

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

  // Compute product-level inventory aggregate
  function getProductAggregateStock(product: ProductWithRelations): number {
    return product.inventoryRecords
      .filter((ir) => !ir.isReferenceSnapshot)
      .reduce((sum, ir) => sum + ir.quantity, 0);
  }

  // Build bulk checkboxes states
  const selectedCount = Object.values(selectedProductIds).filter(Boolean).length;
  const isAllSelected =
    products.length > 0 &&
    products.every((p) => selectedProductIds[p.id]);

  function handleSelectAll(checked: boolean) {
    if (checked) {
      const next: Record<string, boolean> = {};
      products.forEach((p) => {
        next[p.id] = true;
      });
      setSelectedProductIds(next);
    } else {
      setSelectedProductIds({});
    }
  }

  function handleSelectRow(id: string, checked: boolean) {
    setSelectedProductIds((prev) => ({
      ...prev,
      [id]: checked,
    }));
  }

  return (
    <TooltipProvider>
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Products
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your store's clothing catalogue, image assets, active states, and tracking levels.
          </p>
        </div>
        {hasMutationRights && (
          <div className="flex items-center gap-2">
            <CsvImportDialog branches={branches} onSuccess={fetchProducts} />
            <Link href="/dashboard/products/new">
              <Button id="add-product-btn" className="rounded-xl flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Add product
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Filter and Bulk Action bar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search products by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>

          {/* Category Dropdown */}
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-full sm:w-[220px] rounded-xl">
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

          {/* Branch Dropdown */}
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-full sm:w-[200px] rounded-xl">
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
        </div>

        {/* Bulk Actions (Owner only) */}
        {isOwner && selectedCount > 0 && (
          <Button
            variant="destructive"
            onClick={handleBulkDelete}
            disabled={isBulkDeleting}
            className="rounded-xl flex items-center gap-1.5 self-start md:self-auto"
          >
            {isBulkDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            Delete Selected ({selectedCount})
          </Button>
        )}
      </div>

      {/* Table view */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-3xl border border-dashed bg-card/20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed p-12 text-center bg-card/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <Layers className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-foreground">No products found</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm">
            Try adjusting your search criteria, category tree filters, or create a new product entry.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                {isOwner && (
                  <TableHead className="w-[40px] pl-4">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={(checked) => handleSelectAll(!!checked)}
                      aria-label="Select all products"
                    />
                  </TableHead>
                )}
                <TableHead className="w-[80px]">Image</TableHead>
                <TableHead>Product details</TableHead>
                <TableHead>Stock tracking</TableHead>
                <TableHead>Stock status</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => {
                const isSelected = !!selectedProductIds[product.id];
                const breadcrumb = getCategoryBreadcrumb(product.categoryId, initialCategories);
                const sLevel = product.stockBearingLevel ?? "NONE";

                // Stock Calculations
                const aggStock = getProductAggregateStock(product);

                return (
                  <TableRow
                    key={product.id}
                    className={`hover:bg-muted/10 transition-colors ${
                      product.isActive ? "" : "opacity-60 bg-muted/5"
                    }`}
                  >
                    {isOwner && (
                      <TableCell className="pl-4">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => handleSelectRow(product.id, !!checked)}
                          aria-label={`Select product ${product.name}`}
                        />
                      </TableCell>
                    )}

                    {/* Image Column */}
                    <TableCell>
                      <div className="relative h-12 w-12 overflow-hidden rounded-xl border bg-muted">
                        <Image
                          src={product.images[0] ?? "/placeholder-image.png"}
                          alt={product.name}
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      </div>
                    </TableCell>

                    {/* Name + Breadcrumb Category */}
                    <TableCell className="max-w-[280px]">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-foreground leading-none">{product.name}</span>
                        {product.brand && (
                          <span className="text-[10px] text-muted-foreground font-mono">{product.brand}</span>
                        )}
                        <span className="text-xs text-muted-foreground font-medium truncate mt-1">
                          {breadcrumb}
                        </span>
                      </div>
                    </TableCell>

                    {/* Stock Tracking Level Badge */}
                    <TableCell>
                      {sLevel === "PRODUCT" && (
                        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-semibold">
                          Tracks here (product)
                        </Badge>
                      )}
                      {sLevel === "VARIANT" && (
                        <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 font-semibold">
                          Tracks via variants ({product.variants.length})
                        </Badge>
                      )}
                      {sLevel === "CATEGORY" && (
                        <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 font-semibold">
                          Tracks via category
                        </Badge>
                      )}
                      {sLevel === "NONE" && (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-semibold">
                          Not configured
                        </Badge>
                      )}
                    </TableCell>

                    {/* Stock Count Indicator */}
                    <TableCell>
                      {sLevel === "PRODUCT" && (
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              aggStock > 10
                                ? "bg-emerald-500"
                                : aggStock > 0
                                ? "bg-amber-500"
                                : "bg-destructive"
                            }`}
                          />
                          <span className="text-sm font-semibold text-foreground">
                            {aggStock} units
                          </span>
                        </div>
                      )}
                      {sLevel === "VARIANT" && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 rounded-lg text-xs font-semibold px-2 hover:bg-muted text-blue-600 dark:text-blue-400"
                            >
                              Detail stock <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[260px] p-3 rounded-2xl">
                            <div className="space-y-2">
                              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                <Layers className="w-3.5 h-3.5" /> Variant stock breakdown
                              </h4>
                              <div className="space-y-1.5 pl-1.5 border-l-2 border-primary/20">
                                {product.variants.map((v) => {
                                  const vStock = v.inventoryRecords
                                    .filter((ir) => !ir.isReferenceSnapshot)
                                    .reduce((sum, ir) => sum + ir.quantity, 0);

                                  const label = [v.size, v.colour].filter(Boolean).join(" / ") || v.sku || "Variant";

                                  return (
                                    <div
                                      key={v.id}
                                      className="text-xs flex items-center justify-between text-muted-foreground"
                                    >
                                      <span className="font-semibold text-foreground">{label}</span>
                                      <span className="font-medium bg-muted px-1.5 py-0.5 rounded text-[10px]">
                                        {vStock} units
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                      {(sLevel === "CATEGORY" || sLevel === "NONE") && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground font-mono cursor-help text-sm">
                              —
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[260px]">
                            {sLevel === "CATEGORY"
                              ? `Stock tracking for this item is handled at the Category level (${breadcrumb}).`
                              : "This product's stock has not been configured. Check the category's stock status."}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>

                    {/* Active/Draft Switch */}
                    <TableCell>
                      {hasMutationRights ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Switch
                                checked={product.isActive}
                                onCheckedChange={() =>
                                  handleToggleActive(product.id, product.isActive)
                                }
                                disabled={actionLoadingId === product.id}
                                aria-label="Toggle active status"
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {product.isActive ? "Deactivate entry" : "Activate entry"}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Badge
                          variant="outline"
                          className={
                            product.isActive
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              : "bg-destructive/10 text-destructive border-destructive/20"
                          }
                        >
                          {product.isActive ? "Active" : "Draft"}
                        </Badge>
                      )}
                    </TableCell>

                    {/* Actions Column */}
                    <TableCell className="text-right pr-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Edit Button */}
                        {hasMutationRights && (
                          <Link href={`/dashboard/products/${product.id}/edit`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg hover:bg-muted"
                              title="Edit product"
                            >
                              <Edit className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </Link>
                        )}

                        {/* Inline Delete Button (Owner Only) */}
                        {isOwner && (
                          <>
                            {deletingId === product.id ? (
                              <div className="flex items-center gap-1 z-10">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="h-8 rounded-lg px-2.5 text-xs font-semibold"
                                  onClick={() => handleDeleteProduct(product.id)}
                                  disabled={actionLoadingId === product.id}
                                >
                                  {actionLoadingId === product.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    "Confirm"
                                  )}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 rounded-lg px-2.5 text-xs font-medium"
                                  onClick={() => setDeletingId(null)}
                                  disabled={actionLoadingId === product.id}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg hover:bg-destructive/10 hover:text-destructive group"
                                onClick={() => setDeletingId(product.id)}
                                title="Delete product"
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground group-hover:text-destructive" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </TooltipProvider>
  );
}
