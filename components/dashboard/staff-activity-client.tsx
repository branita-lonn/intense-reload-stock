// components/dashboard/staff-activity-client.tsx
// Client component for staff activity reports.
// Renders sortable metrics tables, date window filters, and non-judgmental warning flags for high rejection rates.
// This module is READ-ONLY. StockMovement and UserActivityLog have no update/delete routes anywhere in this codebase, by design — do not add any here. (OWASP A09: Security Logging and Monitoring)

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Calendar,
  Filter,
  Loader2,
  Users,
  AlertTriangle,
  ArrowUpDown,
} from "lucide-react";
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
import { type StaffActivitySummary, HIGH_REJECTION_RATE_THRESHOLD } from "@/lib/staff-activity-queries";

interface Branch {
  id: string;
  name: string;
}

interface StaffActivityClientProps {
  branches: Branch[];
  initialBranchId: string;
}

type SortField =
  | "userName"
  | "salesLogged"
  | "salesApproved"
  | "salesRejected"
  | "salesPending"
  | "approvalRate"
  | "rejectionRate";

type SortOrder = "asc" | "desc";

export function StaffActivityClient({
  branches,
  initialBranchId,
}: StaffActivityClientProps) {
  const [summaries, setSummaries] = useState<StaffActivitySummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state (default to last 30 days)
  const [branchId, setBranchId] = useState<string>(initialBranchId);
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("salesLogged");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Load activity summaries
  const fetchSummaries = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (branchId && branchId !== "all") params.set("branchId", branchId);
      if (dateFrom) params.set("dateFrom", new Date(dateFrom).toISOString());
      if (dateTo) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        params.set("dateTo", endOfDay.toISOString());
      }

      const res = await fetch(`/api/dashboard/staff-activity?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as StaffActivitySummary[];
        setSummaries(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to load staff activity summaries.");
      }
    } catch {
      toast.error("Network error. Could not retrieve staff summaries.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummaries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, dateFrom, dateTo]);

  // Handle click-to-sort on table headers
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  // Sort summaries client-side
  const sortedSummaries = [...summaries].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    // Handle null values for rates
    if (valA === null) valA = sortOrder === "asc" ? Infinity : -Infinity;
    if (valB === null) valB = sortOrder === "asc" ? Infinity : -Infinity;

    if (typeof valA === "string" && typeof valB === "string") {
      return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }

    if (typeof valA === "number" && typeof valB === "number") {
      return sortOrder === "asc" ? valA - valB : valB - valA;
    }

    return 0;
  });

  function formatPercent(val: number | null) {
    if (val === null) return "—";
    return `${Math.round(val * 100)}%`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Staff Activity Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Performance metrics, logging rates, and review feedback analytics.
        </p>
      </div>

      {/* Filters Card */}
      <Card className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Branch filter */}
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

          {/* Date range from */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">From Date</Label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="flex px-3 py-2 w-full border rounded-xl text-sm bg-background h-10 items-center justify-center font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              title="Date From"
            />
          </div>

          {/* Date range to */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">To Date</Label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex px-3 py-2 w-full border rounded-xl text-sm bg-background h-10 items-center justify-center font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              title="Date To"
            />
          </div>
        </div>
      </Card>

      {/* Main Table */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-3xl border border-dashed bg-card/25">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : sortedSummaries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed p-16 text-center bg-card/40 gap-4">
          <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-lg">No staff activity summaries</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-0.5">
              There is no activity logged during the selected filters.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th
                    onClick={() => handleSort("userName")}
                    className="p-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider cursor-pointer hover:text-foreground select-none"
                  >
                    <div className="flex items-center gap-1">
                      Staff Member
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-60" />
                    </div>
                  </th>
                  <th className="p-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">Branch(es)</th>
                  <th
                    onClick={() => handleSort("salesLogged")}
                    className="p-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider cursor-pointer hover:text-foreground select-none text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Sales Logged
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-60" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("salesApproved")}
                    className="p-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider cursor-pointer hover:text-foreground select-none text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Approved
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-60" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("salesRejected")}
                    className="p-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider cursor-pointer hover:text-foreground select-none text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Rejected
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-60" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("salesPending")}
                    className="p-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider cursor-pointer hover:text-foreground select-none text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Pending
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-60" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("approvalRate")}
                    className="p-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider cursor-pointer hover:text-foreground select-none text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Approval Rate
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-60" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("rejectionRate")}
                    className="p-4 font-bold text-muted-foreground uppercase text-[10px] tracking-wider cursor-pointer hover:text-foreground select-none text-center"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Rejection Rate
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-60" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {sortedSummaries.map((s) => {
                  // Check rejection rate threshold flag
                  // Note: This is a pattern flag for the owner to investigate context (e.g. new staff member still learning),
                  // not an accusation — UI copy remains neutral and non-judgmental.
                  const isHighRejection = s.rejectionRate !== null && s.rejectionRate > HIGH_REJECTION_RATE_THRESHOLD;

                  return (
                    <tr
                      key={s.userId}
                      className={`hover:bg-muted/10 transition-colors ${
                        isHighRejection ? "border-l-4 border-l-amber-500/80 bg-amber-500/[0.02]" : ""
                      }`}
                    >
                      <td className="p-4 font-semibold text-foreground">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <span>{s.userName}</span>
                          {isHighRejection && (
                            <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20 shadow-none font-bold py-0.5 px-2 text-[10px] w-fit">
                              <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                              Review Needed
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-4 font-medium text-muted-foreground max-w-[200px] truncate">
                        {s.branchNames.length > 0 ? s.branchNames.join(", ") : "None assigned"}
                      </td>
                      <td className="p-4 text-center font-bold text-foreground">{s.salesLogged}</td>
                      <td className="p-4 text-center font-semibold text-emerald-600">{s.salesApproved}</td>
                      <td className="p-4 text-center font-semibold text-destructive">{s.salesRejected}</td>
                      <td className="p-4 text-center font-semibold text-amber-600">{s.salesPending}</td>
                      <td className="p-4 text-center font-bold text-foreground">{formatPercent(s.approvalRate)}</td>
                      <td className="p-4 text-center font-bold text-foreground">{formatPercent(s.rejectionRate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
