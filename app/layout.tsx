// app/layout.tsx
// Root application layout — applies global fonts, dark mode detection, SessionProvider, and Toaster.

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/providers/session-provider";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Intense Reload — Stock Management",
    template: "%s | Intense Reload",
  },
  description:
    "Multi-branch inventory and stock management system for Intense Reload clothing & accessories.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} h-full antialiased`}>
      <head>
        {/*
         * Theme detection script — runs synchronously before React hydration to prevent
         * a flash of the wrong theme. Reads the user's system preference (prefers-color-scheme)
         * and applies the "dark" class to <html> if dark mode is preferred.
         * NOTE: This is intentionally a raw <script> tag, NOT a Next.js Script component,
         * because it must execute before any paint. Do not move it or defer it.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=window.matchMedia('(prefers-color-scheme: dark)');if(m.matches){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full bg-background text-foreground flex flex-col">
        <SessionProvider>
          {children}
          {/* Toaster for sonner toast notifications — positioned bottom-right */}
          <Toaster position="bottom-right" richColors />
        </SessionProvider>
      </body>
    </html>
  );
}
