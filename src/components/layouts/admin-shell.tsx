"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { seedNotifications } from "@/data/platform";
import type { AppNotification } from "@/types";

/**
 * Two overlays that are closed on arrival but were being bundled into every
 * admin route and evaluated on every page load. Loaded on first open instead,
 * then kept mounted so the close animation and internal state behave exactly
 * as before.
 */
const CommandPalette = dynamic(
    () => import("@/components/adx/command-palette").then((m) => m.CommandPalette),
    { ssr: false },
);
const NotificationsDrawer = dynamic(
    () => import("@/components/adx/notifications-drawer").then((m) => m.NotificationsDrawer),
    { ssr: false },
);

/**
 * Admin application frame: fixed header, responsive sidebar,
 * global search palette, and the notifications drawer.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
    const [collapsed, setCollapsed] = React.useState(false);
    const [mobileOpen, setMobileOpen] = React.useState(false);
    const [searchOpen, setSearchOpen] = React.useState(false);
    const [notificationsOpen, setNotificationsOpen] = React.useState(false);
    /* Latch: once an overlay has been opened it stays mounted, so its chunk is
       fetched on first use rather than on every page load. */
    const [searchUsed, setSearchUsed] = React.useState(false);
    const [notificationsUsed, setNotificationsUsed] = React.useState(false);

    React.useEffect(() => {
        if (searchOpen) setSearchUsed(true);
    }, [searchOpen]);
    React.useEffect(() => {
        if (notificationsOpen) setNotificationsUsed(true);
    }, [notificationsOpen]);
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

            {searchUsed && <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />}
            {notificationsUsed && (
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
            )}
        </div>
    );
}