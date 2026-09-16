"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, List, LocateFixed, MapPinOff, Minus, Plus, Search } from "lucide-react";
import { MapSurface, type MapPoint } from "@/components/adx/map";
import { cameraFor, cameraInto, stepZoom, type Camera } from "@/lib/map-geometry";
import type { MapsClientConfig } from "@/services/maps";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge, TrafficLight } from "@/components/adx/status-badge";
import { formatMoney, formatNumber } from "@/lib/format";
import {
    LISTING_LIFECYCLE,
    LISTING_STATUS_TONE,
    listingStatusLabel,
    type AdminListingsPage,
    type ListingLifecycle,
} from "@/services/listings";
import { NO_CITY, clustersOf, placeable, type Cluster, type Pin } from "./map-clusters";

interface InventoryMapProps {
    page: AdminListingsPage;
    /** G13-C: `GET /app/maps` — the provider and its browser key; null draws the seam's placeholder. */
    mapsConfig: MapsClientConfig | null;
}

/** A pin as the map surface draws it: its status tone and its title. */
type PinPoint = Pin & MapPoint;

const toPoint = (pin: Pin): PinPoint => ({ ...pin, tone: LISTING_STATUS_TONE[pin.status], title: pin.title });

/** The camera's fallback while nothing is placed — the country, wide. */
const INDIA: Camera = { latitude: 21.5, longitude: 79, zoom: 4 };

/** The zoom a chosen pin is shown at: close enough to read its street, never further out than the operator already is. */
const PIN_ZOOM = 15;

/** The category names the API keeps, as the chips print them. */
const categoryLabel = (category: string): string =>
    category.charAt(0) + category.slice(1).toLowerCase().replace(/_/g, " ");

/**
 * The inventory map, live — the frame's three-column layout (`5102:37531`)
 * over `GET /listings`.
 *
 * The seven clusters and the thousand listings it used to carry inside the
 * component are gone. A cluster is a city, centred on the mean of its
 * placed spots; the chips over the map switch between them, the rail
 * beside the map lists the chosen city's pins, each coloured by the
 * listing's status and linked to its page. Rows the API sent without a fix
 * are not drawn and the caption says how many.
 *
 * G13-C: the map itself is the console's map seam (`components/adx/map.tsx`)
 * over Google Maps — every placed listing in the filter is a marker on the
 * tiles, coloured by its status, folding into numbered bubbles as the
 * camera pulls out; a bubble zooms in on itself, a marker selects its row
 * in the rail, and a row in the rail flies the camera to its marker. The
 * browser key is `GET /app/maps` (the seam); with none set yet the surface
 * is the placeholder with the vendor sentence, and the rail still works.
 * The OpenStreetMap iframe that stood in until now is gone.
 */
export function InventoryMap({ page, mapsConfig }: InventoryMapProps) {
    const { pins, skipped } = React.useMemo(() => placeable(page.items), [page.items]);

    const [q, setQ] = React.useState("");
    const [hiddenCities, setHiddenCities] = React.useState<Set<string>>(() => new Set());
    const [category, setCategory] = React.useState<string | "ALL">("ALL");
    const [status, setStatus] = React.useState<ListingLifecycle | "ALL">("ALL");
    const [selectedCity, setSelectedCity] = React.useState<string | null>(null);
    const [selectedPinId, setSelectedPinId] = React.useState<string | null>(null);

    const allClusters = React.useMemo(() => clustersOf(pins), [pins]);
    const categories = React.useMemo(() => [...new Set(pins.map((pin) => pin.category))].sort(), [pins]);

    const filtered = React.useMemo(() => {
        const needle = q.trim().toLowerCase();
        return pins.filter((pin) => {
            if (hiddenCities.has(pin.city?.trim() || NO_CITY)) return false;
            if (category !== "ALL" && pin.category !== category) return false;
            if (status !== "ALL" && pin.status !== status) return false;
            if (!needle) return true;
            return [pin.title, pin.address, pin.publisherName, pin.displayId].some((field) =>
                (field ?? "").toLowerCase().includes(needle),
            );
        });
    }, [pins, hiddenCities, category, status, q]);

    const clusters = React.useMemo(() => clustersOf(filtered), [filtered]);
    /* The chosen cluster if it survived the filters, else the largest. */
    const selected: Cluster | null = clusters.find((cluster) => cluster.name === selectedCity) ?? clusters[0] ?? null;
    const selectedPin: Pin | null = selected?.pins.find((pin) => pin.id === selectedPinId) ?? null;

    /* The camera is the operator's: it starts on the largest city and moves
       for a chip, a rail row, a bubble or the buttons — and follows a drag. */
    const [camera, setCamera] = React.useState<Camera>(() => cameraFor(allClusters[0]?.pins ?? []) ?? INDIA);
    const points = React.useMemo(() => filtered.map(toPoint), [filtered]);

    const showCluster = (cluster: Cluster) => {
        setSelectedCity(cluster.name);
        setSelectedPinId(null);
        setCamera(cameraFor(cluster.pins) ?? INDIA);
    };
    const showPin = (pin: Pin) => {
        setSelectedCity(pin.city?.trim() || NO_CITY);
        setSelectedPinId(pin.id);
        setCamera((current) => ({ latitude: pin.latitude, longitude: pin.longitude, zoom: Math.max(current.zoom, PIN_ZOOM) }));
    };

    const statusCounts = React.useMemo(() => {
        const counts: Partial<Record<ListingLifecycle, number>> = {};
        for (const pin of pins) counts[pin.status] = (counts[pin.status] ?? 0) + 1;
        return counts;
    }, [pins]);

    const reset = () => {
        setQ("");
        setHiddenCities(new Set());
        setCategory("ALL");
        setStatus("ALL");
        setSelectedPinId(null);
    };

    const subtitle = [
        `${formatNumber(pins.length)} placed ${pins.length === 1 ? "listing" : "listings"} across ${allClusters.length} ${allClusters.length === 1 ? "city" : "cities"}`,
        skipped > 0 ? `${skipped} without a fix left off the map` : null,
        page.items.length < page.total ? `showing the newest ${page.items.length} of ${page.total}` : null,
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <div className="space-y-5">
            <PageHeader
                title="Inventory map"
                subtitle={subtitle}
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

            {pins.length === 0 ? (
                <Card className="rounded-lg border-border shadow-none">
                    <EmptyState
                        icon={MapPinOff}
                        title="Nothing to place yet"
                        description={
                            skipped > 0
                                ? `${skipped} ${skipped === 1 ? "listing has" : "listings have"} no coordinates, so there is nothing to draw. A spot is placed when it is created with a fix or edited to carry one.`
                                : "No listings yet. The first one placed with coordinates appears here."
                        }
                    />
                </Card>
            ) : (
                <div className="grid gap-4 xl:grid-cols-[260px_1fr_320px]">
                    {/* Filters */}
                    <Card className="h-fit rounded-lg border-border p-4 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filters</h3>
                        <div className="relative mt-3">
                            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={q}
                                onChange={(event) => setQ(event.target.value)}
                                placeholder="Search sites"
                                aria-label="Search sites"
                                className="h-9 pl-8"
                            />
                        </div>

                        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">City</p>
                        <ul className="mt-2 space-y-2">
                            {allClusters.map((cluster) => {
                                const id = `city-${cluster.name.replace(/\W+/g, "-")}`;
                                return (
                                    <li key={cluster.name} className="flex items-center gap-2.5">
                                        <Checkbox
                                            id={id}
                                            checked={!hiddenCities.has(cluster.name)}
                                            onCheckedChange={(checked) =>
                                                setHiddenCities((current) => {
                                                    const next = new Set(current);
                                                    if (checked) next.delete(cluster.name);
                                                    else next.add(cluster.name);
                                                    return next;
                                                })
                                            }
                                        />
                                        <label htmlFor={id} className="flex flex-1 items-center justify-between text-sm">
                                            <span className="text-foreground">{cluster.name}</span>
                                            <span className="text-xs text-muted-foreground">{formatNumber(cluster.pins.length)}</span>
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>

                        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Format</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {(["ALL", ...categories] as const).map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    aria-pressed={category === option}
                                    onClick={() => setCategory(option)}
                                    className={cn(
                                        "h-7 rounded-full border px-2.5 text-xs font-medium transition-colors",
                                        category === option
                                            ? "border-foreground bg-foreground text-background"
                                            : "bg-card text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {option === "ALL" ? "All" : categoryLabel(option)}
                                </button>
                            ))}
                        </div>

                        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                        <Select value={status} onValueChange={(value) => setStatus(value as ListingLifecycle | "ALL")}>
                            <SelectTrigger className="mt-2 h-9 bg-card" aria-label="Status">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All ({pins.length})</SelectItem>
                                {LISTING_LIFECYCLE.filter((value) => (statusCounts[value] ?? 0) > 0).map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {listingStatusLabel(value)} ({statusCounts[value]})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <button
                            type="button"
                            className="mt-4 border-t pt-3 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                            onClick={reset}
                        >
                            Reset filters
                        </button>
                    </Card>

                    {/* Map ------------------------------------------------- */}
                    <Card className="relative min-h-[540px] overflow-hidden rounded-lg border-border shadow-none">
                        <div className="absolute inset-0">
                            <MapSurface
                                config={mapsConfig}
                                points={points}
                                camera={camera}
                                onCameraChange={setCamera}
                                selectedId={selectedPin?.id ?? null}
                                onSelect={(point) => showPin(point)}
                                onClusterClick={(cluster) => setCamera(cameraInto(cluster, camera.zoom))}
                                caption={
                                    filtered.length === 0
                                        ? "No placed listing matches these filters."
                                        : `${formatNumber(filtered.length)} placed ${filtered.length === 1 ? "listing" : "listings"} under the filters, coloured by status; ${selected?.name ?? "—"} is the city in the rail.`
                                }
                            />
                        </div>

                        {/* Cluster switcher */}
                        <div className="absolute inset-x-4 top-4 z-10 flex flex-wrap gap-1.5">
                            {clusters.map((cluster) => {
                                const active = cluster.name === selected?.name;
                                return (
                                    <button
                                        key={cluster.name}
                                        type="button"
                                        onClick={() => showCluster(cluster)}
                                        aria-pressed={active}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm transition-colors",
                                            active
                                                ? "border-primary bg-primary text-primary-foreground"
                                                : "border-border bg-card text-foreground hover:border-foreground",
                                        )}
                                    >
                                        {cluster.name}
                                        <span
                                            className={cn(
                                                "rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                                                active ? "bg-background/20" : "bg-muted",
                                            )}
                                        >
                                            {cluster.pins.length}
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
                                onClick={() => setCamera((current) => ({ ...current, zoom: stepZoom(current.zoom, 1) }))}
                            >
                                <Plus className="size-4" />
                            </button>
                            <button
                                type="button"
                                aria-label="Zoom out"
                                className="flex size-8 items-center justify-center border-b transition-colors hover:bg-muted"
                                onClick={() => setCamera((current) => ({ ...current, zoom: stepZoom(current.zoom, -1) }))}
                            >
                                <Minus className="size-4" />
                            </button>
                            <button
                                type="button"
                                aria-label="Reset view"
                                className="flex size-8 items-center justify-center transition-colors hover:bg-muted"
                                onClick={() => {
                                    setSelectedPinId(null);
                                    setCamera(cameraFor(selected?.pins ?? []) ?? INDIA);
                                }}
                            >
                                <LocateFixed className="size-4" />
                            </button>
                        </div>
                    </Card>

                    {/* Pins rail */}
                    <Card className="flex h-fit flex-col rounded-lg border-border shadow-none">
                        <div className="border-b p-4">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected cluster</h3>
                            <p className="mt-1.5 text-base font-semibold text-foreground">{selected?.name ?? "—"}</p>
                            <p className="text-sm text-muted-foreground">
                                {selected
                                    ? `${selected.pins.length} ${selected.pins.length === 1 ? "listing" : "listings"} · ${selected.pins.filter((pin) => pin.status === "ACTIVE").length} live`
                                    : "Nothing matches these filters."}
                            </p>
                        </div>

                        <div className="p-4">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pins</h4>
                            <ul className="mt-2 divide-y" aria-label="Pins">
                                {(selected?.pins ?? []).map((pin) => {
                                    const active = pin.id === selectedPin?.id;
                                    return (
                                        <li key={pin.id}>
                                            <div
                                                className={cn(
                                                    "flex items-center gap-3 rounded-md px-1 py-2.5 transition-colors",
                                                    active ? "bg-primary/[0.04]" : "hover:bg-muted/50",
                                                )}
                                            >
                                                <button
                                                    type="button"
                                                    aria-pressed={active}
                                                    aria-label={`Centre on ${pin.title}`}
                                                    title={listingStatusLabel(pin.status)}
                                                    onClick={() => (active ? setSelectedPinId(null) : showPin(pin))}
                                                    className="flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-muted"
                                                >
                                                    <TrafficLight tone={LISTING_STATUS_TONE[pin.status]} />
                                                </button>
                                                <div className="min-w-0 flex-1">
                                                    <Link
                                                        href={`/listings/${pin.id}`}
                                                        className="block truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
                                                    >
                                                        {pin.title}
                                                    </Link>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {[pin.subType ?? categoryLabel(pin.category), pin.size].filter(Boolean).join(" · ")}
                                                    </p>
                                                </div>
                                                <StatusBadge
                                                    status={{ label: listingStatusLabel(pin.status), tone: LISTING_STATUS_TONE[pin.status] }}
                                                />
                                                <span className="w-[84px] shrink-0 text-right text-xs font-semibold tabular-nums">
                                                    {pin.ratePerDay ? `${formatMoney(pin.ratePerDay)}/d` : "—"}
                                                </span>
                                                <Link
                                                    href={`/listings/${pin.id}`}
                                                    aria-label={`Open ${pin.title}`}
                                                    className="shrink-0 text-muted-foreground hover:text-foreground"
                                                >
                                                    <ExternalLink className="size-3.5" />
                                                </Link>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                            {selected && (
                                <Button variant="outline" className="mt-3 w-full bg-card" asChild>
                                    <Link href="/listings">Open cluster in list</Link>
                                </Button>
                            )}
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
