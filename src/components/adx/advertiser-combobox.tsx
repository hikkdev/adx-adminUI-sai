"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";
import { advertiserService } from "@/services/advertisers";
import type { Advertiser } from "@/types";

/** The advertiser a list is narrowed to: the profile id the API filters on, and what the field shows. */
export interface AdvertiserPick {
    id: string;
    label: string;
}

/** How many matches the list shows; the search narrows it. */
export const ADVERTISER_PICK_LIMIT = 8;

/** "Rao Sweets" — the business, else the person. */
export const advertiserPickLabel = (advertiser: Pick<Advertiser, "name" | "companyName">): string => advertiser.companyName?.trim() || advertiser.name;

/**
 * The filter bar's Advertiser field — 2 Oct 2026, for the campaigns list
 * ("Advertiser (search-as-you-type picker)"). The same look as the bar's
 * city field (`CityCombobox`): one input over `GET /advertisers?q=` — name,
 * company, email, ADV- id and mobile — the matches under it, a pick
 * showing as the field's value with a clear. What leaves here is a profile
 * id the API issued, never typed text.
 */
export function AdvertiserCombobox({
    id,
    value,
    onChange,
    placeholder = "Any advertiser",
    className,
}: {
    id: string;
    value: AdvertiserPick | null;
    onChange: (pick: AdvertiserPick | null) => void;
    placeholder?: string;
    className?: string;
}) {
    const [text, setText] = React.useState("");
    const [open, setOpen] = React.useState(false);
    const q = useDebounced(text.trim(), 300);
    const matches = useApiResource<Advertiser[]>(`advertiser-pick:${open}:${q}`, () =>
        open && q.length >= 2 ? advertiserService.search(q, ADVERTISER_PICK_LIMIT) : Promise.resolve([]),
    );
    const listId = `${id}-advertisers`;

    if (value) {
        return (
            <div className={cn("flex h-9 items-center justify-between gap-2 rounded-md border bg-card px-3 text-sm", className)} data-testid="advertiser-filter-value">
                <span className="truncate" title={value.label}>
                    {value.label}
                </span>
                <button type="button" onClick={() => onChange(null)} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Clear the advertiser">
                    <X className="size-4" />
                </button>
            </div>
        );
    }

    const rows = matches.data ?? [];
    return (
        <div className={cn("relative", className)}>
            <Input
                id={id}
                role="combobox"
                aria-label="Advertiser"
                aria-expanded={open}
                aria-controls={listId}
                aria-autocomplete="list"
                value={text}
                placeholder={placeholder}
                autoComplete="off"
                className="h-9 bg-card"
                onChange={(event) => {
                    setText(event.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onKeyDown={(event) => {
                    if (event.key === "Escape") setOpen(false);
                }}
            />
            {open && q.length >= 2 && (
                <div
                    id={listId}
                    role="listbox"
                    aria-label="Matching advertisers"
                    className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 min-w-[16rem] overflow-y-auto rounded-md border bg-popover text-sm shadow-md"
                    /* Mouse down, not click: the input blurs (and the list closes) before a click would land. */
                    onMouseDown={(event) => event.preventDefault()}
                >
                    {matches.loading && rows.length === 0 ? (
                        <p className="px-3 py-2 text-muted-foreground">Searching…</p>
                    ) : matches.error ? (
                        <p className="px-3 py-2 text-danger">{matches.error}</p>
                    ) : rows.length === 0 ? (
                        <p className="px-3 py-2 text-muted-foreground">No advertiser matches &ldquo;{q}&rdquo;.</p>
                    ) : (
                        rows.map((advertiser) => (
                            <button
                                key={advertiser.id}
                                type="button"
                                role="option"
                                aria-selected={false}
                                onClick={() => {
                                    onChange({ id: advertiser.id, label: advertiserPickLabel(advertiser) });
                                    setText("");
                                    setOpen(false);
                                }}
                                className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-muted/50"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate">{advertiserPickLabel(advertiser)}</span>
                                    {advertiser.companyName?.trim() && advertiser.companyName.trim() !== advertiser.name ? (
                                        <span className="block truncate text-xs text-muted-foreground">{advertiser.name}</span>
                                    ) : null}
                                </span>
                                <span className="shrink-0 font-mono text-xs text-muted-foreground">{advertiser.displayId ?? ""}</span>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
