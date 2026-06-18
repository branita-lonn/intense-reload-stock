// app/(print)/products/qr-sheet/layout.tsx
// Minimal passthrough layout for the QR label print sheet.
// Lives in the (print) route group — outside /dashboard — so the dashboard sidebar is never rendered.
// The root app/layout.tsx owns <html> and <body>; this layout is transparent.

export default function QrSheetLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
