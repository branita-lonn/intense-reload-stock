// app/api/dashboard/settings/route.ts
// GET/PATCH /api/dashboard/settings — OWNER-only store settings management.

import { requireSession, requireRole } from "@/lib/authz";
import { handleApiError, ValidationError } from "@/lib/errors";
import { updateStoreSettingsSchema } from "@/lib/validations/settings";
import { getOrCreateStoreSettings } from "@/lib/get-store-settings";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(): Promise<Response> {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER"]);

    const settings = await getOrCreateStoreSettings();
    return Response.json({ settings }, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER"]);

    const body = (await request.json()) as unknown;
    const parsed = updateStoreSettingsSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("Invalid settings data.", parsed.error);

    const currentSettings = await getOrCreateStoreSettings();

    // Capture previous values of changed fields for the audit log.
    const changedFields = Object.keys(parsed.data) as (keyof typeof parsed.data)[];
    const previousValues: Record<string, unknown> = {};
    for (const field of changedFields) {
      previousValues[field] = currentSettings[field];
    }

    const updated = await prisma.storeSettings.update({
      where: { id: currentSettings.id },
      data: parsed.data,
    });

    // Append-only audit entry — SETTINGS_UPDATED (OWASP A09).
    await prisma.userActivityLog.create({
      data: {
        actorId: session.user.id,
        action: "SETTINGS_UPDATED",
        details: {
          changedFields,
          previousValues,
        } as Prisma.InputJsonValue,
      },
    });

    return Response.json({ settings: updated }, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
