"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/adx/status-badge";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { CITY_STAGE_LABEL, CITY_STAGE_TONE, geoReadsApi, geoService, stateNameOf, type CityStage, type GeoCity } from "@/services/geo";

export interface CityComboboxProps {
    id: string;
    /** The city as free text — what the form sends. A catalogued pick writes the city's display name here. */
    value: string;
    onChange: (value: string, city: GeoCity | null) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    /** The stages offered before anything is typed (the biggest cities at them). Every stage once a search is typed. */
    stages?: readonly CityStage[];
    "aria-label"?: string;
    "aria-invalid"?: boolean;
    autoComplete?: string;
    maxLength?: number;
}

/** How many matches the list shows — the search narrows it, and the input keeps whatever was typed. */
export const CITY_PICK_LIMIT = 20;
export const DEFAULT_PICK_STAGES: readonly CityStage[] = ["LAUNCHED"];

/** The rows under their state, in the order the API sent them (biggest first). */
export function groupByState(cities: readonly GeoCity[]): [string, GeoCity[]][] {
    const groups = new Map<string, GeoCity[]>();
    for (const city of cities) {
        const state = stateNameOf(city) ?? "—";
        const bucket = groups.get(state);
        if (bucket) bucket.push(city);
        else groups.set(state, [city]);
    }
    return [...groups.entries()];
}

/**
 * Everywhere a city is chosen on the console — V-C: the create dialogs for
 * a publisher, an advertiser, an agent, a print partner, a listing and a
 * lead, and the overview window's city filter.
 *
 * One text input over `GET /geo/cities?q=` (`services/geo.ts`): the
 * matches under their state with the stage pill, the biggest first; a pick
 * writes the display name into the field. Free text is allowed on purpose —
 * a city the catalogue lacks passes every gate on the server and is noted
 * once a day for ops to add by hand — so the value that leaves here is a
 * string, never an id, and a name that matches nothing is still the name.
 * With nothing typed the list offers the launched cities, the ones a party
 * is most likely in; a typed search reaches every stage, since an agent may
 * well be signed in a city still seeding.
 */
export function CityCombobox({
    id,
    value,
    onChange,
    placeholder = "Bengaluru",
    disabled,
    className,
    stages = DEFAULT_PICK_STAGES,
    autoComplete = "off",
    maxLength,
    ...aria
}: CityComboboxProps) {
    const [open, setOpen] = React.useState(false);
    /* The list follows the field while it is typed into; a pick closes it until the next keystroke. */
    const q = useDebounced(value.trim(), 300);
    const live = geoReadsApi();
    const stageKey = stages.join(",");

    const matches = useApiResource<GeoCity[]>(`city-pick:${live}:${open}:${q}:${stageKey}`, async () => {
        if (!live || !open) return [];
        const page = await geoService.cities(q ? { q, pageSize: CITY_PICK_LIMIT, sort: "population" } : { stage: [...stages], pageSize: CITY_PICK_LIMIT, sort: "population" });
        return page.items;
    });

    const rows = matches.data ?? [];
    const listId = `${id}-cities`;

    return (
        <div className={cn("relative", className)}>
            <Input
                id={id}
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-autocomplete="list"
                value={value}
                disabled={disabled}
                placeholder={placeholder}
                autoComplete={autoComplete}
                maxLength={maxLength}
                onChange={(event) => {
                    onChange(event.target.value, null);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onKeyDown={(event) => {
                    if (event.key === "Escape") setOpen(false);
                }}
                {...aria}
            />
            {open && live && (
                <div
                    id={listId}
                    role="listbox"
                    aria-label="Matching cities"
                    className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover text-sm shadow-md"
                    /* Mouse down, not click: the input blurs (and the list closes) before a click would land. */
                    onMouseDown={(event) => event.preventDefault()}
                >
                    {matches.loading && rows.length === 0 ? (
                        <p className="px-3 py-2 text-muted-foreground">Searching…</p>
                    ) : matches.error ? (
                        <p className="px-3 py-2 text-danger">{matches.error}</p>
                    ) : rows.length === 0 ? (
                        <p className="px-3 py-2 text-muted-foreground">
                            {q ? (
                                <>
                                    No catalogued city matches &ldquo;{q}&rdquo; — the name is kept as typed.
                                </>
                            ) : (
                                "No launched city yet; type a name."
                            )}
                        </p>
                    ) : (
                        groupByState(rows).map(([state, cities]) => (
                            <div key={state} role="group" aria-label={state}>
                                <p className="sticky top-0 bg-muted/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{state}</p>
                                {cities.map((city) => (
                                    <button
                                        key={city.slug}
                                        type="button"
                                        role="option"
                                        aria-selected={city.name === value}
                                        onClick={() => {
                                            onChange(city.name, city);
                                            setOpen(false);
                                        }}
                                        className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-muted/50"
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate">{city.name}</span>
                                            {city.geoDistrict ? <span className="block truncate text-xs text-muted-foreground">{city.geoDistrict.name}</span> : null}
                                        </span>
                                        <StatusBadge status={{ label: CITY_STAGE_LABEL[city.stage], tone: CITY_STAGE_TONE[city.stage] }} />
                                    </button>
                                ))}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
