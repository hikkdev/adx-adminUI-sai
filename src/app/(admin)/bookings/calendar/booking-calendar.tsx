"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, List, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterChips, type FilterChip } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { formatNumber } from "@/lib/format";
import { CALENDAR_CATEGORIES, CALENDAR_CATEGORY_LABEL, type CalendarCategory, type CalendarSite } from "@/services/orders";
import {
    CALENDAR_RANGES,
    CALENDAR_RANGE_LABEL,
    calendarRows,
    dayKey,
    shiftAnchor,
    windowFor,
    windowLabel,
    type CalendarRange,
} from "./calendar-window";

interface BookingCalendarProps {
    /** The sites loaded so far, each with the orders that hold a slot on it over the window — `GET /orders/calendar`. */
    sites: CalendarSite[];
    /** How many ACTIVE sites are in the filter in all — the rail's "x of N sites". */
    total: number;
    /** By listing category, counted with the category facet removed — the chips. */
    counts: Record<string, number>;
    loadingMore: boolean;
    onLoadMore: () => void;
    /** YYYY-MM-DD, the day the window is built around. */
    anchor: string;
    onAnchorChange: (anchor: string) => void;
    range: CalendarRange;
    onRangeChange: (range: CalendarRange) => void;
    category: CalendarCategory | "";
    onCategoryChange: (category: CalendarCategory | "") => void;
    live: boolean;
}

/** The chip row over the server's category counts: every site, then one chip per category. */
export function categoryChips(counts: Record<string, number>): FilterChip<CalendarCategory | "">[] {
    const all = CALENDAR_CATEGORIES.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
    return [
        { value: "", label: "All sites", count: all },
        ...CALENDAR_CATEGORIES.map((key) => ({ value: key, label: CALENDAR_CATEGORY_LABEL[key], count: counts[key] ?? 0 })),
    ];
}

const SITE_COLUMN = "220px";
const LANE_HEIGHT = 40;

/**
 * The booking calendar (`5102:24619`), live — the frame's gantt over Lot G's
 * listings-first read.
 *
 * DECISION 17 (recorded): nothing in the platform records a Hold or a Block
 * on inventory, so the gantt draws ONLY Booked bars — one per order that
 * holds a slot on the site over the window, by its flight or, failing a
 * flight, its install slot — and everything else as Available. The Hold and
 * Blocked legend entries and their eight seeded rows are gone.
 *
 * The frame's "New booking" opens the campaign wizard (`/campaigns/new`):
 * a booking is a campaign an advertiser pays for, and the wizard is how ops
 * place one on their behalf. The site rail is the frame's "x of N sites ·
 * Load more sites" over the read's pages; the chips are its category
 * facet, counted server-side. Clicking a bar opens the order; clicking a
 * site opens the listing.
 */
export function BookingCalendar({
    sites,
    total,
    counts,
    loadingMore,
    onLoadMore,
    anchor,
    onAnchorChange,
    range,
    onRangeChange,
    category,
    onCategoryChange,
    live,
}: BookingCalendarProps) {
    const router = useRouter();
    const window = React.useMemo(() => windowFor(anchor, range), [anchor, range]);
    const rows = React.useMemo(() => calendarRows(sites, window), [sites, window]);
    const today = dayKey(new Date());
    const todayIndex = window.columns.findIndex((column) => column.key === today);
    const booked = rows.reduce((sum, row) => sum + row.bars.length, 0);
    const sitesWithBookings = rows.filter((row) => row.bars.length > 0).length;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Booking calendar"
                subtitle={
                    total
                        ? `Availability across ${formatNumber(total)} ${total === 1 ? "site" : "sites"}${booked ? ` · ${booked} ${booked === 1 ? "booking" : "bookings"} on ${sitesWithBookings} of the ${formatNumber(rows.length)} loaded` : ""}`
                        : "No active sites in this filter"
                }
                actions={
                    <>
                        <Button variant="outline" className="bg-card" asChild>
                            <Link href="/bookings">
                                <List className="mr-1.5 size-4" />
                                List view
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link href="/campaigns/new">
                                <Plus className="mr-1.5 size-4" />
                                New booking
                            </Link>
                        </Button>
                    </>
                }
            />

            <FilterChips chips={categoryChips(counts)} value={category} onChange={onCategoryChange} />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-lg border bg-card p-0.5">
                        {CALENDAR_RANGES.map((option) => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => onRangeChange(option)}
                                aria-pressed={range === option}
                                className={cn(
                                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                    range === option ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {CALENDAR_RANGE_LABEL[option]}
                            </button>
                        ))}
                    </div>
                    <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => onAnchorChange(today)}>
                        Today
                    </Button>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label="Previous window"
                            onClick={() => onAnchorChange(shiftAnchor(anchor, range, -1))}
                        >
                            <ChevronLeft className="size-4" />
                        </Button>
                        <span className="text-sm font-medium">{windowLabel(window)}</span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label="Next window"
                            onClick={() => onAnchorChange(shiftAnchor(anchor, range, 1))}
                        >
                            <ChevronRight className="size-4" />
                        </Button>
                    </div>
                    <div className="flex h-8 items-center gap-2 rounded-md border bg-card pl-3 pr-1">
                        <Label htmlFor="calendar-anchor" className="text-xs font-normal text-muted-foreground">
                            Go to
                        </Label>
                        <Input
                            id="calendar-anchor"
                            type="date"
                            value={anchor}
                            onChange={(event) => {
                                if (event.target.value) onAnchorChange(event.target.value);
                            }}
                            className="h-7 w-[150px] border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                        />
                    </div>
                </div>

                {/* Two entries, because there are two states an order can put a
                    day in. A Hold or a Block would be a third record the
                    platform does not keep. */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-sm border bg-card" />
                        Available
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-sm bg-danger-soft" />
                        Booked
                    </span>
                </div>
            </div>

            <Card className="overflow-x-auto rounded-lg border-border shadow-none">
                <div className="relative" style={{ minWidth: `calc(${SITE_COLUMN} + ${window.days * 44}px)` }}>
                    {/* Header */}
                    <div className="grid border-b bg-muted/50" style={{ gridTemplateColumns: `${SITE_COLUMN} repeat(${window.days}, 1fr)` }}>
                        <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Site</div>
                        {window.columns.map((column) => (
                            <div key={column.key} className={cn("border-l px-1 py-2 text-center", column.weekend && "bg-muted/40")}>
                                <p className="text-[10px] font-medium uppercase text-muted-foreground">{column.weekday}</p>
                                <p className={cn("text-[12px] font-semibold", column.key === today ? "text-primary" : "text-foreground")}>
                                    {column.date}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* Today marker */}
                    {todayIndex >= 0 && (
                        <div
                            aria-hidden
                            className="pointer-events-none absolute bottom-0 top-[49px] z-10 w-px bg-primary"
                            style={{ left: `calc(${SITE_COLUMN} + (100% - ${SITE_COLUMN}) / ${window.days} * ${todayIndex + 0.5})` }}
                        />
                    )}

                    {/* Rows */}
                    {rows.length === 0 ? (
                        <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                            No active site in this filter. A site appears here once its listing is live.
                        </p>
                    ) : (
                        rows.map((row) => (
                            <div
                                key={row.key}
                                className="grid border-b last:border-0"
                                style={{
                                    gridTemplateColumns: `${SITE_COLUMN} repeat(${window.days}, 1fr)`,
                                    gridTemplateRows: `repeat(${row.lanes}, ${LANE_HEIGHT}px)`,
                                }}
                            >
                                <div className="flex flex-col justify-center px-4 py-2" style={{ gridColumn: 1, gridRow: `1 / span ${row.lanes}` }}>
                                    <Link
                                        href={`/listings/${row.listingId}`}
                                        className="truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
                                    >
                                        {row.site}
                                    </Link>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {[
                                            CALENDAR_CATEGORY_LABEL[row.category as CalendarCategory] ?? row.category,
                                            row.city,
                                            row.slotsTotal > 1 ? `${row.slotsTotal} slots` : null,
                                            row.bars.length ? `${row.bars.length} ${row.bars.length === 1 ? "booking" : "bookings"}` : "available",
                                        ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </p>
                                </div>
                                {window.columns.map((column, index) => (
                                    <div
                                        key={column.key}
                                        aria-hidden
                                        className={cn("border-l", column.weekend && "bg-muted/20")}
                                        style={{ gridColumn: index + 2, gridRow: `1 / span ${row.lanes}` }}
                                    />
                                ))}
                                {row.bars.map((bar) => (
                                    <button
                                        key={bar.orderId}
                                        type="button"
                                        title={`${bar.label} · ${row.site}`}
                                        onClick={() => router.push(`/orders/${bar.orderId}`)}
                                        className="z-[5] m-1 truncate rounded-md bg-danger-soft px-2 py-1.5 text-left text-xs font-medium text-danger"
                                        style={{ gridColumnStart: bar.from + 1, gridColumnEnd: bar.to + 2, gridRow: bar.lane + 1 }}
                                    >
                                        {bar.label}
                                    </button>
                                ))}
                            </div>
                        ))
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground">
                        <span>
                            {formatNumber(rows.length)} of {formatNumber(total)} {total === 1 ? "site" : "sites"} · booked bars are orders with a flight, or an install
                            slot when no flight is set
                            {!live && " · seeded rows; connect the API for real bookings"}
                        </span>
                        {rows.length < total && (
                            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onLoadMore} disabled={loadingMore}>
                                {loadingMore ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                                Load more sites
                            </Button>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
}
