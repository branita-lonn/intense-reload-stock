// app/api/setup/route.ts
// One-time API endpoint that creates the first OWNER account.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { firstRunSetupSchema } from "@/lib/validations/first-run-setup";
import bcrypt from "bcryptjs";
import { handleApiError, ValidationError } from "@/lib/errors";

export interface SetupResponse {
  success: boolean;
  userId: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const validated = firstRunSetupSchema.parse(body);

    const createdUser = await prisma.$transaction(async (tx) => {
      const existingUserCount = await tx.user.count();
      if (existingUserCount > 0) {
        throw new ValidationError(
          "Setup has already been completed. Please use the login page."
        );
      }

      const passwordHash = await bcrypt.hash(validated.password, 12);

      const user = await tx.user.create({
        data: {
          name: validated.name,
          email: validated.email.toLowerCase(),
          password: passwordHash,
          role: "OWNER", // hardcoded — never taken from client input
        },
      });

      await tx.userActivityLog.create({
        data: {
          actorId: user.id,
          targetUserId: user.id,
          action: "FIRST_RUN_SETUP_COMPLETED",
          details: { email: user.email },
        },
      });

      return user;
    });

    const responseData: SetupResponse = { success: true, userId: createdUser.id };
    return NextResponse.json(responseData, { status: 201 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return NextResponse.json(body, { status });
  }
}
