// app/api/dashboard/products/variants/[variantId]/qr/route.ts
// GET: Returns a QR code data URL for the given variant's SKU. OWNER/BRANCH_MANAGER only.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateQrDataUrl } from "@/lib/qr-code";

interface QrResponse {
  dataUrl: string;
}

interface ErrorResponse {
  error: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ variantId: string }> }
): Promise<NextResponse<QrResponse | ErrorResponse>> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Role check: OWNER or BRANCH_MANAGER only
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  });

  if (!user?.isActive) {
    return NextResponse.json({ error: "Account inactive" }, { status: 403 });
  }

  if (user.role !== "OWNER" && user.role !== "BRANCH_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { variantId } = await params;

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { sku: true },
  });

  if (!variant) {
    return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }

  if (!variant.sku) {
    return NextResponse.json(
      { error: "This variant has no SKU. Set a SKU before generating a QR label." },
      { status: 400 }
    );
  }

  const dataUrl = await generateQrDataUrl(variant.sku);
  return NextResponse.json({ dataUrl });
}
