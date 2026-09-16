"use client";

import * as React from "react";
import { Bell, Check, History, RefreshCw, Siren, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    HEALTH_SERVICE_LABEL,
    INCIDENT_SEVERITY_META,
    INCIDENT_STATUS_META,
    PUBLIC_STATUS_META,
    healthService,
    historyBars,
    opsCards,
    publicStatusUrl,
    regionErrorRate,
    regionLastIncident,
    serviceBars,
    uptimeLabel,
    uptimePct,
    type HealthDay,
    type HealthServiceName,
    type HistoryBar,
    type Incident,
    type IncidentStatus,
    type JobHeartbeat,
    type Probe,
    type RegionStatus,
    type ServiceDayBar,
} from "@/services/health";
import type { StatusMeta } from "@/types";
import { DeclareIncidentDialog, IncidentUpdateDialog } from "./incident-dialogs";
import { IncidentHistory, UpdatesList } from "./incident-history";
import type { HealthCheck, HealthPage } from "./system-health-loader";

const UP: StatusMeta = { label: "Operational", tone: "success" };
const DOWN: StatusMeta = { label: "Outage", tone: "danger" };

interface ServiceCard {
    /** Which sampled series the strip under the card draws (Lot G, Q130). */
    service: HealthServiceName;
    name: string;
    status: StatusMeta;
    metric: string;
    metricLabel: string;
}

/** The three things the probe can speak for, as cards. */
export function serviceCards(check: HealthCheck): ServiceCard[] {
    if (!check.reachable) {
        return [
            { service: "API", name: "API", status: DOWN, metric: "Down", metricLabel: check.error },
            { service: "POSTGRES", name: "Postgres", status: { label: "Unknown", tone: "neutral" }, metric: "—", metricLabel: "not probed; the API did not answer" },
            { service: "REDIS", name: "Redis", status: { label: "Unknown", tone: "neutral" }, metric: "—", metricLabel: "not probed; the API did not answer" },
        ];
    }
    const { readiness } = check;
    const probe = (service: HealthServiceName, name: string, result: Probe): ServiceCard =>
        result.ok
            ? { service, name, status: UP, metric: `${result.latencyMs}ms`, metricLabel: "ping" }
            : { service, name, status: DOWN, metric: "Down", metricLabel: result.error };
    return [
        { service: "API", name: "API", status: UP, metric: uptimeLabel(readiness.uptime), metricLabel: "up since the last restart" },
        probe("POSTGRES", "Postgres", readiness.postgres),
        probe("REDIS", "Redis", readiness.redis),
    ];
}

interface SystemHealthViewProps {
    page: HealthPage;
    refreshing: boolean;
    onRefresh: () => void;
}

/**
 * "System Health · /settings/system-health" on DR 10 (5102:46544): the
 * title, Subscribe and Incident history, the attention banner, a card per
 * service with its status pill, one big number and a strip of thirty
 * day-bars, then the incident card beside the regions table. The probe
 * fills the first row — the API, its database, its cache — with Storage
 * from the public status read, and Lot E's ops read fills a second: the
 * last backup, the last restore drill, what retention has flagged, and
 * whether every job is still ticking.
 *
 * Lot G (package CG4, Q130) gave the frame's remaining parts their source.
 * The strip under every service card is that service's thirty days of
 * five-minute samples off `/settings/system-health/history` (`services`),
 * a bar per Indian day toned by the share that passed; the API's 5xx strip
 * stays beside it. The incident card and Incident history read
 * `/settings/system-health/incidents`, with Declare, Add update and
 * Resolve over its POST and PATCH routes. The regions table reads
 * `/regions` — one region until there is a second deployment, the round
 * trips live. Subscribe posts to the public status page's own
 * `POST /status/subscribe`; G11-2: the ops read carries
 * `subscribers { confirmed, pending }`, printed beside the button.
 */
export function SystemHealthView({ page, refreshing, onRefresh }: SystemHealthViewProps) {
    const { check, ops, history, status, regions, openIncidents } = page;
    const [declaring, setDeclaring] = React.useState(false);
    const [updating, setUpdating] = React.useState<{ incident: Incident; status: IncidentStatus } | null>(null);
    const [subscribing, setSubscribing] = React.useState(false);
    const [showHistory, setShowHistory] = React.useState(false);
    const [historyNonce, setHistoryNonce] = React.useState(0);

    const probes = serviceCards(check);
    const storage = status?.services.find((row) => row.service === "STORAGE") ?? null;
    const storageCard: ServiceCard = {
        service: "STORAGE",
        name: "Storage",
        status: storage ? PUBLIC_STATUS_META[storage.status] : { label: "Unknown", tone: "neutral" },
        metric: storage && storage.latencyMs !== null ? `${storage.latencyMs}ms` : "—",
        metricLabel: storage?.sampledAt ? `bucket probe, sampled ${formatDateTime(storage.sampledAt)}` : "no sample yet — the status read did not answer",
    };
    const services = [...probes, storageCard];
    const housekeeping = ops.ok ? opsCards(ops.value) : [];
    const bars = historyBars(history);
    const cards = [...services, ...housekeeping];
    const failing = cards.filter((card) => card.status.tone === "danger").length;
    const warning = cards.filter((card) => card.status.tone === "warning").length;
    const allUp = check.reachable && check.readiness.ok && ops.ok && failing === 0 && warning === 0;

    /* The banner's uptime: every sampled service's thirty days, averaged. */
    const sampled = Object.values(history?.services ?? {}).map((series) => uptimePct(series?.days));
    const withData = sampled.filter((value): value is number => value !== null);
    const uptime = withData.length ? Math.round((withData.reduce((sum, value) => sum + value, 0) / withData.length) * 100) / 100 : null;

    const newestOpen = openIncidents?.[0] ?? null;
    const subscribers = ops.ok ? (ops.value.subscribers ?? null) : null;

    const changed = () => {
        onRefresh();
        setHistoryNonce((n) => n + 1);
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title="System health"
                subtitle={`${regions?.[0]?.region ? `${regions[0].region} · ` : ""}Checked ${formatDateTime(check.checkedAt)}`}
                actions={
                    <>
                        <span className="inline-flex items-center gap-2">
                            <Button variant="outline" className="bg-card" onClick={() => setSubscribing(true)}>
                                <Bell className="size-4" aria-hidden />
                                Subscribe
                            </Button>
                            {subscribers && (
                                <span className="text-xs tabular-nums text-muted-foreground" data-testid="status-subscribers">
                                    {subscribers.confirmed} confirmed{subscribers.pending > 0 ? ` · ${subscribers.pending} pending` : ""}
                                </span>
                            )}
                        </span>
                        <Button variant="outline" className="bg-card" onClick={() => setShowHistory((value) => !value)} aria-expanded={showHistory}>
                            <History className="size-4" aria-hidden />
                            Incident history
                        </Button>
                        <Button variant="outline" className="bg-card" onClick={() => setDeclaring(true)}>
                            <Siren className="size-4" aria-hidden />
                            Declare incident
                        </Button>
                        <Button variant="outline" className="bg-card" onClick={onRefresh} disabled={refreshing}>
                            <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} aria-hidden />
                            Check again
                        </Button>
                    </>
                }
            />

            {allUp ? (
                <div className="flex items-center gap-3 rounded-lg border border-success/20 bg-success-soft px-4 py-3">
                    <Check className="size-4 shrink-0 text-success" />
                    <p className="flex-1 text-sm text-foreground">
                        The API, Postgres, Redis and storage all answered; the backups, the drill, retention and the jobs are in order.
                        {uptime !== null && (
                            <>
                                {" "}
                                Overall uptime over 30 days: <strong>{uptime}%</strong>
                            </>
                        )}
                    </p>
                </div>
            ) : (
                <div className="flex items-center gap-3 rounded-lg border border-warning/20 bg-warning-soft px-4 py-3">
                    <TriangleAlert className="size-4 shrink-0 text-warning" />
                    <p className="flex-1 text-sm text-foreground">
                        {failing + warning} of {cards.length} services need attention.
                        {check.reachable ? " The API is up and reported the state itself." : " The API did not answer at all."}
                        {!ops.ok && ` The ops read failed: ${ops.error}`}
                        {uptime !== null && (
                            <>
                                {" "}
                                Overall uptime over 30 days: <strong>{uptime}%</strong>
                            </>
                        )}
                    </p>
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {services.map((card) => (
                    <Card key={card.name} className="rounded-lg border-border p-5 shadow-none">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold text-foreground">{card.name}</h3>
                            <StatusBadge status={card.status} />
                        </div>
                        <p className="mt-3 text-metric text-foreground">{card.metric}</p>
                        <p className="text-xs text-muted-foreground">{card.metricLabel}</p>
                        <ServiceStrip service={card.service} days={history?.services?.[card.service]?.days} />
                        {/* The 5xx strip belongs to the API: the counts are its answers. */}
                        {card.service === "API" && bars.length > 0 && <HistoryStrip bars={bars} total={history?.serverErrors.total ?? 0} />}
                    </Card>
                ))}
            </div>

            <section className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">Housekeeping</h2>
                {ops.ok ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {housekeeping.map((card) => (
                            <Card key={card.id} className="rounded-lg border-border p-5 shadow-none">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-sm font-semibold text-foreground">{card.name}</h3>
                                    <StatusBadge status={card.status} />
                                </div>
                                <p className="mt-3 text-metric text-foreground">{card.metric}</p>
                                <p className="text-xs text-muted-foreground">{card.metricLabel}</p>
                                {card.detail && <p className="mt-2 text-xs text-muted-foreground">{card.detail}</p>}
                                {card.id === "jobs" && <ServiceStrip service="JOBS" days={history?.services?.JOBS?.days} />}
                            </Card>
                        ))}
                    </div>
                ) : (
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <p className="text-sm text-muted-foreground">
                            The backup, drill, retention and job state could not be read: {ops.error}
                        </p>
                    </Card>
                )}
                {ops.ok && ops.value.jobs.length > 0 && <JobsTable jobs={ops.value.jobs} />}
            </section>

            <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                <IncidentCard
                    incident={newestOpen}
                    failed={openIncidents === null}
                    others={openIncidents ? openIncidents.length - 1 : 0}
                    onDeclare={() => setDeclaring(true)}
                    onUpdate={(incident) => setUpdating({ incident, status: incident.status })}
                    onResolve={(incident) => setUpdating({ incident, status: "RESOLVED" })}
                    onHistory={() => setShowHistory(true)}
                />
                <RegionsTable regions={regions} />
            </div>

            {showHistory && (
                <section className="space-y-3" id="incident-history">
                    <h2 className="text-sm font-semibold text-foreground">Incident history</h2>
                    <IncidentHistory
                        nonce={historyNonce}
                        onUpdate={(incident) => setUpdating({ incident, status: incident.status === "RESOLVED" ? "MONITORING" : incident.status })}
                        onResolve={(incident) => setUpdating({ incident, status: "RESOLVED" })}
                    />
                </section>
            )}

            <DeclareIncidentDialog open={declaring} onOpenChange={setDeclaring} onSaved={changed} />
            <IncidentUpdateDialog
                incident={updating?.incident ?? null}
                initialStatus={updating?.status ?? "OPEN"}
                onOpenChange={(open) => {
                    if (!open) setUpdating(null);
                }}
                onSaved={changed}
            />
            <SubscribeDialog open={subscribing} onOpenChange={setSubscribing} subscribers={subscribers} />
        </div>
    );
}

/**
 * Lot G (Q130): thirty Indian days of one service's five-minute samples —
 * "30 days ago" on the left, "Today" on the right, a bar per day toned by
 * the share of samples that passed, grey for a day with none. Not drawn at
 * all when the backend served no series for the service.
 */
function ServiceStrip({ service, days }: { service: HealthServiceName; days: HealthDay[] | undefined }) {
    const bars: ServiceDayBar[] = serviceBars(days);
    if (bars.length === 0) return null;
    const uptime = uptimePct(days);
    return (
        <div className="mt-4" data-testid={`service-strip-${service}`}>
            <div className="flex gap-0.5" role="img" aria-label={`${HEALTH_SERVICE_LABEL[service]}: ${uptime ?? 0}% of samples passed over ${bars.length} days`}>
                {bars.map((bar) => (
                    <span
                        key={bar.date}
                        title={`${formatDate(bar.date)}: ${bar.okPct === null ? "no sample" : `${bar.okPct}% passed`}${
                            bar.p95Ms !== null ? ` · p95 ${bar.p95Ms}ms` : ""
                        }`}
                        className={cn(
                            "h-3 flex-1 rounded-[2px]",
                            bar.tone === "success" && "bg-success",
                            bar.tone === "warning" && "bg-warning",
                            bar.tone === "danger" && "bg-danger",
                            bar.tone === "neutral" && "bg-muted",
                        )}
                    />
                ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>{bars.length} days ago</span>
                <span>{uptime === null ? "no samples yet" : `${uptime}% passed`} · Today</span>
            </div>
        </div>
    );
}

/** The frame's thirty day-bars for server errors — "30 days ago" on the left, "Today" on the right. */
function HistoryStrip({ bars, total }: { bars: HistoryBar[]; total: number }) {
    return (
        <div className="mt-3" data-testid="history-strip">
            <div className="flex gap-0.5" role="img" aria-label={`${total} server errors in the last ${bars.length} days`}>
                {bars.map((bar) => (
                    <span
                        key={bar.day}
                        title={`${formatDate(bar.day)}: ${bar.count} server error${bar.count === 1 ? "" : "s"}`}
                        className={cn("h-1.5 flex-1 rounded-[2px]", bar.tone === "danger" ? "bg-danger" : "bg-success/40")}
                    />
                ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>5xx</span>
                <span>
                    {total} server error{total === 1 ? "" : "s"} in {bars.length} days
                </span>
            </div>
        </div>
    );
}

/**
 * The frame's incident card: the newest open incident with its status
 * pill, when it started, its title and its timeline, then the actions.
 * With nothing open it says so and offers to declare one.
 */
function IncidentCard({
    incident,
    failed,
    others,
    onDeclare,
    onUpdate,
    onResolve,
    onHistory,
}: {
    incident: Incident | null;
    /** The incident read failed, which is different from nothing being open. */
    failed: boolean;
    /** How many more are open beside this one. */
    others: number;
    onDeclare: () => void;
    onUpdate: (incident: Incident) => void;
    onResolve: (incident: Incident) => void;
    onHistory: () => void;
}) {
    if (failed) {
        return (
            <Card className="rounded-lg border-border p-5 shadow-none">
                <p className="text-sm text-muted-foreground">The incident list could not be read.</p>
            </Card>
        );
    }
    if (!incident) {
        return (
            <Card className="flex flex-col justify-between gap-4 rounded-lg border-border p-5 shadow-none">
                <div>
                    <div className="flex items-center gap-2">
                        <StatusBadge status={{ label: "No open incident", tone: "success" }} />
                    </div>
                    <p className="mt-3 text-sm text-foreground">Nothing is being investigated or watched.</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        An incident declared here goes on the public status page and to every confirmed subscriber; the services it names read Degraded there
                        until it is resolved.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-8 bg-card" onClick={onDeclare}>
                        Declare incident
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={onHistory}>
                        View history
                    </Button>
                </div>
            </Card>
        );
    }
    return (
        <Card className="flex flex-col gap-4 rounded-lg border-border p-5 shadow-none">
            <div>
                <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={INCIDENT_STATUS_META[incident.status]} />
                    <StatusBadge status={INCIDENT_SEVERITY_META[incident.severity]} />
                    <span className="text-xs text-muted-foreground">Started {formatDateTime(incident.startedAt)}</span>
                    {incident.services.length > 0 && (
                        <span className="text-xs text-muted-foreground">· {incident.services.map((service) => HEALTH_SERVICE_LABEL[service]).join(", ")}</span>
                    )}
                </div>
                <h3 className="mt-3 text-base font-semibold text-foreground">{incident.title}</h3>
            </div>
            <UpdatesList incident={incident} className="space-y-2 border-l-2 pl-4" />
            <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 bg-card" onClick={() => onUpdate(incident)}>
                    Add update
                </Button>
                <Button size="sm" className="h-8" onClick={() => onResolve(incident)}>
                    Resolve
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={onHistory}>
                    {others > 0 ? `${others} more open · view history` : "View full history"}
                </Button>
            </div>
        </Card>
    );
}

/**
 * The frame's regions table over `GET /settings/system-health/regions`:
 * one row until there is a second deployment, the round trips live. G13-B/C:
 * the frame's Error rate and Last incident columns are drawn off the row —
 * `errorRatePct` (the 5xx share of the last 24 hours' requests, from the
 * request logger's hourly counters) and `lastIncidentAt` (the newest
 * incident naming any service, resolved or not); the latency columns are
 * the read's own.
 */
function RegionsTable({ regions }: { regions: RegionStatus[] | null }) {
    return (
        <Card className="overflow-hidden rounded-lg border-border shadow-none">
            <div className="border-b px-5 py-3">
                <h3 className="text-sm font-semibold text-foreground">Regions</h3>
            </div>
            {regions === null ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">The regions read failed.</p>
            ) : (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                            <th className="px-5 py-2.5 font-medium">Region</th>
                            <th className="px-4 py-2.5 font-medium">Status</th>
                            <th className="px-4 py-2.5 text-right font-medium">API p95</th>
                            <th className="px-4 py-2.5 text-right font-medium">Postgres</th>
                            <th className="px-4 py-2.5 text-right font-medium">Redis</th>
                            <th className="px-4 py-2.5 text-right font-medium">Error rate</th>
                            <th className="px-4 py-2.5 text-right font-medium">Last incident</th>
                        </tr>
                    </thead>
                    <tbody>
                        {regions.map((region) => {
                            const down = region.latency.postgresMs === null || region.latency.redisMs === null;
                            const errorRate = regionErrorRate(region);
                            const lastIncident = regionLastIncident(region);
                            return (
                                <tr key={region.region} className="border-b last:border-0">
                                    <td className="px-5 py-3 font-medium text-foreground">
                                        {region.region}
                                        {region.current && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(this deployment)</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge status={down ? { label: "Degraded", tone: "warning" } : { label: "Operational", tone: "success" }} />
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                                        {region.latency.apiP95Ms === null ? "—" : `${region.latency.apiP95Ms}ms`}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                                        {region.latency.postgresMs === null ? "down" : `${region.latency.postgresMs}ms`}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                                        {region.latency.redisMs === null ? "down" : `${region.latency.redisMs}ms`}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums" title="5xx share of the requests served in the last 24 hours">
                                        <span className={cn(errorRate.tone === "danger" && "text-danger", errorRate.tone === "warning" && "text-warning", (errorRate.tone === "success" || errorRate.tone === "neutral") && "text-muted-foreground")}>
                                            {errorRate.text}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                                        {lastIncident ? formatDateTime(lastIncident) : "none yet"}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
            <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">
                {regions?.[0] ? `Round trips measured ${formatDateTime(regions[0].checkedAt)}. ` : ""}One region until there is a second deployment; there is no
                failover to describe yet.
            </p>
        </Card>
    );
}

/**
 * Subscribe: the public status page's own form, posted anonymously. The
 * server answers the same for a new and a known address and never says
 * which, so the toast repeats its words. The subscriber count is on the
 * ops read (G11-2) and printed beside the button; the page itself is
 * linked for the rest.
 */
function SubscribeDialog({ open, onOpenChange, subscribers }: { open: boolean; onOpenChange: (open: boolean) => void; subscribers: { confirmed: number; pending: number } | null }) {
    const [email, setEmail] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

    const submit = async () => {
        setBusy(true);
        try {
            const { message } = await healthService.subscribe(email.trim().toLowerCase());
            toast.success("Subscription requested", { description: message });
            setEmail("");
            onOpenChange(false);
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "The subscription was refused.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Subscribe to status updates</DialogTitle>
                    <DialogDescription>
                        The public status page mails every incident update to a confirmed address. Confirm-first: nothing is sent until the mailbox clicks
                        the link. Five requests an hour per address.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-1.5">
                    <Label htmlFor="sub-email">Email</Label>
                    <Input id="sub-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="oncall@example.com" autoFocus />
                </div>
                <p className="text-xs text-muted-foreground">
                    The page itself is public at{" "}
                    <a href={publicStatusUrl()} target="_blank" rel="noreferrer" className="font-mono text-foreground underline-offset-4 hover:underline">
                        {publicStatusUrl()}
                    </a>
                    .{" "}
                    {subscribers
                        ? `${subscribers.confirmed} address${subscribers.confirmed === 1 ? "" : "es"} confirmed, ${subscribers.pending} waiting on the mailbox.`
                        : "This backend does not report how many addresses are subscribed."}
                </p>
                <DialogFooter>
                    <Button variant="outline" className="bg-card" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => void submit()} disabled={busy || !valid}>
                        {busy ? "Sending…" : "Subscribe"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function JobsTable({ jobs }: { jobs: JobHeartbeat[] }) {
    return (
        <Card className="overflow-hidden rounded-lg border-border shadow-none">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                        <th className="px-4 py-2.5 font-medium">Job</th>
                        <th className="px-4 py-2.5 font-medium">Last tick</th>
                        <th className="px-4 py-2.5 font-medium">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {jobs.map((job) => (
                        <tr key={job.job} className="border-b last:border-0">
                            <td className="px-4 py-2.5 font-mono text-xs text-foreground">{job.job}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                                {job.lastTickAt
                                    ? `${formatDateTime(job.lastTickAt)}${job.staleMinutes !== null ? ` · ${job.staleMinutes}m ago` : ""}`
                                    : "Never"}
                            </td>
                            <td className="px-4 py-2.5">
                                <StatusBadge status={job.stale ? { label: "Silent", tone: "danger" } : { label: "Ticking", tone: "success" }} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </Card>
    );
}
