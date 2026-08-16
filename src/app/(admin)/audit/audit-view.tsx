"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/adx/filter-chips";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { SimpleTable } from "@/components/adx/simple-table";
import type { AuditEvent } from "@/types";

interface AuditViewProps {
    events: AuditEvent[];
}

type ChipValue = "all" | "Finance" | "Verification" | "Content" | "Listings" | "Settings" | "Support";

export function AuditView({ events }: AuditViewProps) {
    const [chip, setChip] = React.useState<ChipValue>("all");

    const visible = chip === "all" ? events : events.filter((event) => event.module === chip);

    const countBy = (module: string) =>
        events.filter((event) => event.module === module).length;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Audit log"
                subtitle="Every privileged action, immutably recorded"
                actions={
                    <Button
                        variant="outline"
                        className="bg-card"
                        onClick={() => toast.success("Audit log exported for compliance")}
                    >
                        Export
                    </Button>
                }
            />

            <FilterChips<ChipValue>
                value={chip}
                onChange={setChip}
                chips={[
                    { value: "all", label: "All", count: events.length },
                    { value: "Finance", label: "Finance", count: countBy("Finance") },
                    { value: "Verification", label: "Verification", count: countBy("Verification") },
                    { value: "Content", label: "Content", count: countBy("Content") },
                    { value: "Listings", label: "Listings", count: countBy("Listings") },
                    { value: "Settings", label: "Settings", count: countBy("Settings") },
                ]}
            />

            <SimpleTable<AuditEvent>
                rows={visible}
                rowKey={(event) => event.id}
                emptyMessage="No events in this module yet."
                columns={[
                    {
                        key: "timestamp",
                        label: "Timestamp",
                        render: (event) => (
                            <span className="whitespace-nowrap text-muted-foreground">{event.at}</span>
                        ),
                    },
                    {
                        key: "actor",
                        label: "Actor",
                        render: (event) => (
                            <div className="flex items-center gap-2">
                                <InitialsAvatar name={event.actor} size="sm" />
                                <div>
                                    <p className="font-medium text-foreground">{event.actor}</p>
                                    <p className="text-xs text-muted-foreground">{event.actorRole}</p>
                                </div>
                            </div>
                        ),
                    },
                    {
                        key: "action",
                        label: "Action",
                        render: (event) => <span className="text-foreground">{event.action}</span>,
                    },
                    {
                        key: "object",
                        label: "Object",
                        render: (event) => (
                            <span className="text-muted-foreground">{event.target}</span>
                        ),
                    },
                    {
                        key: "scope",
                        label: "Scope",
                        render: (event) => (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                {event.module}
                            </span>
                        ),
                    },
                    {
                        key: "ip",
                        label: "IP",
                        render: (event) => (
                            <span className="text-xs text-muted-foreground">{event.ip}</span>
                        ),
                    },
                ]}
            />
        </div>
    );
}
