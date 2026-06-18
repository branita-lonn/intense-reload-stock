// lib/first-run.ts
// Purpose: single source of truth for "has the first-run setup already happened" —
// checked independently by both the /setup page and the POST /api/setup route.

import { prisma } from "@/lib/prisma";

export async function isFirstRunSetupAvailable(): Promise<boolean> {
  const existingUserCount = await prisma.user.count();
  return existingUserCount === 0;
}
