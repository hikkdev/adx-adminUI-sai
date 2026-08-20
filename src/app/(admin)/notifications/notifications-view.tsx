"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowUpRight, Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { TrafficLight } from "@/components/adx/status-badge";
import {
    ActiveFilters,
    FilterPanel,
    type Facet,
    type FilterSelection,
} from "@/components/adx/filter-panel";
import { cn } from "@/lib/utils";
import type { AppNotification, Tone } from "@/types";

interface NotificationsViewProps {
    notifications: AppNotification[];
}

const CHANNELS = [
    { id: "disputes", label: "Disputes and SLA breaches" },
    { id: "kyc", label: "KYC submissions" },
    { id: "finance", label: "Withdrawals and payout runs" },
    { id: "moderation", label: "Creative review" },
    { id: "tasks", label: "Task assignments" },
] as const;

const toneOrder: Record<Tone, number> = {
    danger: 0,
    warning: 1,
    info: 2,
    success: 3,
    neutral: 4,
};

export function NotificationsView({ notifications: seed }: NotificationsViewProps) {
    const [items, setItems] = React.useState(seed);
    const [selection, setSelection] = React.useState<FilterSelection>({ read: ["unread"] });
    const [prefs, setPrefs] = React.useState<Record<string, { email: boolean; push: boolean }>>(
        () =>
            Object.fromEntries(
                CHANNELS.map((channel) => [
                    channel.id,
                    { email: channel.id !== "tasks", push: true },
                ])
            )
    );

    const unread = items.filter((item) => !item.read);

    const facets: Facet[] = React.useMemo(
        () => [
            {
                id: "read",
                label: "Read state",
                type: "single",
                options: [
                    { value: "unread", label: "Unread", count: items.filter((i) => !i.read).length },
                    { value: "read", label: "Read", count: items.filter((i) => i.read).length },
                ],
            },
            {
                id: "severity",
                label: "Severity",
                options: (["danger", "warning", "info", "success"] as Tone[]).map((tone) => ({
                    value: tone,
                    label:
                        tone === "danger"
                            ? "Critical"
                            : tone[0].toUpperCase() + tone.slice(1),
                    count: items.filter((i) => i.severity === tone).length,
                })),
            },
        ],
        [items]
    );

    const visible = React.useMemo(() => {
        const read = selection.read ?? [];
        const severities = selection.severity ?? [];
        return items
            .filter((item) =>
                read.includes("unread") ? !item.read : read.includes("read") ? item.read : true
            )
            .filter((item) => (severities.length ? severities.includes(item.severity) : true))
            .slice()
            .sort((a, b) => toneOrder[a.severity] - toneOrder[b.severity]);
    }, [items, selection]);

    const markRead = (id: string) =>
        setItems((current) =>
            current.map((item) => (item.id === id ? { ...item, read: true } : item))
        );

    const markAllRead = () => {
        setItems((current) => current.map((item) => ({ ...item, read: true })));
        toast.success("All notifications marked as read");
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title="Notifications"
                subtitle={
                    unread.length
                        ? `${unread.length} unread`
                        : "Nothing unread"
                }
                actions={
                    <Button
                        variant="outline"
                        className="bg-card"
                        onClick={markAllRead}
                        disabled={!unread.length}
                    >
                        <CheckCheck className="size-4" />
                        Mark all read
                    </Button>
                }
            />

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <Card className="rounded-lg border-border shadow-none">
                    <div className="space-y-2.5 border-b px-4 py-3">
                        <FilterPanel
                            facets={facets}
                            selection={selection}
                            onChange={setSelection}
                            resultCount={visible.length}
                        />
                        <ActiveFilters
                            facets={facets}
                            selection={selection}
                            onChange={setSelection}
                            resultCount={visible.length}
                        />
                    </div>

                    {visible.length ? (
                        <ul className="divide-y">
                            {visible.map((item) => (
                                <li
                                    key={item.id}
                                    className={cn(
                                        "flex gap-3 px-5 py-4",
                                        !item.read && "bg-muted/30"
                                    )}
                                >
                                    <TrafficLight tone={item.severity} className="mt-1.5" />
                                    <div className="min-w-0 flex-1">
                                        <p
                                            className={cn(
                                                "text-sm text-foreground",
                                                item.read ? "font-medium" : "font-semibold"
                                            )}
                                        >
                                            {item.title}
                                        </p>
                                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                            {item.body}
                                        </p>
                                        <div className="mt-2 flex flex-wrap items-center gap-3">
                                            <span className="text-xs text-muted-foreground">
                                                {item.time}
                                            </span>
                                            {item.href && (
                                                <Link
                                                    href={item.href}
                                                    onClick={() => markRead(item.id)}
                                                    className="inline-flex items-center gap-0.5 text-xs font-medium text-primary underline-offset-4 hover:underline"
                                                >
                                                    Open
                                                    <ArrowUpRight className="size-3" />
                                                </Link>
                                            )}
                                            {!item.read && (
                                                <button
                                                    type="button"
                                                    onClick={() => markRead(item.id)}
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
                                You are all caught up
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                New alerts appear here and in the bell.
                            </p>
                        </div>
                    )}
                </Card>

                <SectionCard title="Preferences" contentClassName="px-5 py-1">
                    <ul className="divide-y">
                        {CHANNELS.map((channel) => (
                            <li key={channel.id} className="py-3">
                                <p className="text-sm font-medium text-foreground">
                                    {channel.label}
                                </p>
                                <div className="mt-2 flex items-center gap-5">
                                    {(["email", "push"] as const).map((medium) => (
                                        <label
                                            key={medium}
                                            className="flex items-center gap-2 text-xs text-muted-foreground"
                                        >
                                            <Switch
                                                checked={prefs[channel.id][medium]}
                                                onCheckedChange={(checked) =>
                                                    setPrefs((current) => ({
                                                        ...current,
                                                        [channel.id]: {
                                                            ...current[channel.id],
                                                            [medium]: checked,
                                                        },
                                                    }))
                                                }
                                                aria-label={`${channel.label} by ${medium}`}
                                            />
                                            {medium === "email" ? "Email" : "Push"}
                                        </label>
                                    ))}
                                </div>
                            </li>
                        ))}
                    </ul>
                </SectionCard>
            </div>
        </div>
    );
}
