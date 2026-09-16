"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilterChips } from "@/components/adx/filter-chips";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { StatusBadge } from "@/components/adx/status-badge";
import { useAuth } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";
import {
    CITY_KINDS,
    CITY_KIND_LABEL,
    CITY_STAGES,
    CITY_STAGE_LABEL,
    CITY_STAGE_TONE,
    CITY_SWITCHES,
    CITY_SWITCH_META,
    geoService,
    stageCountsOf,
    stateNameOf,
    type CityKind,
    type CityStage,
    type GeoCity,
    type GeoCityPage,
    type GeoDistricts,
    type GeoStateRow,
} from "@/services/geo";
import { AddCityDialog } from "./add-city-dialog";
import { CITY_PAGE_SIZE, cityFacetsKey, cityFacetsOf, cityQueryOf, geoQuery, type CityFacets } from "./geographies-facets";
import { StageChangeDialog, type StageChangeTarget } from "./stage-change-dialog";

const ALL = "__all__";

/** "4 of 6 on" — the switches column. */
export function switchesSummary(city: Pick<GeoCity, "switches">): string {
    const on = CITY_SWITCHES.filter((key) => city.switches[key]).length;
    return on === CITY_SWITCHES.length ? "all on" : on === 0 ? "all off" : `${on} of ${CITY_SWITCHES.length} on`;
}

/**
 * The Cities tab — `GET /geo/cities` on the list contract. Every facet
 * (state, district, stage, kind, a population floor, the search, the sort,
 * the page) goes to the API and lives in the URL; `counts` comes back per
 * stage with the stage facet removed, so each chip says how many it would
 * show. Checked rows raise the bar: Change stage opens the one confirm
 * with the cities as a `citySlugs` scope (`POST /geo/rollout`). A row
 * opens the drawer; the name links to the page. Add a city is
 * `POST /geo/cities` for a place the dataset lacks.
 */
export function CitiesTab({ nonce, onOpenCity }: { nonce: number; onOpenCity: (slug: string) => void }) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const facets = cityFacetsOf(params);
    const { can } = useAuth();
    const mayEdit = can("settings.edit");

    /* The search box is typed into and settles into the request; a link may seed it through `?q=`, and the rest of the facets live in the URL. */
    const [query, setQuery] = React.useState(facets.q);
    const q = useDebounced(query.trim(), 300);
    const effective: CityFacets = { ...facets, q };
    const setFacets = React.useCallback(
        (next: CityFacets) => {
            const qs = geoQuery("cities", next);
            router.replace(qs ? `${pathname}?${qs}` : pathname);
        },
        [pathname, router],
    );

    const states = useApiResource<GeoStateRow[]>("geo:states", () => geoService.states());
    const districts = useApiResource<GeoDistricts | null>(`geo:districts:${facets.state ?? "-"}`, () => (facets.state ? geoService.districts(facets.state) : Promise.resolve(null)));
    const resource = useApiResource<GeoCityPage>(`geo:cities:${cityFacetsKey(effective)}:${nonce}`, () => geoService.cities(cityQueryOf(effective)));

    const [selected, setSelected] = React.useState<Map<string, GeoCity>>(() => new Map());
    const [target, setTarget] = React.useState<StageChangeTarget | null>(null);
    const [adding, setAdding] = React.useState(false);

    const toggleRow = (city: GeoCity, checked: boolean) =>
        setSelected((current) => {
            const next = new Map(current);
            if (checked) next.set(city.slug, city);
            else next.delete(city.slug);
            return next;
        });

    const stageChip: CityStage | "ALL" = facets.stage.length === 1 ? facets.stage[0] : "ALL";

    return (
        <div className="space-y-4">
            <Card className="rounded-lg border-border p-4 shadow-none">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="relative min-w-[220px] flex-1">
                        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, alias or slug" aria-label="Search cities" className="h-9 pl-8" />
                    </div>
                    <Select value={facets.state ?? ALL} onValueChange={(value) => setFacets({ ...facets, state: value === ALL ? null : value, district: null, page: 1 })}>
                        <SelectTrigger className="h-9 w-48 bg-card" aria-label="State">
                            <SelectValue placeholder="Every state" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>Every state</SelectItem>
                            {(states.data ?? []).map((state) => (
                                <SelectItem key={state.code} value={state.code}>
                                    {state.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={facets.district ?? ALL} onValueChange={(value) => setFacets({ ...facets, district: value === ALL ? null : value, page: 1 })} disabled={!facets.state}>
                        <SelectTrigger className="h-9 w-48 bg-card" aria-label="District">
                            <SelectValue placeholder={facets.state ? "Every district" : "Pick a state first"} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>Every district</SelectItem>
                            {(districts.data?.items ?? []).map((district) => (
                                <SelectItem key={district.id} value={district.id}>
                                    {district.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={facets.kind.length === 1 ? facets.kind[0] : ALL} onValueChange={(value) => setFacets({ ...facets, kind: value === ALL ? [] : [value as CityKind], page: 1 })}>
                        <SelectTrigger className="h-9 w-44 bg-card" aria-label="Kind">
                            <SelectValue placeholder="Every kind" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>Every kind</SelectItem>
                            {CITY_KINDS.map((kind) => (
                                <SelectItem key={kind} value={kind}>
                                    {CITY_KIND_LABEL[kind]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={facets.minPopulation === null ? "0" : String(facets.minPopulation)} onValueChange={(value) => setFacets({ ...facets, minPopulation: value === "0" ? null : Number(value), page: 1 })}>
                        <SelectTrigger className="h-9 w-40 bg-card" aria-label="Population at least">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="0">Any population</SelectItem>
                            <SelectItem value="25000">25,000+</SelectItem>
                            <SelectItem value="100000">1 lakh+</SelectItem>
                            <SelectItem value="500000">5 lakh+</SelectItem>
                            <SelectItem value="1000000">10 lakh+</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={facets.sort} onValueChange={(value) => setFacets({ ...facets, sort: value === "name" ? "name" : "population", page: 1 })}>
                        <SelectTrigger className="h-9 w-36 bg-card" aria-label="Sort">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="population">Biggest first</SelectItem>
                            <SelectItem value="name">By name</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" className="h-9 bg-card" onClick={() => setAdding(true)} disabled={!mayEdit}>
                        <Plus className="mr-1.5 size-4" />
                        Add a city
                    </Button>
                </div>
                <FilterChips
                    className="mt-3"
                    value={stageChip}
                    onChange={(value) => setFacets({ ...facets, stage: value === "ALL" ? [] : [value], page: 1 })}
                    chips={[
                        { value: "ALL" as const, label: "Every stage", count: resource.data ? Object.values(stageCountsOf(resource.data.counts)).reduce((a, b) => a + b, 0) : undefined },
                        ...CITY_STAGES.map((stage) => ({ value: stage, label: CITY_STAGE_LABEL[stage], count: resource.data ? stageCountsOf(resource.data.counts)[stage] : undefined })),
                    ]}
                />
            </Card>

            {selected.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm" data-testid="bulk-bar">
                    <span className="font-medium text-foreground">
                        {selected.size} {selected.size === 1 ? "city" : "cities"} selected
                    </span>
                    <Button size="sm" disabled={!mayEdit} onClick={() => setTarget({ kind: "cities", cities: [...selected.values()].map((city) => ({ slug: city.slug, name: city.name, stage: city.stage })) })}>
                        Change stage
                    </Button>
                    <button type="button" className="text-muted-foreground underline-offset-4 hover:underline" onClick={() => setSelected(new Map())}>
                        Clear
                    </button>
                </div>
            )}

            <ResourceBoundary resource={resource}>
                {(page) => {
                    const pages = Math.max(1, Math.ceil(page.total / CITY_PAGE_SIZE));
                    const allChecked = page.items.length > 0 && page.items.every((city) => selected.has(city.slug));
                    return (
                        <Card className="overflow-hidden rounded-lg border-border shadow-none">
                            <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5 text-xs text-muted-foreground">
                                <span>
                                    {formatNumber(page.total)} {page.total === 1 ? "city" : "cities"}
                                    {page.total > CITY_PAGE_SIZE ? ` · page ${facets.page} of ${pages}` : ""}
                                </span>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" className="h-7 bg-card" disabled={facets.page <= 1} onClick={() => setFacets({ ...facets, page: facets.page - 1 })}>
                                        Previous
                                    </Button>
                                    <Button variant="outline" size="sm" className="h-7 bg-card" disabled={facets.page >= pages} onClick={() => setFacets({ ...facets, page: facets.page + 1 })}>
                                        Next
                                    </Button>
                                </div>
                            </div>
                            {page.items.length === 0 ? (
                                <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                                    {page.total === 0 && !q && !facets.state && facets.stage.length === 0
                                        ? "The catalogue is empty. Seed it from the Overview tab."
                                        : "No city matches these facets."}
                                </p>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                            <th className="w-10 px-4 py-2.5">
                                                <Checkbox
                                                    aria-label="Select every city on this page"
                                                    checked={allChecked}
                                                    onCheckedChange={(checked) =>
                                                        setSelected((current) => {
                                                            const next = new Map(current);
                                                            for (const city of page.items) {
                                                                if (checked) next.set(city.slug, city);
                                                                else next.delete(city.slug);
                                                            }
                                                            return next;
                                                        })
                                                    }
                                                />
                                            </th>
                                            <th className="px-2 py-2.5">City</th>
                                            <th className="px-4 py-2.5">State</th>
                                            <th className="px-4 py-2.5">District</th>
                                            <th className="px-4 py-2.5">Kind</th>
                                            <th className="px-4 py-2.5 text-right">Population</th>
                                            <th className="px-4 py-2.5">Stage</th>
                                            <th className="px-4 py-2.5">Switches</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {page.items.map((city) => (
                                            <tr
                                                key={city.slug}
                                                className={cn("cursor-pointer border-b last:border-0 hover:bg-muted/40", selected.has(city.slug) && "bg-primary/[0.04]")}
                                                onClick={() => onOpenCity(city.slug)}
                                            >
                                                <td className="px-4 py-2.5" onClick={(event) => event.stopPropagation()}>
                                                    <Checkbox aria-label={`Select ${city.name}`} checked={selected.has(city.slug)} onCheckedChange={(checked) => toggleRow(city, checked === true)} />
                                                </td>
                                                <td className="px-2 py-2.5">
                                                    <Link
                                                        href={`/settings/geographies/${encodeURIComponent(city.slug)}`}
                                                        className="font-medium text-foreground underline-offset-4 hover:underline"
                                                        onClick={(event) => event.stopPropagation()}
                                                    >
                                                        {city.name}
                                                    </Link>
                                                    {city.aliases.length > 0 && <span className="ml-2 text-xs text-muted-foreground">{city.aliases.slice(0, 2).join(", ")}</span>}
                                                </td>
                                                <td className="px-4 py-2.5 text-muted-foreground">{stateNameOf(city) ?? "—"}</td>
                                                <td className="px-4 py-2.5 text-muted-foreground">{city.geoDistrict?.name ?? "—"}</td>
                                                <td className="px-4 py-2.5 text-muted-foreground">{city.kind ? CITY_KIND_LABEL[city.kind] : "—"}</td>
                                                <td className="px-4 py-2.5 text-right tabular-nums">{city.population === null ? "—" : formatNumber(city.population)}</td>
                                                <td className="px-4 py-2.5">
                                                    <StatusBadge status={{ label: CITY_STAGE_LABEL[city.stage], tone: CITY_STAGE_TONE[city.stage] }} />
                                                </td>
                                                <td className="px-4 py-2.5 text-xs text-muted-foreground" title={CITY_SWITCHES.filter((key) => city.switches[key]).map((key) => CITY_SWITCH_META[key].label).join(", ") || "none"}>
                                                    {switchesSummary(city)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </Card>
                    );
                }}
            </ResourceBoundary>

            <StageChangeDialog
                target={target}
                onOpenChange={(open) => {
                    if (!open) setTarget(null);
                }}
                onDone={() => {
                    setSelected(new Map());
                    resource.reload();
                }}
            />
            <AddCityDialog
                open={adding}
                onOpenChange={setAdding}
                states={states.data ?? []}
                onAdded={(city) => {
                    resource.reload();
                    onOpenCity(city.slug);
                }}
            />
        </div>
    );
}
