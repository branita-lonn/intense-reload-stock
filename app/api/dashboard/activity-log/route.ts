// app/api/dashboard/activity-log/route.ts
// API route for querying stock movement activity log (GET).
// This module is READ-ONLY. StockMovement and UserActivityLog have no update/delete routes anywhere in this codebase, by design — do not add any here. (OWASP A09: Security Logging and Monitoring)

import { type NextRequest } from "next/server";
import { requireSession, requireBranchAccess, getAccessibleBranchIds } from "@/lib/authz";
import { handleApiError, ValidationError } from "@/lib/errors";
import { getMovementLog } from "@/lib/stock-movement-queries";
import { StockMovementType } from "@prisma/client";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireSession();

    const { searchParams } = new URL(request.url);
    const branchIdParam = searchParams.get("branchId") || undefined;
    const typeParam = searchParams.get("type") || undefined;
    const performedByIdParam = searchParams.get("performedById") || undefined;
    const dateFromParam = searchParams.get("dateFrom") || undefined;
    const dateToParam = searchParams.get("dateTo") || undefined;
    const searchParam = searchParams.get("search") || undefined;
    const categoryIdParam = searchParams.get("categoryId") || undefined;
    const productIdParam = searchParams.get("productId") || undefined;
    const productVariantIdParam = searchParams.get("productVariantId") || undefined;
    const pageParam = searchParams.get("page") || "1";
    const pageSizeParam = searchParams.get("pageSize") || "25";

    // 1. Resolve branch access
    let finalBranchIds: string[] = [];
    if (branchIdParam) {
      await requireBranchAccess(session.user.id, branchIdParam);
      finalBranchIds = [branchIdParam];
    } else {
      finalBranchIds = await getAccessibleBranchIds(session);
    }

    // 2. Enforce role-scoped performer filter (OWASP A01: Broken Access Control)
    let finalPerformedById: string | undefined = undefined;
    if (session.user.role === "STAFF") {
      // Staff are forced to query only their own movements
      finalPerformedById = session.user.id;
    } else {
      // Owner/Manager can filter by any staff member in their branches
      if (performedByIdParam) {
        finalPerformedById = performedByIdParam;
      }
    }

    // 3. Validate StockMovementType
    let finalType: StockMovementType | undefined = undefined;
    if (typeParam) {
      if (Object.values(StockMovementType).includes(typeParam as StockMovementType)) {
        finalType = typeParam as StockMovementType;
      } else {
        throw new ValidationError("Invalid stock movement type.");
      }
    }

    // 4. Parse Dates
    let dateFrom: Date | undefined = undefined;
    let dateTo: Date | undefined = undefined;
    if (dateFromParam) {
      dateFrom = new Date(dateFromParam);
      if (isNaN(dateFrom.getTime())) {
        throw new ValidationError("Invalid dateFrom parameter.");
      }
    }
    if (dateToParam) {
      dateTo = new Date(dateToParam);
      if (isNaN(dateTo.getTime())) {
        throw new ValidationError("Invalid dateTo parameter.");
      }
    }

    // 5. Parse Pagination
    const page = parseInt(pageParam, 10);
    const pageSize = parseInt(pageSizeParam, 10);
    if (isNaN(page) || page < 1) {
      throw new ValidationError("Invalid page parameter.");
    }
    if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new ValidationError("Invalid pageSize parameter.");
    }

    // 6. Query Movements
    const result = await getMovementLog({
      branchIds: finalBranchIds,
      type: finalType,
      performedById: finalPerformedById,
      dateFrom,
      dateTo,
      search: searchParam,
      categoryId: categoryIdParam,
      productId: productIdParam,
      productVariantId: productVariantIdParam,
      page,
      pageSize,
    });

    return Response.json(result, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
