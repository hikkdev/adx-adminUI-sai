"use client";

import * as React from "react";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CityCombobox } from "@/components/adx/city-combobox";
import { EMPTY_CITY_FACET, cityFacetValue } from "@/lib/city-facet";
import { useDebounced } from "@/lib/use-debounced";
import { CITY_STAGES } from "@/services/geo";
import type { AccountStatusCounts, AccountStatusOption } from "@/services/account-state";
import {
    EMPTY_ROSTER_FILTERS,
    KYC_STATE_OPTIONS,
    ROSTER_ANY,
    rosterFiltersActive,
    rosterQueryKey,
    rosterQueryOf,
    type PartyRosterFilters,
    type PartyRosterQuery,
    type RosterOption,
} from "@/services/party-roster";

/**
 * The party rosters' one filter bar — 29 Sep 2026, beside the one column
 * layout in `party-roster-columns`. The same filters in the same order on
 * every desk (2 Oct 2026, the owner: "again 3 different variations"):
 *
 *   Search (name, ID, phone, email, city) · Door · KYC state · [the party's
 *   own facet] · City · Status            … and the table's Columns on the right
 *
 * The party's own facet is its Type (publishers, advertisers, agents) or,
 * for a party with no type, the one facet it has instead — the print
 * partners' app state — in the same slot and the same select. Status (the
 * account lifecycle) defaults to Active; each option carries its one line
 * and the server's count, and a desk offers only the states its list route
 * can cut (print partners: Active, Deactivated, Everyone).
 * Each is the server's, so the loader keys its read on `query` and a filter
 * never hides a row on a page the console has not read.
 */

export interface PartyRosterFilterState {
    filters: PartyRosterFilters;
    /** Merges a change into the filters — one select, or the text as typed. */
    set: (patch: Partial<PartyRosterFilters>) => void;
    clear: () => void;
    /** What the read sends: the selects at once, the text and the city once they stop changing. */
    query: PartyRosterQuery;
    /** A stable string for `query` — the read's key. */
    key: string;
}

export function usePartyRosterFilters(initial: Partial<PartyRosterFilters> = {}): PartyRosterFilterState {
    /* What "Clear" goes back to — the desk's own defaults (the Status select's Active), held from the first render. */
    const [start] = React.useState<PartyRosterFilters>(() => ({ ...EMPTY_ROSTER_FILTERS, ...initial }));
    const [filters, setFilters] = React.useState<PartyRosterFilters>(start);
    const q = useDebounced(filters.q.trim(), 300);
    /* A catalogued pick sends its slug; free text is sent as typed — both once the field settles. */
    const city = useDebounced(cityFacetValue(filters.city), 300);
    // The selects are read as they stand; the two typed fields through their settled values.
    const { door, kycState, type, status } = filters;
    const query = React.useMemo(
        () => rosterQueryOf({ q, door, kycState, type, city: city ? { text: city, slug: null } : EMPTY_CITY_FACET, status }),
        [q, door, kycState, type, city, status],
    );
    const set = React.useCallback((patch: Partial<PartyRosterFilters>) => setFilters((current) => ({ ...current, ...patch })), []);
    const clear = React.useCallback(() => setFilters(start), [start]);
    return { filters, set, clear, query, key: rosterQueryKey(query) };
}

export interface PartyRosterFilterSpec {
    /** The search box's hint — every desk searches name, ID, phone, email and city. */
    searchPlaceholder: string;
    /** The doors this party comes through. */
    doors: readonly RosterOption[];
    /** The party's types; omit for a party that has none. */
    types?: readonly RosterOption[];
    /** Unique per desk — the city field's id. */
    idPrefix: string;
    /** The account states the Status select offers (`accountStatusOptions`); omit for a desk without it. */
    statuses?: readonly AccountStatusOption[];
}

/**
 * The party's own facet for a party with no type — drawn in Type's slot, as
 * the same select: "Any …" first, then the options.
 */
export interface RosterOwnFacet {
    /** The select's accessible name — "App state". */
    label: string;
    /** The option that does not filter — "Any app state". Its value is `ROSTER_ANY`. */
    all: string;
    value: string;
    options: readonly RosterOption[];
    onChange: (value: string) => void;
}

interface PartyRosterFilterBarProps {
    spec: PartyRosterFilterSpec;
    state: PartyRosterFilterState;
    /** The read is refetching under the rows on screen. */
    refreshing?: boolean;
    /** The party's own facet in Type's slot, for a party with no type (the print partners' app state). */
    facet?: RosterOwnFacet;
    /** The server's count of each account state over the other filters — drawn beside each Status option when known. */
    statusCounts?: AccountStatusCounts;
}

/** The bar's search box — the same field on every list that uses the bar's controls. */
export function RosterSearch({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
    return (
        <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label="Search" className="h-9 w-[260px] bg-card pl-8" />
        </div>
    );
}

/** One of the bar's selects: "Any …" first (`ROSTER_ANY`), then the options. */
export function RosterSelect({ label, all, value, options, onChange }: { label: string; all: string; value: string; options: readonly RosterOption[]; onChange: (value: string) => void }) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="h-9 w-[170px] bg-card" aria-label={label}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ROSTER_ANY}>{all}</SelectItem>
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

/** One Status option: its value, its word and its one line. The party rosters pass `AccountStatusOption`s; the user accounts list its own states. */
export interface StatusSelectOption {
    value: string;
    label: string;
    description: string;
}

/**
 * The Status select: the same trigger as the bar's other selects, its value
 * read as "Active · 120", and each option with its count and its one line.
 */
export function StatusSelect({
    options,
    value,
    counts,
    onChange,
    label = "Status",
}: {
    options: readonly StatusSelectOption[];
    value: string;
    counts?: Readonly<Partial<Record<string, number>>>;
    onChange: (value: string) => void;
    /** The select's accessible name — "Status", or the facet it stands for in that style ("Waiting on"). */
    label?: string;
}) {
    const picked = options.find((option) => option.value === value) ?? options[0];
    const countOf = (option: StatusSelectOption): number | undefined => counts?.[option.value];
    const pickedCount = picked ? countOf(picked) : undefined;
    return (
        <Select value={picked?.value ?? value} onValueChange={onChange}>
            <SelectTrigger
                className="h-9 w-[170px] bg-card"
                aria-label={label}
                data-testid={label === "Status" ? "roster-status" : `roster-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            >
                <SelectValue>{picked ? `${picked.label}${pickedCount === undefined ? "" : ` · ${pickedCount}`}` : null}</SelectValue>
            </SelectTrigger>
            <SelectContent>
                {options.map((option) => {
                    const count = countOf(option);
                    return (
                        <SelectItem key={option.value} value={option.value}>
                            <span className="flex min-w-[13rem] flex-col">
                                <span className="flex items-center justify-between gap-3">
                                    <span>{option.label}</span>
                                    {count !== undefined && <span className="tabular-nums text-xs text-muted-foreground">{count}</span>}
                                </span>
                                <span className="text-xs text-muted-foreground">{option.description}</span>
                            </span>
                        </SelectItem>
                    );
                })}
            </SelectContent>
        </Select>
    );
}

export function PartyRosterFilterBar({ spec, state, refreshing = false, facet, statusCounts }: PartyRosterFilterBarProps) {
    const { filters, set, clear } = state;
    return (
        <div className="flex flex-1 flex-wrap items-center gap-2" data-testid="party-roster-filters">
            <RosterSearch value={filters.q} onChange={(q) => set({ q })} placeholder={spec.searchPlaceholder} />
            <RosterSelect label="Onboarded via" all="Every door" value={filters.door} options={spec.doors} onChange={(door) => set({ door })} />
            <RosterSelect label="KYC state" all="Every KYC state" value={filters.kycState} options={KYC_STATE_OPTIONS} onChange={(kycState) => set({ kycState })} />
            {spec.types ? (
                <RosterSelect label="Type" all="Every type" value={filters.type} options={spec.types} onChange={(type) => set({ type })} />
            ) : facet ? (
                <RosterSelect label={facet.label} all={facet.all} value={facet.value} options={facet.options} onChange={facet.onChange} />
            ) : null}
            <CityCombobox
                id={`${spec.idPrefix}-city`}
                value={filters.city.text}
                onChange={(text, picked) => set({ city: { text, slug: picked?.slug ?? null } })}
                placeholder="Any city"
                aria-label="City"
                stages={CITY_STAGES}
                className="w-[170px]"
            />
            {spec.statuses && (
                <StatusSelect options={spec.statuses} value={filters.status ?? ""} counts={statusCounts} onChange={(status) => set({ status })} />
            )}
            {(rosterFiltersActive(filters) || (facet !== undefined && facet.value !== ROSTER_ANY)) && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-9"
                    onClick={() => {
                        clear();
                        if (facet && facet.value !== ROSTER_ANY) facet.onChange(ROSTER_ANY);
                    }}
                >
                    <X className="mr-1 size-3.5" aria-hidden />
                    Clear
                </Button>
            )}
            {refreshing && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />}
        </div>
    );
}
