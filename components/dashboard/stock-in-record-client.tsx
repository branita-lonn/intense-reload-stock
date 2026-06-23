// components/dashboard/stock-in-record-client.tsx
// Client component managing stock-in record ledger, filters, single inline date editing, and bulk date edits.

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Calendar,
  Search,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  Pencil,
  X,
  Check,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StockInRecordRow } from "@/lib/stock-in-record-queries";

interface StockInRecordClientProps {
  branches: Array<{ id: string; name: string }>;
  user: { id: string; name: string; role: string };
}

export function StockInRecordClient({ branches, user }: StockInRecordClientProps) {
  const [branchId, setBranchId] = useState<string>(branches.length === 1 ? branches[0].id : "all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<StockInRecordRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Inline edit state
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingDateValue, setEditingDateValue] = useState("");

  // Bulk edit state
  const [bulkDateValue, setBulkDateValue] = useState("");
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Sync / query executor
  const triggerFetch = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (branchId && branchId !== "all") queryParams.set("branchId", branchId);
      if (search.trim()) queryParams.set("search", search.trim());
      if (dateFrom) queryParams.set("dateFrom", new Date(dateFrom).toISOString());
      if (dateTo) queryParams.set("dateTo", new Date(dateTo).toISOString());
      queryParams.set("page", page.toString());
      queryParams.set("pageSize", "25");

      const res = await fetch(`/api/dashboard/inventory/stock-in-record?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch records");
      const data = await res.json();
      setRows(data.rows);
      setTotalCount(data.totalCount);
    } catch {
      toast.error("Failed to load stock-in records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      triggerFetch();
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, search, dateFrom, dateTo, page]);

  // Handle filter changes
  const handleBranchChange = (val: string) => {
    setBranchId(val);
    setPage(1);
    setSelectedIds(new Set());
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
    setSelectedIds(new Set());
  };

  const handleDateFromChange = (val: string) => {
    setDateFrom(val);
    setPage(1);
    setSelectedIds(new Set());
  };

  const handleDateToChange = (val: string) => {
    setDateTo(val);
    setPage(1);
    setSelectedIds(new Set());
  };

  const handleResetFilters = () => {
    setBranchId(branches.length === 1 ? branches[0].id : "all");
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
    setSelectedIds(new Set());
  };

  // Selection Helpers
  const allChecked = rows.length > 0 && selectedIds.size === rows.length;

  const toggleAll = () => {
    if (allChecked) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const toggleSingle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Inline Edit handlers
  const startInlineEdit = (row: StockInRecordRow) => {
    if (user.role === "STAFF" && row.performedById !== user.id) {
      toast.warning("Staff members can only edit dates of stock-in movements they personally logged.");
      return;
    }

    setEditingRowId(row.id);
    if (row.stockInDate) {
      const [dd, mm, yyyy] = row.stockInDate.split("/");
      if (dd && mm && yyyy) {
        setEditingDateValue(`${yyyy}-${mm}-${dd}`);
        return;
      }
    }
    
    // Fallback default
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setEditingDateValue(`${yyyy}-${mm}-${dd}`);
  };

  const cancelInlineEdit = () => {
    setEditingRowId(null);
    setEditingDateValue("");
  };

  const saveInlineEdit = async (rowId: string) => {
    if (!editingDateValue) {
      cancelInlineEdit();
      return;
    }

    try {
      const parsedDate = new Date(editingDateValue);
      if (isNaN(parsedDate.getTime())) {
        toast.error("Please enter a valid date.");
        return;
      }

      // Convert yyyy-MM-dd to dd/MM/yyyy
      const dd = String(parsedDate.getDate()).padStart(2, "0");
      const mm = String(parsedDate.getMonth() + 1).padStart(2, "0");
      const yyyy = parsedDate.getFullYear();
      const formattedDate = `${dd}/${mm}/${yyyy}`;

      const res = await fetch("/api/dashboard/stock-in/edit-date", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockMovementIds: [rowId],
          stockInDate: formattedDate,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to update date");
      }

      if (data.skipped && data.skipped.length > 0) {
        toast.error(`Could not update date: ${data.skipped[0].reason}`);
      } else {
        toast.success("Stock-in date updated successfully.");
        triggerFetch();
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : "An error occurred while updating the date.";
      toast.error(errMsg);
    } finally {
      cancelInlineEdit();
    }
  };

  // Bulk Edit Handler
  const handleBulkUpdateDate = async () => {
    if (!bulkDateValue) {
      toast.error("Please select a date first.");
      return;
    }

    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    // Client-side RBAC sanity check
    if (user.role === "STAFF") {
      const hasForbiddenRow = ids.some((id) => {
        const row = rows.find((r) => r.id === id);
        return row && row.performedById !== user.id;
      });
      if (hasForbiddenRow) {
        toast.error("Bulk edit failed: Staff members can only update movements they personally logged.");
        return;
      }
    }

    setIsBulkUpdating(true);

    try {
      const parsedDate = new Date(bulkDateValue);
      if (isNaN(parsedDate.getTime())) {
        toast.error("Please enter a valid date.");
        return;
      }

      const dd = String(parsedDate.getDate()).padStart(2, "0");
      const mm = String(parsedDate.getMonth() + 1).padStart(2, "0");
      const yyyy = parsedDate.getFullYear();
      const formattedDate = `${dd}/${mm}/${yyyy}`;

      const res = await fetch("/api/dashboard/stock-in/edit-date", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockMovementIds: ids,
          stockInDate: formattedDate,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to bulk update dates.");
      }

      const updatedCount = data.updated?.length || 0;
      const skippedCount = data.skipped?.length || 0;

      if (skippedCount > 0) {
        toast.warning(`Updated ${updatedCount} record(s). Skipped ${skippedCount} record(s) due to security constraints.`);
      } else {
        toast.success(`Successfully updated ${updatedCount} record(s).`);
      }

      setSelectedIds(new Set());
      setBulkDateValue("");
      triggerFetch();
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : "An error occurred during bulk update.";
      toast.error(errMsg);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Export handlers
  const handleExport = (formatType: "csv" | "pdf") => {
    const queryParams = new URLSearchParams();
    if (branchId && branchId !== "all") queryParams.set("branchId", branchId);
    if (search.trim()) queryParams.set("search", search.trim());
    if (dateFrom) queryParams.set("dateFrom", new Date(dateFrom).toISOString());
    if (dateTo) queryParams.set("dateTo", new Date(dateTo).toISOString());
    queryParams.set("format", formatType);

    window.open(`/api/dashboard/inventory/stock-in-record/export?${queryParams.toString()}`, "_blank");
  };

  const totalPages = Math.ceil(totalCount / 25);
  const showBranchColumn = branchId === "all";

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Stock-In Record
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View, audit, and manage physical delivery history and business arrival dates.
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("csv")} className="rounded-xl h-10 gap-1.5 font-semibold">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("pdf")} className="rounded-xl h-10 gap-1.5 font-semibold">
            <Printer className="h-4 w-4" />
            Print PDF
          </Button>
        </div>
      </div>

      {/* Filter and Query controls */}
      <div className="bg-card/50 border rounded-3xl p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Branch switcher */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Branch</Label>
            {branches.length > 1 ? (
              <Select value={branchId} onValueChange={handleBranchChange}>
                <SelectTrigger className="rounded-xl h-10 shadow-sm">
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
              <div className="bg-background border rounded-xl px-3 py-2 text-sm font-semibold h-10 flex items-center">
                {branches[0]?.name || "N/A"}
              </div>
            )}
          </div>

          {/* Search input */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Search Item</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 rounded-xl h-10 shadow-sm"
              />
            </div>
          </div>

          {/* Date from */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Arrived From</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => handleDateFromChange(e.target.value)}
                className="pl-9 rounded-xl h-10 shadow-sm"
              />
            </div>
          </div>

          {/* Date to */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Arrived To</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => handleDateToChange(e.target.value)}
                className="pl-9 rounded-xl h-10 shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* Reset & Refresh controls */}
        <div className="flex items-center justify-between pt-1 border-t border-muted/50">
          <p className="text-xs text-muted-foreground font-semibold">
            {loading ? "Refreshing records..." : `Showing ${totalCount} record(s)`}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={triggerFetch} className="rounded-xl h-8 text-xs font-semibold text-foreground">
              <RefreshCw className="h-3 w-3 mr-1" />
              Refresh
            </Button>
            {(search || dateFrom || dateTo || (branchId !== "all" && branches.length > 1)) && (
              <Button variant="ghost" size="sm" onClick={handleResetFilters} className="rounded-xl h-8 text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive">
                Reset Filters
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main ledger list */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] bg-card border rounded-3xl gap-3">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">Loading ledger records...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] bg-card border border-dashed rounded-3xl p-8 text-center gap-2">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <h3 className="text-base font-bold text-foreground">No records found</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Try adjusting your search queries, date-range bounds, or selected branch filter.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View */}
          <div className="rounded-3xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/15 hover:bg-muted/15 border-b">
                  <TableHead className="w-[50px] pl-4">
                    <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Select all rows" />
                  </TableHead>
                  {/* <TableHead className="w-[120px]">Movement ID</TableHead> */}
                  <TableHead className="w-[180px]">Stock-In Date</TableHead>
                  <TableHead>Item Name</TableHead>
                  {/* <TableHead>Category Path</TableHead> */}
                  <TableHead className="w-[110px]">Before</TableHead>
                  <TableHead className="w-[110px]">Added</TableHead>
                  <TableHead className="w-[110px]">Total</TableHead>
                  {showBranchColumn && <TableHead className="w-[130px]">Branch</TableHead>}
                  <TableHead className="w-[150px]">Performed By</TableHead>
                  
                  <TableHead className="w-[150px]">System Date</TableHead>
                  <TableHead className="w-[200px]">Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const isEditing = editingRowId === row.id;
                  const isChecked = selectedIds.has(row.id);
                  return (
                    <TableRow key={row.id} className={`hover:bg-muted/30 border-b ${isChecked ? "bg-primary/5 hover:bg-primary/10" : ""}`}>
                      <TableCell className="pl-4">
                        <Checkbox checked={isChecked} onCheckedChange={() => toggleSingle(row.id)} aria-label={`Select record ${row.id}`} />
                      </TableCell>
                      {/* <TableCell className="font-mono text-xs text-muted-foreground font-semibold">
                        {row.id.substring(0, 8)}...
                      </TableCell> */}
                      {/* Stock-In Date (Editable inline) */}
                      <TableCell className="relative group">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="date"
                              value={editingDateValue}
                              onChange={(e) => setEditingDateValue(e.target.value)}
                              className="h-8 rounded-lg text-xs font-semibold px-2 py-1 w-[125px]"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveInlineEdit(row.id);
                                else if (e.key === "Escape") cancelInlineEdit();
                              }}
                            />
                            <Button size="icon" variant="ghost" onClick={() => saveInlineEdit(row.id)} className="h-8 w-8 text-emerald-600 rounded-lg">
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={cancelInlineEdit} className="h-8 w-8 text-destructive rounded-lg">
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div
                            onClick={() => startInlineEdit(row)}
                            className="flex items-center gap-1.5 cursor-pointer hover:bg-muted/70 px-2 py-1.5 -mx-2 rounded-lg transition-colors min-h-[32px] w-full"
                          >
                            <span className="text-sm font-semibold">
                              {row.stockInDate ? row.stockInDate : "—"}
                            </span>
                            <Pencil className="h-3 w-3 text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-bold text-foreground">{row.nodeDisplayName}</TableCell>
                      {/* <TableCell className="text-muted-foreground text-xs font-semibold">{row.categoryPath}</TableCell> */}
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.quantityBefore}</TableCell>
                      <TableCell className="font-mono text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                        +{row.quantityAdded}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold">{row.quantityAfter}</TableCell>
                      {showBranchColumn && <TableCell className="text-sm font-semibold">{row.branchName}</TableCell>}
                      <TableCell className="text-sm font-medium">{row.enteredBy}</TableCell>
                      
                      

                      {/* System Date (Read-only) */}
                      <TableCell className="text-muted-foreground text-xs font-semibold">
                        {row.systemDate}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground italic font-medium max-w-[200px] truncate" title={row.note || ""}>
                        {row.note || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card List View */}
          <div className="hidden md:hidden space-y-3">
            {rows.map((row) => {
              const isChecked = selectedIds.has(row.id);
              const isEditing = editingRowId === row.id;
              return (
                <div key={row.id} className={`bg-card border rounded-3xl p-4 space-y-3 shadow-sm relative ${isChecked ? "border-primary bg-primary/5" : ""}`}>
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox checked={isChecked} onCheckedChange={() => toggleSingle(row.id)} aria-label={`Select record ${row.id}`} />
                      <div>
                        <h4 className="text-sm font-bold text-foreground">{row.nodeDisplayName}</h4>
                        <span className="font-mono text-[10px] text-muted-foreground font-semibold">ID: {row.id}</span>
                      </div>
                    </div>
                    <span className="font-mono text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                      +{row.quantityAdded}
                    </span>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs border-t border-muted/50 pt-2.5">
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground">Category Path</p>
                      <p className="font-semibold text-foreground truncate mt-0.5">{row.categoryPath}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground">Branch</p>
                      <p className="font-semibold text-foreground mt-0.5">{row.branchName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground">Performed By</p>
                      <p className="font-semibold text-foreground mt-0.5">{row.enteredBy}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground">System Date</p>
                      <p className="font-semibold text-muted-foreground mt-0.5">{row.systemDate}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground">Before</p>
                      <p className="font-semibold text-foreground mt-0.5">{row.quantityBefore}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground">Total</p>
                      <p className="font-semibold text-foreground mt-0.5">{row.quantityAfter}</p>
                    </div>
                  </div>

                  {/* Stock-In Date Row */}
                  <div className="bg-muted/30 rounded-2xl p-2.5 flex flex-col gap-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground">Stock-In Date (arrival)</p>
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="date"
                          value={editingDateValue}
                          onChange={(e) => setEditingDateValue(e.target.value)}
                          className="h-9 rounded-xl text-xs font-semibold px-2"
                          autoFocus
                        />
                        <Button size="icon" variant="ghost" onClick={() => saveInlineEdit(row.id)} className="h-9 w-9 text-emerald-600 rounded-xl shrink-0">
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={cancelInlineEdit} className="h-9 w-9 text-destructive rounded-xl shrink-0">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div
                        onClick={() => startInlineEdit(row)}
                        className="flex items-center justify-between bg-background border rounded-xl px-3 py-2 cursor-pointer hover:bg-muted/70 transition-colors min-h-[36px]"
                      >
                        <span className="text-xs font-bold text-foreground">
                          {row.stockInDate ? row.stockInDate : "Click to set date"}
                        </span>
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground/60" />
                      </div>
                    )}
                  </div>

                  {/* Note */}
                  {row.note && (
                    <div className="bg-card border border-muted/50 rounded-2xl p-2.5 text-xs text-muted-foreground italic font-medium">
                      Note: {row.note}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <span className="text-xs text-muted-foreground font-semibold">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="rounded-xl h-9">
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="rounded-xl h-9">
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk Edit Floating Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 md:left-[270px] bg-background/95 backdrop-blur-md border border-primary/20 rounded-3xl p-4 shadow-xl z-50 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 animate-in slide-in-from-bottom duration-250">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="rounded-lg px-2 py-0.5 font-bold">
                {selectedIds.size} Selected
              </Badge>
              <span className="text-sm font-bold text-foreground">Bulk Edit Stock-In Date</span>
            </div>
            
            {/* Warning Callout Call */}
            <div className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Changing this date will modify the physical stock arrival record for all selected items. System entry times (System Date) will remain untouched for auditing purposes.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <Input
                type="date"
                value={bulkDateValue}
                onChange={(e) => setBulkDateValue(e.target.value)}
                className="rounded-xl h-10 w-[140px] text-xs font-semibold"
              />
            </div>
            <Button
              onClick={handleBulkUpdateDate}
              disabled={isBulkUpdating || !bulkDateValue}
              className="rounded-xl h-10 px-4 font-bold text-xs shrink-0"
            >
              {isBulkUpdating ? "Updating..." : "Update Date"}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedIds(new Set())}
              className="rounded-xl h-10 w-10 shrink-0"
              aria-label="Cancel selection"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
