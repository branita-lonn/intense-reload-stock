// components/dashboard/stock-in-form.tsx
// Mobile-first batch stock-in form. Allows selecting multiple stock-bearing nodes
// (category / product / variant) across one branch and submitting them together,
// mirroring a real supplier delivery scenario.

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  PackagePlus,
  Loader2,
  Search,
  CheckCircle2,
  ChevronDown,
  Info,
  QrCode,
} from "lucide-react";
import { BarcodeScanner } from "./barcode-scanner";

import type { InventoryRow } from "@/lib/inventory-queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

interface Branch {
  id: string;
  name: string;
}

interface StockInFormProps {
  branches: Branch[];
  initialBranchId?: string;
  initialInventoryRows: InventoryRow[];
  enableBarcodeScanning: boolean;
}

interface BatchItem {
  key: string; // unique key for react list rendering
  row: InventoryRow;
  quantityAdded: number;
  note: string;
}

export function StockInForm({
  branches,
  initialBranchId,
  initialInventoryRows,
  enableBarcodeScanning,
}: StockInFormProps) {
  const router = useRouter();

  const [branchId, setBranchId] = useState(initialBranchId ?? branches[0]?.id ?? "");
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>(initialInventoryRows);
  const [loadingRows, setLoadingRows] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nodeSearch, setNodeSearch] = useState("");
  const [nodePickerOpen, setNodePickerOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const branchName = branches.find((b) => b.id === branchId)?.name ?? "Unknown Branch";

  // ---------------------------------------------------------------------------
  // When branch changes, re-fetch inventory rows scoped to that branch
  // ---------------------------------------------------------------------------
  const handleBranchChange = useCallback(async (newBranchId: string) => {
    setBranchId(newBranchId);
    setBatchItems([]); // clear batch on branch switch
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

  // ---------------------------------------------------------------------------
  // Node search: filter live inventory rows by display name / category
  // ---------------------------------------------------------------------------
  const alreadyAddedNodeIds = new Set(batchItems.map((bi) => bi.row.nodeId + bi.row.branchId));

  const filteredRows = inventoryRows.filter((r) => {
    const matchesSearch =
      !nodeSearch ||
      r.displayName.toLowerCase().includes(nodeSearch.toLowerCase()) ||
      r.categoryPath.toLowerCase().includes(nodeSearch.toLowerCase());
    const alreadyAdded = alreadyAddedNodeIds.has(r.nodeId + r.branchId);
    return matchesSearch && !alreadyAdded;
  });

  function addBatchItem(row: InventoryRow) {
    setBatchItems((prev) => [
      ...prev,
      {
        key: `${row.nodeId}-${row.branchId}-${Date.now()}`,
        row,
        quantityAdded: 1,
        note: "",
      },
    ]);
    setNodeSearch("");
    setNodePickerOpen(false);
  }

  const handleBarcodeScan = useCallback(async (sku: string) => {
    const scanToastId = toast.loading(`Searching SKU: ${sku}...`);
    try {
      const res = await fetch(
        `/api/dashboard/products/variants/by-sku?sku=${encodeURIComponent(sku)}&branchId=${branchId}`
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? "Failed to find product by SKU.");
        return;
      }
      const node = (await res.json()) as {
        nodeType: "VARIANT";
        nodeId: string;
        productId: string;
        productVariantId: string;
        displayName: string;
        categoryPath: string;
        branchId: string | null;
        quantity: number | null;
      };

      // Check if already in batch
      const alreadyAdded = batchItems.some((bi) => bi.row.nodeId === node.nodeId);
      if (alreadyAdded) {
        toast.info("Item is already in the batch list.");
        setScannerOpen(false);
        return;
      }

      const matchedRow = inventoryRows.find((r) => r.nodeId === node.nodeId);
      if (matchedRow) {
        addBatchItem(matchedRow);
        toast.success(`Added: ${matchedRow.displayName}`);
        setScannerOpen(false);
      } else {
        const fallbackRow: InventoryRow = {
          nodeType: "VARIANT",
          nodeId: node.nodeId,
          displayName: node.displayName,
          categoryPath: node.categoryPath,
          categoryId: "",
          productId: node.productId,
          productVariantId: node.productVariantId,
          branchId: branchId,
          branchName: branches.find((b) => b.id === branchId)?.name ?? "Unknown",
          quantity: node.quantity ?? 0,
          lowStockThreshold: 0,
          isLowStock: (node.quantity ?? 0) <= 0,
        };
        addBatchItem(fallbackRow);
        toast.success(`Added: ${node.displayName}`);
        setScannerOpen(false);
      }
    } catch {
      toast.error("Network error looking up SKU.");
    } finally {
      toast.dismiss(scanToastId);
    }
  }, [branchId, inventoryRows, batchItems, branches]);

  function removeBatchItem(key: string) {
    setBatchItems((prev) => prev.filter((bi) => bi.key !== key));
  }

  function updateBatchItem(key: string, field: "quantityAdded" | "note", value: number | string) {
    setBatchItems((prev) =>
      prev.map((bi) => (bi.key === key ? { ...bi, [field]: value } : bi))
    );
  }

  // ---------------------------------------------------------------------------
  // Submit the batch
  // ---------------------------------------------------------------------------
  async function handleSubmit() {
    if (batchItems.length === 0) {
      toast.error("Add at least one item before submitting.");
      return;
    }

    const hasInvalidQty = batchItems.some((bi) => bi.quantityAdded <= 0 || !Number.isInteger(bi.quantityAdded));
    if (hasInvalidQty) {
      toast.error("All quantities must be positive whole numbers.");
      return;
    }

    setIsSubmitting(true);

    const payload = {
      items: batchItems.map((bi) => ({
        branchId,
        quantityAdded: bi.quantityAdded,
        note: bi.note || undefined,
        categoryId: bi.row.nodeType === "CATEGORY" ? bi.row.nodeId : undefined,
        productId: bi.row.nodeType === "PRODUCT" ? bi.row.nodeId : undefined,
        productVariantId: bi.row.nodeType === "VARIANT" ? bi.row.nodeId : undefined,
      })),
    };

    try {
      const res = await fetch("/api/dashboard/stock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as { message?: string; error?: string };

      if (res.ok) {
        toast.success(data.message ?? `Stock updated for ${batchItems.length} item(s).`);
        setBatchItems([]);
        // Refresh the inventory list behind this form
        const refreshRes = await fetch(`/api/dashboard/inventory?branchId=${branchId}`);
        if (refreshRes.ok) {
          const refreshData = (await refreshRes.json()) as { rows: InventoryRow[] };
          setInventoryRows(refreshData.rows);
        }
        router.refresh();
      } else {
        toast.error(data.error ?? "Failed to submit stock-in batch.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const totalUnitsAdded = batchItems.reduce((sum, bi) => sum + bi.quantityAdded, 0);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Stock In</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Record incoming stock for one or more items in a single delivery.
        </p>
      </div>

      {/* Branch Selector */}
      <div className="rounded-3xl border bg-card p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-bold text-foreground">Branch</Label>
          {branches.length === 1 && (
            <Badge variant="outline" className="text-xs font-semibold">
              Your assigned branch
            </Badge>
          )}
        </div>
        {branches.length > 1 ? (
          <Select value={branchId} onValueChange={handleBranchChange}>
            <SelectTrigger className="rounded-xl h-11">
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
        ) : (
          <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-4 h-11">
            <span className="text-sm font-semibold text-foreground">{branchName}</span>
          </div>
        )}
      </div>

      {/* Node Picker */}
      <div className="rounded-3xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-bold text-foreground">Add Items to Batch</Label>
          <span className="text-xs text-muted-foreground">
            {batchItems.length} / 50 items
          </span>
        </div>

        {/* Combobox-style picker */}
        <div className="flex gap-2">
          <Popover open={nodePickerOpen} onOpenChange={setNodePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between rounded-xl h-11 font-normal text-muted-foreground"
                disabled={loadingRows || batchItems.length >= 50}
              >
                {loadingRows ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading items…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Search className="h-4 w-4" /> Search for a stock-bearing item…
                  </span>
                )}
                <ChevronDown className="h-4 w-4 opacity-50 ml-auto" />
              </Button>
            </PopoverTrigger>
          <PopoverContent className="w-[min(90vw,520px)] p-0 rounded-2xl" align="start">
            <Command>
              <CommandInput
                placeholder="Search by name or category…"
                value={nodeSearch}
                onValueChange={setNodeSearch}
              />
              <CommandList className="max-h-72">
                <CommandEmpty>No stock-bearing items found for this branch.</CommandEmpty>
                <CommandGroup>
                  {filteredRows.map((row) => (
                    <CommandItem
                      key={`${row.nodeId}-${row.branchId}`}
                      value={`${row.displayName} ${row.categoryPath}`}
                      onSelect={() => addBatchItem(row)}
                      className="cursor-pointer rounded-lg"
                    >
                      <div className="flex items-start gap-3 w-full py-0.5">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-foreground text-sm truncate">
                            {row.displayName}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {row.categoryPath}
                          </div>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">
                            {row.quantity} units
                          </span>
                          {row.nodeType === "CATEGORY" && (
                            <Badge className="text-[10px] bg-purple-500/10 text-purple-600 border-purple-500/20 shadow-none py-0 px-1.5">
                              Cat
                            </Badge>
                          )}
                          {row.nodeType === "PRODUCT" && (
                            <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 shadow-none py-0 px-1.5">
                              Prod
                            </Badge>
                          )}
                          {row.nodeType === "VARIANT" && (
                            <Badge className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20 shadow-none py-0 px-1.5">
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
        {enableBarcodeScanning && (
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 rounded-xl flex-shrink-0"
            onClick={() => setScannerOpen(!scannerOpen)}
            title="Scan Barcode / QR Code"
            disabled={batchItems.length >= 50}
          >
            <QrCode className="h-5 w-5" />
          </Button>
        )}
      </div>

      {enableBarcodeScanning && scannerOpen && (
        <div className="border rounded-2xl p-4 bg-muted/10 animate-in fade-in duration-200">
          <BarcodeScanner
            onScan={handleBarcodeScan}
            onClose={() => setScannerOpen(false)}
          />
        </div>
      )}

        {/* Batch item list */}
        {batchItems.length > 0 && (
          <div className="space-y-3 mt-2">
            {batchItems.map((bi) => (
              <div
                key={bi.key}
                className="rounded-2xl border bg-muted/20 p-4 space-y-3"
              >
                {/* Item header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground text-sm truncate">{bi.row.displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">{bi.row.categoryPath}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg flex-shrink-0 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => removeBatchItem(bi.key)}
                    title="Remove item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Current stock + quantity input + new total */}
                <div className="grid grid-cols-3 gap-3 items-end">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Current stock</Label>
                    <div className="h-11 flex items-center px-3 rounded-xl border bg-background/60 font-mono text-sm font-bold text-foreground">
                      {bi.row.quantity}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`qty-${bi.key}`} className="text-xs font-semibold text-foreground">
                      Add quantity
                    </Label>
                    <Input
                      id={`qty-${bi.key}`}
                      type="number"
                      min={1}
                      max={100000}
                      value={bi.quantityAdded}
                      onChange={(e) =>
                        updateBatchItem(bi.key, "quantityAdded", Math.max(1, parseInt(e.target.value) || 1))
                      }
                      className="rounded-xl h-11 font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">New total</Label>
                    <div className="h-11 flex items-center px-3 rounded-xl border bg-emerald-500/10 font-mono text-sm font-extrabold text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                      {bi.row.quantity + bi.quantityAdded}
                    </div>
                  </div>
                </div>

                {/* Optional note */}
                <div className="space-y-1.5">
                  <Label htmlFor={`note-${bi.key}`} className="text-xs font-semibold text-muted-foreground">
                    Note (optional)
                  </Label>
                  <Input
                    id={`note-${bi.key}`}
                    placeholder="e.g. Supplier delivery — Invoice #1234"
                    maxLength={255}
                    value={bi.note}
                    onChange={(e) => updateBatchItem(bi.key, "note", e.target.value)}
                    className="rounded-xl h-10 text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary + Submit */}
      {batchItems.length > 0 && (
        <div className="rounded-3xl border bg-card p-5 shadow-sm space-y-4">
          {/* Batch summary */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex-1 space-y-0.5">
              <p className="font-bold text-foreground">
                {batchItems.length} item{batchItems.length !== 1 ? "s" : ""} in batch
              </p>
              <p className="text-muted-foreground text-xs">
                Adding a total of <span className="font-bold text-foreground">{totalUnitsAdded}</span> units to{" "}
                <span className="font-bold text-foreground">{branchName}</span>.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-xl">
              <Info className="h-3.5 w-3.5" />
              Each item gets its own StockMovement audit record.
            </div>
          </div>

          <Button
            id="submit-stock-in-btn"
            className="w-full h-12 rounded-xl text-base font-bold"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" /> Saving…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Confirm stock-in ({batchItems.length} item{batchItems.length !== 1 ? "s" : ""})
              </span>
            )}
          </Button>
        </div>
      )}

      {/* Empty state */}
      {batchItems.length === 0 && !loadingRows && (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed p-10 text-center bg-card/40 gap-3">
          <div className="h-12 w-12 flex items-center justify-center rounded-2xl bg-muted">
            <PackagePlus className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-foreground">No items added yet</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Use the search box above to add stock-bearing items to this delivery.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
