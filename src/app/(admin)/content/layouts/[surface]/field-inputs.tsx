"use client";

import * as React from "react";
import Link from "next/link";
import { ImageIcon, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";
import { geoService } from "@/services/geo";
import { TARGET_KINDS, TARGET_KIND_META, type CtaValue, type TargetKind, type TargetValue } from "@/services/layouts";
import { listingsService } from "@/services/listings";
import { MediaPicker } from "../../media/media-picker";
import { useBuilder } from "./builder-context";

const NONE = "__none__";

/** Where a slot's row is on Ads & sponsored › Slots & pricing — the row carries the key as its id. */
export const slotHref = (key: string): string => `/ads/slots#${encodeURIComponent(key)}`;

/* ------------------------------------------------------------------ */
/* A search box with a result list — listings and cities               */
/* ------------------------------------------------------------------ */

interface SearchHit {
    id: string;
    label: string;
    detail?: string;
}

function AsyncSearch({ placeholder, search, onPick, disabled, ariaLabel }: { placeholder: string; search: (q: string) => Promise<SearchHit[]>; onPick: (hit: SearchHit) => void; disabled?: boolean; ariaLabel: string }) {
    const [q, setQ] = React.useState("");
    const [open, setOpen] = React.useState(false);
    const [result, setResult] = React.useState<{ term: string; hits: SearchHit[] | null; error: string | null } | null>(null);
    const term = useDebounced(q.trim(), 300);
    const hits = result?.term === term ? result.hits : null;
    const error = result?.term === term ? result.error : null;
    const searchRef = React.useRef(search);
    React.useEffect(() => {
        searchRef.current = search;
    });

    React.useEffect(() => {
        if (!open || term.length < 2) return;
        let active = true;
        searchRef.current(term).then(
            (found) => active && setResult({ term, hits: found, error: null }),
            (cause: unknown) => active && setResult({ term, hits: [], error: cause instanceof Error ? cause.message : "The search failed." }),
        );
        return () => {
            active = false;
        };
    }, [term, open]);

    return (
        <div className="relative">
            <Input
                value={q}
                disabled={disabled}
                onChange={(e) => {
                    setQ(e.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => window.setTimeout(() => setOpen(false), 150)}
                placeholder={placeholder}
                aria-label={ariaLabel}
                className="h-9"
            />
            {open && term.length >= 2 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                    {error ? (
                        <p className="px-2 py-1.5 text-xs text-danger">{error}</p>
                    ) : hits === null ? (
                        <p className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
                            <Loader2 className="size-3 animate-spin" aria-hidden /> Searching…
                        </p>
                    ) : hits.length === 0 ? (
                        <p className="px-2 py-1.5 text-xs text-muted-foreground">Nothing matches.</p>
                    ) : (
                        hits.map((hit) => (
                            <button
                                key={hit.id}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    onPick(hit);
                                    setQ("");
                                    setOpen(false);
                                }}
                                className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                            >
                                <span className="text-foreground">{hit.label}</span>
                                {hit.detail && <span className="text-[11px] text-muted-foreground">{hit.detail}</span>}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

function Chips({ items, onRemove }: { items: { id: string; label: string }[]; onRemove: (id: string) => void }) {
    if (items.length === 0) return null;
    return (
        <div className="flex flex-wrap gap-1.5">
            {items.map((item) => (
                <span key={item.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
                    {item.label}
                    <button type="button" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.label}`} className="text-muted-foreground hover:text-foreground">
                        <X className="size-3" />
                    </button>
                </span>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Listings                                                            */
/* ------------------------------------------------------------------ */

async function searchListings(q: string): Promise<SearchHit[]> {
    const page = await listingsService.list({ q, pageSize: 8 });
    return page.items.map((listing) => ({
        id: listing.id,
        label: listing.displayId ? `${listing.title} · ${listing.displayId}` : listing.title,
        detail: [listing.category, listing.city, listing.status].filter(Boolean).join(" · "),
    }));
}

export function ListingIdsField({ value, onChange, max, single }: { value: string[]; onChange: (next: string[]) => void; max?: number; single?: boolean }) {
    const { listingNames, rememberListing } = useBuilder();
    const full = single ? value.length >= 1 : max !== undefined && value.length >= max;
    return (
        <div className="space-y-2">
            <Chips items={value.map((id) => ({ id, label: listingNames.get(id) ?? id }))} onRemove={(id) => onChange(value.filter((item) => item !== id))} />
            {!full && (
                <AsyncSearch
                    ariaLabel="Search listings"
                    placeholder="Search listings by title, id or city"
                    search={searchListings}
                    onPick={(hit) => {
                        rememberListing(hit.id, hit.label);
                        if (!value.includes(hit.id)) onChange(single ? [hit.id] : [...value, hit.id]);
                    }}
                />
            )}
            {max !== undefined && !single && <p className="text-[11px] text-muted-foreground">{value.length} of at most {max}</p>}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Cities                                                              */
/* ------------------------------------------------------------------ */

export function CityPick({ value, onChange, single, placeholder = "Search cities" }: { value: string[]; onChange: (next: string[]) => void; single?: boolean; placeholder?: string }) {
    const { cityNames, rememberCity } = useBuilder();
    const search = React.useCallback(async (q: string): Promise<SearchHit[]> => {
        const page = await geoService.cities({ q, pageSize: 10 });
        return page.items.map((city) => ({ id: city.id, label: city.name, detail: [city.geoState?.name ?? city.state, city.stage.toLowerCase()].filter(Boolean).join(" · ") }));
    }, []);
    return (
        <div className="space-y-2">
            <Chips items={value.map((id) => ({ id, label: cityNames.get(id) ?? `City ${id.slice(0, 8)}…` }))} onRemove={(id) => onChange(value.filter((item) => item !== id))} />
            {!(single && value.length >= 1) && (
                <AsyncSearch
                    ariaLabel={placeholder}
                    placeholder={placeholder}
                    search={search}
                    onPick={(hit) => {
                        rememberCity({ id: hit.id, name: hit.label });
                        if (!value.includes(hit.id)) onChange(single ? [hit.id] : [...value, hit.id]);
                    }}
                />
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

export function MediaField({ value, onChange, spec, invalid }: { value: string; onChange: (next: string) => void; spec?: string; invalid?: boolean }) {
    const { media, specs, rememberMedia } = useBuilder();
    const [open, setOpen] = React.useState(false);
    const asset = value ? media.get(value) : undefined;
    return (
        <div className={cn("flex items-center gap-3 rounded-md border p-2", invalid && "border-danger")}>
            <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                {asset ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a stored picture of any size
                    <img src={asset.url} alt={asset.altText ?? ""} className="max-h-full max-w-full object-contain" />
                ) : (
                    <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
                )}
            </div>
            <div className="min-w-0 flex-1 text-xs">
                {asset ? (
                    <>
                        <p className="truncate font-medium text-foreground">{asset.title || "Untitled"}</p>
                        <p className="truncate text-muted-foreground">
                            {asset.width}×{asset.height} · {asset.altText ?? "no alt text"}
                        </p>
                    </>
                ) : value ? (
                    <p className="text-muted-foreground">Picture {value.slice(0, 10)}… (not in the library list)</p>
                ) : (
                    <p className="text-muted-foreground">No picture chosen</p>
                )}
            </div>
            <div className="flex shrink-0 gap-1">
                <Button type="button" variant="outline" size="sm" className="h-7 bg-card" onClick={() => setOpen(true)}>
                    {value ? "Change" : "Choose"}
                </Button>
                {value && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => onChange("")} aria-label="Clear picture">
                        <X className="size-3.5" />
                    </Button>
                )}
            </div>
            <MediaPicker
                open={open}
                onOpenChange={setOpen}
                spec={spec}
                specs={specs}
                selectedId={value}
                onPick={(picked) => {
                    rememberMedia(picked);
                    onChange(picked.id);
                }}
            />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Target                                                              */
/* ------------------------------------------------------------------ */

export function TargetField({ value, onChange, invalid }: { value: TargetValue; onChange: (next: TargetValue) => void; invalid?: boolean }) {
    const { pages, sitePages, listingNames } = useBuilder();
    const meta = value.kind ? TARGET_KIND_META[value.kind] : null;
    return (
        <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
            <Select value={value.kind || NONE} onValueChange={(kind) => onChange({ kind: kind === NONE ? "" : (kind as TargetKind), value: "" })}>
                <SelectTrigger className={cn("h-9", invalid && "border-danger")} aria-label="Opens">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={NONE}>Nothing</SelectItem>
                    {TARGET_KINDS.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                            {TARGET_KIND_META[kind].label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {meta?.needsValue ? (
                value.kind === "LISTING" ? (
                    value.value ? (
                        <Chips items={[{ id: value.value, label: listingNames.get(value.value) ?? value.value }]} onRemove={() => onChange({ ...value, value: "" })} />
                    ) : (
                        <ListingIdsField value={[]} single onChange={(ids) => onChange({ ...value, value: ids[0] ?? "" })} />
                    )
                ) : value.kind === "PAGE" && sitePages.length > 0 ? (
                    <Select value={value.value || NONE} onValueChange={(key) => onChange({ ...value, value: key === NONE ? "" : key })}>
                        <SelectTrigger className={cn("h-9", invalid && "border-danger")} aria-label="Page">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE}>Pick a page</SelectItem>
                            {!sitePages.some((page) => page.key === value.value) && value.value && <SelectItem value={value.value}>{value.value} (unknown)</SelectItem>}
                            {sitePages.map((page) => (
                                <SelectItem key={page.key} value={page.key}>
                                    {page.title} · {page.path}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : value.kind === "CONTENT" && pages.length > 0 ? (
                    <Select value={value.value || NONE} onValueChange={(slug) => onChange({ ...value, value: slug === NONE ? "" : slug })}>
                        <SelectTrigger className={cn("h-9", invalid && "border-danger")} aria-label="Content page">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NONE}>Pick a page</SelectItem>
                            {pages.map((page) => (
                                <SelectItem key={page.slug} value={page.slug}>
                                    {page.title} · /{page.slug}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <Input value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value })} placeholder={meta.placeholder} className={cn("h-9", invalid && "border-danger")} aria-label="Where it goes" />
                )
            ) : (
                <p className="flex h-9 items-center text-xs text-muted-foreground">{value.kind ? "Each app opens its own screen for this." : "A tap does nothing."}</p>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Slot key and content slug                                           */
/* ------------------------------------------------------------------ */

export function SlotKeyField({ value, onChange, invalid }: { value: string; onChange: (next: string) => void; invalid?: boolean }) {
    const { slots } = useBuilder();
    if (slots.length === 0) {
        return (
            <div className="space-y-1">
                <Input value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} placeholder="WEB_LISTING_SIDEBAR" className={cn("h-9 font-mono", invalid && "border-danger")} aria-label="Slot key" />
                <p className="text-[11px] text-muted-foreground">The slot list could not be read — type the key as Ads & sponsored › Slots & pricing names it.</p>
            </div>
        );
    }
    const known = slots.some((slot) => slot.key === value);
    return (
        <div className="flex items-center gap-3">
            <Select value={value || NONE} onValueChange={(key) => onChange(key === NONE ? "" : key)}>
                <SelectTrigger className={cn("h-9 min-w-0 flex-1", invalid && "border-danger")} aria-label="Slot">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={NONE}>Pick a slot</SelectItem>
                    {!known && value && <SelectItem value={value}>{value} (unknown)</SelectItem>}
                    {slots.map((slot) => (
                        <SelectItem key={slot.key} value={slot.key}>
                            {slot.label} · {slot.key}
                            {slot.isActive ? "" : " (off)"}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {/* AS-1: the slot's price, size and screens live on Slots & pricing — a new tab, so an unsaved draft stays put. */}
            {known && (
                <Link href={slotHref(value)} target="_blank" rel="noopener" className="shrink-0 text-xs text-info hover:underline" data-testid="open-slot">
                    Open slot →
                </Link>
            )}
        </div>
    );
}

export function ContentSlugField({ value, onChange, invalid }: { value: string; onChange: (next: string) => void; invalid?: boolean }) {
    const { pages } = useBuilder();
    const known = pages.some((page) => page.slug === value);
    return (
        <Select value={value || NONE} onValueChange={(slug) => onChange(slug === NONE ? "" : slug)}>
            <SelectTrigger className={cn("h-9", invalid && "border-danger")} aria-label="Content page">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={NONE}>{pages.length ? "None" : "No published pages"}</SelectItem>
                {!known && value && <SelectItem value={value}>/{value} (not published)</SelectItem>}
                {pages.map((page) => (
                    <SelectItem key={page.slug} value={page.slug}>
                        {page.title} · /{page.slug}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

/* ------------------------------------------------------------------ */
/* PB-1: a form's key, and a call to action                            */
/* ------------------------------------------------------------------ */

/** The `form` block's key, picked from the forms desk — a form with nothing published is offered but named as such, since the block draws nothing until it is. */
export function FormKeyField({ value, onChange, invalid }: { value: string; onChange: (next: string) => void; invalid?: boolean }) {
    const { forms } = useBuilder();
    if (forms.length === 0) {
        return (
            <div className="space-y-1">
                <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="event-signup" className={cn("h-9 font-mono", invalid && "border-danger")} aria-label="Form key" />
                <p className="text-[11px] text-muted-foreground">
                    The forms list could not be read — type the key as{" "}
                    <Link href="/content/forms" target="_blank" rel="noopener" className="underline">
                        Content › Forms
                    </Link>{" "}
                    names it.
                </p>
            </div>
        );
    }
    const known = forms.find((form) => form.key === value);
    return (
        <div className="flex items-center gap-3">
            <Select value={value || NONE} onValueChange={(key) => onChange(key === NONE ? "" : key)}>
                <SelectTrigger className={cn("h-9 min-w-0 flex-1", invalid && "border-danger")} aria-label="Form">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={NONE}>Pick a form</SelectItem>
                    {!known && value && <SelectItem value={value}>{value} (unknown)</SelectItem>}
                    {forms.map((form) => (
                        <SelectItem key={form.key} value={form.key}>
                            {form.title} · {form.key}
                            {form.live ? "" : " (not published)"}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {known && (
                <Link href={`/content/forms/${encodeURIComponent(known.key)}`} target="_blank" rel="noopener" className="shrink-0 text-xs text-info hover:underline" data-testid="open-form">
                    Open form →
                </Link>
            )}
        </div>
    );
}

/** A call to action: its label and where it opens — one row, so the pair stays one height. */
export function CtaField({ id, value, onChange, invalid, max = 40 }: { id: string; value: CtaValue; onChange: (next: CtaValue) => void; invalid?: boolean; max?: number }) {
    return (
        <div className="grid gap-2 sm:grid-cols-[200px_1fr]">
            <Input id={id} value={value.label} onChange={(e) => onChange({ ...value, label: e.target.value })} maxLength={max} placeholder="Button label" className={cn("h-9", invalid && "border-danger")} aria-label="Button label" />
            <TargetField value={value.target} onChange={(target) => onChange({ ...value, target })} invalid={invalid} />
        </div>
    );
}
