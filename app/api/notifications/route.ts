// app/api/notifications/route.ts
// GET endpoint: retrieves current user's notifications (most recent first) and unread count.

import { requireSession } from "@/lib/authz";
import { handleApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    // Build filters
    const whereClause: { userId: string; isRead?: boolean } = {
      userId,
    };

    if (unreadOnly) {
      whereClause.isRead = false;
    }

    // Fetch notifications and unreadCount in parallel
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        take: 50, // limit to 50 recent notifications
      }),
      prisma.notification.count({
        where: {
          userId,
          isRead: false,
        },
      }),
    ]);

    return Response.json(
      { notifications, unreadCount },
      { status: 200 }
    );
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
