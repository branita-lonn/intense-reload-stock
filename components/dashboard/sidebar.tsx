// components/dashboard/sidebar.tsx
// Collapsible dashboard sidebar — desktop fixed sidebar, mobile hamburger sheet.
// Role-based link filtering is a Stage 2 concern; all links are shown to all roles here.

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Package,
  GitBranch,
  Settings,
  LogOut,
  Menu,
  X,
  Package2,
} from "lucide-react";
import { UserRole } from "@prisma/client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

interface SidebarUser {
  name: string;
  email: string;
  role: UserRole;
}

interface DashboardSidebarProps {
  storeName: string;
  user: SidebarUser;
}

const navLinks = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/dashboard/inventory",
    label: "Inventory",
    icon: Package,
    exact: false,
  },
  {
    href: "/dashboard/branches",
    label: "Branches",
    icon: GitBranch,
    exact: false,
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: Settings,
    exact: false,
  },
];

const roleLabels: Record<UserRole, string> = {
  OWNER: "Owner",
  BRANCH_MANAGER: "Branch Manager",
  STAFF: "Staff",
};

function NavContent({
  storeName,
  user,
  onNavClick,
}: DashboardSidebarProps & { onNavClick?: () => void }) {
  const pathname = usePathname();

  async function handleSignOut() {
    try {
      await signOut({ callbackUrl: "/auth/login" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Sign out failed";
      console.error("[sidebar] Sign out error:", message);
      toast.error("Could not sign out. Please try again.");
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Store Header */}
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary">
          <Package2 className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{storeName}</p>
          <p className="text-xs text-muted-foreground">Management System</p>
        </div>
      </div>

      <Separator />

      {/* Navigation Links */}
      <nav aria-label="Dashboard navigation" className="flex-1 space-y-1 px-3 py-4">
        {navLinks.map((link) => {
          const isActive = link.exact
            ? pathname === link.href
            : pathname.startsWith(link.href);
          const Icon = link.icon;

          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavClick}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <Separator />

      {/* User info + sign out */}
      <div className="space-y-3 px-4 py-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          <Badge variant="secondary" className="text-xs">
            {roleLabels[user.role]}
          </Badge>
        </div>
        <Button
          id="sidebar-sign-out-btn"
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}

export function DashboardSidebar({ storeName, user }: DashboardSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar — fixed, visible on lg+ */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-shrink-0 lg:flex-col border-r bg-card">
        <NavContent storeName={storeName} user={user} />
      </aside>

      {/* Mobile hamburger — visible on < lg */}
      <div className="lg:hidden fixed top-0 left-0 z-40 flex h-14 w-full items-center border-b bg-card px-4">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              id="mobile-menu-btn"
              variant="ghost"
              size="icon"
              aria-label="Open navigation menu"
              className="mr-3 rounded-xl"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </SheetTrigger>

          <div className="flex items-center gap-2">
            <Package2 className="h-5 w-5 text-primary" />
            <span className="font-bold text-foreground text-sm">{storeName}</span>
          </div>

          <SheetContent side="left" className="w-64 p-0">
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            <NavContent
              storeName={storeName}
              user={user}
              onNavClick={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Spacer for mobile top bar */}
      <div className="lg:hidden h-14 w-full" />
    </>
  );
}
