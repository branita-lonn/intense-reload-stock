// lib/cloudinary.ts
// Server-side Cloudinary v2 SDK wrapper for image uploads used across the dashboard.

import "server-only";

import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary once at module load time.
// All three env vars are required — missing any one will cause runtime errors
// caught by the typed upload function below rather than at startup.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // Always use HTTPS URLs in responses
});

interface UploadResult {
  url: string;       // Secure HTTPS URL for the uploaded asset
  publicId: string;  // Cloudinary public_id — stored for future deletion/transformation
}

/**
 * Uploads a base64-encoded image to Cloudinary.
 *
 * @param base64  - The image content as a base64 data URI
 *                  (e.g. "data:image/jpeg;base64,/9j/4AAQ...").
 *                  The caller is responsible for pre-validating the content
 *                  via lib/file-validation.ts before passing it here —
 *                  this function assumes the bytes are already trusted.
 * @param folder  - Cloudinary folder path, e.g. "intense-reload/products".
 *                  Must be from the validated allowlist in the API route.
 *
 * @returns { url, publicId } on success.
 * @throws  Error with a descriptive message on Cloudinary failure —
 *          never swallows errors silently.
 */
export async function uploadImage(
  base64: string,
  folder: string
): Promise<UploadResult> {
  try {
    const result = await cloudinary.uploader.upload(base64, {
      folder,
      resource_type: "image",
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Cloudinary error occurred";
    throw new Error(`[CLOUDINARY] Upload failed: ${message}`);
  }
}
