// components/dashboard/log-sale-form.tsx
// Mobile-first counter sale logging form. Allows staff to search stock-bearing nodes,
// adjust quantities via stepper, build a batch up to 20 items, and submit a sale.

"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/use-online-status";
import {
  enqueueSale,
  getPendingQueue,
  removeSale,
  getPendingCount,
  updateSale,
} from "@/lib/offline-queue";
import {
  Plus,
  Minus,
  Trash2,
  Package,
  Loader2,
  Search,
  CheckCircle,
  Home,
  Bell,
  User,
  History,
  ShoppingCart,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import type { UserRole } from "@prisma/client";

import type { InventoryRow } from "@/lib/inventory-queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface Branch {
  id: string;
  name: string;
}

interface LogSaleFormProps {
  branches: Branch[];
  activeBranchId: string;
  initialInventoryRows: InventoryRow[];
  requireSaleApproval: boolean;
  enableDetailedSaleBreakdown: boolean;
  userRole: UserRole;
}

interface BasketItem {
  key: string;
  row: InventoryRow;
  quantity: number;
}

export function LogSaleForm({
  branches,
  activeBranchId,
  initialInventoryRows,
  requireSaleApproval,
  enableDetailedSaleBreakdown,
  userRole,
}: LogSaleFormProps) {
  const router = useRouter();

  const [branchId, setBranchId] = useState(activeBranchId);
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>(initialInventoryRows);
  const [loadingRows, setLoadingRows] = useState(false);
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search & Node selection states
  const [searchQuery, setSearchQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  
  // Selected item (being configured in stepper before adding to basket)
  const [selectedNode, setSelectedNode] = useState<InventoryRow | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState<number>(1);

  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load initial pending count on mount
  useEffect(() => {
    async function loadPending() {
      const count = await getPendingCount();
      setPendingCount(count);
    }
    loadPending();
  }, []);

  const syncPendingSales = useCallback(async () => {
    if (isSyncing) return;
    const queue = await getPendingQueue();
    if (queue.length === 0) return;

    setIsSyncing(true);
    const syncToastId = toast.loading(`Reconnected — syncing ${queue.length} pending sale(s)...`);
    
    let successCount = 0;
    let failedCount = 0;

    for (const sale of queue) {
      if (sale.retryCount >= 3) {
        failedCount++;
        continue;
      }

      const payload = {
        branchId: sale.branchId,
        items: sale.items,
      };

      try {
        const res = await fetch("/api/dashboard/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          await removeSale(sale.localId);
          successCount++;
        } else {
          const updated = { ...sale, retryCount: sale.retryCount + 1 };
          await updateSale(updated);
          if (updated.retryCount >= 3) {
            toast.error("A queued sale failed to sync after multiple attempts and requires manual review.");
            failedCount++;
          }
        }
      } catch {
        const updated = { ...sale, retryCount: sale.retryCount + 1 };
        await updateSale(updated);
        if (updated.retryCount >= 3) {
          toast.error("A queued sale failed to sync and requires manual review.");
          failedCount++;
        }
      }
    }

    const currentCount = await getPendingCount();
    setPendingCount(currentCount);
    setIsSyncing(false);
    toast.dismiss(syncToastId);

    if (successCount > 0 && failedCount === 0) {
      toast.success(`${successCount} sale(s) synced successfully.`);
    } else if (successCount > 0 || failedCount > 0) {
      toast.info(`Sync complete: ${successCount} succeeded, ${failedCount} failed/pending review.`);
    }

    router.refresh();
    try {
      const refreshRes = await fetch(`/api/dashboard/inventory?branchId=${branchId}`);
      if (refreshRes.ok) {
        const refreshData = (await refreshRes.json()) as { rows: InventoryRow[] };
        setInventoryRows(refreshData.rows);
      }
    } catch {
      // Ignore background refresh errors
    }
  }, [branchId, isSyncing, router]);

  useEffect(() => {
    if (isOnline) {
      syncPendingSales();
    }
  }, [isOnline, syncPendingSales]);

  const activeBranchName = branches.find((b) => b.id === branchId)?.name ?? "Unknown Branch";

  // ---------------------------------------------------------------------------
  // Re-fetch inventory rows on branch change (OWNER/BRANCH_MANAGER only)
  // ---------------------------------------------------------------------------
  const handleBranchChange = useCallback(async (newBranchId: string) => {
    setBranchId(newBranchId);
    setBasket([]);
    setSelectedNode(null);
    setSelectedQuantity(1);
    setLoadingRows(true);
    try {
      const res = await fetch(`/api/dashboard/inventory?branchId=${newBranchId}`);
      if (res.ok) {
        const data = (await res.json()) as { rows: InventoryRow[] };
        setInventoryRows(data.rows);
      } else {
        toast.error("Failed to load inventory for this branch.");
      }
    } catch {
      toast.error("Network error loading inventory.");
    } finally {
      setLoadingRows(false);
    }
  }, []);

  // Filter out items already in the basket
  const alreadyAddedKeys = useMemo(() => new Set(basket.map((bi) => bi.row.nodeId)), [basket]);

  const filteredInventoryRows = useMemo(() => {
    return inventoryRows.filter((r) => {
      const matchesSearch =
        !searchQuery ||
        r.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.categoryPath.toLowerCase().includes(searchQuery.toLowerCase());
      const notAdded = !alreadyAddedKeys.has(r.nodeId);
      return matchesSearch && notAdded;
    });
  }, [inventoryRows, searchQuery, alreadyAddedKeys]);

  // Handle selecting an item from search
  function handleSelectNode(node: InventoryRow) {
    setSelectedNode(node);
    setSelectedQuantity(1);
    setPickerOpen(false);
    setSearchQuery("");
  }

  // Add currently selected node to the basket
  function handleAddToBasket() {
    if (!selectedNode) return;

    if (basket.length >= 20) {
      toast.error("A sale cannot exceed 20 line items.");
      return;
    }

    setBasket((prev) => [
      ...prev,
      {
        key: `${selectedNode.nodeId}-${Date.now()}`,
        row: selectedNode,
        quantity: selectedQuantity,
      },
    ]);

    setSelectedNode(null);
    setSelectedQuantity(1);
    toast.success("Added to sale basket.");
  }

  function handleRemoveFromBasket(key: string) {
    setBasket((prev) => prev.filter((item) => item.key !== key));
  }

  function handleUpdateBasketQty(key: string, newQty: number) {
    if (newQty < 1 || newQty > 1000) return;
    setBasket((prev) =>
      prev.map((item) => (item.key === key ? { ...item, quantity: newQty } : item))
    );
  }

  // ---------------------------------------------------------------------------
  // Submit sale transaction
  // ---------------------------------------------------------------------------
  async function handleSubmitSale() {
    if (basket.length === 0) {
      toast.error("Please add at least one item to log a sale.");
      return;
    }

    if (!isOnline) {
      try {
        const itemsPayload = basket.map((item) => ({
          categoryId: item.row.nodeType === "CATEGORY" ? item.row.nodeId : undefined,
          productId: item.row.nodeType === "PRODUCT" ? item.row.nodeId : undefined,
          productVariantId: item.row.nodeType === "VARIANT" ? item.row.nodeId : undefined,
          quantity: item.quantity,
        }));
        await enqueueSale(branchId, itemsPayload);
        const count = await getPendingCount();
        setPendingCount(count);
        toast.success("You're offline — sale saved and will sync when you reconnect.");
        setBasket([]);
        setSelectedNode(null);
        setSelectedQuantity(1);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to queue sale offline.";
        toast.error(message);
      }
      return;
    }

    setIsSubmitting(true);

    const payload = {
      branchId,
      items: basket.map((item) => ({
        categoryId: item.row.nodeType === "CATEGORY" ? item.row.nodeId : undefined,
        productId: item.row.nodeType === "PRODUCT" ? item.row.nodeId : undefined,
        productVariantId: item.row.nodeType === "VARIANT" ? item.row.nodeId : undefined,
        quantity: item.quantity,
      })),
    };

    try {
      const res = await fetch("/api/dashboard/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        // Success toasts
        if (requireSaleApproval) {
          toast.success("Sale logged — awaiting approval.");
        } else {
          toast.success("Sale logged successfully.");
        }

        // Show oversold warning if needed
        if (data.wasOversold && data.oversoldItems) {
          data.oversoldItems.forEach((item: { name: string; newQuantity: number }) => {
            toast.warning(
              `Oversold: logged — but this puts ${item.name} at ${item.newQuantity} in stock.`,
              { duration: 6000 }
            );
          });
        }

        // Reset state
        setBasket([]);
        setSelectedNode(null);
        setSelectedQuantity(1);

        // Refresh inventory rows behind the picker
        const refreshRes = await fetch(`/api/dashboard/inventory?branchId=${branchId}`);
        if (refreshRes.ok) {
          const refreshData = (await refreshRes.json()) as { rows: InventoryRow[] };
          setInventoryRows(refreshData.rows);
        }
        router.refresh();
      } else {
        toast.error(data.error ?? "Failed to submit sale.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const totalItemsCount = basket.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="max-w-2xl mx-auto pb-24 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Log Sale</h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs py-0.5 px-2 bg-muted/20 font-semibold border-muted">
            {activeBranchName}
          </Badge>
          {requireSaleApproval && (
            <Badge className="text-[10px] py-0.5 px-2 bg-amber-500/10 text-amber-600 border border-amber-500/20 shadow-none">
              Requires Approval
            </Badge>
          )}
          {pendingCount > 0 && (
            <Badge className="text-[10px] py-0.5 px-2 bg-blue-500/10 text-blue-600 border border-blue-500/20 shadow-none animate-pulse">
              {pendingCount} Pending Sync
            </Badge>
          )}
        </div>
      </div>

      {/* Branch Switcher (OWNER / BRANCH_MANAGER only) */}
      {branches.length > 1 && userRole !== "STAFF" && (
        <div className="rounded-3xl border bg-card p-5 shadow-sm space-y-2">
          <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Active Counter Branch
          </Label>
          <Select value={branchId} onValueChange={handleBranchChange}>
            <SelectTrigger className="rounded-xl h-11 border bg-background">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Product Search / Browser */}
      <div className="rounded-3xl border bg-card p-5 shadow-sm space-y-4">
        <Label className="text-sm font-bold text-foreground">Search Item</Label>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between rounded-xl h-12 font-normal text-muted-foreground bg-background hover:bg-muted/30"
              disabled={loadingRows || basket.length >= 20}
            >
              {loadingRows ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading items…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" /> Search category, product, or variant…
                </span>
              )}
              <ChevronDown className="h-4 w-4 opacity-50 ml-auto" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(90vw,520px)] p-0 rounded-2xl" align="start">
            <Command>
              <CommandInput
                placeholder="Type item name or category..."
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <CommandList className="max-h-72">
                <CommandEmpty>No stock-bearing items found.</CommandEmpty>
                <CommandGroup>
                  {filteredInventoryRows.map((row) => (
                    <CommandItem
                      key={row.nodeId}
                      value={`${row.displayName} ${row.categoryPath}`}
                      onSelect={() => handleSelectNode(row)}
                      className="cursor-pointer rounded-lg py-2"
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex-1 min-w-0 pr-4">
                          <p className="font-semibold text-foreground text-sm truncate">
                            {row.displayName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {row.categoryPath}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs font-mono font-bold ${row.quantity <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {row.quantity} in stock
                          </span>
                          {row.nodeType === "CATEGORY" && (
                            <Badge className="text-[10px] bg-purple-500/10 text-purple-600 border border-purple-500/20 shadow-none py-0.5 px-2">
                              Cat
                            </Badge>
                          )}
                          {row.nodeType === "PRODUCT" && (
                            <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 shadow-none py-0.5 px-2">
                              Prod
                            </Badge>
                          )}
                          {row.nodeType === "VARIANT" && (
                            <Badge className="text-[10px] bg-blue-500/10 text-blue-600 border border-blue-500/20 shadow-none py-0.5 px-2">
                              Var
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Selected Item Stepper Panel */}
      {selectedNode && (
        <div className="rounded-3xl border bg-card p-5 shadow-sm space-y-4 animate-in fade-in duration-200">
          <div className="flex items-start justify-between">
            <div>
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Configuring Item
              </Label>
              <h3 className="font-bold text-foreground text-lg mt-0.5">{selectedNode.displayName}</h3>
              <p className="text-xs text-muted-foreground">{selectedNode.categoryPath}</p>
            </div>
            <Badge variant="outline" className="font-mono text-xs font-bold">
              {selectedNode.quantity} in stock
            </Badge>
          </div>

          {/* Stepper controls */}
          <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-muted/20 border">
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl flex-shrink-0"
              onClick={() => setSelectedQuantity((q) => Math.max(1, q - 1))}
              disabled={selectedQuantity <= 1}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <div className="flex flex-col items-center flex-1">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                value={selectedQuantity}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  setSelectedQuantity(Math.min(1000, Math.max(1, val)));
                }}
                className="w-full text-center bg-transparent border-none text-2xl font-extrabold focus:outline-none focus:ring-0 font-mono"
              />
              <span className="text-[10px] text-muted-foreground font-semibold">quantity to log</span>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl flex-shrink-0"
              onClick={() => setSelectedQuantity((q) => Math.min(1000, q + 1))}
              disabled={selectedQuantity >= 1000}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Stage 15 detailed breakdown UI hook point */}
          {/* Stage 15: detailed breakdown UI */}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setSelectedNode(null)}
              className="flex-1 rounded-xl h-11"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddToBasket}
              className="flex-1 rounded-xl h-11 font-bold"
            >
              Add to Sale ({selectedQuantity})
            </Button>
          </div>
        </div>
      )}

      {/* Sale Basket (Line Items) */}
      {basket.length > 0 && (
        <div className="rounded-3xl border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-bold text-foreground flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" /> Basket Items
            </Label>
            <Badge variant="secondary" className="font-semibold">
              {basket.length} {basket.length === 1 ? "line" : "lines"}
            </Badge>
          </div>

          <div className="divide-y divide-border">
            {basket.map((item) => (
              <div key={item.key} className="py-3.5 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground text-sm truncate">{item.row.displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.row.categoryPath}</p>
                  {item.quantity > item.row.quantity && (
                    <p className="text-[10px] text-amber-500 font-medium flex items-center gap-1 mt-0.5">
                      <AlertTriangle className="h-3 w-3" /> Overselling by {item.quantity - item.row.quantity} units
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* Small Inline Stepper */}
                  <div className="flex items-center border rounded-lg bg-background h-8">
                    <button
                      className="px-2 text-muted-foreground hover:text-foreground h-full"
                      onClick={() => handleUpdateBasketQty(item.key, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="px-2 font-mono text-sm font-bold text-foreground">
                      {item.quantity}
                    </span>
                    <button
                      className="px-2 text-muted-foreground hover:text-foreground h-full"
                      onClick={() => handleUpdateBasketQty(item.key, item.quantity + 1)}
                      disabled={item.quantity >= 1000}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive rounded-lg flex-shrink-0"
                    onClick={() => handleRemoveFromBasket(item.key)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Basket Summary */}
          <div className="pt-4 border-t flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total items in basket:</span>
            <span className="font-extrabold text-foreground text-base">{totalItemsCount} units</span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {basket.length === 0 && !selectedNode && (
        <div className="rounded-3xl border border-dashed p-12 text-center bg-card/30 flex flex-col items-center justify-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
            <ShoppingCart className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold text-foreground">Basket is empty</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Search and select an item above to log counter sales.
            </p>
          </div>
        </div>
      )}

      {/* Sticky Bottom Actions Bar */}
      {basket.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/80 backdrop-blur-md px-4 py-4 lg:left-64">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
            <div className="flex flex-col text-left">
              <span className="text-xs text-muted-foreground font-semibold">Logging {basket.length} items</span>
              <span className="text-base font-extrabold text-foreground">{totalItemsCount} units total</span>
            </div>
            <Button
              onClick={handleSubmitSale}
              disabled={isSubmitting}
              className="rounded-xl px-6 h-12 text-base font-bold shadow-lg shadow-primary/25"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" /> Logging...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" /> Log Sale
                </span>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Mobile-first Navigation Bar at bottom of screen (always visible on small viewports) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-card h-16 flex items-center justify-around px-2 shadow-2xl">
        <Link
          href="/dashboard"
          className="flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors py-1.5 w-12"
        >
          <Home className="h-5 w-5" />
          <span className="text-[10px] mt-1 font-medium">Home</span>
        </Link>
        <Link
          href="/dashboard/log-sale"
          className="flex flex-col items-center justify-center text-primary py-1.5 w-12"
        >
          <ShoppingCart className="h-5 w-5" />
          <span className="text-[10px] mt-1 font-bold">Log Sale</span>
        </Link>
        <Link
          href="/dashboard/inventory"
          className="flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors py-1.5 w-12"
        >
          <Package className="h-5 w-5" />
          <span className="text-[10px] mt-1 font-medium">Inventory</span>
        </Link>
        <button
          onClick={() => toast.info("Notifications arriving in Stage 6.")}
          className="flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors py-1.5 w-12"
        >
          <Bell className="h-5 w-5" />
          <span className="text-[10px] mt-1 font-medium">Alerts</span>
        </button>
        <Link
          href="/dashboard/change-password"
          className="flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-colors py-1.5 w-12"
        >
          <User className="h-5 w-5" />
          <span className="text-[10px] mt-1 font-medium">Account</span>
        </Link>
      </div>
    </div>
  );
}
