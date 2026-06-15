// components/dashboard/temp-password-alert.tsx
// One-time display component for a staff account's temporary password.
// The plaintext password is never stored, logged, or retrievable after this moment.

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Check, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TempPasswordAlertProps {
  staffName: string;
  temporaryPassword: string;
  onDismiss: () => void;
}

export function TempPasswordAlert({
  staffName,
  temporaryPassword,
  onDismiss,
}: TempPasswordAlertProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      toast.success("Password copied to clipboard.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Could not copy — please copy manually.");
    }
  }

  return (
    <div
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              Temporary password for {staffName}
            </p>
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
              Share this securely. It will not be shown again after you close
              this alert.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100">
              {temporaryPassword}
            </code>
            <Button
              id="copy-temp-password-btn"
              variant="outline"
              size="sm"
              className={cn(
                "flex-shrink-0 rounded-lg border-amber-300 bg-white text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-800",
                copied && "border-emerald-400 text-emerald-700 dark:border-emerald-600 dark:text-emerald-300"
              )}
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span className="ml-1.5">{copied ? "Copied" : "Copy"}</span>
            </Button>
          </div>

          <div className="flex justify-end">
            <Button
              id="dismiss-temp-password-btn"
              variant="ghost"
              size="sm"
              className="text-xs text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
              onClick={onDismiss}
            >
              I have saved this password — dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
