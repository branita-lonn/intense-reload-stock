"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Branch {
  id: string;
  name: string;
}

interface StockCountInitiatorProps {
  initialBranchId: string;
  scope: string;
  scopeCategoryIds?: string[];
  scopeProductId?: string;
  accessibleBranches: Branch[];
}

export function StockCountInitiator({
  initialBranchId,
  scope,
  scopeCategoryIds,
  scopeProductId,
  accessibleBranches,
}: StockCountInitiatorProps) {
  const router = useRouter();
  const [selectedBranchId, setSelectedBranchId] = useState(initialBranchId);
  const [loading, setLoading] = useState(false);
  const hasTriggered = useRef(false);

  const triggerStart = useCallback(
    async (branchId: string) => {
      setLoading(true);
      try {
        const res = await fetch("/api/dashboard/stock-count", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branchId,
            scope,
            scopeCategoryIds,
            scopeProductId,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (res.status === 400 && data.existingId) {
            toast.info("Resuming your in-progress count.");
            router.push(`/dashboard/stock-count/${data.existingId}`);
            return;
          }
          throw new Error(data.error || "Failed to start stock count.");
        }

        toast.success("Stock count session started successfully.");
        router.push(`/dashboard/stock-count/${data.id}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to start session";
        toast.error(msg);
        router.push("/dashboard/inventory");
      } finally {
        setLoading(false);
      }
    },
    [scope, scopeCategoryIds, scopeProductId, router]
  );

  // Auto-fire when a branch ID is already resolved server-side (no manual selection needed)
  useEffect(() => {
    if (initialBranchId && !hasTriggered.current) {
      hasTriggered.current = true;
      triggerStart(initialBranchId);
    }
  }, [initialBranchId, triggerStart]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">
          Initializing stock count session...
        </p>
      </div>
    );
  }

  // If no branch was specified and we have multiple accessible branches, render a selector
  return (
    <div className="max-w-md mx-auto my-12 p-8 border rounded-3xl bg-card shadow-sm space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold text-foreground">Select Branch</h2>
        <p className="text-sm text-muted-foreground">
          Please choose a branch to start the stock count reconciliation.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground" htmlFor="branch-select">
            Branch
          </label>
          <select
            id="branch-select"
            className="w-full h-10 px-3 rounded-2xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
          >
            <option value="">Select a branch...</option>
            {accessibleBranches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>

        <Button
          className="w-full rounded-2xl"
          onClick={() => triggerStart(selectedBranchId)}
          disabled={!selectedBranchId || loading}
        >
          Start Stock Count
        </Button>
      </div>
    </div>
  );
}
