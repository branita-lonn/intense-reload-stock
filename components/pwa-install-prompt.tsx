// components/pwa-install-prompt.tsx
// Client-side component displaying a dismissible PWA install prompt banner.
// Uses a globally-captured beforeinstallprompt event so the prompt is never
// missed even if the component mounts after the event fires.

"use client";

import { useEffect, useState } from "react";
import { X, Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// ─── Global capture ────────────────────────────────────────────────────────
// Browsers fire `beforeinstallprompt` very early — before React even mounts.
// We capture it immediately on the window so no component misses it.
let _capturedPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener(
    "beforeinstallprompt",
    (e: Event) => {
      e.preventDefault();
      _capturedPrompt = e as BeforeInstallPromptEvent;
    },
    { once: true }
  );
}
// ──────────────────────────────────────────────────────────────────────────

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already installed as a standalone PWA — never show
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // User previously dismissed — don't re-show unless cleared
    if (localStorage.getItem("pwa-install-dismissed") === "true") return;

    // Helper that sets state and shows the banner
    const showBanner = (evt: BeforeInstallPromptEvent) => {
      setDeferredPrompt(evt);
      setIsVisible(true);
    };

    // If the prompt was captured before this component mounted, use it now
    if (_capturedPrompt) {
      showBanner(_capturedPrompt);
      return;
    }

    // Otherwise, listen for it arriving later
    const handler = (e: Event) => {
      e.preventDefault();
      _capturedPrompt = e as BeforeInstallPromptEvent;
      showBanner(_capturedPrompt);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        _capturedPrompt = null;
        setDeferredPrompt(null);
        setIsVisible(false);
      }
    } catch (err) {
      console.error("PWA install error:", err instanceof Error ? err.message : err);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("pwa-install-dismissed", "true");
    setIsVisible(false);
  };

  if (!isVisible || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md bg-card text-card-foreground border border-border rounded-2xl shadow-2xl p-4 flex items-center justify-between gap-4 z-[9999] animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-sm leading-tight text-foreground">
          Install Intense Reload
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Add to your home screen for fast access and offline sale support.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          id="pwa-install-btn"
          onClick={handleInstall}
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl transition-colors"
          aria-label="Install app"
        >
          <Download className="h-3.5 w-3.5" />
          Install
        </button>
        <button
          id="pwa-dismiss-btn"
          onClick={handleDismiss}
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
