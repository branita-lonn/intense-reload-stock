// components/dashboard/receipt.tsx
// Client component that displays receipt details, prints the receipt, and allows web sharing.

"use client";

import React from "react";
import { Printer, Share2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ReceiptItem {
  displayName: string;
  quantity: number;
  unitPrice?: number;
}

interface ReceiptData {
  receiptNumber: string | null;
  branchName: string;
  branchContact: string | null;
  saleDate: string;
  items: ReceiptItem[];
  paymentMethod: "CASH" | "MPESA" | "CARD" | null;
  customerName: string | null;
  customerPhone: string | null;
  total?: number;
}

interface ReceiptProps {
  data: ReceiptData;
}

export function Receipt({ data }: ReceiptProps) {
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("print") === "true") {
      window.print();
    }
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    const shareData = {
      title: `Receipt ${data.receiptNumber || ""}`,
      text: `Receipt for purchase of ${data.items.length} item(s) at Intense Reload - ${data.branchName}`,
      url: shareUrl,
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err: unknown) {
        // Ignore AbortError if the user cancels the share action
        if (err instanceof Error && err.name !== "AbortError") {
          toast.error("Failed to share receipt.");
        }
      }
    } else {
      // Fallback: Copy link to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Receipt link copied to clipboard!");
      } catch (err: unknown) {
        toast.error("Failed to copy link to clipboard.");
      }
    }
  };

  const formattedDate = new Date(data.saleDate).toLocaleDateString("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-card border rounded-lg shadow-sm">
      {/* Printable Receipt Wrapper */}
      <div id="receipt-print-area" className="flex flex-col space-y-4 print:p-0 print:border-none print:shadow-none">
        {/* Header */}
        <div className="text-center pb-4 border-b border-dashed">
          <h2 className="text-xl font-bold tracking-tight text-foreground">INTENSE RELOAD</h2>
          <p className="text-sm text-muted-foreground">{data.branchName}</p>
          {data.branchContact && (
            <p className="text-xs text-muted-foreground">Tel: {data.branchContact}</p>
          )}
        </div>

        {/* Metadata */}
        <div className="space-y-1.5 text-xs pb-4 border-b border-dashed">
          {data.receiptNumber && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Receipt No:</span>
              <span className="font-mono font-semibold">{data.receiptNumber}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date:</span>
            <span>{formattedDate}</span>
          </div>
          {data.paymentMethod && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment Method:</span>
              <span className="font-semibold">{data.paymentMethod}</span>
            </div>
          )}
          {data.customerName && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer:</span>
              <span>{data.customerName}</span>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="space-y-3 pb-4 border-b border-dashed">
          <p className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">Items</p>
          <div className="space-y-2">
            {data.items.map((item, index) => {
              const hasPrice = item.unitPrice !== undefined;
              const itemTotal = hasPrice ? item.unitPrice! * item.quantity : null;

              return (
                <div key={index} className="flex justify-between text-sm">
                  <div className="flex flex-col max-w-[70%]">
                    <span className="font-medium truncate">{item.displayName}</span>
                    <span className="text-xs text-muted-foreground">
                      Qty: {item.quantity} {hasPrice && `@ KES ${item.unitPrice?.toFixed(2)}`}
                    </span>
                  </div>
                  {hasPrice && (
                    <span className="font-mono font-medium">
                      KES {itemTotal?.toFixed(2)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Total (Only if stock value tracking enabled/provided) */}
        {data.total !== undefined && (
          <div className="flex justify-between items-center py-2 text-base font-bold">
            <span>TOTAL</span>
            <span className="font-mono">KES {data.total.toFixed(2)}</span>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-4 border-t border-dashed text-xs text-muted-foreground">
          <p className="font-medium">Thank you for shopping at Intense Reload</p>
          <p className="mt-1">Keep this receipt as proof of purchase.</p>
        </div>
      </div>

      {/* Action Buttons (Hidden when printing) */}
      <div className="flex gap-3 mt-6 print:hidden">
        <Button onClick={handlePrint} className="flex-1" variant="outline">
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
        <Button onClick={handleShare} className="flex-1">
          <Share2 className="mr-2 h-4 w-4" />
          Share
        </Button>
      </div>

      {/* Global CSS for print isolation */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #receipt-print-area, #receipt-print-area * {
            visibility: visible;
          }
          #receipt-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: 100%;
            padding: 0;
            margin: 0;
            border: none;
            box-shadow: none;
            background: white;
            color: black;
          }
        }
      `}</style>
    </div>
  );
}
