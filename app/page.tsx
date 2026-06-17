import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Box, Shield } from "lucide-react";
import { auth } from "@/auth";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";

export default async function Home() {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-radial from-background via-muted/30 to-background transition-colors duration-300">
      {/* Ambient Background Gradients */}
      <div className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] h-[600px] w-[600px] rounded-full bg-violet-500/10 blur-[120px] pointer-events-none" />

      {/* Header with Theme Toggle */}
      <header className="absolute top-0 right-0 left-0 flex h-20 items-center justify-between px-6 sm:px-12 z-50">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20">
            <Box className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-extrabold text-foreground tracking-tight text-sm uppercase">
            Intense Reload
          </span>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="relative flex flex-col items-center justify-center px-4 text-center z-10 max-w-4xl w-full">
        {/* Brand Badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary backdrop-blur-md">
          <Shield className="h-3.5 w-3.5" />
          <span>Enterprise Grade Stock Control</span>
        </div>

        {/* Brand Logo Card */}
        <div className="relative mb-8 flex items-center justify-center rounded-3xl p-6 bg-card/60 border border-border/60 shadow-xl hover:scale-105 transition-transform duration-300">
          <Image
            src="/icons/logo.png"
            alt="Intense Reload Logo"
            width={200}
            height={200}
            priority
            sizes="(max-width: 640px) 160px, 200px"
            className="object-contain w-40 h-40 sm:w-48 sm:h-48"
          />
        </div>

        {/* Hero Headings */}
        <h1 className="text-4xl font-black tracking-tight text-foreground sm:text-6xl md:text-7xl leading-[1.1]">
          Intense Reload <br />
          <span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">
            Stock Management
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg md:text-xl leading-relaxed">
          Streamlined, multi-branch stock reconciliation, real-time inventory auditing, and sales logging for floor staff and managers.
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 justify-center w-full max-w-md">
          <Link href="/dashboard" className="w-full sm:w-auto">
            <button className="group relative flex h-14 w-full sm:w-60 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-primary font-bold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all duration-300 cursor-pointer">
              {isLoggedIn ? "Go to Dashboard" : "Sign In to System"}
              <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </Link>
        </div>

        {/* Logged in indicator */}
        {isLoggedIn && (
          <p className="mt-4 text-xs font-medium text-muted-foreground/80">
            Welcome back, <span className="text-foreground font-semibold">{session.user.name ?? "User"}</span> ({session.user.email})
          </p>
        )}
      </main>

      {/* Footer Branding */}
      <footer className="absolute bottom-6 text-center text-xs text-muted-foreground/60 w-full">
        &copy; {new Date().getFullYear()} Intense Reload. All rights reserved.
      </footer>
    </div>
  );
}
