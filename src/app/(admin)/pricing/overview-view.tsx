"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Database, GitMerge, Radio } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/adx/section-card";
import { useNow } from "@/lib/use-now";
import { StatusBadge } from "@/components/adx/status-badge";
import type {
    MediaType,
    MediaTypeMatchLogRow,
    PricingSettings,
    SurgeEventWindow,
    VocabularyProposal,
} from "@/types/pricing-engine";

interface Props {
    mediaTypes: MediaType[];
    matchLog: MediaTypeMatchLogRow[];
    surge: SurgeEventWindow[];
    proposals: VocabularyProposal[];
    settings: PricingSettings;
}

/**
 * What the engine is doing right now, and the two ways it fails quietly.
 *
 * There is no rate-realisation chart here and no discount funnel, because ADX
 * does not set prices and so has no realisation against a card to measure. What
 * this page watches instead is whether the engine can still answer: a
 * fragmenting taxonomy and an empty comparable pool both make the indicator
 * stop appearing, and neither announces itself.
 */
export function PricingOverview({ mediaTypes, matchLog, surge, proposals, settings }: Props) {
    const now = useNow();
    const liveSurge =
        now === null
            ? null
            : surge.filter(
                  (w) =>
                      w.isEnabled &&
                      new Date(w.startsAt).getTime() <= now &&
                      new Date(w.endsAt).getTime() >= now
              );
    const created = matchLog.filter((row) => row.outcome === "CREATED").length;
    const autoCreated = mediaTypes.filter((t) => t.origin === "AUTO_MATCHED").length;
    const fragmenting = matchLog.length >= 10 && created / matchLog.length > 0.4;

    return (
        <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                    label="Media types"
                    value={mediaTypes.filter((t) => t.status === "ACTIVE").length}
                    detail={`${autoCreated} created automatically`}
                />
                <Metric
                    label="Classifications logged"
                    value={matchLog.length}
                    detail={`${created} created a new type`}
                    tone={fragmenting ? "warning" : undefined}
                />
                <Metric
                    label="Surge windows live"
                    value={liveSurge?.length ?? null}
                    detail={`${surge.filter((w) => !w.isEnabled).length} switched off by ops`}
                />
                <Metric
                    label="Unrecognised values"
                    value={proposals.length}
                    detail="waiting on a decision"
                    tone={proposals.length > 0 ? "warning" : undefined}
                />
            </div>

            {fragmenting && (
                <Card className="rounded-lg border-warning/40 bg-warning-soft p-4 shadow-none">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">
                                The taxonomy may be fragmenting
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {created} of the last {matchLog.length} classifications minted a new
                                media type instead of matching one. Near-duplicates split the
                                comparable pool, and the only symptom is the indicator appearing
                                less often.
                            </p>
                        </div>
                        <Button asChild size="sm" variant="outline">
                            <Link href="/pricing/media-types">
                                <GitMerge className="mr-1.5 size-3.5" aria-hidden />
                                Review
                            </Link>
                        </Button>
                    </div>
                </Card>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
                <SectionCard
                    title="How the engine is set"
                    description="The numbers behind every verdict it gives."
                >
                    <dl className="divide-y text-sm">
                        <Row
                            term="Comparable radius"
                            detail="Never widens when the circle is empty"
                            value={`${settings.radiusMeters} m`}
                        />
                        <Row
                            term="Edges"
                            detail="Within this of either end of the range"
                            value={`±${(Number(settings.highEdgePct) * 100).toFixed(0)}%`}
                        />
                        <Row
                            term="Thin evidence below"
                            detail="The indicator says what little it stands on"
                            value={`${settings.thinEvidenceCount} contributors`}
                        />
                        <Row
                            term="ADX takes over at"
                            detail="Sold ADX listings before research is dropped"
                            value={`${settings.validatedTakeoverCount} contributors`}
                        />
                        <Row
                            term="Stale after"
                            detail="Labelled old, but still counted"
                            value={`${settings.stalenessMonths} months`}
                        />
                    </dl>
                </SectionCard>

                <SectionCard
                    title="Where to go next"
                    description="The engine only answers if these have been fed."
                >
                    <ul className="divide-y">
                        <NextStep
                            icon={Database}
                            title="Import market data"
                            body="At launch, research rows are very nearly every comparable there is. An empty pool means no indicator for anybody."
                            href="/pricing/market-data"
                        />
                        <NextStep
                            icon={GitMerge}
                            title="Review the taxonomy"
                            body="Merge near-duplicates before they split a pool that should have been one."
                            href="/pricing/media-types"
                        />
                        <NextStep
                            icon={Radio}
                            title="Check the surge calendar"
                            body="Windows arrive from a scraper. If one is wrong, switching it off here is the only way to stop it."
                            href="/pricing/surge"
                        />
                    </ul>
                </SectionCard>
            </div>
        </div>
    );
}

function Metric({
    label,
    value,
    detail,
    tone,
}: {
    label: string;
    /** Null while the answer depends on a clock that is not known yet. */
    value: number | null;
    detail: string;
    tone?: "warning";
}) {
    return (
        <Card className="rounded-lg border-border p-4 shadow-none">
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{label}</p>
                {tone === "warning" && (
                    <StatusBadge status={{ label: "Check", tone: "warning" }} />
                )}
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {value ?? "—"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
        </Card>
    );
}

function Row({ term, detail, value }: { term: string; detail: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-4 py-2.5">
            <div className="min-w-0">
                <dt className="font-medium text-foreground">{term}</dt>
                <dd className="text-xs text-muted-foreground">{detail}</dd>
            </div>
            <dd className="shrink-0 font-semibold tabular-nums text-foreground">{value}</dd>
        </div>
    );
}

function NextStep({
    icon: Icon,
    title,
    body,
    href,
}: {
    icon: typeof Database;
    title: string;
    body: string;
    href: string;
}) {
    return (
        <li>
            <Link
                href={href}
                className="flex items-start gap-3 py-3 transition-colors hover:bg-muted/40"
            >
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{title}</p>
                    <p className="text-xs text-muted-foreground">{body}</p>
                </div>
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
        </li>
    );
}
