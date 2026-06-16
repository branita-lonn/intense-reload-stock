// components/dashboard/branch-approval-settings-card.tsx
// Client component for OWNERs to configure per-branch sale approval overrides.
// Non-OWNERs see a clean, read-only representation of the effective branch setting.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Settings, ShieldCheck, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface BranchApprovalSettingsCardProps {
  branchId: string;
  initialOverride: boolean | null;
  globalRequireApproval: boolean;
  isOwner: boolean;
}

export function BranchApprovalSettingsCard({
  branchId,
  initialOverride,
  globalRequireApproval,
  isOwner,
}: BranchApprovalSettingsCardProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  // Map database value (null | true | false) to a local string state ("inherit" | "always" | "never")
  const getInitialValue = () => {
    if (initialOverride === null) return "inherit";
    return initialOverride ? "always" : "never";
  };

  const [value, setValue] = useState<"inherit" | "always" | "never">(getInitialValue());

  // Determine effective status text
  const getEffectiveStatus = () => {
    const effective = initialOverride !== null ? initialOverride : globalRequireApproval;
    return effective ? "Requires Approval" : "Auto-Approved";
  };

  async function handleSave() {
    setSubmitting(true);
    try {
      // Map local string back to DB format: boolean | null
      let requireSaleApprovalOverride: boolean | null = null;
      if (value === "always") requireSaleApprovalOverride = true;
      if (value === "never") requireSaleApprovalOverride = false;

      const response = await fetch(`/api/dashboard/branches/${branchId}/approval-setting`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireSaleApprovalOverride }),
      });

      const json = (await response.json()) as unknown;

      if (!response.ok) {
        const errorMessage =
          json !== null &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : "Failed to update settings.";
        toast.error(errorMessage);
        return;
      }

      toast.success("Branch approval settings updated successfully!");
      router.refresh();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unexpected error";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const hasChanges = value !== getInitialValue();

  return (
    <Card className="rounded-3xl border bg-card shadow-sm overflow-hidden mt-6">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-bold tracking-tight text-foreground">
            Sale Approval Settings
          </CardTitle>
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          Configure whether sales logged at this branch require manager/owner review.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 py-2">
        {isOwner ? (
          <div className="space-y-4">
            <RadioGroup
              value={value}
              onValueChange={(val) => setValue(val as "inherit" | "always" | "never")}
              className="space-y-2.5"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="inherit" id="approval-inherit" />
                <Label htmlFor="approval-inherit" className="font-medium cursor-pointer text-sm">
                  Use store default (currently:{" "}
                  <span className="font-semibold text-primary">
                    {globalRequireApproval ? "Requires Approval" : "Auto-Approved"}
                  </span>
                  )
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <RadioGroupItem value="always" id="approval-always" />
                <Label htmlFor="approval-always" className="font-medium cursor-pointer text-sm">
                  Always require approval
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <RadioGroupItem value="never" id="approval-never" />
                <Label htmlFor="approval-never" className="font-medium cursor-pointer text-sm">
                  Never require approval (Auto-Approve)
                </Label>
              </div>
            </RadioGroup>

            <div className="pt-2">
              <Button
                id="save-approval-settings-btn"
                onClick={handleSave}
                disabled={submitting || !hasChanges}
                className="w-full rounded-2xl"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Settings"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-muted/30 border flex items-center gap-3">
            {initialOverride !== null ? (
              initialOverride ? (
                <ShieldAlert className="h-5 w-5 text-amber-500" />
              ) : (
                <ShieldCheck className="h-5 w-5 text-emerald-500" />
              )
            ) : globalRequireApproval ? (
              <ShieldAlert className="h-5 w-5 text-amber-500" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
            )}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Effective Setting
              </p>
              <p className="text-sm font-bold text-foreground">{getEffectiveStatus()}</p>
              <p className="text-xxs text-muted-foreground mt-0.5">
                {initialOverride !== null
                  ? "Overridden specifically for this branch."
                  : "Inherited from store-wide settings default."}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
