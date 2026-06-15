// app/api/dashboard/inventory/route.ts
// API route for querying the unified inventory dashboard rows, filtered by branch, category, search, and low-stock conditions.

import { requireSession, requireBranchAccess, getAccessibleBranchIds } from "@/lib/authz";
import { getInventoryRows } from "@/lib/inventory-queries";
import { handleApiError } from "@/lib/errors";

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireSession();

    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId") || undefined;
    const categoryId = searchParams.get("categoryId") || undefined;
    const search = searchParams.get("search") || undefined;
    const lowStockOnly = searchParams.get("lowStockOnly") === "true";

    let branchIds: string[];
    if (branchId) {
      // Enforce OWASP A01: Broken Access Control by checking access to the specified branch
      await requireBranchAccess(session.user.id, branchId);
      branchIds = [branchId];
    } else {
      branchIds = await getAccessibleBranchIds(session);
    }

    // Call single source of truth query for current stock
    const rows = await getInventoryRows({ branchIds, categoryId, search });

    // Apply low stock filter if toggled
    const filteredRows = lowStockOnly ? rows.filter((r) => r.isLowStock) : rows;

    const totalQuantity = filteredRows.reduce((sum, r) => sum + r.quantity, 0);
    const totalItems = filteredRows.length;
    const lowStockCount = filteredRows.filter((r) => r.isLowStock).length;

    return Response.json({
      rows: filteredRows,
      totalItems,
      totalQuantity,
      lowStockCount,
    });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
