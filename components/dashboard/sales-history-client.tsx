// components/dashboard/sales-history-client.tsx
// Client component managing sales transaction logs.
// Provides filters (branch, status, staff, date range) and collapsible cards showing sale items and oversell audits.

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Calendar,
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileClock,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  User,
  GitBranch,
} from "lucide-react";
import type { Sale, SaleItem, StockMovement, SaleStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Branch {
  id: string;
  name: string;
}

interface StaffUser {
  id: string;
  name: string | null;
}

interface ResolvedSaleItem extends SaleItem {
  displayName: string;
}

interface ResolvedSale extends Sale {
  items: ResolvedSaleItem[];
  stockMovements: StockMovement[];
  loggedBy: {
    id: string;
    name: string | null;
    email: string;
  };
  reviewedBy?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
}

interface SalesHistoryClientProps {
  branches: Branch[];
  staffList: StaffUser[];
  userRole: string;
  userId: string;
  initialBranchId: string;
}

export function SalesHistoryClient({
  branches,
  staffList,
  userRole,
  userId,
  initialBranchId,
}: SalesHistoryClientProps) {
  const [sales, setSales] = useState<ResolvedSale[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [branchId, setBranchId] = useState<string>(initialBranchId);
  const [status, setStatus] = useState<string>("all");
  const [loggedById, setLoggedById] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Expanded cards state
  const [expandedSales, setExpandedSales] = useState<Record<string, boolean>>({});

  const isStaff = userRole === "STAFF";
  const canFilterGlobally = userRole === "OWNER" || userRole === "BRANCH_MANAGER";

  // ---------------------------------------------------------------------------
  // Load sales history
  // ---------------------------------------------------------------------------
  const fetchSales = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (branchId && branchId !== "all") params.set("branchId", branchId);
      if (status && status !== "all") params.set("status", status);
      if (loggedById && loggedById !== "all") params.set("loggedById", loggedById);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/dashboard/sales?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as ResolvedSale[];
        setSales(data);
      } else {
        toast.error("Failed to load sales logs.");
      }
    } catch {
      toast.error("Network error. Could not retrieve sales.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, status, loggedById, dateFrom, dateTo]);

  function toggleExpand(saleId: string) {
    setExpandedSales((prev) => ({
      ...prev,
      [saleId]: !prev[saleId],
    }));
  }

  function getStatusBadge(saleStatus: SaleStatus) {
    switch (saleStatus) {
      case "PENDING":
        return (
          <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20 shadow-none gap-1 py-1 px-2.5 font-semibold">
            <Clock className="w-3.5 h-3.5" />
            Pending Approval
          </Badge>
        );
      case "APPROVED":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 shadow-none gap-1 py-1 px-2.5 font-semibold">
            <CheckCircle className="w-3.5 h-3.5" />
            Approved
          </Badge>
        );
      case "REJECTED":
        return (
          <Badge className="bg-destructive/10 text-destructive border border-destructive/20 shadow-none gap-1 py-1 px-2.5 font-semibold">
            <XCircle className="w-3.5 h-3.5" />
            Rejected
          </Badge>
        );
      default:
        return null;
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Sales Logs & History
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Audit-compliant record of counter sales and counter stock movements.
          </p>
        </div>
      </div>

      {/* Filter panel */}
      <Card className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Branch filter (Owners/Managers only) */}
          {canFilterGlobally ? (
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Branch</Label>
              <Select value={branchId} onValueChange={setBranchId}>
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

          {/* Status filter */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="rounded-xl h-10 bg-background">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="PENDING">Pending Approval</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Staff filter (Owners/Managers only) */}
          {canFilterGlobally ? (
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Logged By</Label>
              <Select value={loggedById} onValueChange={setLoggedById}>
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
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Logged By</Label>
              <div className="flex items-center px-3 h-10 border rounded-xl bg-muted/30 font-semibold text-sm text-foreground">
                Self (Restricted view)
              </div>
            </div>
          )}

          {/* Date range picker */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Date Window</Label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="flex px-3 py-2 border rounded-xl text-xs bg-background h-10 items-center justify-center font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                title="Date From"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="flex px-3 py-2 border rounded-xl text-xs bg-background h-10 items-center justify-center font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                title="Date To"
              />
            </div>
          </div>
        </div>

        {/* Clear filters shortcut */}
        {(branchId !== initialBranchId || status !== "all" || loggedById !== "all" || dateFrom || dateTo) && (
          <div className="mt-4 pt-4 border-t flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setBranchId(initialBranchId);
                setStatus("all");
                setLoggedById("all");
                setDateFrom("");
                setDateTo("");
              }}
              className="text-xs font-semibold rounded-lg text-primary hover:bg-primary/5"
            >
              Reset Filters
            </Button>
          </div>
        )}
      </Card>

      {/* Main content list */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-3xl border border-dashed bg-card/25">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : sales.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed p-16 text-center bg-card/40 gap-4">
          <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
            <FileClock className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-lg">No sales history found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-0.5">
              There are no matching logged transactions. Try broadening your filter options or submit a sale.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {sales.map((sale) => {
            const isExpanded = expandedSales[sale.id] || false;
            const formattedDate = new Date(sale.createdAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            });

            // Calculate total quantities
            const totalQty = sale.items.reduce((sum, item) => sum + item.quantity, 0);

            // Audit oversold items within this sale via StockMovement negative logs
            const oversoldMovementMap = new Map<string, number>();
            sale.stockMovements.forEach((movement) => {
              if (movement.quantityAfter < 0) {
                // Key matches polymorphic node references
                const key = [movement.categoryId, movement.productId, movement.productVariantId]
                  .filter(Boolean)
                  .join("-");
                oversoldMovementMap.set(key, movement.quantityAfter);
              }
            });

            const hasOversold = oversoldMovementMap.size > 0;

            const activeBranchName = branches.find((b) => b.id === sale.branchId)?.name ?? "Unknown Branch";

            return (
              <Card
                key={sale.id}
                className={`rounded-3xl border bg-card shadow-sm transition-all hover:border-muted-foreground/35 overflow-hidden ${
                  isExpanded ? "ring-1 ring-primary/20" : ""
                }`}
              >
                {/* Collapsible Header */}
                <button
                  onClick={() => toggleExpand(sale.id)}
                  className="w-full text-left p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 focus:outline-none"
                  aria-expanded={isExpanded}
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-foreground">{formattedDate}</span>
                      {getStatusBadge(sale.status)}
                      {hasOversold && (
                        <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20 shadow-none gap-1 py-0.5 px-2 text-[10px] font-bold">
                          <AlertTriangle className="w-3 h-3" />
                          Oversold stock logged
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <GitBranch className="w-3.5 h-3.5" />
                        {activeBranchName}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        Logged by {sale.loggedBy?.name ?? "Unnamed Staff"}
                      </span>
                      <span>
                        • <span className="font-semibold text-foreground">{sale.items.length}</span> line items (
                        <span className="font-semibold text-foreground">{totalQty}</span> units)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-auto">
                    <span className="text-xs text-muted-foreground font-semibold">
                      {isExpanded ? "Collapse" : "View Details"}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Collapsible Details */}
                {isExpanded && (
                  <CardContent className="px-5 pb-5 pt-0 border-t border-border/40 bg-muted/10">
                    <div className="space-y-4 pt-4">
                      {/* Sale Items Detail */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          Transaction Items
                        </h4>
                        <div className="divide-y divide-border border rounded-2xl bg-card overflow-hidden">
                          {sale.items.map((item) => {
                            const itemKey = [item.categoryId, item.productId, item.productVariantId]
                              .filter(Boolean)
                              .join("-");
                            const itemOversoldQty = oversoldMovementMap.get(itemKey);

                            return (
                              <div
                                key={item.id}
                                className="p-3.5 flex items-center justify-between text-sm hover:bg-muted/10 transition-colors"
                              >
                                <div className="space-y-0.5 pr-4">
                                  <p className="font-bold text-foreground">{item.displayName}</p>
                                  {itemOversoldQty !== undefined && (
                                    <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                                      Stock went negative (ended at {itemOversoldQty} units)
                                    </span>
                                  )}
                                </div>
                                <span className="font-bold text-foreground flex-shrink-0">
                                  {item.quantity} unit{item.quantity !== 1 ? "s" : ""}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Approval Audit Trail */}
                      {(sale.status === "APPROVED" || sale.status === "REJECTED") && (
                        <div className="space-y-1.5 p-3.5 rounded-2xl border bg-card text-xs">
                          <p className="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">
                            Approval Audit Trail
                          </p>
                          <p className="text-foreground mt-1">
                            Reviewed by{" "}
                            <span className="font-bold">{sale.reviewedBy?.name ?? "Manager"}</span>
                            {sale.reviewedAt && (
                              <span>
                                {" "}
                                on {new Date(sale.reviewedAt).toLocaleDateString()} at{" "}
                                {new Date(sale.reviewedAt).toLocaleTimeString()}
                              </span>
                            )}
                          </p>
                          {sale.rejectionReason && (
                            <p className="text-destructive font-semibold mt-1">
                              Rejection Reason: {sale.rejectionReason}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Action Hooks Placeholder for Stage 6 */}
                      {/* TODO: Stage 6 — Approve/Reject actions */}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
