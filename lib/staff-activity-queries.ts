// lib/staff-activity-queries.ts
// Shared read-only query logic for staff performance and sale logging metrics.
// This module is READ-ONLY. StockMovement and UserActivityLog have no update/delete routes anywhere in this codebase, by design — do not add any here. (OWASP A09: Security Logging and Monitoring)

import { prisma } from "@/lib/prisma";
import { SaleStatus } from "@prisma/client";

export const HIGH_REJECTION_RATE_THRESHOLD = 0.15; // 15% rejection rate threshold

export interface StaffActivitySummary {
  userId: string;
  userName: string;
  branchNames: string[];
  salesLogged: number;
  salesApproved: number;
  salesRejected: number;
  salesPending: number;
  approvalRate: number | null;
  rejectionRate: number | null;
}

export async function getStaffActivitySummaries(params: {
  branchIds: string[];
  dateFrom: Date;
  dateTo: Date;
}): Promise<StaffActivitySummary[]> {
  const { branchIds, dateFrom, dateTo } = params;

  // 1. Fetch sales matching the branch and date filters
  const sales = await prisma.sale.findMany({
    where: {
      branchId: { in: branchIds },
      createdAt: {
        gte: dateFrom,
        lte: dateTo,
      },
    },
    select: {
      loggedById: true,
      status: true,
    },
  });

  // 2. Fetch users who have logged sales or are active and assigned to these branches
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { id: { in: Array.from(new Set(sales.map((s) => s.loggedById))) } },
        {
          isActive: true,
          branchAssignments: {
            some: { branchId: { in: branchIds } },
          },
        },
      ],
    },
    include: {
      branchAssignments: {
        include: {
          branch: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  // 3. Aggregate metrics in-memory
  const summaries: StaffActivitySummary[] = users.map((user) => {
    const userSales = sales.filter((s) => s.loggedById === user.id);
    const salesLogged = userSales.length;

    let salesApproved = 0;
    let salesRejected = 0;
    let salesPending = 0;

    for (const sale of userSales) {
      if (sale.status === SaleStatus.APPROVED) {
        salesApproved++;
      } else if (sale.status === SaleStatus.REJECTED) {
        salesRejected++;
      } else if (sale.status === SaleStatus.PENDING) {
        salesPending++;
      }
    }

    const reviewedCount = salesApproved + salesRejected;
    const approvalRate = reviewedCount > 0 ? salesApproved / reviewedCount : null;
    const rejectionRate = reviewedCount > 0 ? salesRejected / reviewedCount : null;

    const branchNames = user.branchAssignments
      .map((ba) => ba.branch.name)
      .filter(Boolean);

    return {
      userId: user.id,
      userName: user.name,
      branchNames,
      salesLogged,
      salesApproved,
      salesRejected,
      salesPending,
      approvalRate,
      rejectionRate,
    };
  });

  // Sort by sales logged desc, then name asc
  return summaries.sort((a, b) => {
    if (b.salesLogged !== a.salesLogged) {
      return b.salesLogged - a.salesLogged;
    }
    return a.userName.localeCompare(b.userName);
  });
}
