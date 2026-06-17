// components/dashboard/sidebar.tsx
// Dashboard sidebar — role-filtered navigation links and branch switcher.
// Branch selection uses the ?branch=<id> URL search param for shareability.
// Role visibility rules:
//   OWNER        → Dashboard, Inventory, Branches, Staff, Settings
//   BRANCH_MANAGER → Dashboard, Inventory, Branches, Staff
//   STAFF        → Dashboard, Inventory

"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { clearOfflineQueue } from "@/lib/offline-queue";
import {
  LayoutDashboard,
  Package,
  GitBranch,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Package2,
  ChevronDown,
  FolderTree,
  Layers,
  ShoppingCart,
  FileClock,
  Boxes,
  ClipboardCheck,
} from "lucide-react";
import type { UserRole } from "@prisma/client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SidebarUser {
  name: string;
  email: string;
  role: UserRole;
}

interface AccessibleBranch {
  id: string;
  name: string;
  town: string;
}

interface DashboardSidebarProps {
  storeName: string;
  user: SidebarUser;
  accessibleBranches: AccessibleBranch[];
}

interface NavLink {
  href: string;
  label: string;
  icon: React.ElementType;
  exact: boolean;
  roles: UserRole[];
}

const ALL_NAV_LINKS: NavLink[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
    roles: ["OWNER", "BRANCH_MANAGER", "STAFF"],
  },
  {
    href: "/dashboard/log-sale",
    label: "Log Sale",
    icon: ShoppingCart,
    exact: false,
    roles: ["OWNER", "BRANCH_MANAGER", "STAFF"],
  },
  {
    href: "/dashboard/sales",
    label: "Sales Logs",
    icon: FileClock,
    exact: false,
    roles: ["OWNER", "BRANCH_MANAGER", "STAFF"],
  },
  {
    href: "/dashboard/approvals",
    label: "Approvals",
    icon: ClipboardCheck,
    exact: false,
    roles: ["OWNER", "BRANCH_MANAGER"],
  },
  {
    href: "/dashboard/stock-in",
    label: "Stock-In",
    icon: Boxes,
    exact: false,
    roles: ["OWNER", "BRANCH_MANAGER", "STAFF"],
  },
  {
    href: "/dashboard/stock-count",
    label: "Stock Count",
    icon: ClipboardCheck,
    exact: false,
    roles: ["OWNER", "BRANCH_MANAGER", "STAFF"],
  },
  {
    href: "/dashboard/inventory",
    label: "Inventory",
    icon: Package,
    exact: false,
    roles: ["OWNER", "BRANCH_MANAGER", "STAFF"],
  },
  {
    href: "/dashboard/products",
    label: "Products",
    icon: Layers,
    exact: false,
    roles: ["OWNER", "BRANCH_MANAGER"],
  },
  {
    href: "/dashboard/branches",
    label: "Branches",
    icon: GitBranch,
    exact: false,
    roles: ["OWNER", "BRANCH_MANAGER"],
  },
  {
    href: "/dashboard/categories",
    label: "Categories",
    icon: FolderTree,
    exact: false,
    roles: ["OWNER", "BRANCH_MANAGER"],
  },
  {
    href: "/dashboard/staff",
    label: "Staff",
    icon: Users,
    exact: false,
    roles: ["OWNER", "BRANCH_MANAGER"],
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: Settings,
    exact: false,
    roles: ["OWNER"],
  },
];

const roleLabels: Record<UserRole, string> = {
  OWNER: "Owner",
  BRANCH_MANAGER: "Branch Manager",
  STAFF: "Staff",
};

// ---------------------------------------------------------------------------
// BranchSwitcher
// ---------------------------------------------------------------------------
function BranchSwitcher({
  accessibleBranches,
  userRole,
}: {
  accessibleBranches: AccessibleBranch[];
  userRole: UserRole;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentBranchId = searchParams.get("branch");

  const currentBranch =
    accessibleBranches.find((b) => b.id === currentBranchId) ??
    accessibleBranches[0];

  function selectBranch(branchId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("branch", branchId);
    router.push(`?${params.toString()}`);
  }

  // Single-branch STAFF or managers: show static label only
  if (userRole === "STAFF" || accessibleBranches.length <= 1) {
    return (
      <div className="mx-3 my-2 rounded-xl bg-muted/40 px-3 py-2">
        <p className="text-xs text-muted-foreground">Current branch</p>
        <p className="mt-0.5 text-sm font-semibold text-foreground truncate">
          {currentBranch?.name ?? "—"}
        </p>
      </div>
    );
  }

  // Multi-branch OWNER or BRANCH_MANAGER: show dropdown
  return (
    <div className="mx-3 my-2">
      <p className="px-1 mb-1 text-xs text-muted-foreground">Current branch</p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            id="branch-switcher-trigger"
            className="flex w-full items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/70 transition-colors focus:outline-none"
          >
            <span className="truncate">{currentBranch?.name ?? "All branches"}</span>
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 ml-1 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            Switch branch
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {accessibleBranches.map((branch) => (
            <DropdownMenuItem
              key={branch.id}
              id={`branch-switcher-item-${branch.id}`}
              onSelect={() => selectBranch(branch.id)}
              className={cn(
                "cursor-pointer",
                currentBranch?.id === branch.id && "bg-primary/10 text-primary"
              )}
            >
              <div className="flex flex-col">
                <span>{branch.name}</span>
                <span className="text-xs text-muted-foreground">{branch.town}</span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NavContent — shared between desktop and mobile
// ---------------------------------------------------------------------------
function NavContent({
  storeName,
  user,
  accessibleBranches,
  onNavClick,
}: DashboardSidebarProps & { onNavClick?: () => void }) {
  const pathname = usePathname();

  const visibleLinks = ALL_NAV_LINKS.filter((link) =>
    link.roles.includes(user.role)
  );

  const handleSignOut = useCallback(async () => {
    try {
      // Clear offline queue on logout to prevent queue leakage between users on shared devices (OWASP A04).
      await clearOfflineQueue();
      await signOut({ callbackUrl: "/auth/login" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Sign out failed";
      console.error("[sidebar] Sign out error:", message);
      toast.error("Could not sign out. Please try again.");
    }
  }, []);

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

      {/* Branch Switcher */}
      <BranchSwitcher
        accessibleBranches={accessibleBranches}
        userRole={user.role}
      />

      <Separator />

      {/* Role-filtered Navigation Links */}
      <nav aria-label="Dashboard navigation" className="flex-1 space-y-1 px-3 py-4">
        {visibleLinks.map((link) => {
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

// ---------------------------------------------------------------------------
// DashboardSidebar — exported shell (desktop + mobile)
// ---------------------------------------------------------------------------
export function DashboardSidebar({
  storeName,
  user,
  accessibleBranches,
}: DashboardSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar — fixed, visible on lg+ */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-shrink-0 lg:flex-col border-r bg-card">
        <NavContent
          storeName={storeName}
          user={user}
          accessibleBranches={accessibleBranches}
        />
      </aside>

      {/* Mobile hamburger — visible on < lg */}
      <div className="lg:hidden fixed top-0 left-0 z-40 flex h-14 w-full items-center justify-between border-b bg-card px-4">
        <div className="flex items-center">
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

            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <NavContent
                storeName={storeName}
                user={user}
                accessibleBranches={accessibleBranches}
                onNavClick={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2">
            <Package2 className="h-5 w-5 text-primary" />
            <span className="font-bold text-foreground text-sm truncate max-w-[120px] sm:max-w-[200px]">
              {storeName}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 pr-1">
          <NotificationBell />
        </div>
      </div>
    </>
  );
}
