"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { TrafficLight } from "@/components/adx/status-badge";
import type { AppNotification } from "@/types";

interface NotificationsDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    notifications: AppNotification[];
    onMarkAllRead: () => void;
}

/** Right-hand notifications drawer per "Admin · Notifications · Drawer". */
export function NotificationsDrawer({
    open,
    onOpenChange,
    notifications,
    onMarkAllRead,
}: NotificationsDrawerProps) {
    const unread = notifications.filter((notification) => !notification.read).length;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[420px]">
                <SheetHeader className="flex-row items-center justify-between space-y-0 border-b px-5 py-4">
                    <SheetTitle className="text-base">
                        Notifications
                        {unread > 0 && (
                            <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground">
                                {unread} new
                            </span>
                        )}
                    </SheetTitle>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="mr-8 h-7 text-xs text-muted-foreground"
                        onClick={onMarkAllRead}
                        disabled={unread === 0}
                    >
                        Mark all read
                    </Button>
                </SheetHeader>

                <div className="scrollbar-thin flex-1 overflow-y-auto">
                    {notifications.map((notification) => {
                        const inner = (
                            <div
                                className={cn(
                                    "flex gap-3 border-b px-5 py-4 transition-colors",
                                    notification.href && "hover:bg-muted/50",
                                    !notification.read && "bg-primary/[0.025]"
                                )}
                            >
                                <TrafficLight tone={notification.severity} className="mt-1.5" />
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
                                onClick={() => onOpenChange(false)}
                                className="block"
                            >
                                {inner}
                            </Link>
                        ) : (
                            <div key={notification.id}>{inner}</div>
                        );
                    })}
                </div>

                <div className="border-t px-5 py-3">
                    <Link
                        href="/audit"
                        onClick={() => onOpenChange(false)}
                        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                        View full activity in the audit log
                    </Link>
                </div>
            </SheetContent>
        </Sheet>
    );
}
