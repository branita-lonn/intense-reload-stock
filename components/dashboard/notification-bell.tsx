// components/dashboard/notification-bell.tsx
// Client-side notification bell component with unread indicator and popover dropdown.
// Polls the server periodically to retrieve fresh notifications.

"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Bell, Check, Loader2, MessageSquare, Info, ShieldAlert, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { NotificationType } from "@prisma/client";

interface NotificationItem {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  linkUrl: string | null;
  isRead: boolean;
  relatedSaleId: string | null;
  createdAt: string; // ISO date string from JSON response
}

const NOTIFICATION_ICONS: Record<NotificationType, React.ElementType> = {
  SALE_PENDING_APPROVAL: ShieldAlert,
  SALE_REJECTED: AlertTriangle,
  SALE_EDITED: Info,
  LOW_STOCK: AlertTriangle,
};

const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  SALE_PENDING_APPROVAL: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  SALE_REJECTED: "text-destructive bg-destructive/10 border-destructive/20",
  SALE_EDITED: "text-primary bg-primary/10 border-primary/20",
  LOW_STOCK: "text-rose-500 bg-rose-500/10 border-rose-500/20",
};

export function NotificationBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [markingAll, setMarkingAll] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  // Polling implementation.
  // Tradeoffs: Polling is simple, robust, stateless, and requires no persistent WebSockets/Server-Sent Events (SSE) connections.
  // At this scale, a 60-second polling interval is extremely cheap for the database and completely sufficient for real-time awareness.
  // If the app scales, we can easily replace this with a real-time WebSocket connection or push notification subscription.
  const fetchNotifications = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Failed to load notifications.");
      const data = (await res.json()) as {
        notifications: NotificationItem[];
        unreadCount: number;
      };
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error loading notifications";
      console.error("[NotificationBell] fetch error:", msg);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNotifications(true);

    const interval = setInterval(() => {
      void fetchNotifications(false);
    }, 60000); // Poll every 60 seconds

    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id: string, linkUrl: string | null) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
      });

      if (res.ok) {
        // Optimistic UI update
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));

        if (linkUrl) {
          router.push(linkUrl);
          setIsOpen(false);
        }
      }
    } catch (err: unknown) {
      console.error("[NotificationBell] Failed to mark as read:", err);
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || markingAll) return;
    setMarkingAll(true);
    try {
      const res = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
      });

      if (!res.ok) throw new Error("Failed to mark all as read.");

      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      toast.success("All notifications marked as read.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unexpected error";
      toast.error(msg);
    } finally {
      setMarkingAll(false);
    }
  };

  // Safe format relative time to prevent client-side hydration mismatches
  const formatTime = (isoString: string) => {
    try {
      return formatDistanceToNow(new Date(isoString), { addSuffix: true });
    } catch {
      return "just now";
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          id="notification-bell-btn"
          aria-label="Open notifications"
          className="relative rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all flex items-center justify-center focus:outline-none min-h-[44px] min-w-[44px]"
        >
          <Bell className={cn("h-5 w-5", unreadCount > 0 && "animate-bounce duration-1000")} />
          {unreadCount > 0 && (
            <Badge
              id="notification-badge"
              className="absolute -top-0.5 -right-0.5 h-5 min-w-5 px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xxs font-bold border-2 border-background"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-80 sm:w-96 rounded-3xl p-4 shadow-xl border bg-card text-foreground" align="end">
        <div className="flex items-center justify-between pb-3">
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-xxs text-muted-foreground">
                You have {unreadCount} unread message{unreadCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              id="mark-all-read-btn"
              variant="ghost"
              size="sm"
              disabled={markingAll}
              onClick={handleMarkAllRead}
              className="h-8 rounded-xl text-xs text-primary hover:text-primary/80 hover:bg-primary/5 flex items-center gap-1.5"
            >
              {markingAll ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Mark all read
            </Button>
          )}
        </div>

        <Separator />

        <ScrollArea className="h-72 my-2 pr-1">
          {loading && notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground text-xs gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground text-center px-4">
              <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs font-semibold">All caught up!</p>
              <p className="text-xxs text-muted-foreground mt-0.5">
                No notifications received yet.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 py-1">
              {notifications.map((item) => {
                const Icon = NOTIFICATION_ICONS[item.type] || Info;
                const colors = NOTIFICATION_COLORS[item.type] || "text-muted-foreground bg-muted";

                return (
                  <div
                    key={item.id}
                    onClick={() => void handleMarkAsRead(item.id, item.linkUrl)}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-2xl border transition-all cursor-pointer text-left select-none relative group",
                      item.isRead
                        ? "bg-card border-border/40 hover:bg-muted/30"
                        : "bg-primary/5 border-primary/10 hover:bg-primary/10"
                    )}
                  >
                    {/* Unread indicator dot */}
                    {!item.isRead && (
                      <span className="absolute right-3 top-3.5 h-2 w-2 rounded-full bg-primary" />
                    )}

                    {/* Icon Badge */}
                    <div className={cn("p-2 rounded-xl border flex-shrink-0 flex items-center justify-center", colors)}>
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* Notification content */}
                    <div className="space-y-1 min-w-0 pr-2">
                      <p className={cn(
                        "text-xs font-semibold tracking-tight leading-none truncate",
                        item.isRead ? "text-foreground" : "text-primary"
                      )}>
                        {item.title}
                      </p>
                      <p className="text-xxs text-muted-foreground leading-normal line-clamp-2">
                        {item.body}
                      </p>
                      <p className="text-xxs text-muted-foreground/60 font-medium">
                        {formatTime(item.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
