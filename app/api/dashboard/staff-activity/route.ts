// app/api/dashboard/staff-activity/route.ts
// API route for querying staff activity summaries (GET).
// Restricted to OWNER and BRANCH_MANAGER roles.
// This module is READ-ONLY. StockMovement and UserActivityLog have no update/delete routes anywhere in this codebase, by design — do not add any here. (OWASP A09: Security Logging and Monitoring)

import { type NextRequest } from "next/server";
import { requireSession, requireRole, requireBranchAccess, getAccessibleBranchIds } from "@/lib/authz";
import { handleApiError, ValidationError } from "@/lib/errors";
import { getStaffActivitySummaries } from "@/lib/staff-activity-queries";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireSession();
    // Enforce OWNER or BRANCH_MANAGER access
    await requireRole(session, ["OWNER", "BRANCH_MANAGER"]);

    const { searchParams } = new URL(request.url);
    const branchIdParam = searchParams.get("branchId") || undefined;
    const dateFromParam = searchParams.get("dateFrom") || undefined;
    const dateToParam = searchParams.get("dateTo") || undefined;

    // 1. Resolve branch access
    let finalBranchIds: string[] = [];
    if (branchIdParam) {
      await requireBranchAccess(session.user.id, branchIdParam);
      finalBranchIds = [branchIdParam];
    } else {
      finalBranchIds = await getAccessibleBranchIds(session);
    }

    // 2. Resolve date range (default to last 30 days if not specified)
    let dateFrom: Date;
    let dateTo: Date;

    if (dateFromParam) {
      dateFrom = new Date(dateFromParam);
      if (isNaN(dateFrom.getTime())) {
        throw new ValidationError("Invalid dateFrom parameter.");
      }
    } else {
      dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 30);
    }

    if (dateToParam) {
      dateTo = new Date(dateToParam);
      if (isNaN(dateTo.getTime())) {
        throw new ValidationError("Invalid dateTo parameter.");
      }
    } else {
      dateTo = new Date();
    }

    // 3. Query summaries
    const summaries = await getStaffActivitySummaries({
      branchIds: finalBranchIds,
      dateFrom,
      dateTo,
    });

    return Response.json(summaries, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
