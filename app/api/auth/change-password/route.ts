// app/api/auth/change-password/route.ts
// API route to change a user's password.
// Security: validates current password via bcrypt, hashes new password (12 rounds),
// sets mustChangePassword: false, invalidates existing database sessions.
// All inputs are Zod-validated before any Prisma call (OWASP A03).

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { changePasswordSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  // 1. Authenticate — must be signed in
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse and validate request body with Zod (OWASP A03)
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Validation failed";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const { currentPassword, newPassword } = parsed.data;

  // 3. Fetch the user's current hashed password from the database
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, password: true, isActive: true },
  });

  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Account not found or inactive" }, { status: 403 });
  }

  // 4. Verify the current password before allowing the change
  const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isCurrentPasswordValid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
  }

  // 5. Hash the new password (12 rounds — OWASP A02)
  const hashedNewPassword = await bcrypt.hash(newPassword, 12);

  // 6. Update password and clear mustChangePassword flag
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedNewPassword,
      mustChangePassword: false,
      updatedAt: new Date(),
    },
  });

  // 7. Delete all existing NextAuth database sessions to force re-login
  await prisma.session.deleteMany({ where: { userId: user.id } });

  return NextResponse.json(
    { message: "Password changed successfully. Please sign in again." },
    { status: 200 }
  );
}
