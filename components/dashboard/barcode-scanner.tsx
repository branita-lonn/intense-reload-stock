// components/dashboard/barcode-scanner.tsx
// Client component: opens the device camera and continuously decodes QR/barcodes via @zxing/library.
// Calls onScan(decodedText) on first successful read, then stops the camera.
// Parent controls whether to mount this component — it does NOT check enableBarcodeScanning itself.

"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import { X, CameraOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BarcodeScannerProps {
  onScan: (sku: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function startScanner() {
      try {
        const codeReader = new BrowserQRCodeReader();
        const devices = await BrowserQRCodeReader.listVideoInputDevices();

        // Prefer back camera on mobile if available
        const device =
          devices.find((d: MediaDeviceInfo) =>
            d.label.toLowerCase().includes("back") ||
            d.label.toLowerCase().includes("environment") ||
            d.label.toLowerCase().includes("rear")
          ) ?? devices[0];

        if (!device || !videoRef.current) return;

        setIsReady(true);

        const controls = await codeReader.decodeFromVideoDevice(
          device.deviceId,
          videoRef.current,
          (result: any, error: any) => {
            if (cancelled) return;
            if (result) {
              const decoded = result.getText();
              // Stop the camera immediately after a successful scan
              controls.stop();
              onScan(decoded);
            }
            // Ignore decode errors — they fire constantly between frames
            void error;
          }
        );

        controlsRef.current = controls;
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "";
        if (
          message.toLowerCase().includes("permission") ||
          message.toLowerCase().includes("denied") ||
          message.toLowerCase().includes("notallowed")
        ) {
          setPermissionDenied(true);
        } else {
          // Other camera errors — treat the same as permission denied for UX clarity
          setPermissionDenied(true);
        }
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      // Stop the camera stream on unmount so the camera indicator light turns off
      if (controlsRef.current) {
        try {
          controlsRef.current.stop();
        } catch {
          // Ignore stop errors on cleanup
        }
        controlsRef.current = null;
      }
    };
  }, [onScan]);

  if (permissionDenied) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
          <CameraOff className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-bold text-foreground text-sm">Camera permission denied</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
            Please enable camera access in your browser settings, then try again.
          </p>
        </div>
        <Button variant="outline" className="rounded-xl" onClick={onClose}>
          Search manually
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Scanner viewport */}
      <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          playsInline
          autoPlay
        />
        {/* Scan region overlay — simple CSS corner brackets, no canvas manipulation */}
        {isReady && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className="w-48 h-48 relative"
              style={{
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                borderRadius: "8px",
              }}
            >
              {/* Corner accents */}
              {(["tl", "tr", "bl", "br"] as const).map((corner) => (
                <span
                  key={corner}
                  className="absolute w-6 h-6 border-primary"
                  style={{
                    borderWidth: "3px",
                    borderStyle: "solid",
                    borderColor: "hsl(var(--primary))",
                    top: corner.startsWith("t") ? 0 : "auto",
                    bottom: corner.startsWith("b") ? 0 : "auto",
                    left: corner.endsWith("l") ? 0 : "auto",
                    right: corner.endsWith("r") ? 0 : "auto",
                    borderTopWidth: corner.startsWith("t") ? "3px" : 0,
                    borderBottomWidth: corner.startsWith("b") ? "3px" : 0,
                    borderLeftWidth: corner.endsWith("l") ? "3px" : 0,
                    borderRightWidth: corner.endsWith("r") ? "3px" : 0,
                    borderRadius:
                      corner === "tl"
                        ? "4px 0 0 0"
                        : corner === "tr"
                        ? "0 4px 0 0"
                        : corner === "bl"
                        ? "0 0 0 4px"
                        : "0 0 4px 0",
                  }}
                />
              ))}
              {/* Scan line animation */}
              <div
                className="absolute left-1 right-1 h-0.5 bg-primary/80 rounded"
                style={{ animation: "scan-line 1.8s ease-in-out infinite", top: "50%" }}
              />
            </div>
          </div>
        )}
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-white/70 text-xs font-medium animate-pulse">Initialising camera…</p>
          </div>
        )}
        {/* Close button in top-right of the video */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 h-8 w-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          aria-label="Close scanner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground text-center px-2">
        Point the camera at a product QR code or barcode to select it instantly.
      </p>
      <style>{`
        @keyframes scan-line {
          0%, 100% { transform: translateY(-40px); opacity: 0.6; }
          50% { transform: translateY(40px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
