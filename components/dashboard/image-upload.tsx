"use client";

// components/dashboard/image-upload.tsx
// Multi-image upload component with drag-to-reorder, magic-byte client pre-validation,
// and a "Cover" badge on the first image. Used in the ProductForm and CategoryForm.

import { useRef, useState } from "react";
import Image from "next/image";
import { Upload, X, GripVertical, Loader2 } from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Constants — mirrors the server-side values in lib/file-validation.ts.
// These client-side checks are a UX convenience only (instant feedback).
// The server ALWAYS re-validates regardless of what the client sends — this
// is defence in depth, not a security boundary on its own.
// ---------------------------------------------------------------------------
const CLIENT_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const CLIENT_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

type AllowedFolder = "intense-reload/products" | "intense-reload/categories";

interface ImageUploadProps {
  value: string[];
  onChange: (urls: string[]) => void;
  onRemove: (url: string) => void;
  maxImages?: number;
  folder?: AllowedFolder;
  disabled?: boolean;
}

export function ImageUpload({
  value,
  onChange,
  onRemove,
  maxImages = 8,
  folder = "intense-reload/products",
  disabled = false,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // Drag-to-reorder state
  // ---------------------------------------------------------------------------
  const dragIndexRef = useRef<number | null>(null);

  function handleDragStart(index: number) {
    dragIndexRef.current = index;
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); // Required to allow drop
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, dropIndex: number) {
    e.preventDefault();
    const dragIndex = dragIndexRef.current;
    if (dragIndex === null || dragIndex === dropIndex) return;

    const reordered = [...value];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    onChange(reordered);
    dragIndexRef.current = null;
  }

  // ---------------------------------------------------------------------------
  // File selection & upload
  // ---------------------------------------------------------------------------
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const remaining = maxImages - value.length;
    const filesToProcess = files.slice(0, remaining);

    if (files.length > remaining) {
      toast.warning(
        `Only ${remaining} more image${remaining === 1 ? "" : "s"} can be added (max ${maxImages}).`
      );
    }

    // Client-side pre-validation (UX only — server re-validates)
    for (const file of filesToProcess) {
      if (!CLIENT_ALLOWED_TYPES.includes(file.type)) {
        toast.error(
          `"${file.name}" is not an accepted image type. Use JPEG, PNG, or WebP.`
        );
        return;
      }
      if (file.size > CLIENT_MAX_SIZE_BYTES) {
        toast.error(
          `"${file.name}" exceeds the 5 MB size limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`
        );
        return;
      }
    }

    setUploading(true);

    try {
      const uploadedUrls: string[] = [];

      for (const file of filesToProcess) {
        const base64 = await fileToBase64(file);

        const response = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base64, folder }),
        });

        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          toast.error(data.error ?? `Failed to upload "${file.name}".`);
          continue;
        }

        const { url } = (await response.json()) as { url: string };
        uploadedUrls.push(url);
      }

      if (uploadedUrls.length > 0) {
        onChange([...value, ...uploadedUrls]);
      }
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred during upload."
      );
    } finally {
      setUploading(false);
      // Reset the input so the same file can be re-selected after removal
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const canAddMore = value.length < maxImages && !disabled;

  return (
    <div className="space-y-3">
      {/* Thumbnail grid */}
      {value.length > 0 && (
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
          {value.map((url, index) => (
            <div
              key={url}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
              className="relative aspect-square cursor-grab rounded-xl overflow-hidden border border-border bg-muted group"
            >
              {/* Image */}
              <Image
                src={url}
                alt={`Upload ${index + 1}`}
                fill
                sizes="80px"
                className="object-cover"
              />

              {/* Cover badge — first image is always the cover photo */}
              {index === 0 && (
                <span className="absolute bottom-0 left-0 right-0 bg-primary/80 text-primary-foreground text-[9px] font-semibold tracking-wide text-center py-0.5">
                  Cover
                </span>
              )}

              {/* Drag handle */}
              <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity text-white drop-shadow">
                <GripVertical className="w-3.5 h-3.5" />
              </div>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => onRemove(url)}
                disabled={disabled}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/90 disabled:cursor-not-allowed"
                aria-label={`Remove image ${index + 1}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload zone */}
      {canAddMore && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => !uploading && fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !uploading) {
              fileInputRef.current?.click();
            }
          }}
          className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 px-4 py-8 text-center transition-colors hover:bg-muted/70 hover:border-primary/50 cursor-pointer ${
            uploading ? "opacity-60 pointer-events-none" : ""
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Uploading…</p>
            </>
          ) : (
            <>
              <Upload className="w-6 h-6 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Click to upload
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  JPEG, PNG, WebP · max 5 MB ·{" "}
                  {value.length}/{maxImages} uploaded
                </p>
                {value.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    First image becomes the cover photo
                  </p>
                )}
              </div>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={handleFileChange}
            disabled={disabled || uploading}
            aria-label="Upload images"
          />
        </div>
      )}

      {/* Limit reached hint */}
      {value.length >= maxImages && (
        <p className="text-xs text-muted-foreground text-center">
          Maximum {maxImages} images uploaded. Remove one to add another.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converts a File object to a base64 data URI string.
 * Used to encode the file before POSTing to /api/upload.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read file as base64."));
      }
    };
    reader.onerror = () => reject(new Error("FileReader error."));
    reader.readAsDataURL(file);
  });
}
