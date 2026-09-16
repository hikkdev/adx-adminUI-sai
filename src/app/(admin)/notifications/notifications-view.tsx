"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowUpRight, Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { TrafficLight } from "@/components/adx/status-badge";
import { cn } from "@/lib/utils";
import {
    NOTIFICATION_CHANNEL_LABEL,
    NOTIFICATION_TYPES,
    NOTIFICATION_TYPE_LABEL,
    notificationService,
    preferenceMatrix,
    type NotificationFeed,
    type NotificationRow,
    type NotificationType,
    type PreferenceRow,
} from "@/services/notifications";
import type { NotificationsFacets } from "./notifications-loader";

interface NotificationsViewProps {
    feed: NotificationFeed;
    preferences: PreferenceRow[] | null;
    facets: NotificationsFacets;
    onFacetsChange: (facets: NotificationsFacets) => void;
    /** Re-read after a row or the whole feed is marked read. */
    onChanged: () => void;
}

/**
 * DR 10's notification centre (`5102:39414`), over `GET /notifications`.
 *
 * The frame's page stands: the header with the unread count and Mark all
 * read, the list with a dot, a title, a body, the time, Open and Mark read
 * on every row, and the Preferences card on the right. The list is cut by
 * the read-state chip and the kind chips — both `?` the server takes — and
 * the frame's severity facet is gone, because no notification carries one.
 * The Preferences card is the operator's own matrix, every kind on every
 * channel, written cell by cell; a Required cell is the server's rule,
 * not the console's.
 */
export function NotificationsView({ feed, preferences, facets, onFacetsChange, onChanged }: NotificationsViewProps) {
    const [busy, setBusy] = React.useState(false);

    const markRead = async (row: NotificationRow) => {
        try {
            await notificationService.markRead(row.id);
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not mark it read.");
        }
    };

    const markAllRead = async () => {
        setBusy(true);
        try {
            await notificationService.markAllRead();
            toast.success("All notifications marked as read");
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not mark the feed read.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title="Notifications"
                subtitle={feed.unreadCount ? `${feed.unreadCount} unread` : "Nothing unread"}
                actions={
                    <Button
                        variant="outline"
                        className="bg-card"
                        onClick={() => void markAllRead()}
                        disabled={busy || !feed.unreadCount}
                    >
                        <CheckCheck className="size-4" />
                        Mark all read
                    </Button>
                }
            />

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <Card className="rounded-lg border-border shadow-none">
                    <div className="space-y-2.5 border-b px-4 py-3">
                        <FilterChips<"unread" | "all">
                            value={facets.unreadOnly ? "unread" : "all"}
                            onChange={(next) => onFacetsChange({ ...facets, unreadOnly: next === "unread" })}
                            /* E10-1: both counts are the whole feed's, so "All" says how many it would show. */
                            chips={[
                                { value: "unread", label: "Unread", count: feed.unreadCount },
                                {
                                    value: "all",
                                    label: "All",
                                    ...(feed.readCount === null ? {} : { count: feed.unreadCount + feed.readCount }),
                                },
                            ]}
                        />
                        <FilterChips<NotificationType | "ALL">
                            value={facets.type}
                            onChange={(next) => onFacetsChange({ ...facets, type: next })}
                            chips={[
                                { value: "ALL", label: "Every kind" },
                                ...NOTIFICATION_TYPES.map((type) => ({ value: type, label: NOTIFICATION_TYPE_LABEL[type] })),
                            ]}
                        />
                        <p className="text-xs text-muted-foreground">
                            {feed.items.length} {feed.items.length === 1 ? "result" : "results"}
                        </p>
                    </div>

                    {feed.items.length ? (
                        <ul className="divide-y">
                            {feed.items.map((item) => (
                                <li
                                    key={item.id}
                                    className={cn("flex gap-3 px-5 py-4", !item.read && "bg-muted/30")}
                                >
                                    <TrafficLight tone={item.tone} className="mt-1.5" />
                                    <div className="min-w-0 flex-1">
                                        <p
                                            className={cn(
                                                "text-sm text-foreground",
                                                item.read ? "font-medium" : "font-semibold"
                                            )}
                                        >
                                            {item.title}
                                        </p>
                                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>
                                        <div className="mt-2 flex flex-wrap items-center gap-3">
                                            <span className="text-xs text-muted-foreground">{item.time}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {NOTIFICATION_TYPE_LABEL[item.type]}
                                            </span>
                                            {item.href && (
                                                <Link
                                                    href={item.href}
                                                    onClick={() => {
                                                        if (!item.read) void markRead(item);
                                                    }}
                                                    className="inline-flex items-center gap-0.5 text-xs font-medium text-primary underline-offset-4 hover:underline"
                                                >
                                                    Open
                                                    <ArrowUpRight className="size-3" />
                                                </Link>
                                            )}
                                            {!item.read && (
                                                <button
                                                    type="button"
                                                    onClick={() => void markRead(item)}
                                                    className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                                                >
                                                    Mark read
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="px-5 py-16 text-center">
                            <Bell className="mx-auto size-5 text-muted-foreground" />
                            <p className="mt-3 text-sm font-medium text-foreground">
                                {facets.unreadOnly && facets.type === "ALL"
                                    ? "You are all caught up"
                                    : "Nothing matches these chips"}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                New alerts appear here and in the bell.
                            </p>
                        </div>
                    )}
                </Card>

                <PreferencesCard rows={preferences} />
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Preferences                                                         */
/* ------------------------------------------------------------------ */

/**
 * The operator's own matrix — `GET /notifications/preferences`, every kind
 * on every channel, and one `PUT` per switch. The switch moves at once and
 * moves back if the server refuses, so the card never claims a preference
 * the backend does not hold.
 */
function PreferencesCard({ rows }: { rows: PreferenceRow[] | null }) {
    const [cells, setCells] = React.useState<PreferenceRow[]>(rows ?? []);
    const [saving, setSaving] = React.useState<string | null>(null);

    const groups = preferenceMatrix(cells);

    const flip = async (cell: PreferenceRow, enabled: boolean) => {
        const key = `${cell.type}:${cell.channel}`;
        const previous = cells;
        setCells((current) =>
            current.map((row) => (row.type === cell.type && row.channel === cell.channel ? { ...row, enabled } : row))
        );
        setSaving(key);
        try {
            await notificationService.savePreferences([{ type: cell.type, channel: cell.channel, enabled }]);
        } catch (error) {
            setCells(previous);
            toast.error(error instanceof Error ? error.message : "Could not save the preference.");
        } finally {
            setSaving(null);
        }
    };

    if (rows === null) {
        return (
            <SectionCard title="Preferences" contentClassName="px-5 py-4">
                <p className="text-sm text-muted-foreground">
                    The preference matrix could not be read. Reload to try again.
                </p>
            </SectionCard>
        );
    }

    return (
        <SectionCard title="Preferences" contentClassName="px-5 py-1">
            <ul className="divide-y">
                {groups.map((group) => (
                    <li key={group.type} className="py-3">
                        <p className="text-sm font-medium text-foreground">{group.label}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                            {group.channels.map((cell) => {
                                const key = `${cell.type}:${cell.channel}`;
                                return (
                                    <label
                                        key={cell.channel}
                                        className="flex items-center gap-2 text-xs text-muted-foreground"
                                    >
                                        <Switch
                                            checked={cell.enabled}
                                            disabled={cell.mandatory || saving === key}
                                            onCheckedChange={(checked) => void flip(cell, checked)}
                                            aria-label={`${group.label} by ${NOTIFICATION_CHANNEL_LABEL[cell.channel]}`}
                                        />
                                        {NOTIFICATION_CHANNEL_LABEL[cell.channel]}
                                        {cell.mandatory && (
                                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                                                Required
                                            </span>
                                        )}
                                    </label>
                                );
                            })}
                        </div>
                    </li>
                ))}
            </ul>
            <p className="border-t py-3 text-xs text-muted-foreground">
                In-app is the list the bell counts. Push, email and SMS are delivered as each rail is
                configured; a Required cell is a sign-in code or a service notice and cannot be switched
                off.
            </p>
        </SectionCard>
    );
}
