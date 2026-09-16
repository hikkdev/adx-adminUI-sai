"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/adx/filter-chips";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { StatusBadge } from "@/components/adx/status-badge";
import { useApiResource } from "@/lib/use-api-resource";
import { formatDateTime } from "@/lib/format";
import {
    HEALTH_SERVICE_LABEL,
    INCIDENT_SEVERITY_META,
    INCIDENT_STATUS_META,
    healthService,
    type Incident,
    type IncidentStatus,
    type IncidentsPage,
} from "@/services/health";

type Chip = "all" | IncidentStatus;

const PAGE_SIZE = 50;

/**
 * Lot G (Q130): the frame's "Incident history" — `GET /settings/system-health/
 * incidents` under the list contract, a chip per status with the counts the
 * server computed with the facet removed, each incident opened in place to
 * show its updates oldest first. The buttons hand the row back to the page,
 * which owns the update and resolve dialogs.
 */
export function IncidentHistory({
    nonce,
    onUpdate,
    onResolve,
}: {
    /** Bumped by the page after any write, so the list re-reads. */
    nonce: number;
    onUpdate: (incident: Incident) => void;
    onResolve: (incident: Incident) => void;
}) {
    const [chip, setChip] = React.useState<Chip>("all");
    const [openId, setOpenId] = React.useState<string | null>(null);

    const resource = useApiResource<IncidentsPage>(`health:incidents:${chip}:${nonce}`, () =>
        healthService.incidents({ status: chip === "all" ? undefined : [chip], sort: "newest", pageSize: PAGE_SIZE }),
    );

    return (
        <ResourceBoundary resource={resource}>
            {(page) => {
                const counts = page.counts;
                const all = Object.values(counts).reduce((total, n) => total + n, 0);
                return (
                    <div className="space-y-3">
                        <FilterChips<Chip>
                            value={chip}
                            onChange={setChip}
                            chips={[
                                { value: "all", label: "All", count: all },
                                { value: "OPEN", label: "Investigating", count: counts.OPEN ?? 0 },
                                { value: "MONITORING", label: "Monitoring", count: counts.MONITORING ?? 0 },
                                { value: "RESOLVED", label: "Resolved", count: counts.RESOLVED ?? 0 },
                            ]}
                        />
                        <Card className="overflow-hidden rounded-lg border-border shadow-none">
                            {page.items.length === 0 ? (
                                <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                                    {all === 0 ? "No incident has been declared yet." : "No incident in this state."}
                                </p>
                            ) : (
                                <ul className="divide-y">
                                    {page.items.map((incident) => {
                                        const open = openId === incident.id;
                                        return (
                                            <li key={incident.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => setOpenId(open ? null : incident.id)}
                                                    className="flex w-full items-start justify-between gap-4 px-5 py-3 text-left hover:bg-muted/40"
                                                    aria-expanded={open}
                                                >
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <StatusBadge status={INCIDENT_STATUS_META[incident.status]} />
                                                            <StatusBadge status={INCIDENT_SEVERITY_META[incident.severity]} />
                                                            <span className="text-sm font-medium text-foreground">{incident.title}</span>
                                                        </div>
                                                        <p className="mt-1 text-xs text-muted-foreground">
                                                            Started {formatDateTime(incident.startedAt)}
                                                            {incident.resolvedAt ? ` · resolved ${formatDateTime(incident.resolvedAt)}` : ""}
                                                            {incident.services.length
                                                                ? ` · ${incident.services.map((service) => HEALTH_SERVICE_LABEL[service]).join(", ")}`
                                                                : " · no service named"}
                                                        </p>
                                                    </div>
                                                    <span className="shrink-0 text-xs text-muted-foreground">
                                                        {incident.updates.length} {incident.updates.length === 1 ? "update" : "updates"}
                                                    </span>
                                                </button>
                                                {open && (
                                                    <div className="space-y-3 border-t bg-muted/20 px-5 py-4">
                                                        <UpdatesList incident={incident} />
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <Button size="sm" variant="outline" className="h-8 bg-card" onClick={() => onUpdate(incident)}>
                                                                Add update
                                                            </Button>
                                                            {incident.status !== "RESOLVED" && (
                                                                <Button size="sm" className="h-8" onClick={() => onResolve(incident)}>
                                                                    Resolve
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </Card>
                        {page.total > page.items.length && (
                            <p className="text-xs text-muted-foreground">
                                Showing the newest {page.items.length} of {page.total}.
                            </p>
                        )}
                    </div>
                );
            }}
        </ResourceBoundary>
    );
}

/** The frame's timeline: a time and a note per update, newest first as drawn. */
export function UpdatesList({ incident, className }: { incident: Incident; className?: string }) {
    const updates = [...incident.updates].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    if (updates.length === 0) return <p className={className ?? "text-xs text-muted-foreground"}>No update yet.</p>;
    return (
        <ol className={className ?? "space-y-2 border-l-2 pl-4"}>
            {updates.map((update) => (
                <li key={update.id} className="text-sm">
                    <span className="mr-2 font-medium tabular-nums text-foreground">{formatDateTime(update.at)}</span>
                    <span className="mr-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{INCIDENT_STATUS_META[update.status].label}</span>
                    <span className="text-muted-foreground">{update.body}</span>
                </li>
            ))}
        </ol>
    );
}
