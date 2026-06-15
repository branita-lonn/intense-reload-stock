// lib/file-validation.ts
// Server-side image upload validation using magic-byte inspection (OWASP A08).
//
// SECURITY NOTE: Never trust `Content-Type` headers or file extensions alone —
// a `.jpg`-named file containing executable content would pass a naive check.
// This module inspects the actual byte content of the decoded file to verify
// it matches a known, safe image format, regardless of what the client claims.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

// 5 MB in bytes — rejects files larger than this before touching Cloudinary.
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// validateImageMagicBytes
// ---------------------------------------------------------------------------

interface MagicByteResult {
  valid: boolean;
  detectedType?: string; // e.g. "image/jpeg" — only set when valid is true
}

/**
 * Inspects the first few bytes of a decoded file buffer for known magic numbers.
 *
 * Supported formats and their signatures:
 *   JPEG  — bytes 0-2: FF D8 FF
 *   PNG   — bytes 0-3: 89 50 4E 47  (‰PNG)
 *   WebP  — bytes 0-3: 52 49 46 46  (RIFF) + bytes 8-11: 57 45 42 50  (WEBP)
 *
 * This check is deliberately performed AFTER base64 decoding so we are
 * inspecting the actual binary content, not the encoded representation.
 *
 * @param buffer - Raw bytes of the uploaded file, decoded from base64.
 */
export function validateImageMagicBytes(buffer: Buffer): MagicByteResult {
  if (buffer.length < 12) {
    // Too short to contain any valid image header
    return { valid: false };
  }

  // JPEG: starts with FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, detectedType: "image/jpeg" };
  }

  // PNG: starts with 89 50 4E 47 (hex) = \x89PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { valid: true, detectedType: "image/png" };
  }

  // WebP: bytes 0-3 = "RIFF" (52 49 46 46) AND bytes 8-11 = "WEBP" (57 45 42 50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, detectedType: "image/webp" };
  }

  // None of the above magic byte sequences matched.
  return { valid: false };
}

// ---------------------------------------------------------------------------
// validateUploadedImage
// ---------------------------------------------------------------------------

interface ImageValidationResult {
  valid: boolean;
  error?: string;          // User-safe error message (no internal details)
  detectedType?: string;   // MIME type inferred from magic bytes on success
}

/**
 * Full validation pipeline for an uploaded image encoded as a base64 data URI.
 *
 * Steps (in order):
 *   1. Strip the data URI prefix and decode to raw bytes.
 *   2. Reject if the decoded size exceeds MAX_FILE_SIZE_BYTES.
 *   3. Call validateImageMagicBytes on the raw bytes.
 *   4. Return a combined result with a user-safe error message on failure.
 *
 * This is the entry point called by the upload API route (app/api/upload/route.ts)
 * before any bytes are sent to Cloudinary.
 *
 * @param base64 - The image as a base64 string, with or without a data URI
 *                 prefix (e.g. "data:image/jpeg;base64,...").
 */
export function validateUploadedImage(base64: string): ImageValidationResult {
  // Strip the data URI prefix if present (e.g. "data:image/jpeg;base64,")
  const base64Data = base64.includes(",") ? base64.split(",")[1] : base64;

  if (!base64Data) {
    return { valid: false, error: "No file content received." };
  }

  // Decode to raw bytes
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Data, "base64");
  } catch {
    return { valid: false, error: "Could not decode the uploaded file." };
  }

  // Size check
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (buffer.length / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File is too large (${sizeMb} MB). Maximum allowed size is 5 MB.`,
    };
  }

  // Magic-byte check
  const { valid, detectedType } = validateImageMagicBytes(buffer);
  if (!valid) {
    return {
      valid: false,
      error:
        "File content does not match an allowed image type. Accepted formats: JPEG, PNG, WebP.",
    };
  }

  return { valid: true, detectedType };
}
