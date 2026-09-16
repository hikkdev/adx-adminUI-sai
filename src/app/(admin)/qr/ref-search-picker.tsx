"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { advertiserService } from "@/services/advertisers";
import { agentService } from "@/services/agents";
import { listingsService } from "@/services/listings";
import { orderService } from "@/services/orders";
import type { QrType } from "@/services/qr";
import { advertiserHit, agentHit, listingHit, orderHit, publisherHit, type SearchHit } from "@/services/search";
import { supplyService } from "@/services/supply";

/** How many matches a search shows — the picker is a short list, the full table is one click away. */
const LIMIT = 8;

/**
 * Which roster a code type's ref comes from — the same server-side searches
 * the command palette fans out to, one at a time. AD and ACCESS_GRANT have
 * no roster the console searches (a placement id comes off the order; a
 * grant's code is minted by the grant itself), so the picker offers a
 * plain id field for those.
 */
const SOURCES: Partial<Record<QrType, { placeholder: string; search: (q: string) => Promise<SearchHit[]> }>> = {
    SITE: {
        placeholder: "Search listings by title, id or city",
        search: (q) => listingsService.list({ q, sort: "NEWEST", pageSize: LIMIT }).then((page) => page.items.map(listingHit)),
    },
    AGENT: {
        placeholder: "Search agents by name or mobile",
        search: (q) => agentService.search(q, LIMIT).then((rows) => (rows ?? []).map(agentHit)),
    },
    ORDER: {
        placeholder: "Search orders by campaign, listing or id",
        search: (q) => orderService.page({ q, sort: "NEWEST", pageSize: LIMIT }).then((page) => page.items.map(orderHit)),
    },
    PUBLISHER: {
        placeholder: "Search publishers by name, id or mobile",
        search: (q) => supplyService.search(q, LIMIT).then((rows) => rows.map(publisherHit)),
    },
    ADVERTISER: {
        placeholder: "Search advertisers by name, company or mobile",
        search: (q) => advertiserService.search(q, LIMIT).then((rows) => rows.map(advertiserHit)),
    },
};

export const hasRefSearch = (type: QrType): boolean => type in SOURCES;

export interface PickedRef {
    id: string;
    label: string;
}

interface RefSearchPickerProps {
    id: string;
    type: QrType;
    value: PickedRef | null;
    onChange: (next: PickedRef | null) => void;
}

/**
 * The subject a QR code names, found on its own roster.
 *
 * The same shape as the agent picker the order dialogs use: type two or
 * more characters, pick a row, and the id that leaves here is one the API
 * issued. For a type with no roster the field takes the id as typed.
 */
export function RefSearchPicker({ id, type, value, onChange }: RefSearchPickerProps) {
    const [query, setQuery] = React.useState("");
    const q = useDebounced(query.trim(), 350);
    const source = SOURCES[type];
    const matches = useApiResource<SearchHit[]>(`qr-ref:${type}:${source ? q : ""}`, () =>
        source && q.length >= 2 ? source.search(q) : Promise.resolve([]),
    );

    if (!source) {
        return (
            <div className="space-y-1.5">
                <Label htmlFor={id}>Reference id</Label>
                <Input
                    id={id}
                    value={value?.id ?? ""}
                    onChange={(event) => onChange(event.target.value.trim() ? { id: event.target.value.trim(), label: event.target.value.trim() } : null)}
                    placeholder={type === "AD" ? "The placement's id" : "The grant's id"}
                    className="h-9 font-mono"
                    autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">No roster to search for this type; paste the id.</p>
            </div>
        );
    }

    if (value) {
        return (
            <div className="space-y-1.5">
                <Label>Reference</Label>
                <div className="flex h-9 items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 text-sm">
                    <span className="truncate">
                        {value.label}
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{value.id}</span>
                    </span>
                    <button type="button" onClick={() => onChange(null)} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Clear the reference">
                        <X className="size-4" />
                    </button>
                </div>
            </div>
        );
    }

    const rows = matches.data ?? [];

    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>Reference</Label>
            <Input id={id} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={source.placeholder} className="h-9" autoComplete="off" />
            {q.length >= 2 && (
                <div className="rounded-md border text-sm" role="listbox" aria-label="Matches">
                    {matches.loading && rows.length === 0 ? (
                        <p className="px-3 py-2 text-muted-foreground">Searching…</p>
                    ) : matches.error ? (
                        <p className="px-3 py-2 text-danger">{matches.error}</p>
                    ) : rows.length === 0 ? (
                        <p className="px-3 py-2 text-muted-foreground">Nothing matches &ldquo;{q}&rdquo;.</p>
                    ) : (
                        <ul className="max-h-40 divide-y overflow-y-auto">
                            {rows.map((row) => (
                                <li key={row.id}>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={false}
                                        onClick={() => {
                                            onChange({ id: row.id, label: row.title });
                                            setQuery("");
                                        }}
                                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50"
                                    >
                                        <span className="truncate">{row.title}</span>
                                        <span className="shrink-0 truncate text-xs text-muted-foreground">{row.subtitle ?? row.id}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
