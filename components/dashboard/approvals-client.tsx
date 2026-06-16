// components/dashboard/approvals-client.tsx
// Client component managing pending approvals queue, supporting filters, edit-before-approve, rejection reason, and bulk actions.

"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Check,
  X,
  Edit2,
  Calendar,
  Loader2,
  AlertCircle,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface SaleItem {
  id: string;
  saleId: string;
  productId: string | null;
  productVariantId: string | null;
  categoryId: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  displayName?: string; // Resolved client-side or by GET /api/dashboard/sales
}

interface Sale {
  id: string;
  branchId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  loggedById: string;
  totalAmount: number;
  createdAt: string;
  items: SaleItem[];
  loggedBy: {
    id: string;
    name: string | null;
    email: string;
  };
}

interface Branch {
  id: string;
  name: string;
}

interface ApprovalsClientProps {
  branches: Branch[];
  userRole: "OWNER" | "BRANCH_MANAGER" | "STAFF";
  userId: string;
  initialBranchId: string;
}

export function ApprovalsClient({
  branches,
  userRole,
  userId,
  initialBranchId,
}: ApprovalsClientProps) {
  const router = useRouter();

  // Filters State
  const [branchId, setBranchId] = useState<string>(initialBranchId === "" ? "all" : initialBranchId);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Data Loading State
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkApproving, setIsBulkApproving] = useState<boolean>(false);

  // Action modals state
  const [actionSale, setActionSale] = useState<Sale | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [isRejecting, setIsRejecting] = useState<boolean>(false);

  const [editSale, setEditSale] = useState<Sale | null>(null);
  const [editQuantities, setEditQuantities] = useState<Record<string, number>>({});
  const [isEditing, setIsEditing] = useState<boolean>(false);

  const [singleApprovingId, setSingleApprovingId] = useState<string | null>(null);

  // Fetch pending sales based on filters
  const loadPendingSales = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("status", "PENDING");
      if (branchId !== "all") {
        params.set("branchId", branchId);
      }
      if (dateFrom) {
        params.set("dateFrom", new Date(dateFrom).toISOString());
      }
      if (dateTo) {
        // Enforce full end of the day for dateTo
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        params.set("dateTo", endOfDay.toISOString());
      }

      const response = await fetch(`/api/dashboard/sales?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to retrieve pending sales.");

      const data = (await response.json()) as Sale[];
      setSales(data);
      // Reset selections when list reloads
      setSelectedIds([]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unexpected error loading sales.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [branchId, dateFrom, dateTo]);

  useEffect(() => {
    void loadPendingSales();
  }, [loadPendingSales]);

  // Sync branch filter selection to main route parameter for state sharing
  const handleBranchFilterChange = (id: string) => {
    setBranchId(id);
    const searchParams = new URLSearchParams(window.location.search);
    if (id === "all") {
      searchParams.delete("branch");
    } else {
      searchParams.set("branch", id);
    }
    router.push(`?${searchParams.toString()}`);
  };

  // Checkbox interactions
  const handleSelectToggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllToggle = () => {
    if (selectedIds.length === sales.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(sales.map((s) => s.id));
    }
  };

  // API Call handlers
  const handleApproveSingle = async (saleId: string) => {
    setSingleApprovingId(saleId);
    try {
      const response = await fetch(`/api/dashboard/sales/${saleId}/approve`, {
        method: "POST",
      });

      const json = (await response.json()) as unknown;

      if (!response.ok) {
        const errorMsg =
          json !== null &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : "Approval failed.";
        throw new Error(errorMsg);
      }

      toast.success("Sale approved successfully.");
      void loadPendingSales();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unexpected error.";
      toast.error(msg);
    } finally {
      setSingleApprovingId(null);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0 || isBulkApproving) return;
    setIsBulkApproving(true);
    try {
      const response = await fetch("/api/dashboard/sales/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleIds: selectedIds }),
      });

      const json = (await response.json()) as {
        approved: string[];
        skipped: { saleId: string; reason: string }[];
      };

      if (!response.ok) {
        throw new Error("Bulk approval request failed.");
      }

      const approvedCount = json.approved.length;
      const skippedCount = json.skipped.length;

      if (skippedCount > 0) {
        toast.warning(
          `${approvedCount} sales approved. ${skippedCount} sales were skipped (already reviewed or access changed). Refreshing list.`
        );
      } else {
        toast.success(`Successfully approved ${approvedCount} sales!`);
      }

      void loadPendingSales();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unexpected error.";
      toast.error(msg);
    } finally {
      setIsBulkApproving(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!actionSale) return;
    setIsRejecting(true);
    try {
      const response = await fetch(`/api/dashboard/sales/${actionSale.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason || null }),
      });

      const json = (await response.json()) as unknown;

      if (!response.ok) {
        const errorMsg =
          json !== null &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : "Rejection failed.";
        throw new Error(errorMsg);
      }

      toast.success("Sale rejected successfully.");
      setActionSale(null);
      setRejectReason("");
      void loadPendingSales();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unexpected error.";
      toast.error(msg);
    } finally {
      setIsRejecting(false);
    }
  };

  const handleEditConfirm = async () => {
    if (!editSale) return;

    // Build items payload
    const itemsPayload = Object.entries(editQuantities).map(([saleItemId, newQuantity]) => ({
      saleItemId,
      newQuantity,
    }));

    if (itemsPayload.length === 0) {
      toast.error("No item quantities were changed.");
      return;
    }

    setIsEditing(true);
    try {
      const response = await fetch(`/api/dashboard/sales/${editSale.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsPayload }),
      });

      const json = (await response.json()) as unknown;

      if (!response.ok) {
        const errorMsg =
          json !== null &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : "Correction save failed.";
        throw new Error(errorMsg);
      }

      toast.success("Sale corrected and approved successfully!");
      setEditSale(null);
      setEditQuantities({});
      void loadPendingSales();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unexpected error.";
      toast.error(msg);
    } finally {
      setIsEditing(false);
    }
  };

  const openEditModal = (sale: Sale) => {
    setEditSale(sale);
    // Populate helper dictionary of quantities
    const dict: Record<string, number> = {};
    sale.items.forEach((item) => {
      dict[item.id] = item.quantity;
    });
    setEditQuantities(dict);
  };

  const handleQtyChange = (saleItemId: string, val: string) => {
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0 && num <= 1000) {
      setEditQuantities((prev) => ({
        ...prev,
        [saleItemId]: num,
      }));
    }
  };

  // Safe formatting of distance to prevent hydrations mismatches
  const formatTime = (isoString: string) => {
    try {
      return formatDistanceToNow(new Date(isoString), { addSuffix: true });
    } catch {
      return "just now";
    }
  };

  const allSelected = sales.length > 0 && selectedIds.length === sales.length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Pending Approvals
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Audit and approve logged counter sales. Unread approvals are marked automatically.
          </p>
        </div>

        {/* Filters Panel */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Branch Select */}
          <div className="w-48">
            <Select value={branchId} onValueChange={handleBranchFilterChange}>
              <SelectTrigger id="approvals-branch-filter" className="rounded-xl">
                <SelectValue placeholder="Select Branch" />
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

          {/* Date Picker Range (Native HTML components) */}
          <div className="flex items-center gap-2 bg-card border rounded-xl px-3 py-1.5 text-xs text-muted-foreground shadow-xs">
            <Calendar className="h-4 w-4 text-muted-foreground/80 flex-shrink-0" />
            <input
              id="approvals-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-transparent border-none outline-none text-foreground cursor-pointer focus:ring-0"
              aria-label="Start date"
            />
            <span>to</span>
            <input
              id="approvals-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-transparent border-none outline-none text-foreground cursor-pointer focus:ring-0"
              aria-label="End date"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                className="text-xxs font-bold text-destructive hover:text-destructive/80 ml-1.5 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Bar */}
      {sales.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 shadow-xxs">
          <div className="flex items-center gap-3">
            <input
              id="approvals-select-all"
              type="checkbox"
              checked={allSelected}
              onChange={handleSelectAllToggle}
              className="h-4 w-4 rounded-md border-amber-500/30 text-amber-600 focus:ring-amber-500 cursor-pointer"
            />
            <span className="text-sm font-semibold text-amber-900 dark:text-amber-300">
              {sales.length} sale{sales.length > 1 ? "s" : ""} awaiting review
              {selectedIds.length > 0 && (
                <span className="font-normal text-muted-foreground ml-1.5">
                  ({selectedIds.length} selected)
                </span>
              )}
            </span>
          </div>

          {selectedIds.length > 0 && (
            <Button
              id="approvals-bulk-approve-btn"
              onClick={handleBulkApprove}
              disabled={isBulkApproving}
              className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5"
            >
              {isBulkApproving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Approve Selected
            </Button>
          )}
        </div>
      )}

      {/* Approvals Table / Grid View */}
      {loading ? (
        <Card className="rounded-3xl border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground text-xs gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Loading pending approvals queue...
          </CardContent>
        </Card>
      ) : sales.length === 0 ? (
        <Card className="rounded-3xl border shadow-sm border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <div className="p-4 rounded-full bg-muted/40 mb-3">
              <Inbox className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <p className="text-sm font-bold text-foreground">Clear Queue!</p>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-xs">
              All logged sales are currently reviewed and approved. There are no pending approvals.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Desktop view table */}
          <div className="hidden md:block rounded-3xl border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-muted/20 text-muted-foreground font-semibold">
                    <th className="p-4 w-12 text-center">Select</th>
                    <th className="p-4">Staff / Time</th>
                    {branchId === "all" && <th className="p-4">Branch</th>}
                    <th className="p-4">Items Summary</th>
                    <th className="p-4 text-right">Total Amount</th>
                    <th className="p-4 text-center w-64">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {sales.map((sale) => (
                    <tr
                      key={sale.id}
                      className={cn(
                        "hover:bg-muted/10 transition-colors",
                        selectedIds.includes(sale.id) && "bg-primary/5 hover:bg-primary/10"
                      )}
                    >
                      {/* Checkbox select */}
                      <td className="p-4 text-center">
                        <input
                          id={`select-sale-${sale.id}`}
                          type="checkbox"
                          checked={selectedIds.includes(sale.id)}
                          onChange={() => handleSelectToggle(sale.id)}
                          className="h-4 w-4 rounded-md border-input text-primary focus:ring-primary cursor-pointer"
                        />
                      </td>

                      {/* Staff & Date */}
                      <td className="p-4">
                        <div className="font-semibold text-foreground">
                          {sale.loggedBy.name ?? "Anonymous"}
                        </div>
                        <div className="text-xxs text-muted-foreground mt-0.5">
                          {sale.loggedBy.email}
                        </div>
                        <div className="text-xxs text-muted-foreground/60 mt-1 font-medium">
                          {formatTime(sale.createdAt)}
                        </div>
                      </td>

                      {/* Branch Column */}
                      {branchId === "all" && (
                        <td className="p-4 font-semibold text-foreground">
                          {branches.find((b) => b.id === sale.branchId)?.name ?? "Unknown"}
                        </td>
                      )}

                      {/* Items */}
                      <td className="p-4">
                        <div className="space-y-1 max-w-xs">
                          {sale.items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-3 text-xxs text-muted-foreground">
                              <span className="font-medium truncate text-foreground/80 max-w-[200px]">
                                {item.displayName ?? "Counter Sale Item"}
                              </span>
                              <span className="flex-shrink-0 font-semibold text-foreground">
                                x{item.quantity}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* Total Amount */}
                      <td className="p-4 text-right font-bold text-foreground text-sm">
                        KES {Number(sale.totalAmount).toLocaleString()}
                      </td>

                      {/* Action buttons */}
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            id={`approve-sale-btn-${sale.id}`}
                            size="sm"
                            variant="outline"
                            onClick={() => handleApproveSingle(sale.id)}
                            disabled={singleApprovingId === sale.id}
                            className="h-8 rounded-xl border-emerald-500/20 text-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10 hover:text-emerald-600 text-xxs px-2.5 font-bold flex items-center gap-1"
                          >
                            {singleApprovingId === sale.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            Approve
                          </Button>

                          <Button
                            id={`edit-sale-btn-${sale.id}`}
                            size="sm"
                            variant="outline"
                            onClick={() => openEditModal(sale)}
                            className="h-8 rounded-xl border-primary/20 text-primary bg-primary/5 hover:bg-primary/10 hover:text-primary/80 text-xxs px-2.5 font-bold flex items-center gap-1"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            Edit
                          </Button>

                          <Button
                            id={`reject-sale-btn-${sale.id}`}
                            size="sm"
                            variant="outline"
                            onClick={() => setActionSale(sale)}
                            className="h-8 rounded-xl border-destructive/20 text-destructive bg-destructive/5 hover:bg-destructive/10 hover:text-destructive/80 text-xxs px-2.5 font-bold flex items-center gap-1"
                          >
                            <X className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile view card grid */}
          <div className="block md:hidden space-y-3">
            {sales.map((sale) => (
              <Card
                key={sale.id}
                className={cn(
                  "rounded-2xl border bg-card shadow-xs overflow-hidden transition-all",
                  selectedIds.includes(sale.id) && "border-primary bg-primary/5"
                )}
              >
                <CardHeader className="p-4 pb-2 border-b flex flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <input
                      id={`select-sale-mobile-${sale.id}`}
                      type="checkbox"
                      checked={selectedIds.includes(sale.id)}
                      onChange={() => handleSelectToggle(sale.id)}
                      className="h-4.5 w-4.5 rounded border-input text-primary focus:ring-primary cursor-pointer"
                    />
                    <div>
                      <p className="text-xs font-bold text-foreground truncate max-w-[150px]">
                        {sale.loggedBy.name ?? "Anonymous"}
                      </p>
                      <p className="text-xxs text-muted-foreground/80 mt-0.5">
                        {formatTime(sale.createdAt)}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs font-bold text-foreground">
                    KES {Number(sale.totalAmount).toLocaleString()}
                  </p>
                </CardHeader>

                <CardContent className="p-4 space-y-4">
                  {/* Items summary */}
                  <div className="space-y-1.5">
                    {sale.items.map((item) => (
                      <div key={item.id} className="flex justify-between items-center gap-3 text-xxs text-muted-foreground">
                        <span className="truncate text-foreground/80 font-medium">
                          {item.displayName ?? "Item"}
                        </span>
                        <span className="font-semibold text-foreground">
                          x{item.quantity}
                        </span>
                      </div>
                    ))}
                  </div>

                  {branchId === "all" && (
                    <div className="text-xxs text-muted-foreground font-semibold flex items-center gap-1">
                      <span>Branch:</span>
                      <span className="text-foreground">
                        {branches.find((b) => b.id === sale.branchId)?.name ?? "Unknown"}
                      </span>
                    </div>
                  )}

                  {/* Actions mobile */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                    <Button
                      id={`approve-sale-mobile-btn-${sale.id}`}
                      size="sm"
                      variant="outline"
                      onClick={() => handleApproveSingle(sale.id)}
                      disabled={singleApprovingId === sale.id}
                      className="h-8 rounded-xl border-emerald-500/20 text-emerald-500 bg-emerald-500/5 text-xxs font-bold flex items-center justify-center gap-1"
                    >
                      {singleApprovingId === sale.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Approve
                    </Button>

                    <Button
                      id={`edit-sale-mobile-btn-${sale.id}`}
                      size="sm"
                      variant="outline"
                      onClick={() => openEditModal(sale)}
                      className="h-8 rounded-xl border-primary/20 text-primary bg-primary/5 text-xxs font-bold flex items-center justify-center gap-1"
                    >
                      <Edit2 className="h-3 w-3" />
                      Edit
                    </Button>

                    <Button
                      id={`reject-sale-mobile-btn-${sale.id}`}
                      size="sm"
                      variant="outline"
                      onClick={() => setActionSale(sale)}
                      className="h-8 rounded-xl border-destructive/20 text-destructive bg-destructive/5 text-xxs font-bold flex items-center justify-center gap-1"
                    >
                      <X className="h-3 w-3" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* REJECT DIALOG */}
      <Dialog open={actionSale !== null} onOpenChange={(open) => !open && setActionSale(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Confirm Sale Rejection
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-normal pt-1">
              Rejecting this sale will reverse inventory decrements by creating positive ADJUSTMENT logs. The logging staff member will be notified.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label htmlFor="reject-reason" className="text-xs font-semibold text-foreground">
                Rejection Reason
              </Label>
              <Input
                id="reject-reason-input"
                placeholder="Specify reason for rejection..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                maxLength={255}
                className="rounded-xl text-xs py-5"
                disabled={isRejecting}
              />
              <p className="text-xxs text-muted-foreground/60 text-right">
                {rejectReason.length}/255 characters
              </p>
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:justify-end border-t pt-4">
            <Button
              id="reject-dialog-cancel"
              variant="outline"
              onClick={() => {
                setActionSale(null);
                setRejectReason("");
              }}
              disabled={isRejecting}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              id="reject-dialog-confirm"
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={isRejecting}
              className="rounded-xl text-xs flex items-center gap-1.5"
            >
              {isRejecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT DIALOG */}
      <Dialog open={editSale !== null} onOpenChange={(open) => !open && setEditSale(null)}>
        <DialogContent className="sm:max-w-lg rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-primary" />
              Correct Item Quantities
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-normal pt-1">
              Modify the quantity of items sold. Saving will adjust inventory and immediately approve the corrected sale.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 max-h-[300px] overflow-y-auto pr-1">
            {editSale?.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0 gap-4">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <p className="text-xs font-bold text-foreground truncate">
                    {item.displayName ?? "Item"}
                  </p>
                  <p className="text-xxs text-muted-foreground">
                    Original Qty: {item.quantity} | Price: KES {Number(item.unitPrice).toLocaleString()}
                  </p>
                </div>
                <div className="w-24">
                  <Label htmlFor={`qty-input-${item.id}`} className="sr-only">
                    Quantity
                  </Label>
                  <Input
                    id={`qty-input-${item.id}`}
                    type="number"
                    min={1}
                    max={1000}
                    value={editQuantities[item.id] ?? 1}
                    onChange={(e) => handleQtyChange(item.id, e.target.value)}
                    className="rounded-xl text-xs text-center font-semibold h-9"
                    disabled={isEditing}
                  />
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="flex gap-2 sm:justify-end border-t pt-4">
            <Button
              id="edit-dialog-cancel"
              variant="outline"
              onClick={() => {
                setEditSale(null);
                setEditQuantities({});
              }}
              disabled={isEditing}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              id="edit-dialog-confirm"
              onClick={handleEditConfirm}
              disabled={isEditing}
              className="rounded-xl text-xs flex items-center gap-1.5"
            >
              {isEditing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save & Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
