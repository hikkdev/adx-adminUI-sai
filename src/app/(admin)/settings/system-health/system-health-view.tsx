"use client";

import { Check, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import type { StatusMeta } from "@/types";

type ServiceState = "operational" | "degraded" | "outage";

const stateMeta: Record<ServiceState, StatusMeta> = {
    operational: { label: "Operational", tone: "success" },
    degraded: { label: "Degraded", tone: "warning" },
    outage: { label: "Outage", tone: "danger" },
};

interface ServiceRow {
    name: string;
    state: ServiceState;
    metric: string;
    metricLabel: string;
    /** 30 daily states, oldest first: 0 ok, 1 degraded, 2 outage. */
    history: number[];
}

const seed = (bad: number[], worse: number[] = []): number[] =>
    Array.from({ length: 30 }, (_, index) =>
        worse.includes(index) ? 2 : bad.includes(index) ? 1 : 0
    );

const services: ServiceRow[] = [
    { name: "API gateway", state: "operational", metric: "142ms", metricLabel: "p95 latency", history: seed([11]) },
    { name: "Payments", state: "operational", metric: "98.2%", metricLabel: "success rate", history: seed([4, 18]) },
    { name: "Order routing", state: "degraded", metric: "612ms", metricLabel: "p95 latency", history: seed([22, 27, 28, 29]) },
    { name: "KYC verification", state: "operational", metric: "1.2s", metricLabel: "avg decision", history: seed([9]) },
    { name: "Notifications", state: "operational", metric: "99.4%", metricLabel: "delivery rate", history: seed([15]) },
    { name: "Map tiles", state: "outage", metric: "Down", metricLabel: "unreachable", history: seed([25, 26], [28, 29]) },
];

const incidentUpdates = [
    { time: "09:04", body: "Rollout of the fix is in progress across three shards." },
    { time: "08:52", body: "Root cause identified: a slow query in the assignment service." },
    { time: "08:36", body: "Investigating reports of delayed order dispatch." },
];

const regions = [
    { region: "Bengaluru (primary)", status: stateMeta.operational, latency: "142ms", errorRate: "0.02%", lastIncident: "12 days ago" },
    { region: "Mumbai (replica)", status: stateMeta.degraded, latency: "612ms", errorRate: "0.31%", lastIncident: "today" },
];

const historyClasses = ["bg-success/70", "bg-warning", "bg-danger"];

export function SystemHealthView() {
    return (
        <div className="space-y-5">
            <PageHeader
                title="System health"
                subtitle="All regions"
                actions={
                    <>
                        <Button
                            variant="outline"
                            className="bg-card"
                            onClick={() => toast.success("Subscribed to status updates")}
                        >
                            Subscribe
                        </Button>
                        <Button
                            variant="outline"
                            className="bg-card"
                            onClick={() => toast.info("Incident history opens here.")}
                        >
                            Incident history
                        </Button>
                    </>
                }
            />

            <div className="flex items-center gap-3 rounded-lg border border-warning/20 bg-warning-soft px-4 py-3">
                <TriangleAlert className="size-4 shrink-0 text-warning" />
                <p className="flex-1 text-sm text-foreground">
                    2 of 6 services need attention. Overall uptime this quarter:
                    <span className="ml-1 font-semibold">99.98%</span>
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {services.map((service) => (
                    <Card key={service.name} className="rounded-lg border-border p-5 shadow-none">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold text-foreground">{service.name}</h3>
                            <StatusBadge status={stateMeta[service.state]} />
                        </div>
                        <p className="mt-3 text-metric text-foreground">{service.metric}</p>
                        <p className="text-xs text-muted-foreground">{service.metricLabel}</p>
                        <div className="mt-4 flex h-6 items-end gap-[2px]">
                            {service.history.map((state, index) => (
                                <span
                                    key={index}
                                    className={cn(
                                        "h-full flex-1 rounded-[1px]",
                                        historyClasses[state]
                                    )}
                                />
                            ))}
                        </div>
                        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                            <span>30 days ago</span>
                            <span>Today</span>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <div className="flex items-center gap-2">
                        <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning">
                            Investigating
                        </span>
                        <span className="text-xs text-muted-foreground">Started 08:34 IST</span>
                    </div>
                    <h3 className="mt-2 text-base font-semibold text-foreground">
                        Order dispatch delayed by 30 to 60s
                    </h3>
                    <ul className="mt-4 space-y-3 border-l pl-4">
                        {incidentUpdates.map((update) => (
                            <li key={update.time} className="text-sm">
                                <span className="font-medium text-foreground">{update.time}</span>{" "}
                                <span className="text-muted-foreground">{update.body}</span>
                            </li>
                        ))}
                    </ul>
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-4 h-8 bg-card"
                        onClick={() => toast.info("Full incident timeline opens here.")}
                    >
                        View full incident
                    </Button>
                </Card>

                <Card className="overflow-hidden rounded-lg border-border shadow-none">
                    <h3 className="px-5 pb-3 pt-4 text-base font-semibold text-foreground">Regions</h3>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-y bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-5 py-2.5">Region</th>
                                <th className="px-5 py-2.5">Status</th>
                                <th className="px-5 py-2.5 text-right">P95 latency</th>
                                <th className="px-5 py-2.5 text-right">Error rate</th>
                                <th className="px-5 py-2.5 text-right">Last incident</th>
                            </tr>
                        </thead>
                        <tbody>
                            {regions.map((row) => (
                                <tr key={row.region} className="border-b last:border-0">
                                    <td className="px-5 py-3 font-medium text-foreground">{row.region}</td>
                                    <td className="px-5 py-3">
                                        <StatusBadge status={row.status} />
                                    </td>
                                    <td className="px-5 py-3 text-right tabular-nums">{row.latency}</td>
                                    <td className="px-5 py-3 text-right tabular-nums">{row.errorRate}</td>
                                    <td className="px-5 py-3 text-right text-muted-foreground">
                                        {row.lastIncident}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="flex items-center gap-1.5 px-5 py-3 text-xs text-muted-foreground">
                        <Check className="size-3.5 text-success" />
                        Failover to the Mumbai replica is automatic above a 2% error rate.
                    </p>
                </Card>
            </div>
        </div>
    );
}
