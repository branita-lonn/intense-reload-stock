// lib/authz.ts
// Centralised, server-only authorization layer for Intense Reload.
// Every API route and server action that reads or writes branch-scoped data
// MUST call the appropriate helper here — middleware alone is insufficient
// because middleware cannot enforce resource-level ownership (OWASP A01).

/**
 * CANONICAL API ROUTE PATTERN (copy this structure in every branch-scoped route):
 *
 * import { requireSession, requireBranchAccess } from "@/lib/authz";
 * import { handleApiError, ValidationError } from "@/lib/errors";
 * import { someZodSchema } from "@/lib/validations/something";
 *
 * export async function POST(request: Request) {
 *   try {
 *     const session = await requireSession();
 *     const body = await request.json() as unknown;
 *     const parsed = someZodSchema.safeParse(body);
 *     if (!parsed.success) throw new ValidationError("Invalid input", parsed.error);
 *     await requireBranchAccess(session.user.id, parsed.data.branchId);
 *     // ... perform the operation using parsed.data only (never raw body) ...
 *     return Response.json({ ... }, { status: 200 });
 *   } catch (error: unknown) {
 *     const { body, status } = handleApiError(error);
 *     return Response.json(body, { status });
 *   }
 * }
 *
 * For server components, call lib/authz.ts functions directly instead of
 * fetching the route — they run on the server and share the same session.
 * Mutations triggered from the client (form submits, button clicks) should
 * always go through the API route pattern above so the auth check runs on
 * the server in all code paths.
 */

import "server-only";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AuthorizationError } from "@/lib/errors";
import type { Session } from "next-auth";
import type { UserRole } from "@prisma/client";

// ---------------------------------------------------------------------------
// requireSession
// ---------------------------------------------------------------------------
/**
 * Retrieves and validates the current session.
 *
 * Throws an AuthorizationError (treated as 401/redirect-to-login) if:
 *   - There is no active session at all.
 *   - The session's user has `isActive === false` — accounts can be
 *     deactivated by an OWNER after a JWT was issued; this re-checks the
 *     live database value so a deactivated user cannot use a stale token.
 *
 * Call this at the top of every API route and server action.
 */
export async function requireSession(): Promise<Session> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new AuthorizationError("Authentication required.");
  }

  // Re-validate isActive against the live DB on every request.
  // This ensures deactivated accounts are immediately locked out even if
  // their JWT hasn't expired yet.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true },
  });

  if (!user?.isActive) {
    throw new AuthorizationError("Your account has been deactivated. Contact your administrator.");
  }

  return session;
}

// ---------------------------------------------------------------------------
// requireRole
// ---------------------------------------------------------------------------
/**
 * Asserts the session user's role is in the provided allowlist.
 *
 * @param session - A valid session returned by requireSession().
 * @param allowedRoles - Array of roles permitted to perform this action.
 *
 * Throws AuthorizationError (403) if the user's role is not in the list.
 *
 * Example:
 *   await requireRole(session, ["OWNER"]);               // OWNER only
 *   await requireRole(session, ["OWNER", "BRANCH_MANAGER"]); // either
 */
export async function requireRole(
  session: Session,
  allowedRoles: UserRole[]
): Promise<void> {
  if (!allowedRoles.includes(session.user.role)) {
    throw new AuthorizationError(
      "You do not have the required role to perform this action."
    );
  }
}

// ---------------------------------------------------------------------------
// userCanAccessBranch
// ---------------------------------------------------------------------------
/**
 * Returns true if the user has read/write access to the given branch.
 *
 * Access rules:
 *   - OWNER: always true — the owner manages all branches.
 *   - BRANCH_MANAGER / STAFF: true only if a UserBranchAssignment row
 *     exists for (userId, branchId).
 *
 * @param userId  - The authenticated user's ID (from session.user.id).
 * @param branchId - The branch ID extracted from the request (query param,
 *                   route segment, or validated body field).
 *
 * NOTE: never trust a branchId supplied directly from a client request
 * without passing it through this function or requireBranchAccess first.
 */
export async function userCanAccessBranch(
  userId: string,
  branchId: string
): Promise<boolean> {
  // Fetch user role from DB to avoid trusting a potentially-stale JWT role.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user) return false;
  if (user.role === "OWNER") return true;

  const assignment = await prisma.userBranchAssignment.findUnique({
    where: {
      userId_branchId: { userId, branchId },
    },
    select: { id: true },
  });

  return assignment !== null;
}

// ---------------------------------------------------------------------------
// requireBranchAccess
// ---------------------------------------------------------------------------
/**
 * Throws AuthorizationError (403) if the user cannot access the branch.
 *
 * This is the primary guard that MUST be called at the top of every
 * branch-scoped API route, after requireSession() and schema validation.
 * It wraps userCanAccessBranch and converts a false result into a throw.
 *
 * @param userId  - session.user.id
 * @param branchId - The branchId from the validated (Zod-parsed) request —
 *                   never pass a raw, unvalidated value here.
 *
 * Example placement in a route:
 *   const session = await requireSession();
 *   const parsed = schema.safeParse(body);
 *   if (!parsed.success) throw new ValidationError("...", parsed.error);
 *   await requireBranchAccess(session.user.id, parsed.data.branchId);
 *   // safe to proceed with branch-scoped DB operations
 */
export async function requireBranchAccess(
  userId: string,
  branchId: string
): Promise<void> {
  const canAccess = await userCanAccessBranch(userId, branchId);
  if (!canAccess) {
    throw new AuthorizationError(
      "You do not have access to this branch."
    );
  }
}

// ---------------------------------------------------------------------------
// getAccessibleBranchIds
// ---------------------------------------------------------------------------
/**
 * Returns the list of branch IDs the user is permitted to access.
 *
 *   - OWNER: all active branch IDs in the system.
 *   - BRANCH_MANAGER / STAFF: only the IDs they are assigned to via
 *     UserBranchAssignment.
 *
 * Use this for routes that aggregate data across "all my branches"
 * (e.g. the OWNER's consolidated dashboard or a multi-branch report).
 *
 * @param session - A valid session returned by requireSession().
 */
export async function getAccessibleBranchIds(
  session: Session
): Promise<string[]> {
  if (session.user.role === "OWNER") {
    const branches = await prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    return branches.map((b) => b.id);
  }

  const assignments = await prisma.userBranchAssignment.findMany({
    where: { userId: session.user.id },
    select: { branchId: true },
  });

  return assignments.map((a) => a.branchId);
}
