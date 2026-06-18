// lib/qr-code.ts
// Server-side utility: generates a base64 PNG data URL for a given text string using the qrcode library.

import QRCode from "qrcode";

/**
 * Generates a base64-encoded PNG data URL for the given text.
 * Suitable for embedding directly in an <img> src attribute.
 */
export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 256,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });
}
