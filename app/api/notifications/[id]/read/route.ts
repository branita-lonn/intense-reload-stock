// app/api/notifications/[id]/read/route.ts
// POST endpoint: marks a single notification as read.
// Security: Returns 404 for both "not found" and "belongs to another user" to avoid leaking notification existence (non-disclosure).

import { requireSession } from "@/lib/authz";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await requireSession();
    const { id: notificationId } = await params;

    // Fetch notification first to verify ownership
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: { id: true, userId: true },
    });

    // A01 / Non-disclosure: return 404 if not found or if the notification belongs to another user
    if (!notification || notification.userId !== session.user.id) {
      throw new NotFoundError("Notification not found.");
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    return Response.json({ success: true, notification: updated }, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
