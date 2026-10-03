"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import {
    FlowFieldView,
    FlowSections,
    answersInPlay,
    branchOf,
    chosenMediaType,
    fieldSpan,
    fieldsOf,
    flowListingBody,
    flowListingDocuments,
    isNumbered,
    matchedSizeClass,
    missingFields,
    offeredSizes,
    screensInPlay,
    withAnswer,
    type FieldContext,
    type FieldUpload,
    type FlowAnswers,
    type FlowExtras,
    type FlowVocabularies,
    type GeoPoint,
} from "@/components/adx/flow-renderer";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PriceIndicatorLine } from "@/components/adx/price-indicator";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { areaSqFtFrom, ratePerDayFrom, UNIT_NEEDS_AREA, type PricingUnit } from "@/lib/rate-per-day";
import type { ContentCategory } from "@/services/campaigns";
import { listingsService } from "@/services/listings";
import { SPOT_ATTRIBUTE_WORDS } from "@/services/listing-record";
import { uploadService } from "@/services/uploads";
import type { RosterPublisher } from "@/services/supply";
import type { FlowField, WizardFlow } from "@/types";
import type { Material, MediaType, SizeClass, VenueType } from "@/types/pricing-engine";

interface ListingCreateProps {
    publishers: RosterPublisher[];
    venues: VenueType[];
    mediaTypes: MediaType[];
    sizeClasses: SizeClass[];
    materials: Material[];
    /** FL-3: the wizard the form is drawn from — `flows.listing`, the screens both apps render. */
    flow: WizardFlow;
    contentCategories: ContentCategory[];
}

/**
 * Creating a listing, and pricing it against the market while you do.
 *
 * FL-3 (27 Sep 2026): the form is drawn from `flows.listing` — the same
 * screens, fields, labels, order and branches the publisher's phone asks,
 * so what an operator fills in here and what a publisher fills in on their
 * phone are the same listing described the same way, and a screen added
 * on the flow board reaches this form without a deploy. Every screen in
 * play is a card; the branch is the first card's choice.
 *
 * What stays the desk's — the admin extras, drawn around the flow:
 *
 *   - whose spot this is: the publisher picker with the KYC badge;
 *   - "Or a standard size": a size class picked instead of, or beside, the
 *     measurements — DR 02 measures, an operator may know the class;
 *   - LD-1 (3 Oct 2026): the questions every listing form asks — daily
 *     footfall, how busy, how far it is seen, how high, a screen's
 *     resolution, the kind of vehicle, available now — in the website's and
 *     the apps' words, at the end of the spot-details card, each only while
 *     the flow on the row does not ask it itself (they replace the desk's
 *     old elevation / visibility / traffic picks and their own words);
 *   - "Works out to": the daily rate the platform will store, and the
 *     warnings when a price and a unit make no rate;
 *   - the rate basis starting at "Per day", as the old form started;
 *   - the review's attestation is not drawn — the desk creates a draft, and
 *     the publisher confirms and submits from their own phone;
 *   - the gate: the old form's own rule (publisher, name, spot type, a size
 *     or measurements, address, coordinates, a price) plus every required
 *     field on a numbered screen.
 *
 * The rate is entered in whatever unit the publisher quotes in, and the
 * daily rate the platform compares on is derived from that pair. Venue,
 * media type and size class are the comparable match key. The submit maps
 * the answers to the same `POST /listings` body this form always sent
 * (`flow-renderer/listing-body.test.ts` pins it), then files each venue
 * proof collected onto the listing the way the phone does — and, LF-2
 * (28 Sep 2026), the audience screen's two reports beside them: the BARC /
 * TAM sheet as AUDIENCE_RATING, the footfall audit as FOOTFALL_AUDIT.
 */

/** A select's options from the codes and their words — the code is what the listing stores. */
const coded = (words: Record<string, string>) => Object.entries(words).map(([id, title]) => ({ id, title }));

/**
 * LD-1 (3 Oct 2026): the listing questions every form asks, as the flow's
 * own fields — the same ids, words, options and order as the website and
 * both apps — so `flowListingBody` maps them like any flow answer. Fixed
 * options rather than free text, because pricing factors key on them and
 * "Lit", "lit" and "Illuminated" are one property spelled three ways that
 * no rule could match. Every one is optional.
 */
type DeskQuestion = FlowField & { askedOf: (spot: { category: string | null; digital: boolean }) => boolean };

/** A fixed spot: footfall, how busy and how far it is seen are not asked of a moving one or of a broadcast. */
const fixed = ({ category }: { category: string | null }) => category === "indoor" || category === "outdoor";
const DESK_QUESTIONS: DeskQuestion[] = [
    {
        id: "estimated_daily_footfall",
        type: "number",
        label: "About how many people pass this spot in a day?",
        placeholder: "e.g. 2500",
        hint: "Your best estimate — we may refine it with measured data.",
        askedOf: fixed,
    },
    { id: "traffic_grade", type: "select", label: "How busy is it?", options: coded(SPOT_ATTRIBUTE_WORDS.trafficGrade), askedOf: fixed },
    { id: "visibility", type: "select", label: "From how far can it be seen?", options: coded(SPOT_ATTRIBUTE_WORDS.visibility), askedOf: fixed },
    { id: "elevation", type: "select", label: "How high is it?", options: coded(SPOT_ATTRIBUTE_WORDS.elevation), askedOf: ({ category }) => category === "outdoor" },
    { id: "sec_screen", type: "section", label: "Screen resolution (pixels)", askedOf: ({ digital }) => digital },
    { id: "width_px", type: "number", label: "Width (px)", placeholder: "e.g. 1920", askedOf: ({ digital }) => digital },
    { id: "height_px", type: "number", label: "Height (px)", placeholder: "e.g. 1080", askedOf: ({ digital }) => digital },
    { id: "vehicle_type", type: "select", label: "What kind of vehicle?", options: coded(SPOT_ATTRIBUTE_WORDS.vehicleType), askedOf: ({ category }) => category === "transit" },
    { id: "available_now", type: "switch", label: "Available to book now?", askedOf: () => true },
];

/** The flow asks a screen's resolution of every fixed spot and leaves it to the client to draw only for a screen — as the apps and the website do. */
const SCREEN_ONLY = new Set(["sec_screen", "width_px", "height_px"]);

/** A spot type that names a screen — the server's own test for a loop (`slots.service`). */
const SCREEN_WORD = /digital|\bled\b|\blcd\b|(?<![\w-])screen(?![\w-])/i;

/** The old form started on "Per day"; the flow's rate-basis select starts there too. */
const DESK_DEFAULTS: FlowAnswers = { pricing_unit: "PER_DAY" };

/** QR-24: the documents that evidence a right to the space; they carry the term's end date. */
const RIGHTS_PAPERS = new Set(["DISPLAY_AGREEMENT", "MUNICIPAL_PERMIT", "OWNER_NOC"]);


export function ListingCreate({ publishers, venues, mediaTypes, sizeClasses, materials, flow, contentCategories }: ListingCreateProps) {
    const router = useRouter();

    const [publisherId, setPublisherId] = React.useState(publishers[0]?.id ?? "");
    const [answers, setAnswers] = React.useState<FlowAnswers>(DESK_DEFAULTS);
    const [sizeClassId, setSizeClassId] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const publisher = publishers.find((candidate) => candidate.id === publisherId);
    const vocab = React.useMemo<FlowVocabularies>(() => ({ venues, mediaTypes, sizeClasses, materials, contentCategories }), [venues, mediaTypes, sizeClasses, materials, contentCategories]);

    const screens = screensInPlay(flow, answers);
    const category = branchOf(flow, answers);
    const set = React.useCallback((id: string, value: unknown) => setAnswers((current) => withAnswer(flow, current, id, value)), [flow]);

    /* Only what the screens in play asked for is priced and posted; a branch walked away from keeps its answers for a way back, not for the API. */
    const flowInPlay = answersInPlay(answers, screens);
    const mediaType = chosenMediaType(flowInPlay, mediaTypes);
    /* LD-1: a screen's resolution is asked of a screen only; the questions the flow on the row does not ask itself are the desk's, and their answers ride in with the flow's. */
    const digital = flowInPlay.illumination === "Digital" || [mediaType?.name, mediaType?.formatGroup].some((word) => typeof word === "string" && SCREEN_WORD.test(word));
    const flowFields = fieldsOf(screens);
    const deskQuestions = DESK_QUESTIONS.filter((question) => !flowFields.has(question.id) && question.askedOf({ category, digital }));
    const inPlay = Object.fromEntries([
        ...Object.entries(flowInPlay).filter(([id]) => digital || !SCREEN_ONLY.has(id)),
        ...deskQuestions.flatMap((question) => (question.id in answers ? [[question.id, answers[question.id]] as const] : [])),
    ]);
    const venueTypeId = typeof inPlay.venue_type_id === "string" ? inPlay.venue_type_id : null;
    const widthFt = typeof inPlay.width_ft === "string" ? inPlay.width_ft : "";
    const heightFt = typeof inPlay.height_ft === "string" ? inPlay.height_ft : "";

    // A size that belonged to the previous media type has to stop being selected when the type changes, or the form silently posts a mismatched pair.
    const sizes = offeredSizes(sizeClasses, mediaType);
    const effectiveSizeId = sizes.some((size) => size.id === sizeClassId) ? sizeClassId : "";

    // Rounded exactly once, exactly where the server rounds it.
    const areaSqFt = areaSqFtFrom(widthFt, heightFt);
    const measured = areaSqFt !== null;
    const measuredClass = matchedSizeClass(sizeClasses, widthFt, heightFt);
    // The picked class wins where there is one, matching the server: a measurement should not silently overrule a decision.
    const indicatorSizeId = effectiveSizeId || measuredClass?.id || null;

    const point = inPlay.location as GeoPoint | undefined;
    const unit = (typeof inPlay.pricing_unit === "string" ? inPlay.pricing_unit : "PER_DAY") as PricingUnit;
    const basePrice = typeof inPlay.base_price === "string" ? inPlay.base_price : "";
    const derived = ratePerDayFrom({ unit, basePrice, areaSqFt });
    const ratePerDay = derived.rate ?? "";
    const perSqFtNeedsArea = UNIT_NEEDS_AREA[unit] && !measured;
    const city = typeof inPlay.city === "string" ? inPlay.city.trim() : "";
    const title = typeof inPlay.title === "string" ? inPlay.title.trim() : "";
    const address = typeof inPlay.address === "string" ? inPlay.address.trim() : "";

    /* The phone's "Still needed" over the numbered screens; the unnumbered documents and review gate nothing at the desk. */
    const stillNeeded = screens.filter(isNumbered).flatMap((screen) => missingFields(screen, answers));
    const canSubmit =
        publisherId !== "" && title.length > 1 && address.length > 1 && mediaType !== null && (effectiveSizeId !== "" || measured) && point !== undefined && derived.rate !== null && stillNeeded.length === 0;

    /*
     * ST-2 (28 Sep 2026): VERIFICATION is a private purpose now — a private
     * file opens for its owner, the desk and the owner's agent under a grant.
     * Filed at the desk, the venue papers and reports are the publisher's, so
     * they go up in the publisher's name (Lot N's `ownerUserId`) and the
     * publisher can open their own papers. A publisher nobody has registered
     * for yet has no user id; the file is then filed as the desk's own, which
     * the desk and the field agent sent to the listing can still open.
     */
    const ownerUserId = publisher?.userId ?? null;
    const upload: FieldUpload = React.useCallback(
        async (file, purpose) => (await uploadService.upload(file, purpose, purpose === "VERIFICATION" && ownerUserId ? { ownerUserId } : {})).url,
        [ownerUserId]
    );

    const ctx: FieldContext = {
        answers,
        set,
        vocab,
        category,
        upload,
        idPrefix: "listing",
        indicator: (
            <PriceIndicatorLine venueTypeId={venueTypeId} mediaTypeId={mediaType?.id ?? null} sizeClassId={indicatorSizeId} latitude={point?.latitude ?? null} longitude={point?.longitude ?? null} city={city || null} ratePerDay={ratePerDay} />
        ),
    };

    /* The admin extras, where they belong on the flow's screens. */
    const sizeAnchor = screens.some((screen) => screen.fields.some((field) => field.id === "area_sq_ft")) ? "area_sq_ft" : null;
    const standardSize = (
        <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
                <Label htmlFor="listing-size-class">Or a standard size</Label>
                <Select value={effectiveSizeId} onValueChange={setSizeClassId} disabled={mediaType === null}>
                    <SelectTrigger id="listing-size-class">
                        <SelectValue placeholder={mediaType === null ? "Pick a spot type first" : "Measured above"} />
                    </SelectTrigger>
                    <SelectContent>
                        {sizes.map((size) => (
                            <SelectItem key={size.id} value={size.id}>
                                {size.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            {measured && effectiveSizeId === "" && (
                <p className="self-end pb-2 text-xs text-muted-foreground">
                    {areaSqFt} sq ft.{" "}
                    {measuredClass ? `Compares against other ${measuredClass.name} spots.` : "No spot has been listed at these dimensions before, so a size class will be created on save — until then there is nothing to compare against."}
                </p>
            )}
        </div>
    );
    /* Drawn the way the flow draws its own fields, on the same two-column grid. */
    const deskAttributes =
        deskQuestions.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2" data-testid="listing-desk-questions">
                {deskQuestions.map((question) => (
                    <div key={question.id} className={fieldSpan(question) === 2 ? "content-start sm:col-span-2" : "content-start"}>
                        <FlowFieldView field={question} ctx={ctx} />
                    </div>
                ))}
            </div>
        ) : null;
    const worksOutTo = (
        <div className="space-y-2">
            <p className="text-sm text-foreground">
                <span className="text-muted-foreground">Works out to </span>
                <span className="tabular-nums">{ratePerDay ? `₹${ratePerDay} per day` : "—"}</span>
            </p>
            {perSqFtNeedsArea && <p className="text-xs text-warning">A per-square-foot price needs the width and height, so the area can be worked out.</p>}
            {derived.rate === null && derived.problem === "ROUNDS_TO_ZERO" && <p className="text-xs text-warning">That works out to nothing per day — check the price and the unit.</p>}
            {derived.rate === null && derived.problem === "TOO_LARGE" && <p className="text-xs text-warning">That works out to more per day than a listing can hold.</p>}
        </div>
    );
    const extras: FlowExtras = {
        after: { ...(sizeAnchor ? { [sizeAnchor]: standardSize } : {}), base_price: worksOutTo },
        screenEnd: { "spot-details": sizeAnchor ? deskAttributes : <div className="space-y-4">{standardSize}{deskAttributes}</div> },
        // The attestation on the review screen is the submitter's to tick, on their own phone; a screen's resolution is asked of a screen.
        skip: (field, screen) => (!isNumbered(screen) && field.type === "checkbox") || (!digital && SCREEN_ONLY.has(field.id)),
    };
    const footerOf = (screen: (typeof screens)[number]) => {
        if (isNumbered(screen)) return undefined;
        return (
            <p className="text-xs text-muted-foreground">
                {screen.fields.some((field) => field.type === "document-upload")
                    ? "Filed onto the listing the moment it is created; ADX checks them at the desk before an agent is sent out."
                    : "The desk creates the listing as a draft. The publisher confirms and submits it from their own phone."}
            </p>
        );
    };

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (!canSubmit) return;
        setBusy(true);
        try {
            const body = flowListingBody(inPlay, { publisherId, mediaType, ...(effectiveSizeId ? { sizeClassId: effectiveSizeId } : {}), screens });
            const created = await listingsService.create(body as Parameters<typeof listingsService.create>[0]);
            // QR-24: a permit or agreement carries the day the right runs out, so a renewal later can extend it.
            const basis = inPlay.rights_basis;
            const validUntil = inPlay.rights_valid_until;
            const term = typeof basis === "string" && basis !== "OWNED" && typeof validUntil === "string" && validUntil.trim() !== "" ? validUntil.trim() : null;
            const unfiled: string[] = [];
            for (const document of flowListingDocuments(inPlay)) {
                try {
                    await listingsService.addDocument(created.id, { kind: document.kind, url: document.url, ...(term && RIGHTS_PAPERS.has(document.kind) ? { expiresAt: term } : {}) });
                } catch {
                    unfiled.push(document.kind);
                }
            }
            toast.success("Listing created", { description: `${title} is a draft until it is published.` });
            if (unfiled.length > 0) toast.error(`Could not file ${unfiled.join(", ")} — add the document from the listing's verification tab.`);
            router.push(`/listings/${created.id}`);
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not create that listing");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-6">
            <div className="flex items-center gap-3">
                <Button asChild variant="ghost" size="sm">
                    <Link href="/listings/directory">
                        <ChevronLeft className="size-4" aria-hidden />
                        Listings
                    </Link>
                </Button>
            </div>

            <SectionCard title="Publisher" description="Whose spot this is.">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="max-w-sm flex-1">
                        <Combobox items={publishers.map((candidate) => ({ label: candidate.name, value: candidate.id }))} value={publisherId} onValueChange={setPublisherId} placeholder="Choose a publisher" searchPlaceholder="Search publishers…" />
                    </div>
                    {publisher && (
                        <div className="flex items-center gap-2">
                            <InitialsAvatar name={publisher.name} size="sm" />
                            <StatusBadge status={publisher.kycStatus === "VERIFIED" ? { label: "KYC verified", tone: "success" } : { label: "KYC pending", tone: "warning" }} />
                        </div>
                    )}
                </div>
            </SectionCard>

            <FlowSections screens={screens} ctx={ctx} extras={extras} footerOf={footerOf} />

            <div className="flex items-center gap-3">
                <Button type="submit" disabled={busy || !canSubmit}>
                    {busy ? "Creating…" : "Create listing"}
                </Button>
                <Button asChild variant="outline" type="button">
                    <Link href="/listings/directory">Cancel</Link>
                </Button>
                {!canSubmit && (
                    <span className="text-xs text-muted-foreground">
                        {stillNeeded.length > 0 ? `Still needed: ${stillNeeded.join(", ")}.` : "Publisher, name, spot type, a size or measurements, address, coordinates and a price are all needed."}
                    </span>
                )}
            </div>
        </form>
    );
}
