"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { TrafficLight } from "@/components/adx/status-badge";
import type { NotificationRow } from "@/services/notifications";

interface NotificationsDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    notifications: NotificationRow[];
    unreadCount: number;
    /** True while the feed is being read; the header count waits for it. */
    loading: boolean;
    /** Why the feed could not be read, when it could not. */
    error: string | null;
    /** False while the console runs on fixtures — there is no feed to read. */
    live: boolean;
    /** Calls `PATCH /notifications/read-all`; the shell re-reads afterwards. */
    onMarkAllRead: () => void;
    /** Calls `PATCH /notifications/:id/read` for the row that was opened. */
    onOpen: (notification: NotificationRow) => void;
}

/**
 * Right-hand notifications drawer per "Admin · Notifications · Drawer"
 * (`5102:20032`), over `GET /notifications`.
 *
 * The frame's list stands — a dot, the title, the body, the time, the
 * unread mark — and the footer link opens the centre, where the type chips
 * and the Preferences card are.
 */
export function NotificationsDrawer({
    open,
    onOpenChange,
    notifications,
    unreadCount,
    loading,
    error,
    live,
    onMarkAllRead,
    onOpen,
}: NotificationsDrawerProps) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[420px]">
                <SheetHeader className="flex-row items-center justify-between space-y-0 border-b px-5 py-4">
                    <SheetTitle className="text-base">
                        Notifications
                        {unreadCount > 0 && (
                            <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground">
                                {unreadCount} new
                            </span>
                        )}
                    </SheetTitle>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="mr-8 h-7 text-xs text-muted-foreground"
                        onClick={onMarkAllRead}
                        disabled={!live || unreadCount === 0}
                    >
                        Mark all read
                    </Button>
                </SheetHeader>

                <div className="scrollbar-thin flex-1 overflow-y-auto">
                    {!live ? (
                        <p className="px-5 py-8 text-sm text-muted-foreground">
                            Notifications are read from the API. Nothing to show while the console runs on
                            fixtures.
                        </p>
                    ) : loading && notifications.length === 0 ? (
                        <p className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                            Loading…
                        </p>
                    ) : error ? (
                        <p className="px-5 py-8 text-sm text-muted-foreground">{error}</p>
                    ) : notifications.length === 0 ? (
                        <p className="px-5 py-8 text-sm text-muted-foreground">
                            Nothing yet. New alerts appear here and on the bell.
                        </p>
                    ) : (
                        notifications.map((notification) => {
                            const inner = (
                                <div
                                    className={cn(
                                        "flex gap-3 border-b px-5 py-4 transition-colors",
                                        notification.href && "hover:bg-muted/50",
                                        !notification.read && "bg-primary/[0.025]"
                                    )}
                                >
                                    <TrafficLight tone={notification.tone} className="mt-1.5" />
                                    <div className="min-w-0 flex-1">
                                        <p
                                            className={cn(
                                                "text-sm text-foreground",
                                                !notification.read && "font-medium"
                                            )}
                                        >
                                            {notification.title}
                                        </p>
                                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                                            {notification.body}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground/80">
                                            {notification.time}
                                        </p>
                                    </div>
                                    {!notification.read && (
                                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                                    )}
                                </div>
                            );
                            return notification.href ? (
                                <Link
                                    key={notification.id}
                                    href={notification.href}
                                    onClick={() => {
                                        onOpen(notification);
                                        onOpenChange(false);
                                    }}
                                    className="block"
                                >
                                    {inner}
                                </Link>
                            ) : (
                                <div key={notification.id}>{inner}</div>
                            );
                        })
                    )}
                </div>

                <div className="border-t px-5 py-3">
                    <Link
                        href="/notifications"
                        onClick={() => onOpenChange(false)}
                        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                        View all notifications
                    </Link>
                </div>
            </SheetContent>
        </Sheet>
    );
}
