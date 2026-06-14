// next.config.ts
// Next.js configuration including OWASP-aligned security headers for all routes.

import type { NextConfig } from "next";

// ─────────────────────────────────────────────────────────────
// Security Headers — applied to every route (source: "/:path*")
// Each header is documented below for future maintainers who may
// not have a security background. These are non-negotiable and
// must not be removed without a documented reason.
// ─────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  {
    // Prevents the page from being embedded in an <iframe>, <frame>, or <object>.
    // Protects against clickjacking attacks (OWASP A05).
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Tells the browser not to guess (sniff) the content-type of a response.
    // Prevents MIME-type confusion attacks where a malicious file is served
    // with a misleading Content-Type header (OWASP A05).
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Controls how much referrer information is included with outgoing requests.
    // "strict-origin-when-cross-origin": sends the full URL only for same-origin,
    // and only the origin (no path/query) for cross-origin HTTPS requests.
    // Prevents leaking internal paths or query params to third-party sites.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Forces browsers to use HTTPS for the next 2 years (63072000 seconds),
    // including all subdomains. The "preload" directive signals eligibility
    // for browser preload lists. Only active over HTTPS — ignored in HTTP dev.
    // NOTE: Only deploy this in production with a valid SSL certificate.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    // Content Security Policy — restricts which resources the browser is allowed
    // to load for this page. This is the primary defence against XSS (OWASP A03).
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js requires 'unsafe-inline' for script execution (hydration) unless a complex nonce setup is used.
      // Next.js HMR (Hot Module Replacement) requires 'unsafe-eval' during development.
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: res.cloudinary.com",
      "font-src 'self' data:",
      // Development server HMR uses web sockets.
      isDev
        ? "connect-src 'self' ws: wss:"
        : "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply security headers to every route in the application
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },

  images: {
    remotePatterns: [
      {
        // Allow Next.js Image Optimization to fetch product images from Cloudinary (Stage 4+)
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
};

export default nextConfig;
