"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, List, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/adx/page-header";

type SlotKind = "booked" | "hold" | "blocked";

interface CalendarBar {
    label: string;
    kind: SlotKind;
    /** 1-based day index within the 14-day window. */
    from: number;
    to: number;
}

interface CalendarRow {
    site: string;
    meta: string;
    bars: CalendarBar[];
}

const days = [
    ["Mon", "14"], ["Tue", "15"], ["Wed", "16"], ["Thu", "17"], ["Fri", "18"],
    ["Sat", "19"], ["Sun", "20"], ["Mon", "21"], ["Tue", "22"], ["Wed", "23"],
    ["Thu", "24"], ["Fri", "25"], ["Sat", "26"], ["Sun", "27"],
] as [string, string][];

const TODAY_INDEX = 5; // Fri 18

const rows: CalendarRow[] = [
    {
        site: "MG Road Billboard",
        meta: "Static · Bengaluru",
        bars: [
            { label: "Zomato Diwali", kind: "booked", from: 1, to: 5 },
            { label: "PhonePe", kind: "hold", from: 8, to: 12 },
        ],
    },
    {
        site: "Phoenix Atrium 3F",
        meta: "Video · Mumbai",
        bars: [{ label: "Nike Run Club", kind: "booked", from: 1, to: 14 }],
    },
    {
        site: "FitZone Mirrors",
        meta: "Transit · Bengaluru",
        bars: [
            { label: "Cred Rewards", kind: "booked", from: 3, to: 7 },
            { label: "Swiggy Late Night", kind: "booked", from: 9, to: 14 },
        ],
    },
    {
        site: "Koramangala Metro",
        meta: "Static · Bengaluru",
        bars: [{ label: "Maintenance", kind: "blocked", from: 4, to: 8 }],
    },
    {
        site: "Whitefield Lot",
        meta: "Static · Bengaluru",
        bars: [
            { label: "Ola Refresh", kind: "booked", from: 1, to: 4 },
            { label: "Zepto", kind: "hold", from: 11, to: 14 },
        ],
    },
    {
        site: "80ft Road Hoarding",
        meta: "Static · Bengaluru",
        bars: [],
    },
    {
        site: "Indiranagar Wall",
        meta: "Static · Bengaluru",
        bars: [{ label: "Cafe Coffee Day", kind: "booked", from: 6, to: 11 }],
    },
    {
        site: "HSR Panel",
        meta: "Static · Bengaluru",
        bars: [
            { label: "Blinkit", kind: "hold", from: 2, to: 5 },
            { label: "Zomato Diwali", kind: "booked", from: 8, to: 13 },
        ],
    },
];

const kindClasses: Record<SlotKind, string> = {
    booked: "bg-danger-soft text-danger",
    hold: "bg-warning-soft text-warning",
    blocked: "bg-muted text-muted-foreground",
};

const legend: { label: string; className: string }[] = [
    { label: "Available", className: "border bg-card" },
    { label: "Booked", className: "bg-danger-soft" },
    { label: "Hold", className: "bg-warning-soft" },
    { label: "Blocked", className: "bg-muted" },
];

const ranges = ["Week", "2 weeks", "Month"];

export function BookingCalendar() {
    const [range, setRange] = React.useState("2 weeks");

    return (
        <div className="space-y-5">
            <PageHeader
                title="Booking calendar"
                subtitle="Availability across 8 sites"
                actions={
                    <>
                        <Button variant="outline" className="bg-card" asChild>
                            <Link href="/bookings">
                                <List className="mr-1.5 size-4" />
                                List view
                            </Link>
                        </Button>
                        <Button onClick={() => toast.info("Pick a site and window to hold inventory.")}>
                            <Plus className="mr-1.5 size-4" />
                            New booking
                        </Button>
                    </>
                }
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-lg border bg-card p-0.5">
                        {ranges.map((option) => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => setRange(option)}
                                className={cn(
                                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                                    range === option
                                        ? "bg-foreground text-background"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                    <Button variant="outline" size="sm" className="h-8 bg-card">
                        Today
                    </Button>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="size-8" aria-label="Previous window">
                            <ChevronLeft className="size-4" />
                        </Button>
                        <span className="text-sm font-medium">14 Apr to 27 Apr</span>
                        <Button variant="ghost" size="icon" className="size-8" aria-label="Next window">
                            <ChevronRight className="size-4" />
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {legend.map((item) => (
                        <span key={item.label} className="flex items-center gap-1.5">
                            <span className={cn("size-2.5 rounded-sm", item.className)} />
                            {item.label}
                        </span>
                    ))}
                </div>
            </div>

            <Card className="overflow-x-auto rounded-lg border-border shadow-none">
                <div className="relative min-w-[980px]">
                    {/* Header */}
                    <div
                        className="grid border-b bg-muted/50"
                        style={{ gridTemplateColumns: "200px repeat(14, 1fr)" }}
                    >
                        <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Site
                        </div>
                        {days.map(([weekday, date], index) => (
                            <div
                                key={`${weekday}-${date}`}
                                className={cn(
                                    "border-l px-1 py-2 text-center",
                                    index >= 5 && index <= 6 && "bg-muted/40",
                                    index >= 12 && "bg-muted/40"
                                )}
                            >
                                <p className="text-[10px] font-medium uppercase text-muted-foreground">
                                    {weekday}
                                </p>
                                <p className="text-[12px] font-semibold text-foreground">{date}</p>
                            </div>
                        ))}
                    </div>

                    {/* Today marker */}
                    <div
                        aria-hidden
                        className="pointer-events-none absolute bottom-0 top-[49px] z-10 w-px bg-primary"
                        style={{
                            left: `calc(200px + (100% - 200px) / 14 * ${TODAY_INDEX - 0.5})`,
                        }}
                    />

                    {/* Rows */}
                    {rows.map((row) => (
                        <div
                            key={row.site}
                            className="grid items-center border-b last:border-0"
                            style={{ gridTemplateColumns: "200px repeat(14, 1fr)" }}
                        >
                            <div className="px-4 py-4">
                                <p className="text-sm font-medium text-foreground">{row.site}</p>
                                <p className="text-xs text-muted-foreground">{row.meta}</p>
                            </div>
                            {days.map((_, index) => (
                                <div
                                    key={index}
                                    aria-hidden
                                    className="h-full min-h-[64px] border-l"
                                    style={{ gridColumn: index + 2, gridRow: 1 }}
                                />
                            ))}
                            {row.bars.map((bar) => (
                                <button
                                    key={`${row.site}-${bar.label}-${bar.from}`}
                                    type="button"
                                    onClick={() => toast.info(`${bar.label}: ${row.site}`)}
                                    className={cn(
                                        "z-[5] row-start-1 mx-0.5 truncate rounded-md px-2 py-1.5 text-left text-xs font-medium",
                                        kindClasses[bar.kind]
                                    )}
                                    style={{
                                        gridColumnStart: bar.from + 1,
                                        gridColumnEnd: bar.to + 2,
                                        gridRow: 1,
                                    }}
                                >
                                    {bar.label}
                                </button>
                            ))}
                        </div>
                    ))}

                    <div className="flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground">
                        <span>8 of 42 sites</span>
                        <button
                            type="button"
                            className="font-medium text-primary underline-offset-4 hover:underline"
                            onClick={() => toast.info("Loading the next 8 sites")}
                        >
                            Load more sites
                        </button>
                    </div>
                </div>
            </Card>
        </div>
    );
}
