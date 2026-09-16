"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import type { ApiResource } from "@/lib/use-api-resource";
import {
    ALLOWED_MOVES,
    CITY_KIND_LABEL,
    CITY_STAGE_LABEL,
    CITY_STAGE_MEANING,
    CITY_STAGE_TONE,
    CITY_SWITCHES,
    CITY_SWITCH_META,
    READINESS_LABEL,
    failingChecks,
    geoService,
    rolloutActorLabel,
    stateNameOf,
    type CityCounts,
    type CityReadiness,
    type CityStage,
    type CitySwitch,
    type GeoCityDetail,
    type RolloutEvent,
} from "@/services/geo";
import { AliasDialog } from "./alias-dialog";
import { StageChangeDialog, type StageChangeTarget } from "./stage-change-dialog";

export interface CityPanelProps {
    detail: GeoCityDetail;
    /** `GET /geo/cities/:slug/readiness` — read beside the detail; its loading and failure are the checklist's, not the panel's. */
    readiness: Pick<ApiResource<CityReadiness>, "data" | "loading" | "error">;
    onChanged: () => void;
    /** `settings.edit` — without it the transitions and the toggles are drawn disabled. */
    mayEdit: boolean;
    /** In the drawer: tighter, with a link to the full page. */
    compact?: boolean;
}

/** The transition's button label — the verb, not the stage. */
export const MOVE_LABEL: Record<CityStage, string> = {
    PLANNED: "Plan",
    SEEDING: "Start seeding",
    LAUNCHED: "Launch",
    PAUSED: "Pause",
    WITHDRAWN: "Withdraw",
};

/**
 * Where a count leads — the sections whose overview takes `?city=`
 * (publishers, advertisers, agents, print partners: the window picker
 * keeps it in the URL and the read narrows on it). Listings and leads have
 * no city facet on the console, so those counts stay plain numbers.
 */
export function countHref(key: keyof CityCounts, cityName: string): string | null {
    const city = encodeURIComponent(cityName);
    switch (key) {
        case "publishers":
            return `/publishers?city=${city}`;
        case "advertisers":
            return `/advertisers?city=${city}`;
        case "agents":
            return `/agents?city=${city}`;
        case "printPartners":
            return `/print-partners?city=${city}`;
        default:
            return null;
    }
}

const COUNT_LABEL: Record<keyof CityCounts, string> = {
    publishers: "Publishers",
    listingsLive: "Listings live",
    listingsTotal: "Listings total",
    advertisers: "Advertisers",
    agents: "Agents",
    printPartners: "Print partners",
    openLeads: "Open leads",
};

const COUNT_ORDER: (keyof CityCounts)[] = ["publishers", "listingsLive", "listingsTotal", "advertisers", "agents", "printPartners", "openLeads"];

/** The wind-down's own marker event, which is a WITHDRAWN → WITHDRAWN row with `flags.marker`. */
export function isWindDownMarker(event: RolloutEvent): boolean {
    const flags = event.flags as { marker?: unknown } | null;
    return event.fromStage === "WITHDRAWN" && event.toStage === "WITHDRAWN" && flags?.marker === "WIND_DOWN_DONE";
}

/**
 * One city, whatever frame it is in — V-C. The stage with its allowed
 * transitions as buttons, the six switches as toggles that PATCH on their
 * own, the readiness checklist drawn ahead of Launch with the failing
 * checks named (Launch waits on it and, while a check fails, is offered as
 * "Launch anyway" — the server never refuses, so the console asks twice
 * rather than not at all; Y-B's soft `audience` check is printed with the
 * profile's basis and never counted), the seven counts linking into the sections that
 * take a city, the timeline of moves, the aliases (still pricing's PATCH)
 * and the note the last move carried.
 */
export function CityPanel({ detail, readiness, onChanged, mayEdit, compact = false }: CityPanelProps) {
    const [target, setTarget] = React.useState<{ target: StageChangeTarget; stage: CityStage } | null>(null);
    const [editingAliases, setEditingAliases] = React.useState(false);
    const [busySwitch, setBusySwitch] = React.useState<CitySwitch | null>(null);

    const moves = ALLOWED_MOVES[detail.stage];
    const launchOffered = moves.includes("LAUNCHED");
    /* Y-B: a soft check (audience) is printed but never counted — it never gates Launch anyway. */
    const failing = readiness.data ? failingChecks(readiness.data) : [];
    const launchGated = launchOffered && (readiness.loading || (readiness.data !== null && !readiness.data.ready));

    const openMove = (stage: CityStage) => setTarget({ target: { kind: "city", city: { slug: detail.slug, name: detail.name, stage: detail.stage } }, stage });

    async function flip(key: CitySwitch, value: boolean) {
        setBusySwitch(key);
        try {
            await geoService.rollout(detail.slug, { [key]: value });
            toast.success(`${CITY_SWITCH_META[key].label} ${value ? "on" : "off"} in ${detail.name}`, { description: CITY_SWITCH_META[key].gates });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : `Could not change ${CITY_SWITCH_META[key].label}.`);
        } finally {
            setBusySwitch(null);
        }
    }

    const stamps = [
        detail.launchedAt ? `Launched ${formatDate(detail.launchedAt)}` : null,
        detail.pausedAt ? `Paused ${formatDate(detail.pausedAt)}` : null,
        detail.withdrawnAt ? `Withdrawn ${formatDate(detail.withdrawnAt)}` : null,
    ].filter((line): line is string => line !== null);

    return (
        <div className={cn("space-y-4", compact ? "text-sm" : "")}>
            {/* Identity */}
            <Card className="rounded-lg border-border p-4 shadow-none">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={{ label: CITY_STAGE_LABEL[detail.stage], tone: CITY_STAGE_TONE[detail.stage] }} />
                            {detail.kind && <span className="text-xs text-muted-foreground">{CITY_KIND_LABEL[detail.kind]}</span>}
                            {detail.source === "MANUAL" && <span className="text-xs text-muted-foreground">added by hand</span>}
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{CITY_STAGE_MEANING[detail.stage]}</p>
                        <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                            <div className="flex gap-2">
                                <dt>State</dt>
                                <dd className="text-foreground">{stateNameOf(detail) ?? "—"}</dd>
                            </div>
                            <div className="flex gap-2">
                                <dt>District</dt>
                                <dd className="text-foreground">{detail.geoDistrict?.name ?? "—"}</dd>
                            </div>
                            <div className="flex gap-2">
                                <dt>Population</dt>
                                <dd className="text-foreground tabular-nums">{detail.population === null ? "—" : formatNumber(detail.population)}</dd>
                            </div>
                            <div className="flex gap-2">
                                <dt>Slug</dt>
                                <dd>
                                    <code className="rounded bg-muted px-1 py-0.5 text-foreground">{detail.slug}</code>
                                </dd>
                            </div>
                            {stamps.map((line) => (
                                <div key={line} className="text-foreground">
                                    {line}
                                </div>
                            ))}
                        </dl>
                        {detail.rolloutNote && <p className="mt-3 text-xs text-muted-foreground">Last note: “{detail.rolloutNote}”</p>}
                    </div>
                    {compact && (
                        <Button variant="outline" size="sm" className="bg-card" asChild>
                            <Link href={`/settings/geographies/${encodeURIComponent(detail.slug)}`}>Open page</Link>
                        </Button>
                    )}
                </div>

                {/* Transitions */}
                <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="stage-moves">
                    {moves.map((stage) => {
                        const isLaunch = stage === "LAUNCHED";
                        const gated = isLaunch && launchGated;
                        return (
                            <Button
                                key={stage}
                                size="sm"
                                variant={stage === "WITHDRAWN" ? "destructive" : isLaunch ? "default" : "outline"}
                                className={cn(stage !== "WITHDRAWN" && !isLaunch && "bg-card")}
                                disabled={!mayEdit || (isLaunch && readiness.loading)}
                                onClick={() => openMove(stage)}
                                aria-label={gated && !readiness.loading ? "Launch anyway" : MOVE_LABEL[stage]}
                                title={gated && failing.length ? `${failing.length} readiness check${failing.length === 1 ? "" : "s"} failing` : undefined}
                            >
                                {isLaunch && readiness.loading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden /> : null}
                                {isLaunch && gated && !readiness.loading ? `Launch anyway (${failing.length} failing)` : MOVE_LABEL[stage]}
                            </Button>
                        );
                    })}
                    {moves.length === 0 && <span className="text-xs text-muted-foreground">No move from here.</span>}
                    {!mayEdit && <span className="text-xs text-muted-foreground">Moving a city needs settings.edit.</span>}
                </div>
            </Card>

            {/* Readiness — ahead of Launch */}
            {launchOffered && (
                <Card className="rounded-lg border-border p-4 shadow-none" data-testid="readiness">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ready to launch?</h3>
                        {readiness.data && (
                            <StatusBadge
                                status={readiness.data.ready ? { label: "Ready", tone: "success" } : { label: `${failing.length} failing`, tone: "warning" }}
                            />
                        )}
                    </div>
                    {readiness.loading && !readiness.data ? (
                        <p className="mt-2 text-xs text-muted-foreground">Checking…</p>
                    ) : readiness.error ? (
                        <p className="mt-2 text-xs text-danger">{readiness.error}</p>
                    ) : readiness.data ? (
                        <ul className="mt-2 space-y-1.5">
                            {readiness.data.checks.map((check) => (
                                <li key={check.key} className="flex items-start gap-2 text-sm" data-testid={`check-${check.key}`}>
                                    {check.ok ? (
                                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="ok" />
                                    ) : check.soft ? (
                                        <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="soft" />
                                    ) : (
                                        <XCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-label="failing" />
                                    )}
                                    <div className="min-w-0">
                                        <p className={cn("font-medium", check.ok || check.soft ? "text-foreground" : "text-warning")}>
                                            {READINESS_LABEL[check.key]}
                                            {check.soft ? <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">soft — never counted</span> : null}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{check.detail}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">Advisory: the server never refuses a launch. A failing check is named here so the launch is a decision, not a surprise.</p>
                </Card>
            )}

            {/* Switches */}
            <Card className="rounded-lg border-border p-4 shadow-none">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Switches</h3>
                <ul className="mt-2 divide-y">
                    {CITY_SWITCHES.map((key) => (
                        <li key={key} className="flex items-center justify-between gap-4 py-2.5">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">{CITY_SWITCH_META[key].label}</p>
                                <p className="text-xs text-muted-foreground">{CITY_SWITCH_META[key].gates}</p>
                            </div>
                            <Switch
                                checked={detail.switches[key]}
                                disabled={!mayEdit || busySwitch !== null}
                                onCheckedChange={(value) => flip(key, value)}
                                aria-label={`${CITY_SWITCH_META[key].label} in ${detail.name}`}
                            />
                        </li>
                    ))}
                </ul>
            </Card>

            {/* Counts */}
            <Card className="rounded-lg border-border p-4 shadow-none">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In this city</h3>
                <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {COUNT_ORDER.map((key) => {
                        const href = countHref(key, detail.name);
                        const value = formatNumber(detail.counts[key]);
                        return (
                            <div key={key}>
                                <dt className="text-xs text-muted-foreground">{COUNT_LABEL[key]}</dt>
                                <dd className="text-lg font-semibold tabular-nums text-foreground">
                                    {href ? (
                                        <Link href={href} className="underline-offset-4 hover:underline" aria-label={`${COUNT_LABEL[key]} in ${detail.name}`}>
                                            {value}
                                        </Link>
                                    ) : (
                                        value
                                    )}
                                </dd>
                            </div>
                        );
                    })}
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">Matched on each party's free-text city against the name, the slug and the aliases.</p>
            </Card>

            {/* Aliases */}
            <Card className="rounded-lg border-border p-4 shadow-none">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Also written as</h3>
                    <Button variant="outline" size="sm" className="bg-card" onClick={() => setEditingAliases(true)}>
                        Edit
                    </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                    {detail.aliases.length ? (
                        detail.aliases.map((alias) => (
                            <span key={alias} className="rounded-full border bg-card px-2 py-0.5 text-xs text-foreground">
                                {alias}
                            </span>
                        ))
                    ) : (
                        <span className="text-xs text-muted-foreground">No other spelling yet.</span>
                    )}
                </div>
            </Card>

            {/* Timeline */}
            <Card className="rounded-lg border-border p-4 shadow-none">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rollout timeline</h3>
                {detail.events.length === 0 ? (
                    <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <CircleDashed className="size-3.5" aria-hidden /> No move yet.
                    </p>
                ) : (
                    <ol className="mt-2 space-y-2">
                        {detail.events.map((event) => {
                            const marker = isWindDownMarker(event);
                            return (
                                <li key={event.id} className="flex items-start gap-2 text-sm">
                                    {marker ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden /> : <span className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />}
                                    <div className="min-w-0">
                                        <p className="text-foreground">
                                            {marker ? (
                                                "Wind-down done"
                                            ) : (
                                                <>
                                                    {CITY_STAGE_LABEL[event.fromStage]} → <span className="font-medium">{CITY_STAGE_LABEL[event.toStage]}</span>
                                                </>
                                            )}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDateTime(event.at)} · by <span className="font-medium text-foreground">{rolloutActorLabel(event)}</span>
                                            {event.note ? ` · “${event.note}”` : ""}
                                        </p>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </Card>

            <StageChangeDialog
                target={target?.target ?? null}
                initialStage={target?.stage ?? null}
                onOpenChange={(open) => {
                    if (!open) setTarget(null);
                }}
                onDone={onChanged}
            />
            <AliasDialog
                city={editingAliases ? { slug: detail.slug, name: detail.name, aliases: detail.aliases } : null}
                onOpenChange={(open) => {
                    if (!open) setEditingAliases(false);
                }}
                onSaved={onChanged}
            />
        </div>
    );
}
