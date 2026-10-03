"use client";

import * as React from "react";
import { ImageOff, LayoutGrid, List, Star, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PrivateFile } from "@/components/adx/private-file";
import { StatusBadge } from "@/components/adx/status-badge";
import { SuspendedChip } from "@/components/adx/suspended-chip";
import { formatMoney, formatNumber } from "@/lib/format";
import { LISTING_STATUS_TONE, listingCategoryLabel, listingStatusLabel, type AdminListing } from "@/services/listings";

/**
 * The Listings table's grid view (3 Oct 2026) — the owner: "is it possible
 * to see the listings in a grid view with photos".
 *
 * One card per listing: the cover photograph (the front one, else the
 * first filed — the read decides), or a placeholder; the name, the LST-
 * reference, the publisher, the city, the category, the rate a day, the
 * status pill, and one line of track record. The checkbox on the corner
 * and the click that opens the listing are the shared table's, so the grid
 * selects and pages exactly as the rows do.
 */

/** "12 bookings · ★4.2", "No bookings yet", or the stars alone on an older backend. */
export function trackRecordLine(listing: Pick<AdminListing, "bookingCount" | "ratingAvg" | "reviewCount">): string {
    const bookings =
        listing.bookingCount === null ? null : listing.bookingCount === 0 ? "No bookings yet" : `${formatNumber(listing.bookingCount)} booking${listing.bookingCount === 1 ? "" : "s"}`;
    const stars = listing.ratingAvg ? `★${Number(listing.ratingAvg).toFixed(1)} (${formatNumber(listing.reviewCount)})` : null;
    return [bookings, stars].filter(Boolean).join(" · ") || "No reviews yet";
}

export function ListingGridCard({ listing, instantBooking }: { listing: AdminListing; instantBooking: boolean }) {
    return (
        <article aria-label={listing.title} data-testid="listing-card">
            <div className="relative aspect-[4/3] w-full bg-muted">
                {listing.coverPhotoUrl ? (
                    <PrivateFile
                        src={listing.coverPhotoUrl}
                        alt={`${listing.title} — cover photograph`}
                        kind="image"
                        className="h-full w-full object-cover"
                        frameClassName="h-full w-full"
                        loading="lazy"
                    />
                ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground" data-testid="listing-card-placeholder">
                        <ImageOff className="size-6" strokeWidth={1.5} aria-hidden />
                        <span className="text-xs">No photograph yet</span>
                    </div>
                )}
                <span className="absolute right-2 top-2 flex flex-wrap justify-end gap-1">
                    <StatusBadge status={{ label: listingStatusLabel(listing.status), tone: LISTING_STATUS_TONE[listing.status] }} className="shadow-sm" />
                    {listing.status !== "SUSPENDED" && <SuspendedChip scopes={listing.suspensionScopes} />}
                </span>
            </div>
            <div className="space-y-1 p-3">
                {/* Stored text is drawn exactly as stored — a replacement character included. */}
                <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{listing.title}</h3>
                <p className="truncate text-xs text-muted-foreground">{[listing.displayId, listing.city].filter(Boolean).join(" · ") || listing.address}</p>
                <p className="truncate text-xs text-muted-foreground">
                    {[listing.publisherName ?? "Unclaimed", listingCategoryLabel(listing.category), listing.subType].filter(Boolean).join(" · ")}
                </p>
                <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                        {listing.ratePerDay ? `${formatMoney(listing.ratePerDay)} / day` : "Not priced"}
                    </span>
                    {instantBooking && listing.instantBooking === true ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                            <Zap className="size-3" aria-hidden />
                            Instant
                        </span>
                    ) : null}
                </div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    {listing.ratingAvg ? <Star className="size-3 fill-warning text-warning" aria-hidden /> : null}
                    {trackRecordLine(listing)}
                </p>
            </div>
        </article>
    );
}

/* ------------------------------------------------------------------ */
/* Table / Grid — remembered per viewer                                 */
/* ------------------------------------------------------------------ */

export type DirectoryView = "table" | "grid";

/** Kept in this browser, per viewer — the same way the maps keep their tone. */
export const DIRECTORY_VIEW_KEY = "adx.console.listings.view";

const viewOf = (raw: string | null): DirectoryView => (raw === "grid" ? "grid" : "table");

/*
 * One value for the tab, read from localStorage on the first read in the
 * browser — the maps' tone works the same way (`use-map-tone`). The server
 * and the first hydration pass see the table, so the markup never
 * mismatches; storage that refuses (a private window) leaves the table.
 */
let stored: DirectoryView | undefined;
const listeners = new Set<() => void>();

function readView(): DirectoryView {
    if (stored === undefined) {
        try {
            stored = viewOf(window.localStorage.getItem(DIRECTORY_VIEW_KEY));
        } catch {
            stored = "table";
        }
    }
    return stored;
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
        if (event.key !== DIRECTORY_VIEW_KEY) return;
        stored = viewOf(event.newValue);
        listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

export function setDirectoryView(next: DirectoryView): void {
    stored = next;
    try {
        window.localStorage.setItem(DIRECTORY_VIEW_KEY, next);
    } catch {
        /* Storage blocked: the choice still holds for this tab. */
    }
    listeners.forEach((listener) => listener());
}

/** For tests: forget the tab's value so the next read goes back to storage. */
export function resetDirectoryViewForTests(): void {
    stored = undefined;
}

/** The table opens as this viewer last left it. */
export function useDirectoryView(): [DirectoryView, (next: DirectoryView) => void] {
    const view = React.useSyncExternalStore(subscribe, readView, (): DirectoryView => "table");
    return [view, setDirectoryView];
}

/** The Table / Grid choice, drawn as the header's outline buttons beside Map view. */
export function DirectoryViewToggle({ view, onChange }: { view: DirectoryView; onChange: (next: DirectoryView) => void }) {
    const options: { value: DirectoryView; label: string; Icon: typeof List }[] = [
        { value: "table", label: "Table", Icon: List },
        { value: "grid", label: "Grid", Icon: LayoutGrid },
    ];
    return (
        <div role="group" aria-label="View" className="inline-flex rounded-md shadow-xs">
            {options.map(({ value, label, Icon }, index) => (
                <Button
                    key={value}
                    type="button"
                    variant="outline"
                    aria-pressed={view === value}
                    onClick={() => onChange(value)}
                    className={cn(
                        "bg-card",
                        index === 0 ? "rounded-r-none" : "-ml-px rounded-l-none",
                        view === value && "bg-muted text-foreground",
                    )}
                >
                    <Icon className="mr-1.5 size-4" />
                    {label}
                </Button>
            ))}
        </div>
    );
}
