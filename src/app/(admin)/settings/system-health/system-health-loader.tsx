"use client";

import * as React from "react";
import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { ApiError } from "@/lib/api-client";
import {
    healthReadsApi,
    healthService,
    type Incident,
    type OpsHealth,
    type PublicStatus,
    type Readiness,
    type RegionStatus,
    type SystemHealthHistory,
} from "@/services/health";
import { SystemHealthView } from "./system-health-view";

/** What one probe of `/health/ready` came back with, including "nothing". */
export type HealthCheck =
    | { reachable: true; readiness: Readiness; checkedAt: string }
    | { reachable: false; error: string; checkedAt: string };

/** Everything the page draws, in one read. */
export interface HealthPage {
    check: HealthCheck;
    /** Lot E: the housekeeping. `error` when the ADMIN read failed; the page says so under the cards. */
    ops: { ok: true; value: OpsHealth } | { ok: false; error: string };
    /** E6 / Lot G: the 30-day 5xx series, the heartbeats and every service's sampled days. Null when the read failed — the strips are then not drawn. */
    history: SystemHealthHistory | null;
    /** Lot G (Q130): the public page's verdict per service — the sampler's newest sample raised by any open incident. Null when it could not be read. */
    status: PublicStatus | null;
    /** Lot G (Q130): the region row with its live round trips. Null when the read failed; the table says so. */
    regions: RegionStatus[] | null;
    /** Lot G (Q130): what is open or being watched, newest first. Null when the read failed. */
    openIncidents: Incident[] | null;
}

const message = (cause: unknown, fallback: string) => (cause instanceof ApiError ? cause.message : fallback);

/**
 * The console's sources on how the platform is doing: the readiness probe,
 * which is unauthenticated and answers 503 with a body when a dependency is
 * down, so a failed probe is data here rather than an error — and, since
 * Lot E, the ops read and the history behind it, both ADMIN reads through
 * the ordinary client. Lot G (package CG4, Q130) added three more: the
 * public status read for the sampler's verdict per service, the regions
 * table and the open incidents. A failure on any of those is kept beside
 * the probe rather than failing the page: the point of the page is to draw
 * what is wrong, and "the ops read failed" is one of the things that can be.
 */
export function SystemHealthLoader() {
    const live = healthReadsApi();
    const [nonce, setNonce] = React.useState(0);

    const resource = useApiResource<HealthPage | null>(`health:ready:${live}:${nonce}`, async () => {
        if (!live) return null;
        const checkedAt = new Date().toISOString();
        const [check, ops, history, status, regions, incidents] = await Promise.all([
            healthService
                .ready()
                .then((readiness): HealthCheck => ({ reachable: true, readiness, checkedAt }))
                .catch((cause): HealthCheck => ({
                    reachable: false,
                    error: message(cause, "Could not reach the ADX backend."),
                    checkedAt,
                })),
            healthService
                .ops()
                .then((value): HealthPage["ops"] => ({ ok: true, value }))
                .catch((cause): HealthPage["ops"] => ({ ok: false, error: message(cause, "The ops read failed.") })),
            healthService.history().catch(() => null),
            healthService.status().catch(() => null),
            healthService
                .regions()
                .then((answer) => answer.regions)
                .catch(() => null),
            healthService
                .incidents({ status: ["OPEN", "MONITORING"], sort: "newest", pageSize: 20 })
                .then((page) => page.items)
                .catch(() => null),
        ]);
        return { check, ops, history, status, regions, openIncidents: incidents };
    });

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-8 text-center shadow-none">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                    <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">Not connected to the ADX backend</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                    This page asks the backend whether it and its database and cache are up, when it was last backed up
                    and whether its jobs are ticking. There is no seeded answer, because a fixture &ldquo;operational&rdquo;
                    would be a claim about production. Set{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_USE_API=true</code> and point the
                    console at a running backend.
                </p>
            </Card>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(page) =>
                page ? (
                    <SystemHealthView page={page} refreshing={resource.loading} onRefresh={() => setNonce((n) => n + 1)} />
                ) : null
            }
        </ResourceBoundary>
    );
}
