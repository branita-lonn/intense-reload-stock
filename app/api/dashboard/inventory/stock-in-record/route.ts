// app/api/dashboard/inventory/stock-in-record/route.ts
// GET API route for paginated and filtered stock-in records.

import { type NextRequest } from "next/server";
import { requireSession, requireBranchAccess, getAccessibleBranchIds } from "@/lib/authz";
import { handleApiError, ValidationError } from "@/lib/errors";
import { getStockInRecords } from "@/lib/stock-in-record-queries";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireSession();

    const { searchParams } = new URL(request.url);
    const branchIdParam = searchParams.get("branchId") || undefined;
    const searchParam = searchParams.get("search") || undefined;
    const dateFromParam = searchParams.get("dateFrom") || undefined;
    const dateToParam = searchParams.get("dateTo") || undefined;
    const pageParam = searchParams.get("page") || "1";
    const pageSizeParam = searchParams.get("pageSize") || "25";

    const page = Math.max(1, parseInt(pageParam, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeParam, 10))); // Cap pageSize at 100

    // 1. Determine accessible branches
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

    const result = await getStockInRecords({
      branchIds: finalBranchIds,
      search: searchParam,
      dateFrom,
      dateTo,
      page,
      pageSize,
    });

    return Response.json(result, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
