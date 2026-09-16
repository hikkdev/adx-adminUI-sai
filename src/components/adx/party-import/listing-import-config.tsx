"use client";

import * as React from "react";
import Link from "next/link";
import { FileSignature, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/adx/kpi-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatMoney } from "@/lib/format";
import { listingImportService, planOf, type ListingKind, type ListingRowPlan, type PartyImport, type PartyImportRow, type RateCardRowPlan } from "@/services/party-imports";
import { supplyService } from "@/services/supply";
import type { PartyImportConfig } from "./party-import-config";

/**
 * The publisher's two kinds on the import kit — package U.
 *
 * A listings file creates every spot as a DRAFT under ONE supply attempt
 * (never active from an import; the publisher accepts one agreement for
 * the batch) and merges into a spot already on the platform by
 * `externalRef` or by address. A rate-card file sets each listing's rate
 * through the listing's own rate door. Both are FOR a publisher: the
 * upload step is gated on the picker, every route carries
 * `?publisherId=`, and an agent may import for the publishers they may
 * add spots for.
 *
 * What the report draws beyond the four tiles is here: how many created
 * spots have a map pin (given, or geocoded) and how many must be placed
 * by hand, the possible duplicates near another publisher's spot, the
 * "Send the agreement" button over the attempt the commit opened; and,
 * for a rate card, the rate before → after per row with the floor and
 * running-booking flags.
 */

const str = (row: PartyImportRow, key: string): string => {
    const value = row.data[key];
    return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
};

const hasPin = (row: PartyImportRow) => str(row, "latitude") !== "" && str(row, "longitude") !== "";
const warned = (row: PartyImportRow, needle: string) => (planOf(row)?.warnings ?? []).some((warning) => warning.includes(needle));

const BELOW_FLOOR = "below the ADX floor";
const POSSIBLE_DUPLICATE = "Possible duplicate";
const BOOKING_RUNNING = "A booking is running";

/* ------------------------------------------------------------------ */
/* Listings                                                             */
/* ------------------------------------------------------------------ */

/** Given · Geocoded · None — where a created spot's pin comes from. */
function PinCell({ row }: { row: PartyImportRow }) {
    const plan = planOf<ListingRowPlan>(row);
    if (!plan) return <span className="text-muted-foreground">—</span>;
    if (plan.action === "MERGE") return <span className="text-muted-foreground">kept</span>;
    if (!hasPin(row)) return <StatusBadge status={{ label: "Place by hand", tone: "warning" }} />;
    return <span className="text-muted-foreground">{row.data["geocoded"] === true ? "Geocoded" : "Given"}</span>;
}

/** The pin count, the possible duplicates, and — once committed — the agreement. */
function ListingReportExtras({ record, onChanged }: { record: PartyImport; onChanged: () => void }) {
    const rows = record.rows ?? [];
    const creates = rows.filter((row) => planOf<ListingRowPlan>(row)?.action === "CREATE");
    const pinned = creates.filter(hasPin).length;
    const geocoded = creates.filter((row) => row.data["geocoded"] === true).length;
    const unplaced = creates.length - pinned;
    const twins = rows.filter((row) => warned(row, POSSIBLE_DUPLICATE)).length;
    const belowFloor = rows.filter((row) => warned(row, BELOW_FLOOR)).length;
    const committed = record.status === "COMMITTED";

    return (
        <div className="grid gap-4 md:grid-cols-3">
            <KpiCard
                stat={{
                    id: "pins",
                    label: "Map pins",
                    value: `${pinned} / ${creates.length}`,
                    deltaTone: unplaced > 0 ? "negative" : "neutral",
                    hint: unplaced > 0 ? `${geocoded} geocoded · ${unplaced} to place on the map before publishing` : `${geocoded} geocoded from the address`,
                }}
            />
            <KpiCard
                stat={{
                    id: "twins",
                    label: "Possible duplicates",
                    value: String(twins),
                    deltaTone: twins > 0 ? "negative" : "neutral",
                    hint: twins > 0 ? "within 25 m of another publisher's spot — still created" : "none within 25 m of another publisher's spot",
                }}
            />
            {committed ? (
                <AgreementCard attemptId={record.attemptId ?? null} onChanged={onChanged} />
            ) : (
                <KpiCard stat={{ id: "floor", label: "Below the ADX floor", value: String(belowFloor), deltaTone: belowFloor > 0 ? "negative" : "neutral", hint: "the publish gate holds these until ADX signs the price off" }} />
            )}
        </div>
    );
}

/**
 * The agreement — the commit opened one supply attempt for the batch and
 * did not send it; this is the "Send the agreement" over the existing
 * `POST /supply/attempts/:id/request-acceptance`. A commit that created
 * nothing (every row merged or was refused) opened no attempt.
 */
function AgreementCard({ attemptId, onChanged }: { attemptId: string | null; onChanged: () => void }) {
    const [busy, setBusy] = React.useState(false);
    const [sent, setSent] = React.useState(false);

    const send = async () => {
        if (!attemptId) return;
        setBusy(true);
        try {
            await supplyService.requestAttemptAcceptance(attemptId);
            setSent(true);
            toast.success("Agreement sent", { description: "The publisher is asked to accept the listing agreement for every spot in this file." });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The agreement did not go out.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="agreement-card">
            <p className="text-xs font-medium text-muted-foreground">The agreement</p>
            {attemptId ? (
                <>
                    <p className="mt-2 text-sm text-foreground">
                        Every created spot sits under one supply attempt, awaiting the publisher&rsquo;s acceptance.{" "}
                        <Link href={`/listings/attempts/${attemptId}`} className="text-primary underline-offset-4 hover:underline">
                            Open the attempt
                        </Link>
                    </p>
                    <Button size="sm" className="mt-3 h-8" disabled={busy || sent} onClick={() => void send()}>
                        <FileSignature className="mr-1.5 size-3.5" aria-hidden />
                        {sent ? "Agreement sent" : busy ? "Sending…" : "Send the agreement"}
                    </Button>
                </>
            ) : (
                <p className="mt-2 text-sm text-muted-foreground">No spot was created, so no attempt was opened — there is nothing to send.</p>
            )}
        </Card>
    );
}

/** The rate a listings row resolved to (from either shape the file carried), as money. */
const rateCell = (row: PartyImportRow) => {
    const resolved = str(row, "ratePerDayResolved") || str(row, "ratePerDay");
    if (resolved) return <span className="font-mono text-xs">{formatMoney(resolved)}</span>;
    const monthly = str(row, "monthlyPrice");
    return monthly ? <span className="font-mono text-xs text-muted-foreground">{formatMoney(monthly)}/month</span> : <span className="text-muted-foreground">—</span>;
};

export const LISTINGS_IMPORT_CONFIG: PartyImportConfig = {
    party: "listings",
    singular: "listing",
    plural: "listings",
    section: { label: "Listings", href: "/listings" },
    href: "/listings/import",
    targetHref: (id) => `/listings/${id}`,
    liveDomain: "listings",
    formatKind: "listings",
    needsPublisher: true,
    columns: [
        { key: "externalRef", label: "External ref", hint: "The publisher's own id for the spot — the merge key when present.", example: "MS-0042" },
        { key: "title", label: "Title", required: true, hint: "What the spot is called.", example: "FC Road Hoarding" },
        { key: "category", label: "Category", required: true, hint: "A listing category — any casing.", example: "OUTDOOR" },
        { key: "subType", label: "Sub-type", hint: "In the publisher's words.", example: "Hoarding" },
        { key: "description", label: "Description", hint: "Free text.", example: "Faces the junction, lit at night" },
        { key: "address", label: "Address", required: true, hint: "Geocoded when latitude and longitude are not given; the merge key without an external ref.", example: "44, FC Road, Pune" },
        { key: "city", label: "City", hint: "Resolved against the catalogue; unknown warns, kept as typed.", example: "Pune" },
        { key: "state", label: "State", hint: "Used to geocode only.", example: "Maharashtra" },
        { key: "latitude", label: "Latitude", hint: "Decimal degrees; with longitude, or neither.", example: "18.5236" },
        { key: "longitude", label: "Longitude", hint: "Decimal degrees; with latitude, or neither.", example: "73.8412" },
        { key: "mediaType", label: "Media type", hint: "By name or slug from the taxonomy; unknown is invalid.", example: "Hoarding" },
        { key: "sizeClass", label: "Size class", hint: "By slug or name; unknown is invalid.", example: "20x10" },
        { key: "size", label: "Size", hint: "As text.", example: "20 x 10 ft" },
        { key: "material", label: "Material", hint: "By slug or name; unknown is invalid.", example: "flex" },
        { key: "ratePerDay", label: "Rate per day", hint: "One of ratePerDay and monthlyPrice is required.", example: "1200" },
        { key: "monthlyPrice", label: "Monthly price", hint: "Divided by 30 into the daily rate.", example: "36000" },
        { key: "slotsTotal", label: "Slots", hint: "1–24; only a screen carries more than one.", example: "1" },
        { key: "instantBooking", label: "Instant booking", hint: "yes or no.", example: "no" },
        { key: "photos", label: "Photos", hint: "Pipe-separated URLs, at most 20.", example: "https://cdn.adx.in/a.jpg|https://cdn.adx.in/b.jpg" },
    ],
    grid: [
        { key: "title", label: "Title" },
        { key: "category", label: "Category" },
        { key: "address", label: "Address" },
        { key: "city", label: "City" },
        { key: "ratePerDay", label: "Rate/day", render: rateCell },
        { key: "latitude", label: "Pin", render: (row) => <PinCell row={row} /> },
    ],
    templateFileName: "listings.csv",
    notePlaceholder: "The publisher's inventory sheet, September",
    commitDescription: ({ createdCount, mergedCount }) =>
        `${createdCount} spot${createdCount === 1 ? "" : "s"} will be created as drafts under ONE supply attempt — never active from an import — and ${mergedCount} merged into spots already on the platform, row by row. Invalid and skipped rows are left out. The agreement is not sent by the commit: you send it from this report. A commit that stops half-way carries on from where it stopped on the next call.`,
    commitToast: "Every spot is a draft under one supply attempt; send the agreement from the report.",
    rules: {
        title: "Errors are skipped, warnings import with gaps",
        body: "The same external ref as an earlier import, or the same address as one of the publisher's spots, merges — filling only what is empty; a set rate is never overwritten. A spot the map could not place, a rate under the ADX floor and another publisher's spot within 25 m are warnings and still create. Fix the file and upload it again to include the invalid rows.",
    },
    api: (publisherId) => listingImportService("listings", publisherId),
    reportExtras: (props) => <ListingReportExtras {...props} />,
};

/* ------------------------------------------------------------------ */
/* Rate card                                                            */
/* ------------------------------------------------------------------ */

/** before → after, off the plan; the rate as typed on a row the plan refused. */
function RateChangeCell({ row }: { row: PartyImportRow }) {
    const plan = planOf<RateCardRowPlan>(row);
    if (!plan) {
        const typed = str(row, "ratePerDay") || str(row, "monthlyPrice");
        return typed ? <span className="font-mono text-xs text-muted-foreground">{typed}</span> : <span className="text-muted-foreground">—</span>;
    }
    return (
        <span className="font-mono text-xs">
            <span className="text-muted-foreground">{plan.from === null ? "unpriced" : formatMoney(plan.from)}</span>
            <span className="mx-1 text-muted-foreground" aria-hidden>
                →
            </span>
            <span className="text-foreground">{formatMoney(plan.ratePerDay)}</span>
            {plan.slotsTotal !== undefined && <span className="ml-1 text-muted-foreground">· {plan.slotsTotal} slots</span>}
        </span>
    );
}

function RateFlagsCell({ row }: { row: PartyImportRow }) {
    const flags: { label: string; tone: "warning" | "info" }[] = [];
    if (warned(row, BELOW_FLOOR)) flags.push({ label: "Below floor", tone: "warning" });
    if (warned(row, BOOKING_RUNNING)) flags.push({ label: "Booking running", tone: "info" });
    if (flags.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
        <span className="flex flex-wrap gap-1">
            {flags.map((flag) => (
                <StatusBadge key={flag.label} status={flag} />
            ))}
        </span>
    );
}

function RateCardReportExtras({ record }: { record: PartyImport }) {
    const rows = record.rows ?? [];
    const sets = rows.filter((row) => planOf<RateCardRowPlan>(row)?.action === "SET");
    const belowFloor = sets.filter((row) => warned(row, BELOW_FLOOR)).length;
    const running = sets.filter((row) => warned(row, BOOKING_RUNNING)).length;
    const raised = sets.filter((row) => {
        const plan = planOf<RateCardRowPlan>(row)!;
        return plan.from !== null && Number(plan.ratePerDay) > Number(plan.from);
    }).length;
    return (
        <div className="grid gap-4 md:grid-cols-3">
            <KpiCard stat={{ id: "sets", label: record.status === "COMMITTED" ? "Rates set" : "Rates to set", value: String(sets.length), hint: `${raised} up · ${sets.length - raised} down or first-time` }} />
            <KpiCard stat={{ id: "floor", label: "Below the ADX floor", value: String(belowFloor), deltaTone: belowFloor > 0 ? "negative" : "neutral", hint: "set anyway — the publish gate holds these until ADX signs the price off" }} />
            <KpiCard stat={{ id: "running", label: "With a booking running", value: String(running), hint: "the running order's accrual keeps the rate it was placed at" }} />
        </div>
    );
}

export const RATE_CARD_IMPORT_CONFIG: PartyImportConfig = {
    party: "rate-card",
    singular: "rate",
    plural: "rates",
    section: { label: "Listings", href: "/listings" },
    href: "/listings/import",
    targetHref: (id) => `/listings/${id}`,
    liveDomain: "listings",
    formatKind: "rate-card",
    needsPublisher: true,
    columns: [
        { key: "listing", label: "Listing", required: true, hint: "The displayId (ADX-LST-…), the external ref an import gave it, or its exact title — resolved in that order.", example: "ADX-LST-00042" },
        { key: "ratePerDay", label: "Rate per day", hint: "One of ratePerDay and monthlyPrice is required.", example: "1800" },
        { key: "monthlyPrice", label: "Monthly price", hint: "Divided by 30 into the daily rate.", example: "54000" },
        { key: "slotsTotal", label: "Slots", hint: "1–24, when the loop changes too.", example: "1" },
        { key: "effectiveFrom", label: "Effective from", hint: "YYYY-MM-DD; today when omitted. A future day is not supported.", example: "2026-09-15" },
    ],
    grid: [
        { key: "listing", label: "Listing", mono: true },
        { key: "ratePerDay", label: "Rate/day", render: (row) => <RateChangeCell row={row} /> },
        { key: "effectiveFrom", label: "Effective from", mono: true },
        { key: "slotsTotal", label: "Flags", render: (row) => <RateFlagsCell row={row} /> },
    ],
    templateFileName: "rate-card.csv",
    notePlaceholder: "The October rate card",
    commitDescription: ({ mergedCount }) =>
        `${mergedCount} rate${mergedCount === 1 ? "" : "s"} will be set through each listing's own rate door — the rate stamped as of now, the surge state recorded, the loop re-checked — row by row, and audited per listing. Invalid and skipped rows are left out. A commit that stops half-way carries on from where it stopped on the next call.`,
    commitToast: "Each rate went through the listing's own rate door and is audited per listing.",
    rules: {
        title: "Errors are skipped, warnings set anyway",
        body: "A listing the reference does not name on this publisher, a title two listings share, and a future effective date are invalid. A rate under the ADX floor, or a listing with a booking running, is a warning and the rate is still set — the running order keeps the rate it was placed at. Fix the file and upload it again to include the invalid rows.",
    },
    api: (publisherId) => listingImportService("rate-card", publisherId),
    reportExtras: (props) => <RateCardReportExtras {...props} />,
};

export const LISTING_IMPORT_CONFIGS: Record<ListingKind, PartyImportConfig> = {
    listings: LISTINGS_IMPORT_CONFIG,
    "rate-card": RATE_CARD_IMPORT_CONFIG,
};
