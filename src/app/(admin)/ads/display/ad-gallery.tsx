"use client";

import { ImageOff, List, LayoutGrid } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/adx/empty-state";
import { StatusBadge } from "@/components/adx/status-badge";
import { cn } from "@/lib/utils";
import { PROMOTION_STATUS_META, buyerLabel, runLabel, type AdBookingRow } from "@/services/promotions";

/**
 * Display ads › Gallery (28 Sep 2026). The owner, looking at Content ›
 * Media library full of "Ad artwork" cards: "if this is about ads,
 * shouldn't it be present inside ads and promotions?" So the artwork
 * advertisers upload left the library (it asks `owner=adx` now) and is
 * shown here, with its ad: every ad the desk has loaded — under the same
 * status chips, slot and search — as a card of its artwork with the
 * booking reference, the advertiser, the slot, the status and the dates.
 * A card opens the ad's own detail, the same sheet the list opens.
 *
 * The artwork is the ad's current picture as the desk's list carries it
 * (a replaced picture is archived and drops off); an ad with none yet
 * shows the empty frame, so the gallery counts what the list counts.
 */

export type DisplayAdsView = "list" | "gallery";

const VIEWS: { id: DisplayAdsView; label: string; icon: typeof List }[] = [
    { id: "list", label: "List", icon: List },
    { id: "gallery", label: "Gallery", icon: LayoutGrid },
];

/** List or Gallery — the console's segmented toggle (the Tasks board draws the same one). */
export function DisplayAdsViewToggle({ value, onChange }: { value: DisplayAdsView; onChange: (next: DisplayAdsView) => void }) {
    return (
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1" role="group" aria-label="View">
            {VIEWS.map((item) => (
                <button
                    key={item.id}
                    type="button"
                    aria-pressed={value === item.id}
                    onClick={() => onChange(item.id)}
                    className={cn(
                        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors",
                        value === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                    data-testid={`ads-view-${item.id}`}
                >
                    <item.icon className="size-4" aria-hidden />
                    {item.label}
                </button>
            ))}
        </div>
    );
}

export function AdGallery({ rows, loading, onOpen }: { rows: AdBookingRow[]; loading: boolean; onOpen: (id: string) => void }) {
    if (rows.length === 0) {
        return (
            <Card className="rounded-lg border-border shadow-none">
                <EmptyState
                    icon={ImageOff}
                    title={loading ? "Loading…" : "No ads match"}
                    description={loading ? "Reading the ads." : "The artwork an advertiser uploads with a display ad is shown here with its ad."}
                />
            </Card>
        );
    }
    return (
        <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", loading && "opacity-60")} data-testid="ad-gallery">
            {rows.map((row) => (
                <button
                    key={row.id}
                    type="button"
                    onClick={() => onOpen(row.id)}
                    className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid={`ad-gallery-card-${row.id}`}
                >
                    <span className="relative flex aspect-[4/3] w-full items-center justify-center bg-muted/60 p-2">
                        {row.media?.url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- the buyer's stored artwork, any size
                            <img src={row.media.url} alt={row.media.altText ?? ""} className="max-h-full max-w-full object-contain" loading="lazy" />
                        ) : (
                            <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                                <ImageOff className="size-5" aria-hidden />
                                No artwork uploaded
                            </span>
                        )}
                        <span className="absolute left-1.5 top-1.5 rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-background">Ad</span>
                    </span>
                    <span className="flex w-full flex-1 flex-col gap-1 p-3">
                        <span className="truncate text-sm font-medium text-foreground group-hover:underline">{row.title}</span>
                        <span className="flex items-center justify-between gap-2">
                            <span className="truncate font-mono text-[11px] text-muted-foreground">{row.displayId ?? row.id}</span>
                            <StatusBadge status={PROMOTION_STATUS_META[row.status] ?? { label: row.status, tone: "neutral" }} />
                        </span>
                        <span className="truncate text-xs text-foreground">{buyerLabel(row)}</span>
                        <span className="truncate text-xs text-muted-foreground">{row.slot?.label ?? "—"}</span>
                        <span className="mt-auto pt-1 text-[11px] text-muted-foreground">{runLabel(row)}</span>
                    </span>
                </button>
            ))}
        </div>
    );
}
