"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatINR } from "@/lib/format";
import { GRADES, GRADE_LABEL, type RateGrade } from "@/services/rate-cards";
import {
    SECTORS,
    priceModelService,
    type PriceDimension,
    type PriceModelSettings,
    type SimulateInput,
    type Simulation,
    type SiteOption,
} from "@/services/price-model";
import type { Advertiser } from "@/types";
import type { MediaType } from "@/types/pricing-engine";

interface SimulatorViewProps {
    sites: SiteOption[];
    advertisers: Advertiser[];
    dimensions: PriceDimension[];
    settings: PriceModelSettings;
    mediaTypes: MediaType[];
}

const NONE = "__none__";
const DURATIONS = [7, 14, 28, 56, 84];

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
    const next = new Date(`${date}T00:00:00`);
    next.setDate(next.getDate() + days);
    return next.toISOString().slice(0, 10);
};
const daysBetween = (from: string, to: string) => {
    const a = new Date(`${from}T00:00:00`).getTime();
    const b = new Date(`${to}T00:00:00`).getTime();
    return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
};

/** A size band is picked by area, never by hand; every other dimension is a choice. */
const isSizeBand = (dimension: PriceDimension) =>
    dimension.values.some((value) => value.minAreaSqFt !== null || value.maxAreaSqFt !== null);

/** Match a listing's free-text attribute ("Back-lit") to a dimension value. */
function guessValue(dimension: PriceDimension, site: SiteOption | null): string {
    if (!site) return NONE;
    const hints = [site.illumination, site.facing, site.elevation, site.visibility]
        .filter((hint): hint is string => Boolean(hint))
        .map((hint) => hint.toLowerCase().replace(/[^a-z]/g, ""));
    const hit = dimension.values.find((value) => {
        const key = value.label.toLowerCase().replace(/[^a-z]/g, "");
        return hints.some((hint) => hint && (key.includes(hint) || hint.includes(key)));
    });
    return hit?.id ?? NONE;
}

const money = (value: string) => formatINR(Number(value));

/**
 * The DR 10 price simulator: thirteen inputs on the left, the calculation trace
 * on the right, net to publisher at the top.
 *
 * Every row of the trace is the backend's — `POST /price-model/simulate` walks
 * the rate card, the dimensions, the sector rule, the surge calendar, the rules
 * and the duration ladder, then hands the revenue module the rate for tax and
 * commission. The screen draws what it is sent and adds nothing.
 *
 * Differences from the fixture this restores: rates are per day (the platform's
 * unit), "city tier" is the site's city (no tier table exists), and there is no
 * TDS row because nothing in the platform models it.
 */
export function SimulatorView({ sites, advertisers, dimensions, settings, mediaTypes }: SimulatorViewProps) {
    const [siteId, setSiteId] = React.useState(sites[0]?.id ?? "");
    const site = sites.find((candidate) => candidate.id === siteId) ?? null;
    const [advertiserId, setAdvertiserId] = React.useState("");
    const [sector, setSector] = React.useState<string>(NONE);
    const [flightStart, setFlightStart] = React.useState(today());
    const [flightEnd, setFlightEnd] = React.useState(addDays(today(), 27));
    const [grade, setGrade] = React.useState<RateGrade | "">(site?.rateGrade ?? "");
    const [discount, setDiscount] = React.useState("0");

    const choosable = React.useMemo(() => dimensions.filter((d) => d.isActive && !isSizeBand(d)), [dimensions]);
    const [picks, setPicks] = React.useState<Record<string, string>>(() =>
        Object.fromEntries(choosable.map((d) => [d.id, guessValue(d, site)]))
    );

    // A new site resets what the site decides: its grade and its attributes.
    const [seenSite, setSeenSite] = React.useState(siteId);
    if (siteId !== seenSite) {
        setSeenSite(siteId);
        setGrade(site?.rateGrade ?? "");
        setPicks(Object.fromEntries(choosable.map((d) => [d.id, guessValue(d, site)])));
    }

    const days = daysBetween(flightStart, flightEnd);
    const dimensionValueIds = Object.values(picks).filter((id) => id && id !== NONE);

    const input: SimulateInput | null = site
        ? {
              listingId: site.id,
              days,
              sector: sector === NONE ? null : sector,
              grade: (grade || null) as RateGrade | null,
              dimensionValueIds,
              discountPct: discount === "0" ? null : discount,
          }
        : null;
    const inputKey = JSON.stringify(input);

    const [result, setResult] = React.useState<
        | { key: string; state: "ready"; simulation: Simulation }
        | { key: string; state: "error"; message: string }
        | null
    >(null);

    React.useEffect(() => {
        if (!input) return;
        let active = true;
        priceModelService
            .simulate(input)
            .then((simulation) => {
                if (active) setResult({ key: inputKey, state: "ready", simulation });
            })
            .catch((cause: unknown) => {
                if (active) {
                    setResult({
                        key: inputKey,
                        state: "error",
                        message: cause instanceof Error ? cause.message : "Could not price this site.",
                    });
                }
            });
        return () => {
            active = false;
        };
        // `inputKey` is the serialised input; `input` itself is a new object every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inputKey]);

    const stale = result !== null && result.key !== inputKey;
    const simulation = result?.state === "ready" ? result.simulation : null;
    const [sharing, setSharing] = React.useState(false);

    async function share() {
        if (!site || !simulation || !input) return;
        setSharing(true);
        try {
            const quote = await priceModelService.saveQuote({
                advertiserId: advertiserId || null,
                sector: input.sector,
                discountPct: input.discountPct,
                notes: `Simulated on ${site.title}${site.city ? `, ${site.city}` : ""} for a ${days}-day flight from ${flightStart}.`,
                lines: [
                    {
                        mediaTypeId: simulation.listing.mediaTypeId,
                        grade: (grade || site.rateGrade || "B") as RateGrade,
                        cityId: simulation.listing.cityId,
                        label: site.title,
                        days,
                        dimensionValueIds,
                        areaSqFt: site.areaSqFt,
                    },
                ],
            });
            toast.success(`Quote ${quote.reference} saved`, {
                description: "Open Quotes to send it to the advertiser or mark it accepted.",
            });
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save the quote.");
        } finally {
            setSharing(false);
        }
    }

    const mediaTypeName =
        simulation?.listing.mediaTypeName ??
        mediaTypes.find((type) => type.id === site?.mediaTypeId)?.name ??
        "—";

    return (
        <div className="space-y-5">
            <PageHeader
                title="Price simulator"
                subtitle="Trace exactly how a quote is built, rule by rule"
                actions={
                    <Button disabled={!simulation || stale || sharing} onClick={() => void share()}>
                        Share quote
                    </Button>
                }
            />

            <div className="grid gap-4 xl:grid-cols-3">
                <Card className="h-fit rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Inputs
                    </h3>
                    <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                        <Field label="Site" className="sm:col-span-2">
                            <Combobox
                                items={sites.map((candidate) => ({
                                    label: candidate.title,
                                    value: candidate.id,
                                    description: candidate.city ?? undefined,
                                }))}
                                value={siteId}
                                onValueChange={setSiteId}
                                placeholder="Pick a site"
                                searchPlaceholder="Search listings…"
                                className="h-9"
                            />
                        </Field>
                        <Field label="Advertiser">
                            <Combobox
                                items={[
                                    { label: "None", value: NONE },
                                    ...advertisers.map((advertiser) => ({
                                        label: advertiser.name,
                                        value: advertiser.id,
                                        description: advertiser.companyName ?? advertiser.city ?? undefined,
                                    })),
                                ]}
                                value={advertiserId || NONE}
                                onValueChange={(value) => setAdvertiserId(value === NONE ? "" : value)}
                                placeholder="None"
                                searchPlaceholder="Search advertisers…"
                                className="h-9"
                            />
                        </Field>
                        <Field label="Advertiser category">
                            <Select value={sector} onValueChange={setSector}>
                                <SelectTrigger className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>Not set</SelectItem>
                                    {SECTORS.map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {option}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Flight start">
                            <Input
                                type="date"
                                className="h-9"
                                value={flightStart}
                                onChange={(event) => {
                                    const start = event.target.value || today();
                                    setFlightStart(start);
                                    if (daysBetween(start, flightEnd) < 1) setFlightEnd(start);
                                }}
                            />
                        </Field>
                        <Field label="Flight end">
                            <Input
                                type="date"
                                className="h-9"
                                value={flightEnd}
                                min={flightStart}
                                onChange={(event) => setFlightEnd(event.target.value || flightStart)}
                            />
                        </Field>
                        <Field label="Duration">
                            <Select
                                value={DURATIONS.includes(days) ? String(days) : "custom"}
                                onValueChange={(value) => {
                                    if (value !== "custom") setFlightEnd(addDays(flightStart, Number(value) - 1));
                                }}
                            >
                                <SelectTrigger className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {DURATIONS.map((option) => (
                                        <SelectItem key={option} value={String(option)}>
                                            {option} days
                                        </SelectItem>
                                    ))}
                                    {!DURATIONS.includes(days) && (
                                        <SelectItem value="custom">{days} days</SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Media type">
                            <ReadOnly>{mediaTypeName}</ReadOnly>
                        </Field>
                        <Field label="Width (ft)">
                            <ReadOnly>{site?.widthFt ? `${Number(site.widthFt)} ft` : "—"}</ReadOnly>
                        </Field>
                        <Field label="Height (ft)">
                            <ReadOnly>{site?.heightFt ? `${Number(site.heightFt)} ft` : "—"}</ReadOnly>
                        </Field>
                        {choosable.map((dimension) => (
                            <Field key={dimension.id} label={dimension.name}>
                                <Select
                                    value={picks[dimension.id] ?? NONE}
                                    onValueChange={(value) =>
                                        setPicks((current) => ({ ...current, [dimension.id]: value }))
                                    }
                                >
                                    <SelectTrigger className="h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>Not applied</SelectItem>
                                        {dimension.values
                                            .filter((value) => value.isActive)
                                            .map((value) => (
                                                <SelectItem key={value.id} value={value.id}>
                                                    {value.label} · {Number(value.multiplier).toFixed(2)}×
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        ))}
                        <Field label="City">
                            <ReadOnly>{site?.city ?? "—"}</ReadOnly>
                        </Field>
                        <Field label="Locality grade">
                            <Select value={grade || "unset"} onValueChange={(value) => setGrade(value === "unset" ? "" : (value as RateGrade))}>
                                <SelectTrigger className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="unset">
                                        {site?.rateGrade ? `Site's own (${GRADE_LABEL[site.rateGrade]})` : "Site's own"}
                                    </SelectItem>
                                    {GRADES.map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {GRADE_LABEL[option]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Negotiated discount">
                            <Select value={discount} onValueChange={setDiscount}>
                                <SelectTrigger className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {["0", "5", "10", "15", "20", "25"].map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {option}%
                                            {Number(option) >= Number(settings.approvalThresholdPct) && option !== "0"
                                                ? " · needs approval"
                                                : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    </div>
                    <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                        The trace recomputes from the live rate card and every active rule.
                    </p>
                </Card>

                <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                        <div>
                            <h3 className="text-base font-semibold text-foreground">Calculation trace</h3>
                            {simulation && (
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <span>{simulation.cardName}</span>
                                    {simulation.belowFloor && (
                                        <StatusBadge status={{ label: "Below floor", tone: "danger" }} />
                                    )}
                                    {!simulation.belowFloor && simulation.needsApproval && (
                                        <StatusBadge status={{ label: "Needs approval", tone: "warning" }} />
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Net to publisher
                            </p>
                            <p className={cn("text-lg font-semibold text-primary", stale && "opacity-50")}>
                                {simulation ? money(simulation.netToPublisher) : "—"}
                            </p>
                        </div>
                    </div>

                    {!site && (
                        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                            Choose a site to trace its price.
                        </p>
                    )}
                    {site && result?.state === "error" && (
                        <div className="px-5 py-8 text-center">
                            <p className="text-sm font-medium text-foreground">Nothing to trace yet</p>
                            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{result.message}</p>
                            <Button asChild variant="outline" className="mt-4 bg-card">
                                <Link href="/pricing/rate-cards">Open rate cards</Link>
                            </Button>
                        </div>
                    )}
                    {site && result === null && (
                        <p className="px-5 py-10 text-center text-sm text-muted-foreground">Tracing…</p>
                    )}
                    {simulation && (
                        <div className={cn("overflow-x-auto", stale && "opacity-60")}>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                        <th className="px-5 py-2.5">Step</th>
                                        <th className="px-5 py-2.5">Rule</th>
                                        <th className="px-5 py-2.5 text-right">Factor</th>
                                        <th className="px-5 py-2.5 text-right">Running</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {simulation.rows.map((row, index) => (
                                        <tr
                                            key={`${row.step}-${index}`}
                                            className={cn("border-b last:border-0", row.emphasis && "bg-muted/40")}
                                        >
                                            <td
                                                className={cn(
                                                    "px-5 py-2.5",
                                                    row.emphasis ? "font-semibold text-foreground" : "font-medium text-foreground"
                                                )}
                                            >
                                                {row.step}
                                            </td>
                                            <td className="px-5 py-2.5 text-muted-foreground">{row.rule}</td>
                                            <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                                                {row.factor}
                                            </td>
                                            <td
                                                className={cn(
                                                    "px-5 py-2.5 text-right tabular-nums",
                                                    row.emphasis ? "font-semibold" : "font-medium"
                                                )}
                                            >
                                                {money(row.running)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
    return (
        <div className={cn("space-y-1", className)}>
            <Label className="text-xs">{label}</Label>
            {children}
        </div>
    );
}

function ReadOnly({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-foreground">
            <span className="truncate">{children}</span>
        </div>
    );
}
