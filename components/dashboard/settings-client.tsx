// components/dashboard/settings-client.tsx
// Client component — store settings page with feature flag toggles and branch approval overrides.

"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Settings,
  Store,
  ToggleLeft,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SettingsState {
  id: string;
  storeName: string;
  requireSaleApproval: boolean;
  enableDetailedSaleBreakdown: boolean;
  enablePOS: boolean;
  enableBarcodeScanning: boolean;
  enableStockValueTracking: boolean;
}

interface Branch {
  id: string;
  name: string;
  town: string;
  requireSaleApprovalOverride: boolean | null;
}

interface SettingsClientProps {
  initialSettings: SettingsState;
  branches: Branch[];
  pendingSaleCount: number;
}

// ---------------------------------------------------------------------------
// Flag definitions
// ---------------------------------------------------------------------------
interface FlagDef {
  key: keyof Omit<SettingsState, "id" | "storeName">;
  title: string;
  description: string;
  expandedDetails?: string[];
}

const FLAG_DEFS: FlagDef[] = [
  {
    key: "requireSaleApproval",
    title: "Require sale approval",
    description: "Staff sales await your review before being finalised.",
    expandedDetails: [
      "Every sale logged by staff will appear in the Approvals queue.",
      "Inventory is decremented immediately at creation — approval confirms the transaction.",
      "Rejected sales generate a STOCK_ADJUSTMENT StockMovement to reverse the decrement.",
      "Branch managers can override this setting per-branch below.",
    ],
  },
  {
    key: "enableDetailedSaleBreakdown",
    title: "Detailed sale breakdown",
    description: "When logging a sale, optionally break it down into sub-items.",
    expandedDetails: [
      "Adds a sub-item breakdown field to the sale logging flow (Stage 15).",
      "Useful for mixed-product transactions or bundle sales.",
      "Sub-items are descriptive only — they do not affect inventory independently.",
    ],
  },
  {
    key: "enableStockValueTracking",
    title: "Stock value tracking",
    description: "Track cost prices and calculate profit margins.",
    expandedDetails: [
      "Unlocks cost price and selling price fields on product variants.",
      "Enables the Stock Value Analytics dashboard (Stage 10).",
      "Profit margin calculations become visible on the sales reports.",
      "Existing inventory records are not affected — prices are set per-variant going forward.",
    ],
  },
  {
    key: "enableBarcodeScanning",
    title: "Barcode / QR scanning",
    description: "Scan product labels with your phone camera when logging sales.",
    expandedDetails: [
      "Activates the camera-based scanner in the Log Sale flow (Stage 13).",
      "Works with standard barcodes, QR codes, and SKU labels.",
      "Products must have an SKU assigned to a variant to be scannable.",
      "Requires a modern browser with MediaDevices camera permission.",
    ],
  },
  {
    key: "enablePOS",
    title: "POS mode",
    description: "Track payment method per sale and generate receipts.",
    expandedDetails: [
      "Adds payment method selection (Cash, M-Pesa, Card) to the sale logging flow.",
      "Generates printable or shareable receipts for customers (Stage 14).",
      "Sales reports gain a payment method breakdown chart.",
      "Requires the Detailed Sale Breakdown feature for itemised receipts.",
    ],
  },
];

// ---------------------------------------------------------------------------
// FeatureFlagCard
// ---------------------------------------------------------------------------
function FeatureFlagCard({
  flagDef,
  value,
  saving,
  pendingSaleCount,
  onToggle,
}: {
  flagDef: FlagDef;
  value: boolean;
  saving: boolean;
  pendingSaleCount: number;
  onToggle: (key: keyof Omit<SettingsState, "id" | "storeName">, newValue: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const showPendingWarning =
    flagDef.key === "requireSaleApproval" && value && pendingSaleCount > 0;

  return (
    <Card className="rounded-3xl border bg-card shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="py-5 px-6 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{flagDef.title}</p>
              {value ? (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400"
                >
                  On
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-muted text-muted-foreground border-border"
                >
                  Off
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{flagDef.description}</p>
          </div>
          <Switch
            id={`flag-${flagDef.key}`}
            checked={value}
            disabled={saving}
            onCheckedChange={(checked) => onToggle(flagDef.key, checked)}
            aria-label={flagDef.title}
            className="flex-shrink-0 mt-0.5"
          />
        </div>

        {/* Pending sales warning — shown when toggling approval off */}
        {showPendingWarning && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              There {pendingSaleCount === 1 ? "is" : "are"}{" "}
              <strong>{pendingSaleCount}</strong> sale
              {pendingSaleCount !== 1 ? "s" : ""} currently awaiting approval. They will remain
              pending until reviewed. New sales from this point will be approved automatically.
            </p>
          </div>
        )}

        {/* Expandable "What changes?" panel */}
        {flagDef.expandedDetails && (
          <div>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-expanded={expanded}
            >
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              What changes when you enable this?
            </button>
            {expanded && (
              <ul className="mt-2 space-y-1 pl-2 border-l-2 border-muted">
                {flagDef.expandedDetails.map((detail, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0 mt-0.5" />
                    {detail}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SettingsClient
// ---------------------------------------------------------------------------
export function SettingsClient({ initialSettings, branches, pendingSaleCount }: SettingsClientProps) {
  const [settings, setSettings] = useState<SettingsState>(initialSettings);
  const [savingFlag, setSavingFlag] = useState<string | null>(null);
  const [storeNameDraft, setStoreNameDraft] = useState(initialSettings.storeName);
  const [savingName, setSavingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  async function patchSettings(patch: Partial<Omit<SettingsState, "id">>) {
    const res = await fetch("/api/dashboard/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? "Failed to update settings.");
    }
    return res.json() as Promise<{ settings: SettingsState }>;
  }

  async function handleFlagToggle(
    key: keyof Omit<SettingsState, "id" | "storeName">,
    newValue: boolean
  ) {
    // Optimistic update
    setSettings((prev) => ({ ...prev, [key]: newValue }));
    setSavingFlag(key);

    try {
      await patchSettings({ [key]: newValue });
      toast.success("Setting updated.");
    } catch (error: unknown) {
      // Revert on failure
      setSettings((prev) => ({ ...prev, [key]: !newValue }));
      const message = error instanceof Error ? error.message : "Failed to update setting.";
      toast.error(message);
    } finally {
      setSavingFlag(null);
    }
  }

  async function handleSaveStoreName() {
    const trimmed = storeNameDraft.trim();
    if (!trimmed || trimmed === settings.storeName) return;
    setSavingName(true);
    try {
      const { settings: updated } = await patchSettings({ storeName: trimmed });
      setSettings((prev) => ({ ...prev, storeName: updated.storeName }));
      toast.success("Store name updated.");
    } catch (error: unknown) {
      setStoreNameDraft(settings.storeName);
      const message = error instanceof Error ? error.message : "Failed to save store name.";
      toast.error(message);
    } finally {
      setSavingName(false);
    }
  }

  function getEffectiveApproval(branch: Branch): { value: boolean; inherited: boolean } {
    if (branch.requireSaleApprovalOverride !== null) {
      return { value: branch.requireSaleApprovalOverride, inherited: false };
    }
    return { value: settings.requireSaleApproval, inherited: true };
  }

  return (
    <div className="space-y-10">
      {/* Page header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Store settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure store-wide behaviour and feature availability.
          </p>
        </div>
      </div>

      {/* Store name */}
      <section className="space-y-4" aria-labelledby="section-store-name">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-muted-foreground" />
          <h2
            id="section-store-name"
            className="text-base font-semibold text-foreground"
          >
            Store identity
          </h2>
        </div>
        <Card className="rounded-3xl border bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">Store name</CardTitle>
            <CardDescription className="text-xs">
              Displayed in the dashboard header and on receipts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input
                id="store-name-input"
                ref={nameInputRef}
                value={storeNameDraft}
                onChange={(e) => setStoreNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveStoreName();
                }}
                maxLength={100}
                className="flex-1 rounded-xl"
                placeholder="Enter store name"
                disabled={savingName}
                aria-label="Store name"
              />
              <Button
                id="save-store-name-btn"
                onClick={handleSaveStoreName}
                disabled={
                  savingName ||
                  !storeNameDraft.trim() ||
                  storeNameDraft.trim() === settings.storeName
                }
                className="rounded-xl"
                size="sm"
              >
                {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Feature flags */}
      <section className="space-y-4" aria-labelledby="section-feature-flags">
        <div className="flex items-center gap-2">
          <ToggleLeft className="h-4 w-4 text-muted-foreground" />
          <h2
            id="section-feature-flags"
            className="text-base font-semibold text-foreground"
          >
            Feature flags
          </h2>
        </div>
        <div className="space-y-3">
          {FLAG_DEFS.map((flagDef) => (
            <FeatureFlagCard
              key={flagDef.key}
              flagDef={flagDef}
              value={settings[flagDef.key]}
              saving={savingFlag === flagDef.key}
              pendingSaleCount={pendingSaleCount}
              onToggle={handleFlagToggle}
            />
          ))}
        </div>
      </section>

      {/* Branch-level approval overrides */}
      <section className="space-y-4" aria-labelledby="section-branch-approval">
        <div>
          <h2
            id="section-branch-approval"
            className="text-base font-semibold text-foreground"
          >
            Branch approval settings
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Each branch inherits the store-wide approval setting unless explicitly overridden.
          </p>
        </div>
        <Card className="rounded-3xl border bg-card shadow-sm overflow-hidden">
          <div className="divide-y divide-border">
            {branches.length === 0 && (
              <p className="px-6 py-5 text-sm text-muted-foreground">No active branches found.</p>
            )}
            {branches.map((branch) => {
              const { value, inherited } = getEffectiveApproval(branch);
              return (
                <div
                  key={branch.id}
                  className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{branch.name}</p>
                    <p className="text-xs text-muted-foreground">{branch.town}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          value ? "bg-emerald-500" : "bg-muted-foreground/40"
                        )}
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {value ? "Requires approval" : "Auto-approve"}
                        {inherited && (
                          <span className="ml-1 text-muted-foreground/60">(inherited)</span>
                        )}
                      </span>
                    </div>
                    <Button
                      id={`edit-branch-approval-${branch.id}`}
                      asChild
                      variant="ghost"
                      size="sm"
                      className="rounded-xl text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <Link href={`/dashboard/branches/${branch.id}`}>
                        Edit
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <p className="text-xs text-muted-foreground px-1">
          Branch-level overrides take precedence over the store-wide{" "}
          <strong>Require sale approval</strong> toggle above.
        </p>
      </section>
    </div>
  );
}
