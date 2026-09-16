"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { SimpleTable } from "@/components/adx/simple-table";
import { useAuth } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { CITY_STAGES, CITY_STAGE_LABEL, activeCityCount, geoService, type GeoStateRow } from "@/services/geo";
import { geoHref } from "./geographies-facets";
import { StageChangeDialog, type StageChangeTarget } from "./stage-change-dialog";

/** The capitals of a state: the kinds the bulk launch reaches for. */
export const CAPITAL_KINDS = ["NATIONAL_CAPITAL", "STATE_CAPITAL"] as const;

/**
 * The States tab — `GET /geo/states`, the 36 with counts per stage. Two
 * moves per row: Seed this state (`POST /geo/rollout` with `stateCode`,
 * every city to SEEDING — one the table refuses is skipped and named) and
 * Launch capitals (the state's capitals off `GET /geo/cities?kind=`, then
 * the same confirm with them as a `citySlugs` scope to LAUNCHED). The name
 * opens the Cities tab cut to the state.
 */
export function StatesTab({ nonce }: { nonce: number }) {
    const { can } = useAuth();
    const mayEdit = can("settings.edit");
    const resource = useApiResource<GeoStateRow[]>(`geo:states:${nonce}`, () => geoService.states());
    const [target, setTarget] = React.useState<{ target: StageChangeTarget; stage: "SEEDING" | "LAUNCHED" } | null>(null);
    const [fetchingCapitals, setFetchingCapitals] = React.useState<string | null>(null);

    async function launchCapitals(state: GeoStateRow) {
        setFetchingCapitals(state.code);
        try {
            const page = await geoService.cities({ state: state.code, kind: [...CAPITAL_KINDS], pageSize: 50, sort: "population" });
            if (page.items.length === 0) {
                toast.error(`No capital is catalogued under ${state.name}`, { description: "Add it from the Cities tab, or launch the cities one by one." });
                return;
            }
            setTarget({ target: { kind: "cities", cities: page.items.map((city) => ({ slug: city.slug, name: city.name, stage: city.stage })) }, stage: "LAUNCHED" });
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not read the state's capitals.");
        } finally {
            setFetchingCapitals(null);
        }
    }

    return (
        <ResourceBoundary resource={resource}>
            {(states) => (
                <>
                    <SimpleTable
                        rows={states}
                        rowKey={(row) => row.code}
                        emptyMessage="No state yet — seed the catalogue from the Overview tab."
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
                            { key: "cities", label: "Cities", className: "text-right", render: (row) => <span className="tabular-nums">{formatNumber(row.cities)}</span> },
                            { key: "active", label: "Active", className: "text-right", render: (row) => <span className="tabular-nums">{formatNumber(activeCityCount(row.counts))}</span> },
                            ...CITY_STAGES.map((stage) => ({
                                key: stage,
                                label: CITY_STAGE_LABEL[stage],
                                className: "text-right",
                                render: (row: GeoStateRow) => (
                                    <span className={row.counts[stage] ? "tabular-nums" : "tabular-nums text-muted-foreground/60"}>{formatNumber(row.counts[stage])}</span>
                                ),
                            })),
                            {
                                key: "actions",
                                label: "",
                                className: "text-right",
                                render: (row) => (
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 bg-card"
                                            disabled={!mayEdit || row.cities === 0}
                                            onClick={() => setTarget({ target: { kind: "state", stateCode: row.code, name: row.name, counts: row.counts }, stage: "SEEDING" })}
                                        >
                                            Seed this state
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 bg-card"
                                            disabled={!mayEdit || row.cities === 0 || fetchingCapitals !== null}
                                            onClick={() => void launchCapitals(row)}
                                        >
                                            {fetchingCapitals === row.code ? "Finding…" : "Launch capitals"}
                                        </Button>
                                    </div>
                                ),
                            },
                        ]}
                    />
                    <StageChangeDialog
                        target={target?.target ?? null}
                        initialStage={target?.stage ?? null}
                        onOpenChange={(open) => {
                            if (!open) setTarget(null);
                        }}
                        onDone={resource.reload}
                    />
                </>
            )}
        </ResourceBoundary>
    );
}
