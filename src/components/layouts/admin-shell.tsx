"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EnrolmentGate } from "./enrolment-gate";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { useApiResource } from "@/lib/use-api-resource";
import {
    notificationService,
    notificationsReadApi,
    type NotificationFeed,
    type NotificationRow,
} from "@/services/notifications";

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
 * global search palette, the notifications drawer, and (Lot K2) the
 * enrolment gate that holds a session the policy requires an authenticator
 * app of until one is set up.
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

    const openSearch = () => {
        setSearchUsed(true);
        setSearchOpen(true);
    };
    /* The operator's feed — `GET /notifications`, scoped to the caller by
       the server. Read once on arrival for the bell's count and again each
       time the drawer opens, so the number is never older than the last
       look. With the API off there is nothing to read and the bell is quiet. */
    const live = notificationsReadApi();
    const feed = useApiResource<NotificationFeed>(`shell:notifications:${live}`, () =>
        live
            ? notificationService.list({ limit: 20 })
            : Promise.resolve({ items: [], unreadCount: 0, readCount: null })
    );
    const notifications = feed.data?.items ?? [];
    const unreadCount = feed.data?.unreadCount ?? 0;

    const openNotifications = () => {
        setNotificationsUsed(true);
        setNotificationsOpen(true);
        if (live) feed.reload();
    };

    const markAllRead = async () => {
        try {
            await notificationService.markAllRead();
            feed.reload();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not mark the feed read.");
        }
    };

    /** A row opened from the drawer is read; a failure is not worth a toast on the way to the record. */
    const markOpened = (notification: NotificationRow) => {
        if (notification.read) return;
        void notificationService.markRead(notification.id).then(feed.reload, () => undefined);
    };

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
                onOpenSearch={openSearch}
                onOpenNotifications={openNotifications}
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

            <EnrolmentGate />

            {searchUsed && <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />}
            {notificationsUsed && (
                <NotificationsDrawer
                    open={notificationsOpen}
                    onOpenChange={setNotificationsOpen}
                    notifications={notifications}
                    unreadCount={unreadCount}
                    loading={feed.loading}
                    error={feed.error}
                    live={live}
                    onMarkAllRead={() => void markAllRead()}
                    onOpen={markOpened}
                />
            )}
        </div>
    );
}