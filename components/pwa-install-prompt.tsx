// components/pwa-install-prompt.tsx
// Client-side component displaying a dismissible PWA install prompt banner at the bottom of the dashboard.

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

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // 1. Guard against rendering during SSR
    if (typeof window === "undefined") return;

    // 2. Check if already installed
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    if (isStandalone) return;

    // 3. Check if user previously dismissed the prompt
    const isDismissed = localStorage.getItem("pwa-install-dismissed") === "true";
    if (isDismissed) return;

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the default browser mini-infobar prompt
      e.preventDefault();
      // Store the event so it can be triggered later
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Clean up event listener on unmount
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      // Show the install prompt
      await deferredPrompt.prompt();
      // Wait for the user to respond to the prompt
      const choiceResult = await deferredPrompt.userChoice;
      
      if (choiceResult.outcome === "accepted") {
        // Clear the deferred prompt, it can only be used once
        setDeferredPrompt(null);
        setIsVisible(false);
      }
    } catch (error: unknown) {
      console.error(
        "PWA install error:",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  };

  const handleDismissClick = () => {
    localStorage.setItem("pwa-install-dismissed", "true");
    setIsVisible(false);
  };

  if (!isVisible || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md bg-card text-card-foreground border border-border rounded-xl shadow-2xl p-4 flex items-center justify-between gap-4 z-50 animate-in slide-in-from-bottom duration-300">
      <div className="flex-1">
        <h3 className="font-semibold text-sm leading-tight text-foreground">
          Install Intense Reload
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Add to your home screen for fast access and offline sale support.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleInstallClick}
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-foreground text-background hover:opacity-90 rounded-md transition-opacity"
          aria-label="Install app"
        >
          <Download className="h-3.5 width-3.5" />
          Install
        </button>
        <button
          onClick={handleDismissClick}
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
