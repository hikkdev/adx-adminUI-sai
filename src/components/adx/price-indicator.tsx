"use client";

import * as React from "react";
import { AlertTriangle, CircleCheck, Info, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebounced } from "@/lib/use-debounced";
import { ApiError } from "@/lib/api-client";
import { pricingService } from "@/services/pricing";
import type { IndicatorState, PriceIndicator as Indicator } from "@/types/pricing-engine";

interface Props {
    /**
     * The venue, and part of the match key.
     *
     * Null asks about the venue-less pool — right for a roadside hoarding, and
     * wrong for anything indoors. A form that forgets to pass this shows a
     * publisher the verdict for a market their listing will never be filed in.
     */
    venueTypeId: string | null;
    mediaTypeId: string | null;
    sizeClassId: string | null;
    latitude: number | null;
    longitude: number | null;
    city: string | null;
    /** The typed rate, as a decimal string. Empty while the field is blank. */
    ratePerDay: string;
    className?: string;
}

/**
 * The sentence under the pricing field.
 *
 * This is the entire product. Everything else in the pricing engine — the
 * taxonomy, the market data, the surge calendar, the comparable ladder — exists
 * so that one line can be said honestly to a publisher who has just typed a
 * number.
 *
 * It informs and never blocks. A publisher can list at any price; if they insist
 * on one the indicator dislikes, that is a conversation for ops rather than a
 * validation error.
 */

const TONE: Record<
    IndicatorState,
    { icon: typeof Info; ring: string; text: string; label: string }
> = {
    NO_DATA: {
        icon: Info,
        ring: "border-border bg-muted/40",
        text: "text-muted-foreground",
        label: "Nothing to compare",
    },
    TOO_LOW: {
        icon: TrendingDown,
        ring: "border-warning/40 bg-warning-soft",
        text: "text-warning",
        label: "Below the market",
    },
    LOW_SIDE: {
        icon: TrendingDown,
        ring: "border-info/40 bg-info-soft",
        text: "text-info",
        label: "On the cheaper side",
    },
    GOOD: {
        icon: CircleCheck,
        ring: "border-success/40 bg-success-soft",
        text: "text-success",
        label: "Within the going rate",
    },
    TOO_HIGH: {
        icon: TrendingUp,
        ring: "border-warning/40 bg-warning-soft",
        text: "text-warning",
        label: "Above the market",
    },
};

const rupees = (value: string): string =>
    `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function PriceIndicatorLine({
    venueTypeId,
    mediaTypeId,
    sizeClassId,
    latitude,
    longitude,
    city,
    ratePerDay,
    className,
}: Props) {
    /**
     * The answer, tagged with the question it answers.
     *
     * Kept as one keyed object rather than separate state that an effect clears:
     * a verdict for a price the publisher has since changed is worse than no
     * verdict, and comparing keys at render time makes a stale one unrenderable
     * rather than merely unlikely.
     */
    const [answer, setAnswer] = React.useState<{
        key: string;
        result: Indicator | null;
        failed: string | null;
    } | null>(null);

    /**
     * The whole question, and the same question once it has stopped changing.
     *
     * Only the rate used to be debounced, so typing "19.0760" into a latitude
     * field fired seven requests and "Mumbai" six more — a form filled in
     * normally spent a third of a publisher's rate-limit budget before they
     * reached the price. Debouncing one composite string rather than each field
     * separately also means a request is never assembled from a half-updated
     * form: `settled` is false until every input agrees with the settled key.
     */
    const question = `${venueTypeId}|${mediaTypeId}|${sizeClassId}|${latitude}|${longitude}|${city}|${ratePerDay}`;
    const key = useDebounced(question);
    const settled = key === question;

    const askable =
        mediaTypeId !== null &&
        sizeClassId !== null &&
        latitude !== null &&
        longitude !== null &&
        /^\d+(\.\d{1,2})?$/.test(ratePerDay) &&
        Number(ratePerDay) > 0;

    React.useEffect(() => {
        // `settled` is what makes the props safe to read here: while it is false
        // the form has moved on from the question `key` describes, and firing
        // would tag an answer with a key it does not answer.
        if (!askable || !settled) return;

        let live = true;
        void pricingService
            .evaluate({
                venueTypeId,
                mediaTypeId: mediaTypeId!,
                sizeClassId: sizeClassId!,
                latitude: latitude!,
                longitude: longitude!,
                city,
                ratePerDay,
            })
            .then((result) => {
                if (live) setAnswer({ key, result, failed: null });
            })
            .catch((cause: unknown) => {
                if (!live) return;
                // A failed check must never look like a verdict. Silence with a
                // reason is honest; a green tick because the request 500'd is not.
                setAnswer({
                    key,
                    result: null,
                    failed:
                        cause instanceof ApiError
                            ? cause.message
                            : "Could not check this price right now.",
                });
            });

        return () => {
            live = false;
        };
        // `key` carries every input, so nothing else can change the question.
    }, [
        askable,
        settled,
        key,
        venueTypeId,
        mediaTypeId,
        sizeClassId,
        latitude,
        longitude,
        city,
        ratePerDay,
    ]);

    // Anything tagged with a different key answers a question nobody is asking —
    // including, while the form is mid-edit, the last settled one.
    const current = answer?.key === question ? answer : null;

    if (!askable) {
        return (
            <p className={cn("text-xs text-muted-foreground", className)}>
                Pick a media type, a size and a location to check this price against the market.
            </p>
        );
    }

    if (current === null) {
        return (
            <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Checking nearby rates…
            </p>
        );
    }

    if (current.failed) {
        return (
            <p className={cn("text-xs text-muted-foreground", className)}>
                {current.failed} The price is unaffected — this is only a check.
            </p>
        );
    }

    const result = current.result;
    if (!result) return null;

    const tone = TONE[result.state];
    const Icon = tone.icon;

    return (
        <div
            className={cn("rounded-lg border px-3 py-2.5", tone.ring, className)}
            aria-live="polite"
        >
            <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 size-4 shrink-0", tone.text)} aria-hidden />
                <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium", tone.text)}>{tone.label}</p>
                    <p className="mt-0.5 text-sm text-foreground">{result.message}</p>

                    {result.range && (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                            Nearby spots list at{" "}
                            <span className="font-medium tabular-nums text-foreground">
                                {rupees(result.range.low)} – {rupees(result.range.high)}
                            </span>{" "}
                            a day
                            {result.surge && (
                                <>
                                    {" · ceiling lifted to "}
                                    <span className="font-medium tabular-nums text-foreground">
                                        {rupees(result.effectiveHigh ?? result.range.high)}
                                    </span>
                                    {/* A window that is not public reports its
                                        effect without naming itself. */}
                                    {result.surge.name ? ` for ${result.surge.name}` : " for an event running now"}
                                </>
                            )}
                        </p>
                    )}

                    {result.staleContributors > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            {result.staleContributors} of those{" "}
                            {result.staleContributors === 1 ? "price is" : "prices are"} past the
                            staleness window.
                        </p>
                    )}

                    {result.tier === "PROVISIONAL" && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            Based on publisher rate cards rather than observed rates — treat it as
                            provisional.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
