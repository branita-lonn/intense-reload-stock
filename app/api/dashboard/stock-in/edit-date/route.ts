// app/api/dashboard/stock-in/edit-date/route.ts
// PATCH endpoint to modify the physical stock-in business date for single or bulk records.

import { requireSession, userCanAccessBranch } from "@/lib/authz";
import { editStockInDateSchema } from "@/lib/validations/stock-in";
import { handleApiError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { parse } from "date-fns";

export async function PATCH(request: Request): Promise<Response> {
  try {
    const session = await requireSession();

    const body = (await request.json()) as unknown;
    const parsed = editStockInDateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid payload for editing stock-in date.", parsed.error);
    }

    const { stockMovementIds, stockInDate } = parsed.data;
    const parsedDate = parse(stockInDate, "dd/MM/yyyy", new Date());

    // Fetch movements
    const movements = await prisma.stockMovement.findMany({
      where: { id: { in: stockMovementIds } },
      select: {
        id: true,
        branchId: true,
        performedById: true,
        type: true,
        stockInDate: true,
      },
    });

    const eligible: typeof movements = [];
    const skipped: { id: string; reason: "not_a_stock_in_movement" | "no_access" }[] = [];
    const foundIds = new Set(movements.map((m) => m.id));

    // Handle any requested ID that was not found in the database
    for (const id of stockMovementIds) {
      if (!foundIds.has(id)) {
        skipped.push({ id, reason: "not_a_stock_in_movement" });
      }
    }

    for (const movement of movements) {
      if (movement.type !== "STOCK_IN") {
        skipped.push({ id: movement.id, reason: "not_a_stock_in_movement" });
        continue;
      }

      // Check branch access first
      const canAccessBranch = await userCanAccessBranch(session.user.id, movement.branchId);
      if (!canAccessBranch) {
        skipped.push({ id: movement.id, reason: "no_access" });
        continue;
      }

      // If STAFF, restrict to their own performed movements
      if (session.user.role === "STAFF" && movement.performedById !== session.user.id) {
        skipped.push({ id: movement.id, reason: "no_access" });
        continue;
      }

      eligible.push(movement);
    }

    const updatedIds: string[] = [];

    if (eligible.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const movement of eligible) {
          await tx.stockMovement.update({
            where: { id: movement.id },
            data: { stockInDate: parsedDate },
          });

          await tx.userActivityLog.create({
            data: {
              actorId: session.user.id,
              action: "STOCK_IN_DATE_EDITED",
              details: {
                stockMovementId: movement.id,
                previousStockInDate: movement.stockInDate?.toISOString() ?? null,
                newStockInDate: parsedDate.toISOString(),
              },
            },
          });

          updatedIds.push(movement.id);
        }
      });
    }

    return Response.json(
      { updated: updatedIds, skipped },
      { status: 200 }
    );
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
