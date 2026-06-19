// components/dashboard/activity-log-client.tsx
// Client component managing stock movement activity logs.
// Provides filters (branch, type, staff, search, date range), paginated table, mobile-first card list, and CSV export.
// This module is READ-ONLY. StockMovement and UserActivityLog have no update/delete routes anywhere in this codebase, by design — do not add any here. (OWASP A09: Security Logging and Monitoring)

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Calendar,
  Filter,
  Search,
  Loader2,
  FileClock,
  ArrowRight,
  Download,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { type StockMovementType } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type MovementLogEntry } from "@/lib/stock-movement-queries";

interface Branch {
  id: string;
  name: string;
}

interface StaffUser {
  id: string;
  name: string | null;
}

interface ActivityLogClientProps {
  branches: Branch[];
  staffList: StaffUser[];
  userRole: string;
  userId: string;
  initialBranchId: string;
}

export function ActivityLogClient({
  branches,
  staffList,
  userRole,
  userId,
  initialBranchId,
}: ActivityLogClientProps) {
  const [entries, setEntries] = useState<MovementLogEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [branchId, setBranchId] = useState<string>(initialBranchId);
  const [type, setType] = useState<string>("all");
  const [performedById, setPerformedById] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const pageSize = 25; // Paginated page size fixed at 25 rows

  const canFilterGlobally = userRole === "OWNER" || userRole === "BRANCH_MANAGER";

  // Load activity logs
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (branchId && branchId !== "all") params.set("branchId", branchId);
      if (type && type !== "all") params.set("type", type);
      if (performedById && performedById !== "all") params.set("performedById", performedById);
      if (dateFrom) params.set("dateFrom", new Date(dateFrom).toISOString());
      if (dateTo) {
        // Extend to end of the selected day
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        params.set("dateTo", endOfDay.toISOString());
      }
      if (search) params.set("search", search);
      params.set("page", page.toString());
      params.set("pageSize", pageSize.toString());

      const res = await fetch(`/api/dashboard/activity-log?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setTotalCount(data.totalCount || 0);
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to load activity logs.");
      }
    } catch {
      toast.error("Network error. Could not retrieve activity logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, type, performedById, dateFrom, dateTo, search, page]);

  // Reset page when filters change
  const handleFilterChange = (setter: (val: any) => void, val: any) => {
    setter(val);
    setPage(1);
  };

  // CSV Export handler
  const handleExportCSV = () => {
    const params = new URLSearchParams();
    if (branchId && branchId !== "all") params.set("branchId", branchId);
    if (type && type !== "all") params.set("type", type);
    if (performedById && performedById !== "all") params.set("performedById", performedById);
    if (dateFrom) params.set("dateFrom", new Date(dateFrom).toISOString());
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      params.set("dateTo", endOfDay.toISOString());
    }
    if (search) params.set("search", search);

    window.open(`/api/dashboard/activity-log/export?${params.toString()}`, "_blank");
  };

  function getTypeBadge(movementType: StockMovementType) {
    switch (movementType) {
      case "STOCK_IN":
        return <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 shadow-none font-semibold">Stock In</Badge>;
      case "SALE":
        return <Badge className="bg-blue-500/10 text-blue-600 border border-blue-500/20 shadow-none font-semibold">Sale</Badge>;
      case "ADJUSTMENT":
        return <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20 shadow-none font-semibold">Adjustment</Badge>;
      case "TRANSFER_OUT":
        return <Badge className="bg-purple-500/10 text-purple-600 border border-purple-500/20 shadow-none font-semibold">Transfer Out</Badge>;
      case "TRANSFER_IN":
        return <Badge className="bg-purple-500/10 text-purple-600 border border-purple-500/20 shadow-none font-semibold">Transfer In</Badge>;
      case "DRILL_DOWN_MIGRATION":
        return <Badge className="bg-slate-500/10 text-slate-600 border border-slate-500/20 shadow-none font-semibold">Migration</Badge>;
      default:
        return <Badge variant="outline">{movementType}</Badge>;
    }
  }

  function getDeltaDisplay(delta: number) {
    if (delta > 0) {
      return <span className="font-bold text-emerald-600">+{delta}</span>;
    }
    if (delta < 0) {
      return <span className="font-bold text-destructive">{delta}</span>;
    }
    return <span className="font-bold text-muted-foreground">0</span>;
  }

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Activity Log
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Audit trail of all system-wide stock movements and actions.
          </p>
        </div>
        <Button onClick={handleExportCSV} className="rounded-xl flex items-center gap-2 self-start sm:self-auto">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters Card */}
      <Card className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {/* Branch filter */}
          {canFilterGlobally ? (
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Branch</Label>
              <Select value={branchId} onValueChange={(val) => handleFilterChange(setBranchId, val)}>
                <SelectTrigger className="rounded-xl h-10 bg-background">
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
          ) : (
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Branch</Label>
              <div className="flex items-center px-3 h-10 border rounded-xl bg-muted/30 font-semibold text-sm text-foreground">
                {branches[0]?.name || "Assigned Branch"}
              </div>
            </div>
          )}

          {/* Movement Type Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Type</Label>
            <Select value={type} onValueChange={(val) => handleFilterChange(setType, val)}>
              <SelectTrigger className="rounded-xl h-10 bg-background">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="STOCK_IN">Stock In</SelectItem>
                <SelectItem value="SALE">Sale</SelectItem>
                <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
                <SelectItem value="TRANSFER_OUT">Transfer Out</SelectItem>
                <SelectItem value="TRANSFER_IN">Transfer In</SelectItem>
                <SelectItem value="DRILL_DOWN_MIGRATION">Drill-Down Migration</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Staff member Filter */}
          {canFilterGlobally ? (
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Performed By</Label>
              <Select value={performedById} onValueChange={(val) => handleFilterChange(setPerformedById, val)}>
                <SelectTrigger className="rounded-xl h-10 bg-background">
                  <SelectValue placeholder="All Staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff</SelectItem>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name ?? "Unnamed"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Performed By</Label>
              <div className="flex items-center px-3 h-10 border rounded-xl bg-muted/30 font-semibold text-sm text-foreground">
                Self (Restricted view)
              </div>
            </div>
          )}

          {/* Date range picker */}
          <div className="space-y-2 md:col-span-1 lg:col-span-1">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Date Window</Label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => handleFilterChange(setDateFrom, e.target.value)}
                className="flex px-3 py-2 border rounded-xl text-xs bg-background h-10 items-center justify-center font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                title="Date From"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => handleFilterChange(setDateTo, e.target.value)}
                className="flex px-3 py-2 border rounded-xl text-xs bg-background h-10 items-center justify-center font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                title="Date To"
              />
            </div>
          </div>

          {/* Search filter */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Search Item</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Item name..."
                value={search}
                onChange={(e) => handleFilterChange(setSearch, e.target.value)}
                className="pl-9 pr-4 py-2 w-full border rounded-xl text-sm bg-background h-10 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Clear Filters button */}
        {(branchId !== initialBranchId || type !== "all" || performedById !== "all" || dateFrom || dateTo || search) && (
          <div className="mt-4 pt-4 border-t flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setBranchId(initialBranchId);
                setType("all");
                setPerformedById("all");
                setDateFrom("");
                setDateTo("");
                setSearch("");
                setPage(1);
              }}
              className="text-xs font-semibold rounded-lg text-primary hover:bg-primary/5"
            >
              Reset Filters
            </Button>
          </div>
        )}
      </Card>

      {/* Main content area */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-3xl border border-dashed bg-card/25">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed p-16 text-center bg-card/40 gap-4">
          <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
            <FileClock className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-lg">No movement logs found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-0.5">
              There are no matching stock movement logs. Try broadening your filter selections.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden md:block rounded-3xl border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="p-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">Date/Time</th>
                    <th className="p-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">Type</th>
                    <th className="p-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">Item</th>
                    <th className="p-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">Branch</th>
                    <th className="p-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider text-center">Before → After</th>
                    <th className="p-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider text-center">Delta</th>
                    <th className="p-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">Note</th>
                    <th className="p-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">Performed By</th>
                    <th className="p-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider text-right">Links</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {entries.map((e) => {
                    const formattedDate = new Date(e.createdAt).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short",
                    });

                    return (
                      <tr key={e.id} className="hover:bg-muted/10 transition-colors">
                        <td className="p-4 font-semibold text-foreground whitespace-nowrap">{formattedDate}</td>
                        <td className="p-4 whitespace-nowrap">{getTypeBadge(e.type)}</td>
                        <td className="p-4 font-bold text-foreground max-w-[200px] truncate" title={e.nodeDisplayName}>
                          {e.nodeDisplayName}
                        </td>
                        <td className="p-4 font-semibold text-foreground whitespace-nowrap">{e.branchName}</td>
                        <td className="p-4 text-center font-medium whitespace-nowrap">
                          <span className="text-muted-foreground">{e.quantityBefore}</span>
                          <ArrowRight className="w-3.5 h-3.5 inline mx-1.5 text-muted-foreground" />
                          <span className="text-foreground font-bold">{e.quantityAfter}</span>
                        </td>
                        <td className="p-4 text-center whitespace-nowrap">{getDeltaDisplay(e.quantityDelta)}</td>
                        <td className="p-4 text-muted-foreground max-w-[180px] truncate" title={e.note || undefined}>
                          {e.note || "—"}
                        </td>
                        <td className="p-4 font-semibold text-foreground whitespace-nowrap">{e.performedByName}</td>
                        <td className="p-4 text-right whitespace-nowrap">
                          {e.linkContext && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 rounded-lg text-primary hover:bg-primary/5 text-xs font-semibold gap-1"
                              onClick={() => {
                                if (e.linkContext?.kind === "sale") {
                                  window.location.href = `/dashboard/sales`;
                                } else if (e.linkContext?.kind === "stockCount") {
                                  window.location.href = `/dashboard/stock-count/${e.linkContext.id}`;
                                }
                              }}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              {e.linkContext.kind === "sale" ? "View Sale" : "View Count"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card-per-Entry Layout */}
          <div className="space-y-3.5 md:hidden">
            {entries.map((e) => {
              const formattedDate = new Date(e.createdAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              });

              return (
                <Card key={e.id} className="rounded-2xl border bg-card p-4 shadow-sm space-y-3">
                  <div className="flex justify-between items-start gap-2 border-b pb-2.5">
                    <div className="space-y-1">
                      <p className="text-xs font-extrabold text-foreground">{formattedDate}</p>
                      <p className="text-xs text-muted-foreground font-semibold">{e.branchName}</p>
                    </div>
                    {getTypeBadge(e.type)}
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-sm font-extrabold text-foreground">{e.nodeDisplayName}</p>
                    <div className="grid grid-cols-2 gap-y-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Flow:</span>{" "}
                        <span className="font-semibold text-foreground">
                          {e.quantityBefore} → {e.quantityAfter}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Delta:</span>{" "}
                        <span className="font-semibold">{getDeltaDisplay(e.quantityDelta)}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Performed by:</span>{" "}
                        <span className="font-semibold text-foreground">{e.performedByName}</span>
                      </div>
                      {e.note && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Note:</span>{" "}
                          <span className="font-medium text-muted-foreground italic">{e.note}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {e.linkContext && (
                    <div className="border-t pt-2.5 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl text-xs font-semibold gap-1 h-9 px-3"
                        onClick={() => {
                          if (e.linkContext?.kind === "sale") {
                            window.location.href = `/dashboard/sales`;
                          } else if (e.linkContext?.kind === "stockCount") {
                            window.location.href = `/dashboard/stock-count/${e.linkContext.id}`;
                          }
                        }}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {e.linkContext.kind === "sale" ? "View Sale" : "View Count"}
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t pt-4 px-1">
              <span className="text-xs font-semibold text-muted-foreground">
                Page <span className="text-foreground font-bold">{page}</span> of{" "}
                <span className="text-foreground font-bold">{totalPages}</span> ({totalCount} total entries)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-xl h-9 text-xs font-semibold gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-xl h-9 text-xs font-semibold gap-1"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
