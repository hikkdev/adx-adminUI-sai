"use client";

import * as React from "react";
import Link from "next/link";
import { DatabaseZap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatTile } from "@/components/adx/overview";
import { useAuth } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { CITY_STAGES, CITY_STAGE_LABEL, CITY_STAGE_MEANING, activeCityCount, geoService, isSeeded, type GeoSeedResult, type GeoSummary } from "@/services/geo";
import { settingsReadApi, settingsService, type GeoSettings } from "@/services/settings";
import { GeoSettingsCard } from "./geo-settings-card";
import { geoHref } from "./geographies-facets";
import { UnresolvedCard } from "./unresolved-card";

interface OverviewData {
    summary: GeoSummary;
    /** `settings.geo` off the platform row; null when the backend is older than the section, undefined when the read failed. */
    geo: GeoSettings | null | undefined;
}

/**
 * The Overview tab: `GET /geo/summary` (cities per stage, the states with
 * any activity) and `settings.geo` off `GET /settings/platform`. The seed
 * button is `POST /geo/seed` behind a confirm — the same run as
 * `npm run seed:geo`, six thousand rows, `system.roles` — disabled once the
 * catalogue is the country. The settings card sends the diff only. Lot X-B:
 * the Unresolved spellings card under the states table (`GET
 * /geo/unresolved`) — the typed cities no catalogue row answers to, folded
 * in by an alias or a new city.
 */
export function OverviewTab({ nonce }: { nonce: number }) {
    const settingsLive = settingsReadApi();
    const resource = useApiResource<OverviewData>(`geo:overview:${nonce}:${settingsLive}`, async () => {
        const [summary, settings] = await Promise.all([geoService.summary(), settingsLive ? settingsService.get().catch(() => undefined) : Promise.resolve(undefined)]);
        return { summary, geo: settings === undefined ? undefined : (settings.geo ?? null) };
    });

    return (
        <ResourceBoundary resource={resource}>
            {({ summary, geo }) => (
                <div className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                        {CITY_STAGES.map((stage) => (
                            <StatTile
                                key={stage}
                                label={CITY_STAGE_LABEL[stage]}
                                value={formatNumber(summary.stages[stage])}
                                delta={null}
                                previous={null}
                                hint={CITY_STAGE_MEANING[stage].split(":")[0].replace(/\.$/, "")}
                                href={geoHref("cities", { stage: [stage] })}
                            />
                        ))}
                    </div>

                    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
                        <div className="space-y-5">
                            <div>
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <h3 className="text-sm font-semibold text-foreground">States with activity</h3>
                                    <p className="text-xs text-muted-foreground">
                                        {summary.statesWithActivity} of the states have a city past Planned · {formatNumber(summary.cities)} cities in the catalogue
                                    </p>
                                </div>
                                <SimpleTable
                                    rows={summary.states}
                                    rowKey={(row) => row.code}
                                    emptyMessage="No city is past Planned yet. Seed the catalogue, then start with a state or a city."
                                    columns={[
                                        {
                                            key: "name",
                                            label: "State",
                                            render: (row) => (
                                                <Link href={geoHref("cities", { state: row.code })} className="font-medium text-foreground underline-offset-4 hover:underline">
                                                    {row.name}
                                                </Link>
                                            ),
                                        },
                                        { key: "active", label: "Active", className: "text-right", render: (row) => <span className="tabular-nums">{formatNumber(activeCityCount(row.counts))}</span> },
                                        ...CITY_STAGES.filter((stage) => stage !== "PLANNED").map((stage) => ({
                                            key: stage,
                                            label: CITY_STAGE_LABEL[stage],
                                            className: "text-right",
                                            render: (row: GeoSummary["states"][number]) => <span className="tabular-nums">{formatNumber(row.counts[stage])}</span>,
                                        })),
                                        { key: "planned", label: "Planned", className: "text-right", render: (row) => <span className="tabular-nums text-muted-foreground">{formatNumber(row.counts.PLANNED)}</span> },
                                    ]}
                                />
                            </div>
                            <UnresolvedCard nonce={nonce} onChanged={resource.reload} />
                        </div>

                        <div className="space-y-5">
                            <SeedCard summary={summary} onSeeded={resource.reload} />
                            <GeoSettingsCard geo={geo} onSaved={resource.reload} />
                        </div>
                    </div>
                </div>
            )}
        </ResourceBoundary>
    );
}

/** "36 states, 763 districts, 6,420 cities created; 43 seed rows matched" — the toast after the run. */
export function seedSummarySentence(result: GeoSeedResult): string {
    const parts = [
        `${formatNumber(result.states.created)} states`,
        `${formatNumber(result.districts.created)} districts`,
        `${formatNumber(result.cities.created)} cities created`,
        `${formatNumber(result.cities.matched)} seed rows matched`,
    ];
    if (result.cities.updated) parts.push(`${formatNumber(result.cities.updated)} refreshed`);
    if (result.cities.unmatchedSeed.length) parts.push(`${result.cities.unmatchedSeed.join(", ")} not in the dataset`);
    return parts.join(" · ");
}

function SeedCard({ summary, onSeeded }: { summary: GeoSummary; onSeeded: () => void }) {
    const { can } = useAuth();
    const [confirming, setConfirming] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const seeded = isSeeded(summary);
    const allowed = can("system.roles");

    async function seed() {
        setBusy(true);
        const progress = toast.loading("Seeding the catalogue…", { description: "Six thousand rows in chunks of five hundred; well under a minute." });
        try {
            const result = await geoService.seed();
            toast.success(`Catalogue seeded from ${result.source}`, { id: progress, description: seedSummarySentence(result) });
            setConfirming(false);
            onSeeded();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The seed did not run.", { id: progress });
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card className="rounded-lg border-border p-4 shadow-none">
            <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <DatabaseZap className="size-4 text-muted-foreground" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-foreground">The catalogue</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {seeded
                            ? `${formatNumber(summary.cities)} cities from GeoNames (CC BY 4.0). Running the seed again changes nothing unless the dataset moved.`
                            : `${formatNumber(summary.cities)} cities — the Lot A rows only. Seeding adds every Indian town of 5,000 people or more, Planned, with every switch off.`}
                    </p>
                    <Button className="mt-3" size="sm" variant={seeded ? "outline" : "default"} disabled={seeded || !allowed || busy} onClick={() => setConfirming(true)}>
                        {seeded ? "Already seeded" : "Seed the catalogue"}
                    </Button>
                    {!allowed && !seeded && <p className="mt-1.5 text-xs text-muted-foreground">Needs system.roles — it writes six thousand rows.</p>}
                </div>
            </div>
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title="Seed the geography catalogue?"
                description="The same run as npm run seed:geo: 36 states, 763 districts and about 6,400 towns from the vendored GeoNames cut, every new one Planned with every switch off. The 44 Lot A cities are matched, not duplicated, and keep their stage. Audited GEO_SEEDED."
                confirmLabel="Seed"
                busy={busy}
                onConfirm={() => void seed()}
            />
        </Card>
    );
}
