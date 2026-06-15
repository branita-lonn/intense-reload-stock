// components/dashboard/categories-client.tsx
// Client Component managing category list interactions, stock-bearing toggles, and deletion confirmations.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Clock,
  FolderTree,
  Trash2,
  Edit,
  ArrowDownToLine,
  ChevronRight,
  ChevronDown,
  HelpCircle,
  Plus,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";

import {
  buildCategoryTree,
  hasStockBearingAncestor,
  hasStockBearingDescendant,
  type CategoryWithRelations,
  type CategoryTreeNode,
} from "@/lib/category-tree";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CategoryForm } from "./category-form";
import { DrillDownDialog } from "./drill-down-dialog";

interface BranchDetails {
  id: string;
  name: string;
}

interface InventoryRecord {
  id: string;
  branchId: string;
  quantity: number;
  isReferenceSnapshot: boolean;
  snapshotLabel?: string | null;
  branch: BranchDetails;
}

interface CategoryWithAll {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  isStockBearing: boolean;
  children: Array<{ id: string; name: string; isStockBearing: boolean }>;
  _count: { products: number };
  inventoryRecords: InventoryRecord[];
}

interface CategoriesClientProps {
  initialCategories: CategoryWithAll[];
  userRole: string;
}

export function CategoriesClient({ initialCategories, userRole }: CategoriesClientProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isTogglingId, setIsTogglingId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<string[]>([]);

  const isOwner = userRole === "OWNER";
  const isManager = userRole === "BRANCH_MANAGER";
  const hasMutationRights = isOwner || isManager;

  // Build the hierarchical tree
  const treeNodes = buildCategoryTree(initialCategories as unknown as CategoryWithRelations[]);

  // Flatten the tree for linear rendering with depths
  interface FlattenedRow {
    category: CategoryWithAll;
    depth: number;
  }

  function flattenTree(nodes: CategoryTreeNode[], depth = 0): FlattenedRow[] {
    const rows: FlattenedRow[] = [];
    for (const node of nodes) {
      // Find full category details in the initial list
      const fullDetails = initialCategories.find((c) => c.id === node.id);
      if (fullDetails) {
        rows.push({ category: fullDetails, depth });
        rows.push(...flattenTree(node.children, depth + 1));
      }
    }
    return rows;
  }

  const rows = flattenTree(treeNodes);

  // Toggle stock-bearing status
  async function handleToggleStockBearing(categoryId: string, enable: boolean) {
    setIsTogglingId(categoryId);
    try {
      const response = await fetch("/api/dashboard/categories/stock-bearing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, enable }),
      });

      const json = (await response.json()) as unknown;

      if (!response.ok) {
        const errorMessage =
          json !== null &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : "Failed to toggle stock-bearing status.";
        toast.error(errorMessage);
        return;
      }

      toast.success(
        enable
          ? "Stock tracking enabled successfully!"
          : "Stock tracking disabled successfully!"
      );
      router.refresh();
    } catch (error: unknown) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsTogglingId(null);
    }
  }

  // Delete category
  async function handleDelete(id: string) {
    setIsDeletingId(id);
    try {
      const response = await fetch(`/api/dashboard/categories/${id}`, {
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
            : "Failed to delete category.";
        toast.error(errorMessage);
        return;
      }

      toast.success("Category deleted successfully!");
      setDeletingId(null);
      router.refresh();
    } catch (error: unknown) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsDeletingId(null);
    }
  }

  const toggleHistory = (id: string) => {
    setExpandedHistoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <TooltipProvider>
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Categories
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your store's product hierarchy, sort order, and stock-bearing points.
          </p>
        </div>
        {hasMutationRights && (
          <CategoryForm categories={initialCategories} />
        )}
      </div>

      {/* Categories Table */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed p-12 text-center bg-card/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <FolderTree className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-foreground">No categories found</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm">
            Configure parent-child levels and start tracking inventory items.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Category Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Stock Status</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ category, depth }) => {
                const activeInventories = category.inventoryRecords.filter((r) => !r.isReferenceSnapshot);
                const snapshotInventories = category.inventoryRecords.filter((r) => r.isReferenceSnapshot);

                const hasAncestorConflict = hasStockBearingAncestor(category.id, initialCategories as any);
                const hasDescendantConflict = hasStockBearingDescendant(category.id, initialCategories as any);

                // Parent category conflict label
                let ancestorLabel = "an ancestor category";
                if (hasAncestorConflict) {
                  let currentId = category.id;
                  while (true) {
                    const current = initialCategories.find((c) => c.id === currentId);
                    if (current && current.parentId) {
                      const parentNode = initialCategories.find((c) => c.id === current.parentId);
                      if (parentNode && parentNode.isStockBearing) {
                        ancestorLabel = parentNode.name;
                        break;
                      }
                      currentId = current.parentId;
                    } else {
                      break;
                    }
                  }
                }

                // Subcategory conflict label
                let descendantLabel = "subcategories";
                if (hasDescendantConflict) {
                  const checkDescendants = (id: string): string | null => {
                    const descendants = initialCategories.filter((c) => c.parentId === id);
                    for (const d of descendants) {
                      if (d.isStockBearing) return d.name;
                      const res = checkDescendants(d.id);
                      if (res) return res;
                    }
                    return null;
                  };
                  descendantLabel = checkDescendants(category.id) || "a subcategory";
                }

                const canToggleStock = !hasAncestorConflict && !hasDescendantConflict;

                // Build indentation prefix
                const indentStyles = {
                  paddingLeft: `${Math.min(depth * 1.5, 6)}rem`,
                };

                return (
                  <>
                    <TableRow
                      key={category.id}
                      className={`hover:bg-muted/10 transition-colors ${
                        category.isActive ? "" : "opacity-60 bg-muted/5"
                      }`}
                    >
                      <TableCell style={indentStyles} className="font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          {depth > 0 && <span className="text-muted-foreground font-mono">└</span>}
                          <span>{category.name}</span>
                          {!category.isActive && (
                            <Badge variant="outline" className="text-[10px] py-0 px-1 border-muted text-muted-foreground bg-muted/20">
                              Inactive
                            </Badge>
                          )}
                          {snapshotInventories.length > 0 && (
                            <button
                              onClick={() => toggleHistory(category.id)}
                              className="text-muted-foreground hover:text-foreground transition-colors p-1"
                              title="Toggle History Snapshots"
                            >
                              {expandedHistoryIds.includes(category.id) ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <Clock className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground font-mono">
                        /{category.slug}
                      </TableCell>

                      <TableCell className="text-sm font-medium">
                        {category._count.products}
                      </TableCell>

                      <TableCell>
                        {category.isStockBearing ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                                Tracks stock here
                              </Badge>
                              {isOwner && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => handleToggleStockBearing(category.id, false)}
                                  disabled={isTogglingId === category.id}
                                  title="Disable Stock Tracking"
                                >
                                  {isTogglingId === category.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <EyeOff className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              )}
                            </div>
                            {activeInventories.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {activeInventories.map((inv) => (
                                  <Badge
                                    key={inv.id}
                                    variant="outline"
                                    className="text-[10px] font-normal px-1.5 py-0 border-muted text-muted-foreground bg-muted/10"
                                  >
                                    {inv.branch.name}: {inv.quantity}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : hasAncestorConflict ? (
                          <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-transparent">
                            Tracked via '{ancestorLabel}'
                          </Badge>
                        ) : hasDescendantConflict ? (
                          <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-transparent">
                            Tracked via '{descendantLabel}'
                          </Badge>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                              Not tracked
                            </Badge>
                            {isOwner && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10"
                                      onClick={() => handleToggleStockBearing(category.id, true)}
                                      disabled={!canToggleStock || isTogglingId === category.id}
                                    >
                                      {isTogglingId === category.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Eye className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                {!canToggleStock && (
                                  <TooltipContent>
                                    {hasAncestorConflict
                                      ? `Conflict: Stock is already tracked at ancestor category '${ancestorLabel}'.`
                                      : `Conflict: Stock is already tracked at subcategory '${descendantLabel}'.`}
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            )}
                          </div>
                        )}
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            category.isActive
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              : "bg-destructive/10 text-destructive border-destructive/20"
                          }
                        >
                          {category.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Drill Down trigger (Owner only, only if stock-bearing and has children) */}
                          {isOwner && category.isStockBearing && category.children.length > 0 && (
                            <DrillDownDialog
                              category={category}
                              allCategories={initialCategories}
                            />
                          )}

                          {/* Edit (Owner/Manager) */}
                          {hasMutationRights && (
                            <CategoryForm
                              category={category}
                              categories={initialCategories}
                              trigger={
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-muted" title="Edit Category">
                                  <Edit className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              }
                            />
                          )}

                          {/* Two-Click Delete */}
                          {isOwner && (
                            <>
                              {deletingId === category.id ? (
                                <div className="flex items-center gap-1 z-10">
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-8 rounded-lg px-2.5 text-xs font-semibold"
                                    onClick={() => handleDelete(category.id)}
                                    disabled={isDeletingId === category.id}
                                  >
                                    {isDeletingId === category.id ? (
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
                                    disabled={isDeletingId === category.id}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg hover:bg-destructive/10 hover:text-destructive group"
                                  onClick={() => setDeletingId(category.id)}
                                  title="Delete Category"
                                >
                                  <Trash2 className="h-4 w-4 text-muted-foreground group-hover:text-destructive" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Historical snapshots expanded rows */}
                    {expandedHistoryIds.includes(category.id) && snapshotInventories.length > 0 && (
                      <TableRow key={`${category.id}-history`} className="bg-muted/10">
                        <TableCell colSpan={6} className="py-3 pl-12 pr-6 border-b">
                          <div className="space-y-2">
                            <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                              <Clock className="h-3.5 w-3.5" /> Historical Stock Snapshots
                            </span>
                            <div className="space-y-2 pl-4 border-l-2 border-primary/20">
                              {snapshotInventories.map((snap) => (
                                <div key={snap.id} className="text-xs text-muted-foreground flex items-start gap-1">
                                  <span className="font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded mr-1">
                                    {snap.branch.name}
                                  </span>
                                  <span className="leading-5">
                                    {snap.snapshotLabel || `Archived quantity (final count: ${snap.quantity})`}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </TooltipProvider>
  );
}
