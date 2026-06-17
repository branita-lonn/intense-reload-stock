// next.config.ts
// Next.js configuration including OWASP-aligned security headers for all routes.

import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

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
  // Empty turbopack config satisfies Next.js 16's requirement that applications
  // with a webpack config also acknowledge Turbopack. The PWA plugin's webpack
  // config is only exercised during production builds; in dev, the PWA plugin
  // is disabled (disable: process.env.NODE_ENV === "development" above).
  turbopack: {},

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

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  fallbacks: {
    document: "/offline.html",
  },
  workboxOptions: {
    runtimeCaching: [
      {
        // 1. Security: Never cache API routes, session details or per-user data.
        // Direct enforcement of A04 (Insecure Design) to prevent stale or leaked auth states.
        urlPattern: /^\/api\/.*$/i,
        handler: "NetworkOnly",
      },
      {
        // 2. Dashboard HTML pages - NetworkFirst with 3 seconds timeout
        // Allows owner/staff to load the app shell from cache if the network is down or slow.
        urlPattern: /^\/dashboard(\/.*)?$/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "dashboard-html",
          networkTimeoutSeconds: 3,
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
        },
      },
      {
        // 3. Static JS and CSS assets
        urlPattern: /^\/_next\/static\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "next-static",
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          },
        },
      },
      {
        // 4. PWA manifest file
        urlPattern: /^\/manifest\.json$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "pwa-manifest",
          expiration: {
            maxEntries: 1,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
        },
      },
      {
        // 5. PWA Icon assets
        urlPattern: /^\/icons\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "pwa-icons",
          expiration: {
            maxEntries: 20,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
        },
      },
      {
        // 6. External fonts (Google Fonts)
        urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "google-fonts",
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
        },
      },
    ],
  },
});

export default withPWA(nextConfig);
