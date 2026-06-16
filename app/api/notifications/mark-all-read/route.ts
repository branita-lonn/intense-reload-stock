// app/api/notifications/mark-all-read/route.ts
// POST endpoint: marks all unread notifications of the current user as read.

import { requireSession } from "@/lib/authz";
import { handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const result = await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });

    return Response.json(
      { success: true, count: result.count },
      { status: 200 }
    );
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
