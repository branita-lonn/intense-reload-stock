// app/(print)/products/qr-sheet/page.tsx
// Server-rendered bulk QR label sheet. Auth-gated (OWNER/BRANCH_MANAGER only).
// Renders a printable grid of QR labels for all variants with SKUs belonging to the requested productIds.
// No dashboard chrome — the parent layout suppresses the sidebar for clean printing.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateQrDataUrl } from "@/lib/qr-code";
import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "QR Label Sheet | Intense Reload",
};

interface QrSheetPageProps {
  searchParams: Promise<{ productIds?: string }>;
}

interface LabelItem {
  variantId: string;
  sku: string;
  productName: string;
  size: string | null;
  colour: string | null;
  dataUrl: string;
}

export default async function QrSheetPage({ searchParams }: QrSheetPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  });

  if (!user?.isActive) {
    redirect("/auth/login");
  }

  if (user.role !== "OWNER" && user.role !== "BRANCH_MANAGER") {
    redirect("/dashboard/products");
  }

  const { productIds: productIdsParam } = await searchParams;
  const productIds = productIdsParam
    ? productIdsParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : [];

  if (productIds.length === 0) {
    return (
      <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
        <p>No products selected. Go back and select products to print labels.</p>
      </div>
    );
  }

  // Fetch all variants with SKUs for the requested products
  const variants = await prisma.productVariant.findMany({
    where: {
      productId: { in: productIds },
      sku: { not: null },
      isActive: true,
    },
    select: {
      id: true,
      sku: true,
      size: true,
      colour: true,
      product: { select: { name: true } },
    },
    orderBy: [{ product: { name: "asc" } }, { sku: "asc" }],
  });

  if (variants.length === 0) {
    return (
      <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
        <p>No variants with SKUs found for the selected products.</p>
      </div>
    );
  }

  // Generate QR data URLs server-side
  const labels: LabelItem[] = await Promise.all(
    variants.map(async (v) => ({
      variantId: v.id,
      sku: v.sku!,
      productName: v.product.name,
      size: v.size,
      colour: v.colour,
      dataUrl: await generateQrDataUrl(v.sku!),
    }))
  );

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: sans-serif; background: #fff; }

        .sheet-header {
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .sheet-title { font-size: 1rem; font-weight: 700; color: #111; }
        .sheet-meta { font-size: 0.75rem; color: #6b7280; }

        .print-btn {
          background: #1d4ed8;
          color: #fff;
          border: none;
          border-radius: 0.5rem;
          padding: 0.5rem 1.25rem;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
        }
        .print-btn:hover { background: #1e40af; }

        .label-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 0;
          padding: 0.5rem;
        }

        .label-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1px solid #d1d5db;
          padding: 0.75rem 0.5rem;
          text-align: center;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .label-cell img {
          width: 110px;
          height: 110px;
          display: block;
        }

        .label-sku {
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: #111;
          margin-top: 0.375rem;
          word-break: break-all;
        }

        .label-name {
          font-size: 0.6rem;
          color: #6b7280;
          margin-top: 0.125rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 140px;
        }

        .label-variant {
          font-size: 0.55rem;
          color: #9ca3af;
        }

        @media print {
          .sheet-header { display: none !important; }
          body { background: #fff; }
          .label-grid {
            grid-template-columns: repeat(4, 1fr);
            gap: 0;
            padding: 0;
          }
          .label-cell {
            border: 1px solid #000;
          }
        }
      `}</style>

      <div className="sheet-header">
        <div>
          <div className="sheet-title">QR Label Sheet — Intense Reload</div>
          <div className="sheet-meta">{labels.length} label{labels.length !== 1 ? "s" : ""}</div>
        </div>
        <PrintButton />
      </div>

      <div className="label-grid">
        {labels.map((label) => {
          const variantDesc = [label.size, label.colour].filter(Boolean).join(" / ");
          return (
            <div key={label.variantId} className="label-cell">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={label.dataUrl} alt={`QR for ${label.sku}`} />
              <div className="label-sku">{label.sku}</div>
              <div className="label-name" title={label.productName}>
                {label.productName}
              </div>
              {variantDesc && <div className="label-variant">{variantDesc}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
