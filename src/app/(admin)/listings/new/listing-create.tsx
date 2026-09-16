"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { CityCombobox } from "@/components/adx/city-combobox";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PinPicker } from "@/components/adx/pin-picker";
import { PriceIndicatorLine } from "@/components/adx/price-indicator";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import {
    areaSqFtFrom,
    ratePerDayFrom,
    PRICING_UNITS,
    UNIT_LABEL,
    UNIT_NEEDS_AREA,
    type PricingUnit,
} from "@/lib/rate-per-day";
import { listingsService } from "@/services/listings";
import type { Material, MediaType, SizeClass, VenueType } from "@/types/pricing-engine";
import type { RosterPublisher } from "@/services/supply";

interface ListingCreateProps {
    publishers: RosterPublisher[];
    venues: VenueType[];
    mediaTypes: MediaType[];
    sizeClasses: SizeClass[];
    materials: Material[];
}

/**
 * Creating a listing, and pricing it against the market while you do.
 *
 * The rate is entered in whatever unit the publisher quotes in — a mall talks
 * in rupees per square foot per month, a billboard owner in rupees per day —
 * and the daily rate the platform compares on is derived from that pair. Asking
 * everyone for a daily rate is how a price gets mistyped by a factor of thirty.
 *
 * Venue, media type and size class are the comparable match key, and all three
 * are required for the same reason: a spot missing any of them joins no
 * comparable pool and helps price nothing, its own neighbours included. Venue is
 * the coarsest cut and the easiest to get silently wrong, because leaving it
 * blank is not "any venue" — it files the spot with the roadside hoardings.
 *
 * The sections follow DR 02's order, so what an operator fills in here and what
 * a publisher fills in on their phone are the same listing described the same
 * way.
 */

const NO_VENUE = "__none__";

/**
 * The starting vocabulary for the physical attributes a factor rule reads.
 *
 * Fixed options rather than free text: these are what pricing factors key on,
 * and "Lit", "lit" and "Illuminated" are one property spelled three ways that no
 * rule could ever match. They are plain strings in the column, so ops can extend
 * the list without a migration — but they have to be *a* list, not prose.
 */
const ATTRIBUTES = [
    {
        key: "illumination",
        label: "Illumination",
        options: ["Non-lit", "Front-lit", "Back-lit", "Digital"],
    },
    { key: "facing", label: "Facing", options: ["Single", "Double", "Junction", "Multi-facing"] },
    { key: "elevation", label: "Elevation", options: ["Ground", "Mid-rise", "High-rise", "Rooftop"] },
    { key: "visibility", label: "Visibility", options: ["Obstructed", "Partial", "Clear", "Landmark"] },
    { key: "trafficGrade", label: "Traffic", options: ["Low", "Medium", "High", "Prime"] },
] as const;

type AttributeKey = (typeof ATTRIBUTES)[number]["key"];

export function ListingCreate({
    publishers,
    venues,
    mediaTypes,
    sizeClasses,
    materials,
}: ListingCreateProps) {
    const router = useRouter();

    const [publisherId, setPublisherId] = React.useState(publishers[0]?.id ?? "");
    const [title, setTitle] = React.useState("");
    const [address, setAddress] = React.useState("");
    const [city, setCity] = React.useState("");
    const [latitude, setLatitude] = React.useState("");
    const [longitude, setLongitude] = React.useState("");
    const [venueId, setVenueId] = React.useState(NO_VENUE);
    const [mediaTypeId, setMediaTypeId] = React.useState("");
    const [placement, setPlacement] = React.useState("");
    const [sizeClassId, setSizeClassId] = React.useState("");
    const [widthFt, setWidthFt] = React.useState("");
    const [heightFt, setHeightFt] = React.useState("");
    const [materialId, setMaterialId] = React.useState("");
    const [unit, setUnit] = React.useState<PricingUnit>("PER_DAY");
    const [basePrice, setBasePrice] = React.useState("");
    const [description, setDescription] = React.useState("");
    const [targetAudience, setTargetAudience] = React.useState("");
    const [uniqueSellingPoint, setUniqueSellingPoint] = React.useState("");
    const [footfallNote, setFootfallNote] = React.useState("");
    const [attributes, setAttributes] = React.useState<Partial<Record<AttributeKey, string>>>({});
    const [minBookingDays, setMinBookingDays] = React.useState("");
    const [availableFrom, setAvailableFrom] = React.useState("");
    const [hoursFrom, setHoursFrom] = React.useState("");
    const [hoursTo, setHoursTo] = React.useState("");
    const [peakPeriodNote, setPeakPeriodNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const publisher = publishers.find((candidate) => candidate.id === publisherId);
    const venue = venues.find((candidate) => candidate.id === venueId) ?? null;
    const venueTypeId = venueId === NO_VENUE ? null : venueId;

    /**
     * Only the formats that live in the chosen venue.
     *
     * The catalogue holds over a thousand, so an unfiltered list is not a
     * control anybody can use. It is also the correct filter rather than a
     * convenience: a format belongs to one venue, and offering a mall's atrium
     * LED wall inside a hospital would create a listing in a pool it can never
     * be compared against.
     */
    const offeredTypes = React.useMemo(
        () => mediaTypes.filter((type) => (type.venueTypeId ?? null) === venueTypeId),
        [mediaTypes, venueTypeId]
    );

    /** Formats under their catalogue heading, so sixty-four read as four groups. */
    const groupedTypes = React.useMemo(() => {
        const groups = new Map<string, MediaType[]>();
        for (const type of offeredTypes) {
            const key = type.formatGroup ?? "Other formats";
            const bucket = groups.get(key);
            if (bucket) bucket.push(type);
            else groups.set(key, [type]);
        }
        return [...groups.entries()];
    }, [offeredTypes]);

    // A placement belongs to the venue it was picked from. Without this, moving
    // from a mall to a hospital left "Food court" in state — the Select rendered
    // blank because it is not among the hospital's areas, and the POST still
    // carried it.
    const placementStillOffered =
        venue === null || venue.subVenues.length === 0 || venue.subVenues.includes(placement);
    const effectivePlacement = placementStillOffered ? placement : "";

    const typeStillOffered = offeredTypes.some((type) => type.id === mediaTypeId);
    const effectiveTypeId = typeStillOffered ? mediaTypeId : "";
    const mediaType = offeredTypes.find((candidate) => candidate.id === effectiveTypeId);

    /**
     * Only the sizes and materials this media type is actually built in.
     *
     * An empty list on the type means unconstrained rather than none, so the
     * fallback is every option — a type nobody has pinned down yet must not
     * block the person trying to list a spot of it.
     */
    const offeredSizes = React.useMemo(() => {
        if (!mediaType || mediaType.sizeClassIds.length === 0) return sizeClasses;
        return sizeClasses.filter((size) => mediaType.sizeClassIds.includes(size.id));
    }, [mediaType, sizeClasses]);

    const offeredMaterials = React.useMemo(() => {
        if (!mediaType || mediaType.materialIds.length === 0) return materials;
        return materials.filter((material) => mediaType.materialIds.includes(material.id));
    }, [mediaType, materials]);

    // A size that belonged to the previous media type has to stop being selected
    // when the type changes, or the form silently posts a mismatched pair.
    const sizeStillOffered = offeredSizes.some((size) => size.id === sizeClassId);
    const effectiveSizeId = sizeStillOffered ? sizeClassId : "";
    const materialStillOffered = offeredMaterials.some((item) => item.id === materialId);
    const effectiveMaterialId = materialStillOffered ? materialId : "";

    // Rounded exactly once, exactly where the server rounds it — before any
    // per-square-foot rate is multiplied by it. Doing the arithmetic in floats
    // and rounding at the end put the form's figure and the stored figure eleven
    // rupees apart on a 3.33 x 3.33 spot.
    const areaSqFt = areaSqFtFrom(widthFt, heightFt);
    const measured = areaSqFt !== null;

    /**
     * The class those measurements already have a name for.
     *
     * A size class is identified by its exact dimensions, so this is a lookup
     * rather than a guess. When there is no match the class is minted on save —
     * which is why the indicator has to say it cannot answer yet rather than
     * quietly comparing against the wrong pool.
     */
    const measuredClass = React.useMemo(() => {
        if (!measured) return null;
        return (
            sizeClasses.find(
                (size) =>
                    size.widthFt !== null &&
                    size.heightFt !== null &&
                    Number(size.widthFt) === Number(widthFt) &&
                    Number(size.heightFt) === Number(heightFt)
            ) ?? null
        );
    }, [measured, sizeClasses, widthFt, heightFt]);

    // The picked class wins where there is one, matching the server: a
    // measurement should not silently overrule a decision.
    const indicatorSizeId = effectiveSizeId || measuredClass?.id || null;

    const lat = latitude.trim() === "" ? null : Number(latitude);
    const lng = longitude.trim() === "" ? null : Number(longitude);
    const coordsValid = lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng);

    /** The daily rate the platform will store. Shown, because it is the number
     *  every comparison is made against and nobody should have to infer it. */
    const derived = ratePerDayFrom({ unit, basePrice, areaSqFt });
    const ratePerDay = derived.rate ?? "";
    const perSqFtNeedsArea = UNIT_NEEDS_AREA[unit] && !measured;

    const canSubmit =
        publisherId !== "" &&
        title.trim().length > 1 &&
        address.trim().length > 1 &&
        effectiveTypeId !== "" &&
        (effectiveSizeId !== "" || measured) &&
        coordsValid &&
        derived.rate !== null;

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (!canSubmit || !mediaType) return;
        setBusy(true);
        try {
            const created = await listingsService.create({
                publisherId,
                title: title.trim(),
                // Carried from the media type rather than asked twice: they are
                // the same fact, and a form that lets them disagree will.
                category: mediaType.category,
                address: address.trim(),
                city: city.trim() || undefined,
                latitude: lat!,
                longitude: lng!,
                ...(venueTypeId ? { venueTypeId } : {}),
                mediaTypeId: effectiveTypeId,
                // Both, whenever both were given. The server prefers the picked
                // class and stores the measurements beside it — sending only one
                // meant a spot with a standard size and a per-square-foot price
                // passed this form's own checks and was then 400'd for having no
                // dimensions to work an area out from.
                ...(effectiveSizeId ? { sizeClassId: effectiveSizeId } : {}),
                ...(measured ? { widthFt: widthFt.trim(), heightFt: heightFt.trim() } : {}),
                ...(effectiveMaterialId ? { materialId: effectiveMaterialId } : {}),
                ...(effectivePlacement.trim() ? { placement: effectivePlacement.trim() } : {}),
                pricingUnit: unit,
                // The typed string, not a float round-trip. The server
                // normalises it to two places with decimal arithmetic; parsing
                // it here only to re-print it is how "100.05" becomes "100.04".
                basePrice: basePrice.trim(),
                ...(description.trim() ? { description: description.trim() } : {}),
                ...(targetAudience.trim() ? { targetAudience: targetAudience.trim() } : {}),
                ...(uniqueSellingPoint.trim()
                    ? { uniqueSellingPoint: uniqueSellingPoint.trim() }
                    : {}),
                ...(footfallNote.trim() ? { footfallNote: footfallNote.trim() } : {}),
                ...attributes,
                ...(minBookingDays.trim() ? { minBookingDays: Number(minBookingDays) } : {}),
                ...(availableFrom ? { availableFrom } : {}),
                ...(hoursFrom.trim() ? { availableHoursFrom: hoursFrom.trim() } : {}),
                ...(hoursTo.trim() ? { availableHoursTo: hoursTo.trim() } : {}),
                ...(peakPeriodNote.trim() ? { peakPeriodNote: peakPeriodNote.trim() } : {}),
            });
            toast.success("Listing created", {
                description: `${title.trim()} is a draft until it is published.`,
            });
            router.push(`/listings/${created.id}`);
        } catch (cause) {
            toast.error(
                cause instanceof ApiError ? cause.message : "Could not create that listing"
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-6">
            <div className="flex items-center gap-3">
                <Button asChild variant="ghost" size="sm">
                    <Link href="/listings">
                        <ChevronLeft className="size-4" aria-hidden />
                        Listings
                    </Link>
                </Button>
            </div>

            <SectionCard title="Publisher" description="Whose spot this is.">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="max-w-sm flex-1">
                        <Combobox
                            items={publishers.map((candidate) => ({
                                label: candidate.name,
                                value: candidate.id,
                            }))}
                            value={publisherId}
                            onValueChange={setPublisherId}
                            placeholder="Choose a publisher"
                            searchPlaceholder="Search publishers…"
                        />
                    </div>
                    {publisher && (
                        <div className="flex items-center gap-2">
                            <InitialsAvatar name={publisher.name} size="sm" />
                            <StatusBadge
                                status={
                                    publisher.kycStatus === "VERIFIED"
                                        ? { label: "KYC verified", tone: "success" }
                                        : { label: "KYC pending", tone: "warning" }
                                }
                            />
                        </div>
                    )}
                </div>
            </SectionCard>

            <SectionCard
                title="Venue and spot type"
                description="Venue, format and size are the comparable match key. All three decide which spots this one is priced against."
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="title">Site name</Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder="Andheri East metro bridge gantry"
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="venue">Venue</Label>
                            <Combobox
                                id="venue"
                                items={[
                                    {
                                        label: "No venue — roadside or vehicle exterior",
                                        value: NO_VENUE,
                                    },
                                    ...venues.map((item) => ({
                                        label: item.name,
                                        value: item.id,
                                        group: item.category,
                                    })),
                                ]}
                                value={venueId}
                                onValueChange={(next) => setVenueId(next || NO_VENUE)}
                                searchPlaceholder="Search fifty-seven venues…"
                            />
                            <p className="text-xs text-muted-foreground">
                                &ldquo;No venue&rdquo; is its own market, not a wildcard — this spot
                                will only be compared against other spots that have none.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="media-type">Spot type</Label>
                            <Combobox
                                id="media-type"
                                items={offeredTypes.map((item) => ({
                                    // Catalogue names are venue-qualified, and
                                    // inside a chosen venue that prefix is noise.
                                    label: item.formatGroup
                                        ? (item.name.split(" — ").at(-1) ?? item.name)
                                        : item.name,
                                    value: item.id,
                                    description: item.description ?? undefined,
                                    group: item.formatGroup ?? undefined,
                                }))}
                                value={effectiveTypeId}
                                onValueChange={setMediaTypeId}
                                placeholder="Choose"
                                searchPlaceholder="Search this venue's spot types…"
                                emptyText="Nothing matches in this venue."
                            />
                            {offeredTypes.length === 0 && (
                                <p className="text-xs text-warning">
                                    No spot types are defined for this venue yet. Add some under
                                    Pricing → Media types.
                                </p>
                            )}
                        </div>
                    </div>

                    {venue && (
                        <div className="space-y-2">
                            <Label htmlFor="placement">Where in the venue</Label>
                            {venue.subVenues.length > 0 ? (
                                <Select value={effectivePlacement} onValueChange={setPlacement}>
                                    <SelectTrigger id="placement">
                                        <SelectValue placeholder="Choose an area" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {venue.subVenues.map((area) => (
                                            <SelectItem key={area} value={area}>
                                                {area}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <Input
                                    id="placement"
                                    value={effectivePlacement}
                                    onChange={(event) => setPlacement(event.target.value)}
                                    placeholder="Reception / mirror wall"
                                />
                            )}
                        </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="width">Width (ft)</Label>
                            <Input
                                id="width"
                                inputMode="decimal"
                                value={widthFt}
                                onChange={(event) => setWidthFt(event.target.value)}
                                placeholder="6"
                                className="tabular-nums"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="height">Height (ft)</Label>
                            <Input
                                id="height"
                                inputMode="decimal"
                                value={heightFt}
                                onChange={(event) => setHeightFt(event.target.value)}
                                placeholder="4"
                                className="tabular-nums"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="size-class">Or a standard size</Label>
                            <Select
                                value={effectiveSizeId}
                                onValueChange={setSizeClassId}
                                disabled={effectiveTypeId === ""}
                            >
                                <SelectTrigger id="size-class">
                                    <SelectValue
                                        placeholder={
                                            effectiveTypeId === ""
                                                ? "Pick a spot type first"
                                                : "Measured above"
                                        }
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    {offeredSizes.map((size) => (
                                        <SelectItem key={size.id} value={size.id}>
                                            {size.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {measured && effectiveSizeId === "" && (
                        <p className="text-xs text-muted-foreground">
                            {areaSqFt} sq ft.{" "}
                            {measuredClass
                                ? `Compares against other ${measuredClass.name} spots.`
                                : "No spot has been listed at these dimensions before, so a size class will be created on save — until then there is nothing to compare against."}
                        </p>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="material">Material (optional)</Label>
                            <Select
                                value={effectiveMaterialId}
                                onValueChange={setMaterialId}
                                disabled={effectiveTypeId === ""}
                            >
                                <SelectTrigger id="material">
                                    <SelectValue placeholder="Choose" />
                                </SelectTrigger>
                                <SelectContent>
                                    {offeredMaterials.map((material) => (
                                        <SelectItem key={material.id} value={material.id}>
                                            {material.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="address">Address</Label>
                        <Input
                            id="address"
                            value={address}
                            onChange={(event) => setAddress(event.target.value)}
                            placeholder="Western Express Highway, near the flyover"
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="city">City</Label>
                            <CityCombobox id="city" value={city} onChange={setCity} stages={["LAUNCHED", "SEEDING"]} placeholder="Mumbai" />
                        </div>
                    </div>

                    {/* AD-C: the spot on a map — search, drag the pin, or type the two numbers; all three write the same two strings the payload always sent. */}
                    <PinPicker
                        id="spot"
                        latitude={latitude}
                        longitude={longitude}
                        onChange={(next) => {
                            setLatitude(next.latitude);
                            setLongitude(next.longitude);
                        }}
                        onAddress={(place) => {
                            setAddress(place.formattedAddress);
                            if (place.city && !city.trim()) setCity(place.city);
                        }}
                        title={title.trim() || "The spot"}
                        labels={{ search: "Find the spot" }}
                    />
                    <p className="text-xs text-muted-foreground">
                        Comparables are found within 200 m and the radius never widens, so
                        coordinates need to be the spot rather than the neighbourhood.
                    </p>
                </div>
            </SectionCard>

            <SectionCard
                title="Price and availability"
                description="Quoted in the publisher's own unit. ADX does not set this — the line below says how it compares."
            >
                <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
                        <div className="space-y-2">
                            <Label htmlFor="unit">Rate basis</Label>
                            <Select
                                value={unit}
                                onValueChange={(value) => setUnit(value as PricingUnit)}
                            >
                                <SelectTrigger id="unit">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PRICING_UNITS.map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {UNIT_LABEL[option]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="base-price">Base price (₹)</Label>
                            <Input
                                id="base-price"
                                inputMode="decimal"
                                value={basePrice}
                                onChange={(event) => setBasePrice(event.target.value)}
                                placeholder="150"
                                className="tabular-nums"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Works out to</Label>
                            <p className="pt-2 text-sm tabular-nums text-foreground">
                                {ratePerDay ? `₹${ratePerDay} per day` : "—"}
                            </p>
                        </div>
                    </div>

                    {perSqFtNeedsArea && (
                        <p className="text-xs text-warning">
                            A per-square-foot price needs the width and height, so the area can be
                            worked out.
                        </p>
                    )}
                    {derived.rate === null && derived.problem === "ROUNDS_TO_ZERO" && (
                        <p className="text-xs text-warning">
                            That works out to nothing per day — check the price and the unit.
                        </p>
                    )}
                    {derived.rate === null && derived.problem === "TOO_LARGE" && (
                        <p className="text-xs text-warning">
                            That works out to more per day than a listing can hold.
                        </p>
                    )}

                    <PriceIndicatorLine
                        venueTypeId={venueTypeId}
                        mediaTypeId={effectiveTypeId || null}
                        sizeClassId={indicatorSizeId}
                        latitude={coordsValid ? lat : null}
                        longitude={coordsValid ? lng : null}
                        city={city.trim() || null}
                        ratePerDay={ratePerDay}
                    />

                    <div className="grid gap-4 sm:grid-cols-4">
                        <div className="space-y-2">
                            <Label htmlFor="min-days">Min. booking (days)</Label>
                            <Input
                                id="min-days"
                                inputMode="numeric"
                                value={minBookingDays}
                                onChange={(event) => setMinBookingDays(event.target.value)}
                                placeholder="30"
                                className="tabular-nums"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="available-from">Available from</Label>
                            <Input
                                id="available-from"
                                type="date"
                                value={availableFrom}
                                onChange={(event) => setAvailableFrom(event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="hours-from">Visible from</Label>
                            <Input
                                id="hours-from"
                                value={hoursFrom}
                                onChange={(event) => setHoursFrom(event.target.value)}
                                placeholder="10 AM"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="hours-to">Visible until</Label>
                            <Input
                                id="hours-to"
                                value={hoursTo}
                                onChange={(event) => setHoursTo(event.target.value)}
                                placeholder="10 PM"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="peak">Peak period</Label>
                        <Input
                            id="peak"
                            value={peakPeriodNote}
                            onChange={(event) => setPeakPeriodNote(event.target.value)}
                            placeholder="Evenings and weekends"
                        />
                        <p className="text-xs text-muted-foreground">
                            When the spot is worth most, not when it is free.
                        </p>
                    </div>
                </div>
            </SectionCard>

            <SectionCard
                title="What it is like"
                description="Observable properties a pricing factor can key on, and the claims an advertiser will act on."
            >
                <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-5">
                        {ATTRIBUTES.map((attribute) => (
                            <div key={attribute.key} className="space-y-2">
                                <Label htmlFor={attribute.key}>{attribute.label}</Label>
                                <Select
                                    value={attributes[attribute.key] ?? ""}
                                    onValueChange={(value) =>
                                        setAttributes((current) => ({
                                            ...current,
                                            [attribute.key]: value,
                                        }))
                                    }
                                >
                                    <SelectTrigger id={attribute.key}>
                                        <SelectValue placeholder="—" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {attribute.options.map((option) => (
                                            <SelectItem key={option} value={option}>
                                                {option}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ))}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="audience">Who sees it</Label>
                            <Input
                                id="audience"
                                value={targetAudience}
                                onChange={(event) => setTargetAudience(event.target.value)}
                                placeholder="Office commuters, 25-40"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="usp">Unique selling point</Label>
                            <Input
                                id="usp"
                                value={uniqueSellingPoint}
                                onChange={(event) => setUniqueSellingPoint(event.target.value)}
                                placeholder="Eye-level visibility near reception"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="footfall">Footfall</Label>
                            <Input
                                id="footfall"
                                value={footfallNote}
                                onChange={(event) => setFootfallNote(event.target.value)}
                                placeholder="~8,000 a day"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            rows={3}
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            placeholder="What faces it, what it overlooks, anything an advertiser would ask."
                        />
                    </div>
                </div>
            </SectionCard>

            <div className="flex items-center gap-3">
                <Button type="submit" disabled={busy || !canSubmit}>
                    {busy ? "Creating…" : "Create listing"}
                </Button>
                <Button asChild variant="outline" type="button">
                    <Link href="/listings">Cancel</Link>
                </Button>
                {!canSubmit && (
                    <span className="text-xs text-muted-foreground">
                        Publisher, name, spot type, a size or measurements, address, coordinates and
                        a price are all needed.
                    </span>
                )}
            </div>
        </form>
    );
}
