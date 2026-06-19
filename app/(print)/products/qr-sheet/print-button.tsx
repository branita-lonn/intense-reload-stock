// app/(print)/products/qr-sheet/print-button.tsx
// "use client" — thin client component that renders the print button for the QR sheet.
// Extracted from the server-rendered page to avoid passing event handlers from a Server Component.

"use client";

export function PrintButton() {
  return (
    <button
      className="print-btn"
      onClick={() => window.print()}
      style={{
        background: "#1d4ed8",
        color: "#fff",
        border: "none",
        borderRadius: "0.5rem",
        padding: "0.5rem 1.25rem",
        fontSize: "0.875rem",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      Print all labels
    </button>
  );
}
