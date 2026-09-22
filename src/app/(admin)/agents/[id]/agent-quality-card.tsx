"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { qualityHint, qualityLabel, type AgentQuality } from "@/services/leads";

/**
 * LH10: the agent's quality score, beside the rating.
 *
 * The rating is what publishers and the platform's own counters say about
 * the work; this is what the sampled evidence says — a photo and a fix on a
 * visit, the consent line on a recorded call — less any integrity flag ops
 * confirmed. It is deliberately null under the sample floor: too little
 * sampled work is no score, not a bad one.
 */
export function AgentQualityCard({ quality }: { quality: AgentQuality | null }) {
    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="agent-quality-card">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Quality</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">What the sampled field work shows, less the confirmed integrity flags.</p>
                </div>
                <Link href="/leads/integrity" className="text-xs font-medium text-primary hover:underline">
                    Integrity desk
                </Link>
            </div>
            {quality === null ? (
                <p className="mt-4 text-sm text-muted-foreground">The quality score is read from the API. Turn the leads domain on to see it.</p>
            ) : (
                <>
                    <p className="text-metric mt-4 text-foreground" data-testid="agent-quality-score">
                        {qualityLabel(quality)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground" data-testid="agent-quality-hint">
                        {qualityHint(quality)}
                    </p>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <dt className="text-xs text-muted-foreground">Visits sampled</dt>
                            <dd className="tabular-nums text-foreground">{quality.visits}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">Calls sampled</dt>
                            <dd className="tabular-nums text-foreground">{quality.calls}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">Failed</dt>
                            <dd className="tabular-nums text-foreground">{quality.failed}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">Confirmed flags</dt>
                            <dd className="tabular-nums text-foreground">{quality.confirmedFlags}</dd>
                        </div>
                    </dl>
                </>
            )}
        </Card>
    );
}

/** The one-line version for a roster row or a tooltip. */
export const qualityLine = (quality: AgentQuality, now = new Date()): string => `${qualityLabel(quality)} — as at ${formatDateTime(now.toISOString())}`;
