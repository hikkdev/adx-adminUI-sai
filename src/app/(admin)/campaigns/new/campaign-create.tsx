"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, PlugZap, Search, Star, Upload, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { EmptyState } from "@/components/adx/empty-state";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { StatusBadge } from "@/components/adx/status-badge";
import { FieldList } from "@/components/adx/simple-table";
import { ApiError } from "@/lib/api-client";
import { formatCompactINR, formatDate, formatMoney } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { advertiserService } from "@/services/advertisers";
import {
    BROWSE_CATEGORY_LABEL,
    CREATIVE_PATH_CHOICES,
    WIZARD_STEPS,
    WIZARD_STEP_LABEL,
    availabilityFor,
    averageWeeklyRate,
    campaignWizardService,
    cartBody,
    estimatedCost,
    flightDays,
    flightPatch,
    initialWizardState,
    nextStep,
    previousStep,
    stepBlocker,
    wizardReadsApi,
    type BrowseCard,
    type BrowseCategory,
    type BrowseDisplay,
    type BrowsePage,
    type WizardState,
} from "@/services/campaign-wizard";
import { campaignService, type CampaignReview, type ContentCategory } from "@/services/campaigns";
import { moderationService } from "@/services/moderation";
import { uploadService } from "@/services/uploads";
import { AuthorizeDialog } from "../authorize-dialog";
import type { Advertiser } from "@/types";

/** The slider's range for the frame's "rate per site" cap — per day, the canonical unit. */
const RATE_MIN = 500;
const RATE_MAX = 25_000;

/**
 * DR 10's New campaign wizard (`5102:27803`), over the live routes.
 *
 * The frame's layout stands — the stepper, the sites table with its
 * filters rail and selection summary — and every figure on it is the API's:
 * the inventory is `GET /listings/browse`, the draft is `POST /campaigns`,
 * the flight `PATCH /campaigns/:id`, the cart `PUT /campaigns/:id/spots`,
 * and the review step's two buttons are `submit-for-payment` and the
 * on-behalf authorise with the reference typed back.
 *
 * The filters rail's City and Type controls are single-select — a
 * narrowing of the frame, not a drop: `GET /listings/browse` takes one
 * `city`, one `category` and one `display` per read, so a second tick
 * would have to be a second request the table cannot merge with the first.
 * The frame's fifth selection-summary row, "Avg weekly rate", is seven
 * times the mean rate per day of the picked spots.
 *
 * G13-C: the frame's subtitle "brief received" is dropped under Q116 —
 * nothing on the server records a brief; the wizard's first write is the
 * draft itself — so the line under the title is the campaign name as
 * typed (which stands) and whether the draft is saved, nothing more.
 */
export function CampaignCreate() {
    const router = useRouter();
    const [state, setState] = React.useState<WizardState>(initialWizardState);
    const [busy, setBusy] = React.useState(false);
    const [picked, setPicked] = React.useState<Map<string, BrowseCard>>(new Map());
    const patch = (next: Partial<WizardState>) => setState((current) => ({ ...current, ...next }));

    if (!wizardReadsApi()) {
        return (
            <EmptyState
                icon={PlugZap}
                title="The wizard writes real drafts"
                description="A campaign here holds real spots for a real advertiser. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend."
            />
        );
    }

    const blocker = stepBlocker(state);
    const days = flightDays(state.startDate, state.endDate);
    const pickedCards = state.selected.map((id) => picked.get(id)).filter((card): card is BrowseCard => Boolean(card));

    /** Leaving a step writes what the server needs from it. */
    const advance = async () => {
        if (blocker) {
            toast.error(blocker);
            return;
        }
        setBusy(true);
        try {
            if (state.step === "ADVERTISER" && !state.campaignId) {
                const draft = await campaignWizardService.createDraft({ advertiserId: state.advertiserId!, name: state.name.trim() });
                patch({ campaignId: draft.id, step: "SITES" });
            } else if (state.step === "FLIGHT" && state.campaignId) {
                // The API wants the flight before the cart: a spot's line is its rate × days.
                await campaignWizardService.patch(state.campaignId, flightPatch(state));
                await campaignWizardService.setSpots(state.campaignId, cartBody(state));
                toast.success("Sites locked. Next: creatives", {
                    description: `${state.selected.length} site${state.selected.length === 1 ? "" : "s"} in the cart at today's rates.`,
                });
                patch({ step: "CREATIVES" });
            } else {
                const next = nextStep(state.step);
                if (next) patch({ step: next });
            }
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "Could not save this step");
        } finally {
            setBusy(false);
        }
    };

    const back = () => {
        const previous = previousStep(state.step);
        if (previous) patch({ step: previous });
    };

    const continueLabel: Record<WizardState["step"], string> = {
        ADVERTISER: "Continue to sites",
        SITES: "Continue to flight and budget",
        FLIGHT: "Continue to creatives",
        CREATIVES: "Continue to review",
        REVIEW: "",
    };

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/campaigns"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Campaigns
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">New campaign</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {state.name.trim() ? state.name.trim() : "A campaign on an advertiser's behalf"}
                            {state.campaignId ? " · draft saved" : ""}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {previousStep(state.step) ? (
                            <Button variant="outline" className="bg-card" onClick={back} disabled={busy}>
                                Back
                            </Button>
                        ) : (
                            <Button variant="outline" className="bg-card" asChild>
                                <Link href="/campaigns">Back</Link>
                            </Button>
                        )}
                        {state.step !== "REVIEW" && (
                            <Button disabled={busy || blocker !== null} title={blocker ?? undefined} onClick={advance}>
                                {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                                {continueLabel[state.step]}
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Stepper */}
            <Card className="rounded-lg border-border shadow-none">
                <ol className="flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-4">
                    {WIZARD_STEPS.map((step, index) => {
                        const active = step === state.step;
                        const done = WIZARD_STEPS.indexOf(step) < WIZARD_STEPS.indexOf(state.step);
                        return (
                            <li key={step} className="flex items-center gap-2.5">
                                <span
                                    className={cn(
                                        "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                                        active ? "bg-primary text-primary-foreground" : done ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
                                    )}
                                >
                                    {index + 1}
                                </span>
                                <span className={cn("text-sm font-medium", active ? "text-foreground" : "text-muted-foreground")}>
                                    {WIZARD_STEP_LABEL[step]}
                                </span>
                            </li>
                        );
                    })}
                </ol>
            </Card>

            {state.step === "ADVERTISER" && <AdvertiserStep state={state} onChange={patch} />}
            {state.step === "SITES" && (
                <SitesStep
                    state={state}
                    picked={picked}
                    days={days}
                    onToggle={(card) => {
                        setPicked((current) => new Map(current).set(card.id, card));
                        patch({
                            selected: state.selected.includes(card.id)
                                ? state.selected.filter((id) => id !== card.id)
                                : [...state.selected, card.id],
                        });
                    }}
                />
            )}
            {state.step === "FLIGHT" && <FlightStep state={state} onChange={patch} cards={pickedCards} days={days} />}
            {state.step === "CREATIVES" && state.campaignId && (
                <CreativesStep campaignId={state.campaignId} state={state} cards={pickedCards} onUploaded={() => patch({ uploaded: state.uploaded + 1 })} />
            )}
            {state.step === "REVIEW" && state.campaignId && (
                <ReviewStep campaignId={state.campaignId} name={state.name} onLaunched={() => router.push(`/campaigns/${state.campaignId}`)} />
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Step 0 — the advertiser                                             */
/* ------------------------------------------------------------------ */

/** What an advertiser is called on the picker: the company, else the person. */
const advertiserLabel = (row: Advertiser) => row.companyName ?? row.name;

function AdvertiserStep({ state, onChange }: { state: WizardState; onChange: (next: Partial<WizardState>) => void }) {
    /* E7-3: searched server-side — `GET /advertisers?q=` over name, company,
       email, identifier and mobile — rather than the whole roster filtered here. */
    const [query, setQuery] = React.useState("");
    const [picked, setPicked] = React.useState<Advertiser | null>(null);
    const q = useDebounced(query.trim(), 350);
    const matches = useApiResource<Advertiser[]>(`wizard:advertisers:${q}`, () =>
        q.length >= 2 ? advertiserService.search(q) : Promise.resolve([])
    );
    const rows = matches.data ?? [];
    const locked = Boolean(state.campaignId);

    return (
        <Card className="max-w-2xl rounded-lg border-border p-5 shadow-none">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Whose campaign</h3>
            <p className="mt-1 text-sm text-muted-foreground">
                The draft is the advertiser&rsquo;s from the first write; they see it in their app and can pay for it themselves.
            </p>
            <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                    <Label htmlFor="wizard-advertiser">Advertiser</Label>
                    {picked && state.advertiserId === picked.id ? (
                        <div className="flex h-9 items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 text-sm" data-testid="wizard-advertiser-picked">
                            <span className="truncate">
                                {advertiserLabel(picked)}
                                {picked.displayId ? <span className="ml-2 font-mono text-xs text-muted-foreground">{picked.displayId}</span> : null}
                            </span>
                            {!locked && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPicked(null);
                                        onChange({ advertiserId: null });
                                    }}
                                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                                    aria-label="Clear the advertiser"
                                >
                                    <X className="size-4" />
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            <Input
                                id="wizard-advertiser"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Search by name, company, identifier, email or mobile"
                                autoComplete="off"
                                disabled={locked}
                            />
                            {q.length >= 2 && (
                                <div className="rounded-md border text-sm" role="listbox" aria-label="Matching advertisers">
                                    {matches.loading && rows.length === 0 ? (
                                        <p className="px-3 py-2 text-muted-foreground">Searching…</p>
                                    ) : matches.error ? (
                                        <p className="px-3 py-2 text-danger">{matches.error}</p>
                                    ) : rows.length === 0 ? (
                                        <p className="px-3 py-2 text-muted-foreground">No advertiser matches &ldquo;{q}&rdquo;.</p>
                                    ) : (
                                        <ul className="max-h-48 divide-y overflow-y-auto">
                                            {rows.map((row) => (
                                                <li key={row.id}>
                                                    <button
                                                        type="button"
                                                        role="option"
                                                        aria-selected={false}
                                                        onClick={() => {
                                                            setPicked(row);
                                                            setQuery("");
                                                            onChange({ advertiserId: row.id });
                                                        }}
                                                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50"
                                                    >
                                                        <span className="min-w-0">
                                                            <span className="block truncate">{advertiserLabel(row)}</span>
                                                            <span className="block truncate text-xs text-muted-foreground">
                                                                {[row.city, row.status].filter(Boolean).join(" · ")}
                                                            </span>
                                                        </span>
                                                        <span className="shrink-0 font-mono text-xs text-muted-foreground">{row.displayId ?? ""}</span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                    <p className="text-xs text-muted-foreground">Searched on the server as you type; two characters to start.</p>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="wizard-name">Campaign name</Label>
                    <Input
                        id="wizard-name"
                        value={state.name}
                        onChange={(event) => onChange({ name: event.target.value })}
                        placeholder="Diwali season push"
                        maxLength={160}
                        disabled={Boolean(state.campaignId)}
                    />
                </div>
                {state.campaignId && (
                    <p className="text-xs text-muted-foreground">
                        Draft saved. To start over for another advertiser, open the wizard again.
                    </p>
                )}
            </div>
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* Step 1 — the sites                                                  */
/* ------------------------------------------------------------------ */

function SitesStep({
    state,
    picked,
    days,
    onToggle,
}: {
    state: WizardState;
    picked: Map<string, BrowseCard>;
    days: number | null;
    onToggle: (card: BrowseCard) => void;
}) {
    const [q, setQ] = React.useState("");
    const [city, setCity] = React.useState("");
    const [category, setCategory] = React.useState<BrowseCategory | "">("");
    const [display, setDisplay] = React.useState<BrowseDisplay | "">("");
    const [instant, setInstant] = React.useState(false);
    const [rateCap, setRateCap] = React.useState([RATE_MAX]);
    const search = useDebounced(q.trim(), 300);
    const cityValue = useDebounced(city.trim(), 300);
    const maxRate = useDebounced(rateCap[0], 300);

    const page = useApiResource<BrowsePage>(
        `wizard:browse:${search}:${cityValue}:${category}:${display}:${instant}:${maxRate}`,
        () =>
            campaignWizardService.browse({
                q: search || undefined,
                city: cityValue || undefined,
                category: category || undefined,
                display: display || undefined,
                instant: instant ? true : undefined,
                maxRate: maxRate < RATE_MAX ? String(maxRate) : undefined,
                pageSize: 50,
            }),
    );

    const reset = () => {
        setQ("");
        setCity("");
        setCategory("");
        setDisplay("");
        setInstant(false);
        setRateCap([RATE_MAX]);
    };

    const items = page.data?.items ?? [];
    const selectedCards = state.selected.map((id) => picked.get(id)).filter((card): card is BrowseCard => Boolean(card));
    const rates = selectedCards.map((card) => card.ratePerDay);
    const cost = estimatedCost(rates, days ?? 1);
    const weeklyRate = averageWeeklyRate(rates);

    return (
        <div className="grid gap-4 xl:grid-cols-3">
            {/* Sites table */}
            <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Select sites</h3>
                    <div className="relative w-full sm:w-64">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={q}
                            onChange={(event) => setQ(event.target.value)}
                            placeholder="Site, publisher or address"
                            className="h-8 pl-9"
                            aria-label="Search sites"
                        />
                    </div>
                </div>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-y bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                            <th className="w-10 px-5 py-2.5" />
                            <th className="px-3 py-2.5">Site</th>
                            <th className="px-3 py-2.5">City</th>
                            <th className="px-3 py-2.5">Type</th>
                            <th className="px-3 py-2.5 text-right">Rate / day</th>
                            <th className="px-3 py-2.5">Availability</th>
                        </tr>
                    </thead>
                    <tbody>
                        {page.loading && items.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                                    <Loader2 className="mx-auto size-4 animate-spin" />
                                </td>
                            </tr>
                        )}
                        {page.error && (
                            <tr>
                                <td colSpan={6} className="px-5 py-10 text-center text-sm text-danger">
                                    {page.error}
                                </td>
                            </tr>
                        )}
                        {!page.loading && !page.error && items.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                                    No live spot matches these filters.
                                </td>
                            </tr>
                        )}
                        {items.map((card) => {
                            const selected = state.selected.includes(card.id);
                            return (
                                <tr
                                    key={card.id}
                                    onClick={() => onToggle(card)}
                                    className={cn(
                                        "cursor-pointer border-b transition-colors last:border-0",
                                        selected ? "bg-primary/[0.04]" : "hover:bg-muted/40",
                                    )}
                                >
                                    <td className="px-5 py-3">
                                        <Checkbox checked={selected} onCheckedChange={() => onToggle(card)} aria-label={`Select ${card.title}`} />
                                    </td>
                                    <td className="px-3 py-3">
                                        <div className="flex items-center gap-2.5">
                                            <InitialsAvatar name={card.title} size="sm" />
                                            <div className="min-w-0">
                                                <p className="flex items-center gap-1.5 font-medium text-foreground">
                                                    <span className="truncate">{card.title}</span>
                                                    {card.instantBooking && (
                                                        <Zap className="size-3.5 shrink-0 text-warning" aria-label="Instant booking" />
                                                    )}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {card.publisherName ?? "Unclaimed"}
                                                    {card.ratingAvg ? (
                                                        <span className="ml-1.5 inline-flex items-center gap-0.5">
                                                            <Star className="size-3 fill-warning text-warning" aria-hidden />
                                                            {card.ratingAvg} ({card.reviewCount})
                                                        </span>
                                                    ) : null}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 text-muted-foreground">{card.city ?? "—"}</td>
                                    <td className="px-3 py-3 text-muted-foreground">{card.subType ?? card.category}</td>
                                    <td className="px-3 py-3 text-right font-medium tabular-nums">
                                        {card.ratePerDay ? formatMoney(card.ratePerDay) : "—"}
                                    </td>
                                    <td className="px-3 py-3">
                                        <StatusBadge status={availabilityFor(card)} />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <p className="px-5 py-3 text-xs text-muted-foreground">
                    {page.data ? `Showing ${items.length} of ${page.data.total} live sites that match` : ""}
                </p>
            </Card>

            {/* Filters + summary rail */}
            <div className="space-y-4">
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filters</h3>
                        <button
                            type="button"
                            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                            onClick={reset}
                        >
                            Reset
                        </button>
                    </div>
                    <p className="mt-3 text-xs font-medium text-muted-foreground">City</p>
                    <Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Bengaluru" className="mt-1.5 h-8" />
                    <p className="mt-4 text-xs font-medium text-muted-foreground">Type</p>
                    <div className="mt-1.5 space-y-1.5">
                        {(Object.keys(BROWSE_CATEGORY_LABEL) as BrowseCategory[]).map((option) => (
                            <label key={option} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                    checked={category === option}
                                    onCheckedChange={(checked) => setCategory(checked ? option : "")}
                                />
                                {BROWSE_CATEGORY_LABEL[option]}
                            </label>
                        ))}
                    </div>
                    <p className="mt-4 text-xs font-medium text-muted-foreground">Display</p>
                    <div className="mt-1.5 space-y-1.5">
                        {(["STATIC", "DIGITAL"] as BrowseDisplay[]).map((option) => (
                            <label key={option} className="flex items-center gap-2 text-sm">
                                <Checkbox checked={display === option} onCheckedChange={(checked) => setDisplay(checked ? option : "")} />
                                {option === "STATIC" ? "Static" : "Digital"}
                            </label>
                        ))}
                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox checked={instant} onCheckedChange={(checked) => setInstant(Boolean(checked))} />
                            Instant booking only
                        </label>
                    </div>
                    <p className="mt-4 text-xs font-medium text-muted-foreground">Rate per day per site</p>
                    <Slider value={rateCap} onValueChange={setRateCap} min={RATE_MIN} max={RATE_MAX} step={500} className="mt-3" />
                    <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                        <span>{formatCompactINR(RATE_MIN)}</span>
                        <span className="font-medium text-foreground">
                            {rateCap[0] >= RATE_MAX ? "any rate" : `up to ${formatCompactINR(rateCap[0])}`}
                        </span>
                    </div>
                </Card>

                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selection summary</h3>
                    <FieldList
                        className="mt-3"
                        items={[
                            ["Sites selected", String(state.selected.length)],
                            [days ? "Estimated cost" : "Per day", cost ? formatMoney(cost) : "—"],
                            ["Flight", days ? `${formatDate(state.startDate)} to ${formatDate(state.endDate)}` : "Set on the next step"],
                            ["Duration", days ? `${days} day${days === 1 ? "" : "s"}` : "—"],
                            ["Avg weekly rate", weeklyRate ? formatMoney(weeklyRate) : "—"],
                        ]}
                    />
                    <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                        Rates bind when the cart is written, at the price the server reads then. Spots are held for 24 hours once the
                        campaign is sent to the advertiser to pay.
                    </p>
                </Card>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Step 2 — flight and budget                                          */
/* ------------------------------------------------------------------ */

function FlightStep({
    state,
    onChange,
    cards,
    days,
}: {
    state: WizardState;
    onChange: (next: Partial<WizardState>) => void;
    cards: BrowseCard[];
    days: number | null;
}) {
    const categories = useApiResource<ContentCategory[]>("wizard:content-categories", () => campaignService.contentCategories());
    const cost = estimatedCost(
        cards.map((card) => card.ratePerDay),
        days,
    );

    return (
        <div className="grid gap-4 xl:grid-cols-3">
            <Card className="rounded-lg border-border p-5 shadow-none xl:col-span-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Flight and budget</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="wizard-start">Start date</Label>
                        <Input id="wizard-start" type="date" value={state.startDate} onChange={(event) => onChange({ startDate: event.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="wizard-end">End date</Label>
                        <Input id="wizard-end" type="date" value={state.endDate} min={state.startDate || undefined} onChange={(event) => onChange({ endDate: event.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="wizard-budget">Budget (₹, optional)</Label>
                        <Input id="wizard-budget" inputMode="decimal" value={state.budget} onChange={(event) => onChange({ budget: event.target.value })} placeholder="250000" />
                        <p className="text-xs text-muted-foreground">A cap the review measures the cart against. Leave blank for none.</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="wizard-category">Content category</Label>
                        <Select value={state.contentCategoryId ?? ""} onValueChange={(value) => onChange({ contentCategoryId: value || null })}>
                            <SelectTrigger id="wizard-category">
                                <SelectValue placeholder={categories.loading ? "Loading…" : "What the creative advertises"} />
                            </SelectTrigger>
                            <SelectContent>
                                {(categories.data ?? [])
                                    .filter((item) => item.isActive)
                                    .map((item) => (
                                        <SelectItem key={item.id} value={item.id}>
                                            {item.name}
                                            {item.isSensitive ? " · sensitive" : ""}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Checked against every booked spot&rsquo;s content rules at upload.</p>
                    </div>
                </div>

                <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Creative path</h3>
                <RadioGroup
                    className="mt-3 grid gap-2 sm:grid-cols-3"
                    value={state.creativePath}
                    onValueChange={(value) => onChange({ creativePath: value as WizardState["creativePath"] })}
                >
                    {CREATIVE_PATH_CHOICES.map((choice) => (
                        <label
                            key={choice.value}
                            className={cn(
                                "flex cursor-pointer items-start gap-2.5 rounded-md border p-3 text-sm",
                                state.creativePath === choice.value ? "border-primary bg-primary/[0.04]" : "hover:bg-muted/40",
                            )}
                        >
                            <RadioGroupItem value={choice.value} className="mt-0.5" />
                            <span>
                                <span className="block font-medium text-foreground">{choice.label}</span>
                                <span className="block text-xs text-muted-foreground">{choice.detail}</span>
                            </span>
                        </label>
                    ))}
                </RadioGroup>
            </Card>

            <Card className="rounded-lg border-border p-5 shadow-none">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selection summary</h3>
                <FieldList
                    className="mt-3"
                    items={[
                        ["Sites selected", String(cards.length)],
                        ["Estimated cost", cost ? formatMoney(cost) : "—"],
                        ["Flight", days ? `${formatDate(state.startDate)} to ${formatDate(state.endDate)}` : "—"],
                        ["Duration", days ? `${days} day${days === 1 ? "" : "s"}` : "—"],
                        ["Budget", state.budget.trim() ? formatMoney(state.budget.trim()) : "No cap"],
                    ]}
                />
                <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
                    {cards.map((card) => (
                        <li key={card.id} className="flex justify-between gap-2">
                            <span className="truncate">{card.title}</span>
                            <span className="tabular-nums">{card.ratePerDay ? `${formatMoney(card.ratePerDay)}/day` : "—"}</span>
                        </li>
                    ))}
                </ul>
                <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                    Continuing writes the flight and the cart. Fees and GST are added at review.
                </p>
            </Card>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Step 3 — creatives                                                  */
/* ------------------------------------------------------------------ */

function CreativesStep({
    campaignId,
    state,
    cards,
    onUploaded,
}: {
    campaignId: string;
    state: WizardState;
    cards: BrowseCard[];
    onUploaded: () => void;
}) {
    const [busy, setBusy] = React.useState<string | null>(null);
    const perSpot = state.creativePath !== "ADX_DESIGN_AGENCY";
    const [done, setDone] = React.useState<Set<string>>(new Set());

    const upload = async (file: File, spotId: string | null, key: string) => {
        setBusy(key);
        try {
            const stored = await uploadService.upload(file, "CAMPAIGN_CREATIVE");
            const input = { fileUrl: stored.url, fileName: file.name, fileSize: file.size, mimeType: file.type || undefined };
            if (state.creativePath === "ADX_DESIGN_AGENCY") {
                await moderationService.uploadDesigned(campaignId, { ...input, spotId });
                toast.success("ADX design uploaded", { description: "The advertiser accepts it before ops review." });
            } else {
                await campaignWizardService.uploadCreative(campaignId, { ...input, spotId });
                toast.success("Artwork submitted", { description: "It is in the review queue." });
            }
            setDone((current) => new Set(current).add(key));
            onUploaded();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The upload was refused.");
        } finally {
            setBusy(null);
        }
    };

    // The cart's spot ids are on the draft, not the browse cards; the upload
    // is campaign-level here and the advertiser (or the campaign page) can
    // attach per-spot artwork once the spots have ids. One slot per card is
    // drawn so ops see what is expected.
    const slots = perSpot ? cards.map((card) => ({ key: card.id, title: card.title, subtitle: card.size ?? card.city ?? "" })) : [{ key: "campaign", title: "Whole campaign", subtitle: "One design, every spot" }];

    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Creatives</h3>
            <p className="mt-1 text-sm text-muted-foreground">
                {perSpot
                    ? "Every upload is a submission to the review desk. The advertiser can upload from their app instead; the review lists what is still missing."
                    : "Ops upload the design; it waits for the advertiser's acceptance and then enters ops review like any other artwork."}
            </p>
            <ul className="mt-4 divide-y">
                {slots.map((slot) => (
                    <li key={slot.key} className="flex items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">{slot.title}</p>
                            <p className="text-xs text-muted-foreground">{slot.subtitle}</p>
                        </div>
                        {done.has(slot.key) ? (
                            <StatusBadge status={{ label: "Uploaded", tone: "success" }} />
                        ) : (
                            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted/40">
                                {busy === slot.key ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                                Upload
                                <input
                                    type="file"
                                    accept={state.creativePath === "VIDEO_OR_MOTION" ? "video/*" : "image/*,video/*"}
                                    className="hidden"
                                    disabled={busy !== null}
                                    onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        if (file) void upload(file, null, slot.key);
                                        event.target.value = "";
                                    }}
                                />
                            </label>
                        )}
                    </li>
                ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
                Uploads here are campaign-level; per-spot artwork is attached from the campaign page once the cart has spot ids.
            </p>
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* Step 4 — review                                                     */
/* ------------------------------------------------------------------ */

function ReviewStep({ campaignId, name, onLaunched }: { campaignId: string; name: string; onLaunched: () => void }) {
    const router = useRouter();
    const review = useApiResource<CampaignReview>(`wizard:review:${campaignId}`, () => campaignService.review(campaignId));
    const [authorising, setAuthorising] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const data = review.data;
    const missing = (data?.missing ?? []).filter((item) => item.field !== "AGREEMENT_REQUIRED");

    const send = async () => {
        setBusy(true);
        try {
            await campaignService.submitForPayment(campaignId);
            toast.success(`${name} sent to the advertiser to pay`, {
                description: "The spots are held for 24 hours and the advertiser has been told.",
            });
            router.push(`/campaigns/${campaignId}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not send it");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="grid gap-4 xl:grid-cols-3">
            <Card className="rounded-lg border-border p-5 shadow-none xl:col-span-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">The bill</h3>
                {review.loading && !data && <Loader2 className="mt-4 size-4 animate-spin text-muted-foreground" />}
                {review.error && <p className="mt-4 text-sm text-danger">{review.error}</p>}
                {data && (
                    <>
                        <table className="mt-4 w-full text-sm">
                            <thead>
                                <tr className="border-y bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                    <th className="px-3 py-2">Site</th>
                                    <th className="px-3 py-2 text-right">Rate / day</th>
                                    <th className="px-3 py-2 text-right">Days</th>
                                    <th className="px-3 py-2 text-right">Line</th>
                                </tr>
                            </thead>
                            <tbody>
                                {((data.lines as { spotId: string; title: string; city: string | null; ratePerDay: string; days: number; lineTotal: string }[] | undefined) ?? []).map((line) => (
                                    <tr key={line.spotId} className="border-b last:border-0">
                                        <td className="px-3 py-2">
                                            <span className="font-medium text-foreground">{line.title}</span>
                                            {line.city && <span className="ml-1.5 text-xs text-muted-foreground">{line.city}</span>}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.ratePerDay)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{line.days}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(line.lineTotal)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <FieldList
                            className="mt-4 ml-auto max-w-xs"
                            items={[
                                ["Spots", formatMoney(data.spotsSubtotal as string)],
                                ["Fees", formatMoney(data.feesTotal as string)],
                                ["GST", formatMoney(data.gstAmount as string)],
                                ["Discount", formatMoney(data.discount as string)],
                                ["Total", <span key="total" className="text-base">{formatMoney(data.total ?? null)}</span>],
                            ]}
                        />
                        {missing.length > 0 && (
                            <div className="mt-4 rounded-md bg-warning-soft p-3 text-xs">
                                <p className="font-medium text-foreground">Still missing before it can be sent</p>
                                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                                    {missing.map((item) => (
                                        <li key={`${item.step}:${item.field}`}>{item.label}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {(data.outstanding ?? []).map((item) => (
                            <p key={item.code} className="mt-3 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
                                {item.label}
                            </p>
                        ))}
                        {(data.clashes ?? []).length > 0 && (
                            <p className="mt-3 rounded-md bg-danger-soft p-3 text-xs text-danger">
                                No slot left for these dates — the holds fill the listing&apos;s slots: {data.clashes!.map((clash) => clash.title).join(", ")}. Pick another
                                spot or another flight.
                            </p>
                        )}
                    </>
                )}
            </Card>

            <Card className="rounded-lg border-border p-5 shadow-none">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What happens next</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                    Send it to the advertiser and they pay from their app — wallet or gateway — with the spots held for 24 hours. Or
                    authorise now out of their wallet balance, with the reference typed back and, above the threshold, a second admin.
                </p>
                <div className="mt-4 space-y-2">
                    <Button className="w-full" disabled={busy || review.loading || missing.length > 0} onClick={send}>
                        Send to advertiser to pay
                    </Button>
                    <Button variant="outline" className="w-full bg-card" disabled={busy || review.loading} onClick={() => setAuthorising(true)}>
                        Authorise now
                    </Button>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                    The insertion order is the advertiser&rsquo;s own click; authorising refuses until they have accepted the live
                    version.
                </p>
            </Card>

            <AuthorizeDialog
                campaign={authorising && data ? { id: campaignId, name, reference: data.reference ?? "", total: data.total ?? null } : null}
                onOpenChange={(open) => !open && setAuthorising(false)}
                onDone={onLaunched}
            />
        </div>
    );
}
