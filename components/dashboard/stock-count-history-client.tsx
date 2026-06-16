// components/dashboard/stock-count-history-client.tsx
// Client component to show branch-scoped stock reconciliation history and launch new count sessions

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  History,
  Plus,
  Play,
  Eye,
  Calendar,
  Layers,
  CheckCircle,
  AlertCircle,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface CountSummary {
  id: string;
  branchId: string;
  status: "IN_PROGRESS" | "COMPLETED";
  scope: "FULL_BRANCH" | "DRILL_DOWN_MIGRATION" | "VARIANT_CONVERSION_MIGRATION";
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  startedBy: { id: string; name: string | null; email: string | null };
  completedBy: { id: string; name: string | null; email: string | null } | null;
  itemCount: number;
  totalVariance: number;
}

interface Branch {
  id: string;
  name: string;
}

interface StockCountHistoryClientProps {
  initialCounts: CountSummary[];
  branches: Branch[];
  activeBranchId: string;
  userRole: string;
}

export function StockCountHistoryClient({
  initialCounts,
  branches,
  activeBranchId,
  userRole,
}: StockCountHistoryClientProps) {
  const router = useRouter();
  const [selectedBranchId, setSelectedBranchId] = useState(activeBranchId);

  const isStaff = userRole === "STAFF";

  const handleBranchChange = (branchId: string) => {
    setSelectedBranchId(branchId);
    router.push(`/dashboard/stock-count?branch=${branchId}`);
  };

  const getScopeLabel = (scope: string) => {
    switch (scope) {
      case "FULL_BRANCH":
        return "Full Branch Count";
      case "DRILL_DOWN_MIGRATION":
        return "Drill-down Split Migration";
      case "VARIANT_CONVERSION_MIGRATION":
        return "Variant Conversion Migration";
      default:
        return scope;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and CTA */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
            <History className="w-8 h-8 text-primary" /> Stock Reconciliation
          </h1>
          <p className="text-sm text-muted-foreground">
            Audit inventory logs, track variant migrations, and resolve stock discrepancies.
          </p>
        </div>

        <Link href={`/dashboard/stock-count/new?branch=${selectedBranchId}`}>
          <Button className="rounded-2xl shadow-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Start Stock Count
          </Button>
        </Link>
      </div>

      {/* Toolbar / Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 rounded-3xl border bg-card/40 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-muted-foreground">Viewing Branch:</span>
          {isStaff ? (
            <span className="text-sm font-bold text-foreground">
              {branches.find((b) => b.id === selectedBranchId)?.name || "Assigned Branch"}
            </span>
          ) : (
            <select
              className="h-10 px-3 rounded-2xl border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
              value={selectedBranchId}
              onChange={(e) => handleBranchChange(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* History Logs Table */}
      <div className="rounded-3xl border bg-card overflow-hidden shadow-sm">
        {initialCounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <History className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">No stock counts found</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Start a guided stock count to initialize or reconcile inventory numbers on this branch.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow>
                <TableHead>Date Started</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Items Counted</TableHead>
                <TableHead className="text-right">Total Variance</TableHead>
                <TableHead>Performed By</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialCounts.map((count) => {
                const isCompleted = count.status === "COMPLETED";
                const dateString = new Date(count.startedAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                });

                return (
                  <TableRow key={count.id} className="hover:bg-muted/5 transition-colors">
                    <TableCell className="font-semibold text-foreground py-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span>{dateString}</span>
                      </div>
                    </TableCell>

                    <TableCell className="text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-muted-foreground" />
                        <span>{getScopeLabel(count.scope)}</span>
                      </div>
                    </TableCell>

                    <TableCell>
                      {isCompleted ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 rounded-xl flex items-center gap-1 w-fit">
                          <CheckCircle className="w-3 h-3" /> Completed
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 rounded-xl flex items-center gap-1 w-fit">
                          <AlertCircle className="w-3 h-3" /> In Progress
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell className="text-right font-medium text-sm">
                      {count.itemCount} items
                    </TableCell>

                    <TableCell className="text-right font-bold text-sm">
                      {isCompleted ? (
                        count.totalVariance > 0 ? (
                          <span className="text-destructive">{count.totalVariance} units</span>
                        ) : (
                          <span className="text-muted-foreground">0 discrepancy</span>
                        )
                      ) : (
                        <span className="text-muted-foreground font-normal italic">Pending...</span>
                      )}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <User className="w-4 h-4" />
                        <span>{count.startedBy.name || count.startedBy.email}</span>
                      </div>
                    </TableCell>

                    <TableCell className="text-right py-3">
                      {isCompleted ? (
                        <Link href={`/dashboard/stock-count/${count.id}`}>
                          <Button variant="outline" size="sm" className="rounded-xl flex items-center gap-1">
                            <Eye className="w-3.5 h-3.5" /> View
                          </Button>
                        </Link>
                      ) : (
                        <Link href={`/dashboard/stock-count/${count.id}`}>
                          <Button size="sm" className="rounded-xl flex items-center gap-1">
                            <Play className="w-3.5 h-3.5 fill-current" /> Resume
                          </Button>
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
