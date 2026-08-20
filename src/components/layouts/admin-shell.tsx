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
 * Admin application frame: fixed header, responsive sidebar,
 * global search palette, and the notifications drawer.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
    const [collapsed, setCollapsed] = React.useState(false);
    const [mobileOpen, setMobileOpen] = React.useState(false);
    const [searchOpen, setSearchOpen] = React.useState(false);
    const [notificationsOpen, setNotificationsOpen] = React.useState(false);
    const [notifications, setNotifications] =
        React.useState<AppNotification[]>(seedNotifications);

    const unreadCount = notifications.filter((notification) => !notification.read).length;

    const handleToggleSidebar = () => {
        if (window.matchMedia("(min-width: 768px)").matches) {
            setCollapsed((value) => !value);
            return;
        }
        setMobileOpen((value) => !value);
    };

    return (
        <div className="min-h-screen bg-canvas">
            <Header
                onToggleSidebar={handleToggleSidebar}
                onOpenSearch={() => setSearchOpen(true)}
                onOpenNotifications={() => setNotificationsOpen(true)}
                unreadCount={unreadCount}
            />

            {mobileOpen && (
                <button
                    type="button"
                    aria-label="Close navigation"
                    className="fixed inset-0 top-[57px] z-20 bg-foreground/20 md:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            <Sidebar
                collapsed={collapsed}
                mobileOpen={mobileOpen}
                onNavigate={() => setMobileOpen(false)}
            />
            <main
                className={cn(
                    "min-h-screen pt-[57px] md:transition-[padding-left] md:duration-200",
                    collapsed ? "md:pl-[68px]" : "md:pl-[243px]"
                )}
            >
                <div className="mx-auto max-w-[1680px] p-4 sm:p-6">{children}</div>
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