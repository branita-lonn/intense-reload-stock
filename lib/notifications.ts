// lib/notifications.ts
// Server-only helper module for creating in-app Notification records.

// These functions intentionally do not check `requireSession`/`requireRole` — they are
// called from within already-authorized API route handlers as a side effect of a state
// change (e.g. a sale rejection), not as standalone endpoints. Never expose these
// directly as API routes without their own authorization layer.

import { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateNotificationParams {
  /** The recipient user's ID. */
  userId: string;
  type: NotificationType;
  /** Max 150 characters — mirroring the DB VarChar(150) constraint. */
  title: string;
  /** Max 500 characters — mirroring the DB VarChar(500) constraint. */
  body: string;
  /** Optional deep-link URL shown in the notification bell dropdown. */
  linkUrl?: string;
  /** Optional FK to the Sale that triggered this notification. */
  relatedSaleId?: string;
}

// ─── createNotification ───────────────────────────────────────────────────────

/**
 * Writes a single Notification row for the given recipient.
 *
 * Silently truncates title/body if they exceed the DB column limits so a
 * programming error in a long notification message never crashes the calling
 * transaction — the notification is better to arrive truncated than to
 * silently swallow the parent operation's success.
 */
export async function createNotification(
  params: CreateNotificationParams
): Promise<void> {
  const { userId, type, title, body, linkUrl, relatedSaleId } = params;

  await prisma.notification.create({
    data: {
      userId,
      type,
      title: title.slice(0, 150),
      body: body.slice(0, 500),
      linkUrl: linkUrl ?? null,
      relatedSaleId: relatedSaleId ?? null,
    },
  });
}

// ─── notifyUsersForBranch ─────────────────────────────────────────────────────

/**
 * Creates a notification for every user relevant to a branch:
 *   - All OWNER-role users (system-wide — owners oversee all branches).
 *   - All BRANCH_MANAGER / STAFF users who have a UserBranchAssignment for
 *     the given branchId.
 *
 * Intended for broadcast events such as Stage 10's LOW_STOCK alerts. Not
 * heavily used in Stage 6 (which targets specific individuals via
 * `createNotification`), but the shared module is built here as the natural
 * home for notification utilities.
 *
 * Failures are per-notification — if one insert fails the others still run.
 */
export async function notifyUsersForBranch(
  branchId: string,
  params: Omit<CreateNotificationParams, "userId">
): Promise<void> {
  // Fetch OWNER users (role-level — no branch assignment needed).
  const owners = await prisma.user.findMany({
    where: { role: "OWNER", isActive: true },
    select: { id: true },
  });

  // Fetch BRANCH_MANAGER + STAFF assigned to this specific branch.
  const assignments = await prisma.userBranchAssignment.findMany({
    where: { branchId },
    include: {
      user: { select: { id: true, isActive: true } },
    },
  });

  // Deduplicate: an OWNER might also have a branch assignment.
  const recipientIds = new Set<string>(owners.map((u: { id: string }) => u.id));
  for (const assignment of assignments) {
    if (assignment.user.isActive) {
      recipientIds.add(assignment.user.id);
    }
  }

  // Fire all inserts concurrently; individual failures are logged and swallowed
  // so a notification bug never blocks the parent business operation.
  const results = await Promise.allSettled(
    Array.from(recipientIds).map((userId) =>
      createNotification({ ...params, userId })
    )
  );

  for (const result of results) {
    if (result.status === "rejected") {
      // Server-side log only — never surface internal detail to clients.
      console.error(
        "[notifications] notifyUsersForBranch: failed to create notification:",
        result.reason instanceof Error ? result.reason.message : result.reason
      );
    }
  }
}
