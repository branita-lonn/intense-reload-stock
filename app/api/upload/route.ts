// app/api/upload/route.ts
// POST handler for secure image uploads — validates magic bytes then forwards to Cloudinary.

import { requireSession, requireRole } from "@/lib/authz";
import { handleApiError, ValidationError } from "@/lib/errors";
import { validateUploadedImage } from "@/lib/file-validation";
import { uploadImage } from "@/lib/cloudinary";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Folder allowlist
// ---------------------------------------------------------------------------
// A user-supplied `folder` value is never passed to Cloudinary without being
// checked against this allowlist first (OWASP A10 — no user-controlled
// paths forwarded to server-side operations without validation).
const ALLOWED_FOLDERS = [
  "intense-reload/products",
  "intense-reload/categories",
] as const;

type AllowedFolder = (typeof ALLOWED_FOLDERS)[number];

const uploadSchema = z.object({
  base64: z.string().min(1, "No file content provided."),
  // Zod v4: error param replaces errorMap
  folder: z.enum(ALLOWED_FOLDERS, {
    error: `Invalid upload folder. Must be one of: ${ALLOWED_FOLDERS.join(", ")}`,
  }),
});

// ---------------------------------------------------------------------------
// POST /api/upload
// ---------------------------------------------------------------------------
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession();

    // Only OWNER and BRANCH_MANAGER may upload product images.
    // STAFF do not create or edit catalogue entries.
    await requireRole(session, ["OWNER", "BRANCH_MANAGER"]);

    const body = (await request.json()) as unknown;
    const parsed = uploadSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid upload request.", parsed.error);
    }

    const { base64, folder } = parsed.data;

    // Security: inspect actual file bytes before touching Cloudinary.
    // This runs AFTER Zod validation so `base64` is a confirmed non-empty string,
    // but BEFORE any network call — a malicious payload is rejected cheaply here.
    const validation = validateUploadedImage(base64);
    if (!validation.valid) {
      // Safe error message returned to client; no internal detail leaked.
      throw new ValidationError(
        validation.error ?? "File content does not match an allowed image type."
      );
    }

    // Upload to Cloudinary — folder is a validated AllowedFolder value.
    const { url, publicId } = await uploadImage(base64, folder as AllowedFolder);

    return Response.json({ url, publicId }, { status: 200 });
  } catch (error: unknown) {
    // Log unexpected errors server-side with a recognisable prefix.
    if (
      !(error instanceof ValidationError) &&
      !(
        error instanceof Error &&
        (error.constructor.name === "AuthorizationError" ||
          error.constructor.name === "NotFoundError")
      )
    ) {
      console.error("[UPLOAD_ERROR]", error);
    }

    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
