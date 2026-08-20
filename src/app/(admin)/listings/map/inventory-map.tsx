"use client";

import * as React from "react";
import Link from "next/link";
import { List, LocateFixed, Minus, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatINR, formatNumber } from "@/lib/format";
import type { StatusMeta } from "@/types";

interface ClusterSite {
    title: string;
    spec: string;
    status: StatusMeta;
    rate: number;
}

interface Cluster {
    id: string;
    name: string;
    count: number;
    booked: number;
    /** Real coordinates for the map embed. */
    lat: number;
    lng: number;
    sites: ClusterSite[];
}

const cityFilters = [
    { city: "Bengaluru", count: 412, checked: true },
    { city: "Mumbai", count: 268, checked: true },
    { city: "Delhi", count: 173, checked: false },
    { city: "Hyderabad", count: 121, checked: false },
    { city: "Chennai", count: 78, checked: false },
    { city: "Pune", count: 40, checked: false },
];

const formats = ["Outdoor", "Transit", "Indoor", "Media"];

const clusters: Cluster[] = [
    {
        id: "koramangala",
        name: "Koramangala",
        count: 24,
        booked: 18,
        lat: 12.9352,
        lng: 77.6245,
        sites: [
            { title: "MG Road Billboard", spec: "Static · 6×3 m", status: { label: "Live", tone: "success" }, rate: 45000 },
            { title: "Phoenix Atrium 3F", spec: "Video · 8×12 m", status: { label: "Live", tone: "success" }, rate: 180000 },
            { title: "FitZone Mirrors", spec: "Transit · 24 units", status: { label: "Live", tone: "success" }, rate: 36000 },
            { title: "Koramangala Metro", spec: "Static · 6×4 m", status: { label: "Review", tone: "warning" }, rate: 28000 },
            { title: "80ft Road Hoarding", spec: "Static · 10×5 m", status: { label: "Vacant", tone: "neutral" }, rate: 38000 },
        ],
    },
    {
        id: "indiranagar",
        name: "Indiranagar",
        count: 12,
        booked: 9,
        lat: 12.9784,
        lng: 77.6408,
        sites: [
            { title: "100ft Road LED", spec: "Digital · 6×9 m", status: { label: "Live", tone: "success" }, rate: 295000 },
            { title: "CMH Road Wrap", spec: "Static · 9×6 m", status: { label: "Vacant", tone: "neutral" }, rate: 64000 },
        ],
    },
    {
        id: "whitefield",
        name: "Whitefield",
        count: 31,
        booked: 22,
        lat: 12.9698,
        lng: 77.7500,
        sites: [
            { title: "Whitefield Lot", spec: "Static · 8×6 m", status: { label: "Live", tone: "success" }, rate: 125000 },
            { title: "ITPL Approach Gantry", spec: "Gantry · 14×4 m", status: { label: "Live", tone: "success" }, rate: 210000 },
        ],
    },
    {
        id: "hebbal",
        name: "Hebbal",
        count: 8,
        booked: 6,
        lat: 13.0358,
        lng: 77.5970,
        sites: [
            { title: "Hebbal Flyover Facade", spec: "Static · 12×8 m", status: { label: "Live", tone: "success" }, rate: 260000 },
        ],
    },
    {
        id: "jayanagar",
        name: "Jayanagar",
        count: 9,
        booked: 4,
        lat: 12.9308,
        lng: 77.5838,
        sites: [
            { title: "4th Block Arch", spec: "Static · 6×3 m", status: { label: "Vacant", tone: "neutral" }, rate: 42000 },
        ],
    },
    {
        id: "airportrd",
        name: "Airport Road",
        count: 17,
        booked: 15,
        lat: 13.1986,
        lng: 77.7066,
        sites: [
            { title: "Trumpet Flyover Unipole", spec: "Static · 12×6 m", status: { label: "Live", tone: "success" }, rate: 340000 },
        ],
    },
    {
        id: "mgroad",
        name: "MG Road",
        count: 5,
        booked: 5,
        lat: 12.9757,
        lng: 77.6011,
        sites: [
            { title: "Metro Pillar Series", spec: "Transit · 12 pillars", status: { label: "Live", tone: "success" }, rate: 96000 },
        ],
    },
];

export function InventoryMap() {
    const [selected, setSelected] = React.useState<Cluster>(clusters[0]);
    const [zoom, setZoom] = React.useState(1);
    const occupancy = Math.round((selected.booked / selected.count) * 100);

    return (
        <div className="space-y-5">
            <PageHeader
                title="Inventory map"
                subtitle="1,092 active listings across 6 cities"
                actions={
                    <>
                        <Button variant="outline" className="bg-card" asChild>
                            <Link href="/listings">
                                <List className="mr-1.5 size-4" />
                                List view
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link href="/listings/new">
                                <Plus className="mr-1.5 size-4" />
                                Add listing
                            </Link>
                        </Button>
                    </>
                }
            />

            <div className="grid gap-4 xl:grid-cols-[260px_1fr_300px]">
                {/* Filters */}
                <Card className="h-fit rounded-lg border-border p-4 shadow-none">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Filters
                    </h3>
                    <div className="relative mt-3">
                        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder="Search sites" className="h-9 pl-8" />
                    </div>

                    <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        City
                    </p>
                    <ul className="mt-2 space-y-2">
                        {cityFilters.map((filter) => (
                            <li key={filter.city} className="flex items-center gap-2.5">
                                <Checkbox defaultChecked={filter.checked} id={`city-${filter.city}`} />
                                <label
                                    htmlFor={`city-${filter.city}`}
                                    className="flex flex-1 items-center justify-between text-sm"
                                >
                                    <span className="text-foreground">{filter.city}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {formatNumber(filter.count)}
                                    </span>
                                </label>
                            </li>
                        ))}
                    </ul>

                    <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Format
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {formats.map((format, index) => (
                            <button
                                key={format}
                                type="button"
                                className={cn(
                                    "h-7 rounded-full border px-2.5 text-xs font-medium transition-colors",
                                    index === 0
                                        ? "border-foreground bg-foreground text-background"
                                        : "bg-card text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {format}
                            </button>
                        ))}
                    </div>

                    <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Availability
                    </p>
                    <div className="mt-2 space-y-1.5 text-sm">
                        {["All", "Vacant now", "Booked"].map((option, index) => (
                            <label key={option} className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="availability"
                                    defaultChecked={index === 0}
                                    className="size-3.5 accent-[hsl(359.5_85.5%_29.8%)]"
                                />
                                {option}
                            </label>
                        ))}
                    </div>

                    <button
                        type="button"
                        className="mt-4 border-t pt-3 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        onClick={() => toast.info("Filters reset")}
                    >
                        Reset filters
                    </button>
                </Card>

                {/* Map ------------------------------------------------- */}
                <Card className="relative min-h-[540px] overflow-hidden rounded-lg border-border shadow-none">
                    <iframe
                        key={`${selected.id}-${zoom}`}
                        title={`Map of ${selected.name}`}
                        className="absolute inset-0 size-full border-0"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        src={`https://www.openstreetmap.org/export/embed.html?bbox=${
                            selected.lng - 0.045 / zoom
                        }%2C${selected.lat - 0.03 / zoom}%2C${selected.lng + 0.045 / zoom}%2C${
                            selected.lat + 0.03 / zoom
                        }&layer=mapnik&marker=${selected.lat}%2C${selected.lng}`}
                    />

                    {/* Cluster switcher */}
                    <div className="absolute inset-x-4 top-4 z-10 flex flex-wrap gap-1.5">
                        {clusters.map((cluster) => {
                            const active = cluster.id === selected.id;
                            return (
                                <button
                                    key={cluster.id}
                                    type="button"
                                    onClick={() => setSelected(cluster)}
                                    aria-pressed={active}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm transition-colors",
                                        active
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : "border-border bg-card text-foreground hover:border-foreground"
                                    )}
                                >
                                    {cluster.name}
                                    <span
                                        className={cn(
                                            "rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                                            active ? "bg-background/20" : "bg-muted"
                                        )}
                                    >
                                        {cluster.count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Map controls */}
                    <div className="absolute right-4 top-16 z-10 flex flex-col overflow-hidden rounded-md border bg-card shadow-sm">
                        <button
                            type="button"
                            aria-label="Zoom in"
                            className="flex size-8 items-center justify-center border-b transition-colors hover:bg-muted"
                            onClick={() => setZoom((value) => Math.min(4, value * 1.5))}
                        >
                            <Plus className="size-4" />
                        </button>
                        <button
                            type="button"
                            aria-label="Zoom out"
                            className="flex size-8 items-center justify-center border-b transition-colors hover:bg-muted"
                            onClick={() => setZoom((value) => Math.max(0.5, value / 1.5))}
                        >
                            <Minus className="size-4" />
                        </button>
                        <button
                            type="button"
                            aria-label="Reset view"
                            className="flex size-8 items-center justify-center transition-colors hover:bg-muted"
                            onClick={() => setZoom(1)}
                        >
                            <LocateFixed className="size-4" />
                        </button>
                    </div>

                    <a
                        href={`https://www.openstreetmap.org/?mlat=${selected.lat}&mlon=${selected.lng}#map=14/${selected.lat}/${selected.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="absolute bottom-3 right-4 z-10 rounded bg-card/90 px-2 py-1 text-[10px] text-muted-foreground shadow-sm"
                    >
                        © OpenStreetMap contributors
                    </a>
                </Card>

                {/* Cluster rail */}
                <Card className="flex h-fit flex-col rounded-lg border-border shadow-none">
                    <div className="border-b p-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Selected cluster
                        </h3>
                        <p className="mt-1.5 text-base font-semibold text-foreground">{selected.name}</p>
                        <p className="text-sm text-muted-foreground">
                            {selected.count} listings · {selected.booked} booked
                        </p>
                        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                            <span>Occupancy</span>
                            <span className="font-semibold text-foreground">{occupancy}%</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                            <div
                                className="h-full rounded-full bg-foreground"
                                style={{ width: `${occupancy}%` }}
                            />
                        </div>
                    </div>

                    <div className="p-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Sites
                        </h4>
                        <ul className="mt-2 divide-y">
                            {selected.sites.map((site) => (
                                <li key={site.title} className="flex items-center gap-3 py-2.5">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {site.title}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{site.spec}</p>
                                    </div>
                                    <StatusBadge status={site.status} />
                                    <span className="w-[76px] shrink-0 text-right text-xs font-semibold">
                                        {formatINR(site.rate)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <Button variant="outline" className="mt-3 w-full bg-card" asChild>
                            <Link href="/listings">Open cluster in list</Link>
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
}
