"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { formatDateTime } from "@/lib/format";
import { actionLabel, actorName, auditService, diffRows, cellText, type AuditRow } from "@/services/audit";

export interface ActivityTarget {
    /** Model name as the backend writes it — `Publisher`, `Listing`, `AgentProfile`. */
    type: string;
    id: string;
}

interface ActivityTimelineProps {
    /**
     * Every (type, id) pair that names this record. Usually one; the agent
     * page passes two, because the hand-written rows say `AgentProfile` and
     * the generic admin-write tap says `Agent` for the same id.
     */
    targets: ActivityTarget[];
    /** "this publisher", "this listing" — for the empty line. */
    noun: string;
}

/** Newest first, whichever target the row came in under. */
export function mergeTimelines(pages: { items: AuditRow[] }[]): AuditRow[] {
    const seen = new Set<string>();
    const rows: AuditRow[] = [];
    for (const page of pages) {
        for (const row of page.items) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            rows.push(row);
        }
    }
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * The Activity tab on a record — every audit row that named it, read from
 * `GET /audit/targets/:targetType/:targetId`.
 *
 * One component for the publisher, advertiser, agent and listing pages, so
 * they cannot each grow a different idea of what a timeline looks like.
 * With the API off it says so: there is no fixture of somebody else's
 * history, on purpose.
 */
export function ActivityTimeline({ targets, noun }: ActivityTimelineProps) {
    const live = isLive("audit");
    const key = `audit:targets:${targets.map((target) => `${target.type}/${target.id}`).join(",")}:${live}`;
    const resource = useApiResource<AuditRow[] | null>(key, async () => {
        if (!live) return null;
        const pages = await Promise.all(targets.map((target) => auditService.target(target.type, target.id)));
        return mergeTimelines(pages);
    });

    if (!live) {
        return (
            <Card className="rounded-lg border-dashed border-border p-5 shadow-none">
                <p className="text-sm text-muted-foreground">
                    Activity reads the audit log on the ADX backend. Connect the console to see who did what to {noun}.
                </p>
            </Card>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(rows) => (
                <Card className="rounded-lg border-border p-5 shadow-none">
                    {rows && rows.length ? (
                        <ul className="space-y-4">
                            {rows.map((row) => {
                                const changes = diffRows(row.diff);
                                return (
                                    <li key={row.id} className="flex items-start gap-3 text-sm">
                                        <InitialsAvatar name={actorName(row)} size="sm" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-foreground">
                                                <span className="font-medium">{actorName(row)}</span> · {actionLabel(row.action)}
                                            </p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</p>
                                            {changes.length > 0 && (
                                                <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                                                    {changes.map((change) => (
                                                        <li key={change.field} className="font-mono">
                                                            {change.field}: {cellText(change.before)} → {cellText(change.after)}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <p className="py-6 text-center text-sm text-muted-foreground">No admin activity on {noun} yet.</p>
                    )}
                    <p className="mt-4 text-xs text-muted-foreground">
                        The whole trail is at{" "}
                        <Link href="/audit" className="underline underline-offset-2 hover:text-foreground">
                            Audit log
                        </Link>
                        .
                    </p>
                </Card>
            )}
        </ResourceBoundary>
    );
}
