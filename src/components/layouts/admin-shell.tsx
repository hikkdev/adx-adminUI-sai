"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { CommandPalette } from "@/components/adx/command-palette";
import { NotificationsDrawer } from "@/components/adx/notifications-drawer";
import { seedNotifications } from "@/data/platform";
import type { AppNotification } from "@/types";

/**
 * Admin application frame: fixed header, collapsible sidebar,
 * global search palette, and the notifications drawer.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
    const [collapsed, setCollapsed] = React.useState(false);
    const [searchOpen, setSearchOpen] = React.useState(false);
    const [notificationsOpen, setNotificationsOpen] = React.useState(false);
    const [notifications, setNotifications] =
        React.useState<AppNotification[]>(seedNotifications);

    const unreadCount = notifications.filter((notification) => !notification.read).length;

    return (
        <div className="min-h-screen bg-canvas">
            <Header
                onToggleSidebar={() => setCollapsed((value) => !value)}
                onOpenSearch={() => setSearchOpen(true)}
                onOpenNotifications={() => setNotificationsOpen(true)}
                unreadCount={unreadCount}
            />
            <Sidebar collapsed={collapsed} />
            <main
                className={cn(
                    "min-h-screen pt-[57px] transition-[padding-left] duration-200",
                    collapsed ? "pl-[68px]" : "pl-[243px]"
                )}
            >
                <div className="mx-auto max-w-[1680px] p-6">{children}</div>
            </main>

            <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
            <NotificationsDrawer
                open={notificationsOpen}
                onOpenChange={setNotificationsOpen}
                notifications={notifications}
                onMarkAllRead={() =>
                    setNotifications((items) =>
                        items.map((item) => ({ ...item, read: true }))
                    )
                }
            />
        </div>
    );
}
