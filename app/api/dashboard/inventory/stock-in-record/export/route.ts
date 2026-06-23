// app/api/dashboard/inventory/stock-in-record/export/route.ts
// Export route for generating stock-in record files (CSV or styled HTML/PDF) in-memory.

import { type NextRequest } from "next/server";
import { requireSession, requireBranchAccess, getAccessibleBranchIds } from "@/lib/authz";
import { handleApiError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { format } from "date-fns";
import type { CategoryWithRelations } from "@/types";

function buildPath(categoryId: string | null, allCategories: CategoryWithRelations[]): string {
  if (!categoryId) return "Uncategorized";
  const path: string[] = [];
  let current = allCategories.find((c) => c.id === categoryId);
  while (current) {
    path.unshift(current.name);
    const parentId = current.parentId;
    current = parentId
      ? allCategories.find((c) => c.id === parentId)
      : undefined;
  }
  return path.join(" › ");
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireSession();

    const { searchParams } = new URL(request.url);
    const branchIdParam = searchParams.get("branchId") || undefined;
    const searchParam = searchParams.get("search") || undefined;
    const dateFromParam = searchParams.get("dateFrom") || undefined;
    const dateToParam = searchParams.get("dateTo") || undefined;
    const formatParam = searchParams.get("format") || "csv"; // "csv" or "pdf" (printable html)

    // 1. Resolve branch access
    let finalBranchIds: string[] = [];
    if (branchIdParam) {
      await requireBranchAccess(session.user.id, branchIdParam);
      finalBranchIds = [branchIdParam];
    } else {
      finalBranchIds = await getAccessibleBranchIds(session);
    }

    const dateFrom = dateFromParam ? new Date(dateFromParam) : undefined;
    const dateTo = dateToParam ? new Date(dateToParam) : undefined;

    // Validate dates if parsed
    if (dateFrom && isNaN(dateFrom.getTime())) {
      throw new ValidationError("Invalid dateFrom parameter format.");
    }
    if (dateTo && isNaN(dateTo.getTime())) {
      throw new ValidationError("Invalid dateTo parameter format.");
    }

    // Date range validation (max 2 years)
    if (dateFrom && dateTo) {
      const diffMs = Math.abs(dateTo.getTime() - dateFrom.getTime());
      const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
      if (diffMs > twoYearsMs) {
        throw new ValidationError("Date range cannot exceed 2 years.");
      }
    }

    // 2. Build query filters
    const dateFilters: Prisma.StockMovementWhereInput[] = [];
    if (dateFrom || dateTo) {
      const stockInDateFilter: Prisma.DateTimeNullableFilter = {};
      const createdAtFilter: Prisma.DateTimeFilter = {};
      if (dateFrom) {
        stockInDateFilter.gte = dateFrom;
        createdAtFilter.gte = dateFrom;
      }
      if (dateTo) {
        stockInDateFilter.lte = dateTo;
        createdAtFilter.lte = dateTo;
      }

      dateFilters.push({
        OR: [
          {
            AND: [
              { stockInDate: { not: null } },
              { stockInDate: stockInDateFilter },
            ],
          },
          {
            AND: [
              { stockInDate: null },
              { createdAt: createdAtFilter },
            ],
          },
        ],
      });
    }

    const searchFilters: Prisma.StockMovementWhereInput[] = [];
    if (searchParam && searchParam.trim()) {
      const s = searchParam.trim();
      searchFilters.push({
        OR: [
          { category: { name: { contains: s, mode: "insensitive" } } },
          { product: { name: { contains: s, mode: "insensitive" } } },
          {
            productVariant: {
              OR: [
                { product: { name: { contains: s, mode: "insensitive" } } },
                { size: { contains: s, mode: "insensitive" } },
                { colour: { contains: s, mode: "insensitive" } },
              ],
            },
          },
        ],
      });
    }

    const whereClause: Prisma.StockMovementWhereInput = {
      type: "STOCK_IN",
      branchId: { in: finalBranchIds },
      AND: [...dateFilters, ...searchFilters],
    };

    // 3. Enforce export row limit (upper bound 5,000 rows to prevent resource exhaustion / DoS)
    const totalCount = await prisma.stockMovement.count({
      where: whereClause,
    });

    if (totalCount > 5000) {
      throw new ValidationError("Too many rows to export — narrow your date range or filters (limit is 5,000).");
    }

    // 4. Fetch movements
    const movements = await prisma.stockMovement.findMany({
      where: whereClause,
      include: {
        branch: { select: { name: true } },
        performedBy: { select: { name: true } },
        category: true,
        product: true,
        productVariant: {
          include: {
            product: true,
          },
        },
      },
      orderBy: [
        { stockInDate: "desc" },
        { createdAt: "desc" },
      ],
    });

    const allCategories = (await prisma.category.findMany()) as CategoryWithRelations[];

    // 5. Structure data rows
    const rows = movements.map((m) => {
      let displayName = "Unknown Item";
      let categoryPath = "Uncategorized";

      if (m.categoryId && m.category) {
        displayName = m.category.name;
        categoryPath = buildPath(m.categoryId, allCategories);
      } else if (m.productId && m.product) {
        displayName = m.product.name;
        categoryPath = buildPath(m.product.categoryId, allCategories);
      } else if (m.productVariantId && m.productVariant) {
        const variant = m.productVariant;
        const product = variant.product;
        const variantParts = [variant.colour, variant.size].filter(Boolean).join(" ");
        displayName = `${product.name}${variantParts ? ` — ${variantParts}` : ""}`.trim();
        categoryPath = buildPath(product.categoryId, allCategories);
      }

      // sign convention: quantityDelta is positive for STOCK_IN
      const quantityAdded = Math.abs(m.quantityDelta);

      return {
        id: m.id,
        displayName,
        categoryPath,
        quantityBefore: m.quantityBefore,
        quantityAdded,
        quantityAfter: m.quantityAfter,
        note: m.note ?? "",
        performedBy: m.performedBy.name ?? "Unknown",
        branchName: m.branch.name,
        stockInDate: m.stockInDate ? format(m.stockInDate, "dd/MM/yyyy") : "—",
        createdAt: format(m.createdAt, "dd/MM/yyyy"),
      };
    });

    const dateStr = new Date().toISOString().split("T")[0];

    // CSV format
    if (formatParam === "csv") {
      // Generated in-memory from query results — no filesystem access.
      // System Date (createdAt) always included alongside Stock-In Date so the export is transparent about both timestamps.
      const csvHeaders = [
        "Stock-In Date",
        "System Date",
        "Item",
        "Category",
        "Branch",
        "Before",
        "Added",
        "Total",
        "Note",
        "Entered By"
      ];
      const escapeCsv = (str: string) => `"${str.replace(/"/g, '""')}"`;
      const csvRows = rows.map((r) => [
        r.stockInDate,
        r.createdAt,
        escapeCsv(r.displayName),
        escapeCsv(r.categoryPath),
        escapeCsv(r.branchName),
        r.quantityBefore.toString(),
        r.quantityAdded.toString(),
        r.quantityAfter.toString(),
        escapeCsv(r.note),
        escapeCsv(r.performedBy),
      ]);
      const csvContent = [csvHeaders.join(","), ...csvRows.map((row) => row.join(","))].join("\n");

      return new Response(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="stock-in-record-${dateStr}.csv"`,
        },
      });
    }

    // Printable HTML format (for browser PDF printing)
    if (formatParam === "pdf") {
      let activeBranchName = "All Branches";
      if (branchIdParam) {
        const b = await prisma.branch.findUnique({
          where: { id: branchIdParam },
          select: { name: true }
        });
        activeBranchName = b?.name || "Selected Branch";
      }
      
      const filterSummary = `Branch: ${activeBranchName}${
        dateFromParam || dateToParam 
          ? ` | Date range: ${dateFromParam ? format(new Date(dateFromParam), "dd/MM/yyyy") : "—"} to ${dateToParam ? format(new Date(dateToParam), "dd/MM/yyyy") : "—"}` 
          : ""
      }`;

      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Intense Reload — Stock-In Record - ${dateStr}</title>
  <style>
    @page { size: A4 landscape; margin: 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2937; margin: 0; padding: 0; }
    h1 { font-size: 20px; font-weight: 800; margin: 0 0 5px 0; color: #111827; }
    .header-table { width: 100%; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 15px; }
    .meta-summary { font-size: 11px; color: #4b5563; font-weight: 500; }
    .export-date { text-align: right; font-size: 11px; color: #6b7280; }
    table.data-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    table.data-table th { background-color: #f3f4f6; text-align: left; font-weight: 600; padding: 8px 10px; font-size: 10px; text-transform: uppercase; color: #374151; border-bottom: 1px solid #d1d5db; }
    table.data-table td { padding: 8px 10px; font-size: 11px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    .mono { font-family: monospace; }
    .footer { position: fixed; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-between; font-size: 9px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 5px; }
    @media print {
      .no-print { display: none; }
      body { color: #000; }
    }
  </style>
</head>
<body>
  <table class="header-table">
    <tr>
      <td>
        <h1>Intense Reload — Stock-In Record</h1>
        <div class="meta-summary">${filterSummary}</div>
      </td>
      <td class="export-date">
        <div>Exported: ${format(new Date(), "dd/MM/yyyy")}</div>
        <button class="no-print" onclick="window.print()" style="background-color: #2563eb; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-weight: 600; cursor: pointer; margin-top: 5px; font-size: 11px;">Print PDF</button>
      </td>
    </tr>
  </table>

  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 10%;">Stock-In Date</th>
        <th style="width: 10%;">System Date</th>
        <th style="width: 20%;">Item</th>
        <th style="width: 15%;">Category</th>
        <th style="width: 10%;">Branch</th>
        <th style="width: 6%;">Before</th>
        <th style="width: 6%;">Added</th>
        <th style="width: 6%;">Total</th>
        <th style="width: 12%;">Note</th>
        <th style="width: 10%;">Entered By</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (r) => `
        <tr>
          <td><strong>${r.stockInDate}</strong></td>
          <td style="color: #6b7280;">${r.createdAt}</td>
          <td style="font-weight: 600; color: #111827;">${r.displayName}</td>
          <td style="color: #4b5563;">${r.categoryPath}</td>
          <td>${r.branchName}</td>
          <td class="mono">${r.quantityBefore}</td>
          <td class="mono" style="color: #059669; font-weight: bold;">+${r.quantityAdded}</td>
          <td class="mono" style="font-weight: 600;">${r.quantityAfter}</td>
          <td style="font-style: italic; color: #4b5563; word-break: break-all;">${r.note}</td>
          <td>${r.performedBy}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>

  <div class="footer">
    <span>Intense Reload Stock Auditing System</span>
    <span>Page 1 of 1</span>
  </div>

  <script>
    window.onload = function() {
      // Auto-trigger browser print dialog
      setTimeout(function() {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>`;

      return new Response(htmlContent, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    throw new ValidationError("Unsupported export format.");
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
