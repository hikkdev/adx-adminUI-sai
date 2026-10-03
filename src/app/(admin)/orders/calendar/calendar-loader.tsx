"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { orderService, type CalendarCategory, type CalendarPage, type CalendarSite } from "@/services/orders";
import { BookingCalendar } from "./booking-calendar";
import { dayKey, windowBounds, windowFor, type CalendarRange } from "./calendar-window";

/**
 * The calendar's data — Lot G (Q114): `GET /orders/calendar`, listings first.
 *
 * A view over the ORDERS domain, like the board: it reads `isLive("orders")`
 * rather than a flag of its own, and the eight seeded sites with their Hold
 * and Blocked bars are gone (DECISION 17 — nothing records a hold or a block).
 *
 * The read pages ACTIVE sites on the list contract and hangs the window's
 * slot-holding orders on each, so a quiet site is an empty row rather than
 * an absence. The rail shows the pages loaded so far — "x of N sites" — and
 * "Load more sites" asks for the next; a new window or chip starts again
 * from the first page, because a site's orders are the window's.
 */
export const CALENDAR_SITES_PER_PAGE = 25;

/** The pages loaded so far, folded into one rail, with the server's total and chip counts. */
export interface CalendarRail {
    sites: CalendarSite[];
    total: number;
    counts: Record<string, number>;
}

/** Folds the pages asked for so far into one rail; the total and the counts are the latest page's. */
export function foldRail(pages: CalendarPage[]): CalendarRail {
    const last = pages[pages.length - 1];
    return {
        sites: pages.flatMap((page) => page.items),
        total: last?.total ?? 0,
        counts: last?.counts ?? {},
    };
}

export function CalendarLoader() {
    const live = isLive("orders");
    const [anchor, setAnchor] = React.useState<string>(() => dayKey(new Date()));
    const [range, setRange] = React.useState<CalendarRange>("FORTNIGHT");
    const [category, setCategory] = React.useState<CalendarCategory | "">("");
    const [pages, setPages] = React.useState(1);
    const bounds = windowBounds(windowFor(anchor, range));

    /* Every page loaded so far is asked for together: the key carries the
       page count, so "Load more" is one more page in the same read rather
       than a second resource whose rows have to be merged by hand. The
       server caches nothing here, but a page of sites is cheap. */
    const resource = useApiResource<CalendarRail>(
        `bookings:calendar:${live}:${bounds.from}:${bounds.to}:${category}:${pages}`,
        async () => {
            const answers = await Promise.all(
                Array.from({ length: pages }, (_, index) =>
                    orderService.calendar({
                        from: bounds.from,
                        to: bounds.to,
                        ...(category ? { category } : {}),
                        page: index + 1,
                        pageSize: CALENDAR_SITES_PER_PAGE,
                    }),
                ),
            );
            return foldRail(answers);
        },
    );

    const changeAnchor = (next: string) => {
        setAnchor(next);
        setPages(1);
    };
    const changeRange = (next: CalendarRange) => {
        setRange(next);
        setPages(1);
    };
    const changeCategory = (next: CalendarCategory | "") => {
        setCategory(next);
        setPages(1);
    };

    return (
        <ResourceBoundary resource={resource}>
            {(rail) => (
                <BookingCalendar
                    sites={rail.sites}
                    total={rail.total}
                    counts={rail.counts}
                    loadingMore={resource.loading}
                    onLoadMore={() => setPages((count) => count + 1)}
                    anchor={anchor}
                    onAnchorChange={changeAnchor}
                    range={range}
                    onRangeChange={changeRange}
                    category={category}
                    onCategoryChange={changeCategory}
                    live={live}
                />
            )}
        </ResourceBoundary>
    );
}
