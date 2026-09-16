"use client";

import * as React from "react";
import { RefreshCw, SpellCheck, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { SimpleTable } from "@/components/adx/simple-table";
import { useAuth } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import {
    CITY_KEYED_TABLES,
    CITY_KEYED_TABLE_LABEL,
    backfillSummary,
    geoService,
    type CityKeyBackfillReport,
    type GeoStateRow,
    type GeoUnresolved,
    type UnresolvedCity,
} from "@/services/geo";
import { AddCityDialog } from "./add-city-dialog";
import { AliasOfDialog } from "./alias-of-dialog";

/** "Publishers 3 · Leads 12" — where a spelling's rows are, in the tables' fixed order, the empty ones left out. */
export function tablesSentence(tables: UnresolvedCity["tables"]): string {
    return CITY_KEYED_TABLES.filter((table) => (tables[table] ?? 0) > 0)
        .map((table) => `${CITY_KEYED_TABLE_LABEL[table]} ${formatNumber(tables[table] ?? 0)}`)
        .join(" · ");
}

/** "14 rows under 3 spellings no catalogue city answers to." — the card's one-line count. */
export function unresolvedSummary(data: Pick<GeoUnresolved, "total" | "rows">): string {
    if (data.total === 0) return "Every typed city resolves to a catalogue city.";
    return `${formatNumber(data.rows)} ${data.rows === 1 ? "row" : "rows"} under ${formatNumber(data.total)} ${data.total === 1 ? "spelling" : "spellings"} no catalogue city answers to.`;
}

/**
 * Lot X-B: the Unresolved spellings card on Geographies › Overview —
 * `GET /geo/unresolved`, the typed city strings across the eight party
 * tables that carry no key, biggest first. Two ways to fold one in: teach
 * a catalogue city the spelling ("Add as alias of…", pricing's alias
 * PATCH, which keys the rows as it saves) or add the place itself ("Add as
 * a city", `POST /geo/cities` with the name filled). There is no route for
 * the backfill — after a city is added by hand the rows are keyed by
 * `npm run backfill:city-keys` on the backend, so the card says so and
 * offers a re-read instead.
 */
export function UnresolvedCard({ nonce, onChanged }: { nonce: number; onChanged: () => void }) {
    const { can } = useAuth();
    const mayEdit = can("settings.edit");
    const resource = useApiResource<GeoUnresolved>(`geo:unresolved:${nonce}`, () => geoService.unresolved());
    const states = useApiResource<GeoStateRow[]>("geo:states", () => geoService.states());
    const [aliasOf, setAliasOf] = React.useState<string | null>(null);
    const [adding, setAdding] = React.useState<string | null>(null);
    const [resolving, setResolving] = React.useState(false);
    const [report, setReport] = React.useState<CityKeyBackfillReport | null>(null);

    const changed = () => {
        resource.reload();
        onChanged();
    };

    const reResolve = async () => {
        setResolving(true);
        try {
            const result = await geoService.backfillCityKeys();
            setReport(result);
            toast.success(`Re-resolved: ${backfillSummary(result)}`, {
                description: result.tables
                    .filter((row) => row.resolved > 0 || row.stillNull > 0)
                    .map((row) => `${CITY_KEYED_TABLE_LABEL[row.table]} ${row.resolved} keyed, ${row.stillNull} typed`)
                    .join(" · "),
            });
            changed();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not re-resolve the city keys.");
        } finally {
            setResolving(false);
        }
    };

    return (
        <Card className="rounded-lg border-border p-4 shadow-none" data-testid="unresolved-spellings">
            <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <SpellCheck className="size-4 text-muted-foreground" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">Unresolved spellings</h3>
                            <p className="mt-1 text-xs text-muted-foreground">{resource.data ? unresolvedSummary(resource.data) : "Typed cities no catalogue row answers to."}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Button variant="outline" size="sm" onClick={() => void reResolve()} disabled={!mayEdit || resolving} aria-label="Re-resolve every null city key">
                                <Wand2 className={resolving ? "size-3.5 animate-pulse" : "size-3.5"} aria-hidden />
                                {resolving ? "Re-resolving…" : "Re-resolve"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={resource.reload} disabled={resource.loading} aria-label="Re-read the unresolved spellings">
                                <RefreshCw className={resource.loading ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
                                Refresh
                            </Button>
                        </div>
                    </div>

                    <div className="mt-3">
                        <ResourceBoundary resource={resource}>
                            {(data) => (
                                <SimpleTable
                                    rows={data.items}
                                    rowKey={(row) => row.city}
                                    emptyMessage="Nothing to fold in — every party's city is keyed to the catalogue."
                                    columns={[
                                        {
                                            key: "city",
                                            label: "Typed as",
                                            render: (row) => <span className="font-medium text-foreground">{row.city}</span>,
                                        },
                                        { key: "total", label: "Rows", className: "text-right", render: (row) => <span className="tabular-nums">{formatNumber(row.total)}</span> },
                                        { key: "tables", label: "Where", render: (row) => <span className="text-xs text-muted-foreground">{tablesSentence(row.tables)}</span> },
                                        {
                                            key: "actions",
                                            label: "",
                                            className: "text-right",
                                            render: (row) => (
                                                <div className="flex justify-end gap-1.5">
                                                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={!mayEdit} onClick={() => setAliasOf(row.city)}>
                                                        Add as alias of…
                                                    </Button>
                                                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={!mayEdit} onClick={() => setAdding(row.city)}>
                                                        Add as a city
                                                    </Button>
                                                </div>
                                            ),
                                        },
                                    ]}
                                />
                            )}
                        </ResourceBoundary>
                    </div>

                    {report ? (
                        <div className="mt-3 rounded-md bg-muted/40 p-3" data-testid="backfill-report">
                            <p className="text-xs font-medium text-foreground">Last re-resolve: {backfillSummary(report)}</p>
                            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs sm:grid-cols-[auto_1fr_auto_1fr]">
                                {report.tables.map((row) => (
                                    <React.Fragment key={row.table}>
                                        <dt className="text-muted-foreground">{CITY_KEYED_TABLE_LABEL[row.table]}</dt>
                                        <dd className="tabular-nums text-foreground">
                                            {formatNumber(row.resolved)} keyed · {formatNumber(row.stillNull)} still typed
                                        </dd>
                                    </React.Fragment>
                                ))}
                            </dl>
                        </div>
                    ) : null}

                    <p className="mt-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Re-resolve:</span> an alias keys its rows as it saves. A city added here keys nothing until the resolver
                        is re-run over every null key — Re-resolve does that across the eight tables and prints what resolved and what is still typed. One run at a time.
                    </p>
                    {!mayEdit && <p className="mt-1.5 text-xs text-muted-foreground">Folding a spelling in needs settings.edit.</p>}
                </div>
            </div>

            <AliasOfDialog
                spelling={aliasOf}
                onOpenChange={(open) => {
                    if (!open) setAliasOf(null);
                }}
                onSaved={changed}
            />
            <AddCityDialog
                open={adding !== null}
                onOpenChange={(open) => {
                    if (!open) setAdding(null);
                }}
                states={states.data ?? []}
                initialName={adding ?? undefined}
                onAdded={changed}
            />
        </Card>
    );
}
