"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatDateTime } from "@/lib/format";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import {
    KYC_PROVIDER_EXPLANATION,
    KYC_PROVIDER_META,
    kycProviderService,
    providerUnavailable,
    type KycProviderState,
} from "@/services/kyc-provider";
import type { KycDigio, StatusMeta } from "@/types";

/** How Digio's own words read on the desk. */
export function digioStatusMeta(status: string | null): StatusMeta {
    switch ((status ?? "").toLowerCase()) {
        case "approved":
            return { label: "Approved by Digio", tone: "success" };
        case "rejected":
            return { label: "Rejected by Digio", tone: "danger" };
        case "cancelled":
            return { label: "Cancelled", tone: "neutral" };
        case "pending":
            return { label: "Waiting on the party", tone: "warning" };
        default:
            return { label: "Not started", tone: "neutral" };
    }
}

interface DigioCardProps {
    party: string;
    digio: KycDigio | null;
    verified: boolean;
    /** Lot D (Q127): set once the Digio-path images were purged; the reference stays as proof. */
    imagesPurgedAt: string | null;
    /** `POST …/digio/restart` for this party. */
    onRestart: () => Promise<{ notified: boolean }>;
    /** The desk decides by hand instead — reveals the manual decision on a case Digio is still holding. */
    onReviewManually: () => void;
    /** Whether the manual decision is already in front of the reviewer. */
    manualReview: boolean;
    onChanged: () => void;
}

/**
 * The Digio case, operated from the desk — with the provider's state (Lot D, Q129).
 *
 * The card shows the session as ADX holds it — Digio's request id, its
 * answer, when, and its message when it said no — and the switch the
 * platform is on: DIGIO, DEGRADED (the probe's verdict) or MANUAL (ops').
 * "Restart Digio" asks for a fresh session; while the provider is off it
 * would answer 503, so the button says so and "Review manually" is the path.
 * Verified means nothing to restart; a case verified by documents may still
 * be sent to Digio instead.
 */
export function DigioCard({ party, digio, verified, imagesPurgedAt, onRestart, onReviewManually, manualReview, onChanged }: DigioCardProps) {
    const live = isLive("kyc");
    const [busy, setBusy] = React.useState(false);
    const provider = useApiResource<KycProviderState>(`kyc-provider:${live}`, async () =>
        live ? (await kycProviderService.get()).kycProvider : "DIGIO"
    );
    const state = provider.data ?? "DIGIO";
    const providerOff = state !== "DIGIO";

    const restart = async () => {
        setBusy(true);
        try {
            const result = await onRestart();
            toast.success(`A fresh Digio check is on its way to ${party}`, {
                description: result.notified
                    ? "They have been asked to open the app and finish it."
                    : "They have no app account yet, so nobody was told — reach them another way.",
            });
            onChanged();
        } catch (cause) {
            const unavailable = providerUnavailable(cause);
            if (unavailable) {
                toast.error(`Digio is ${unavailable.provider === "MANUAL" ? "switched off" : "not answering"}`, {
                    description: "Review the documents by hand instead.",
                });
                provider.reload();
            } else {
                toast.error(cause instanceof Error ? cause.message : "Digio could not be asked again.");
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="digio-card">
            <div className="flex items-start justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Digio</h3>
                <StatusBadge status={digio ? digioStatusMeta(digio.status) : { label: "Documents instead", tone: "neutral" }} />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
                <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">Provider</p>
                    <p className="text-xs text-muted-foreground">
                        {provider.loading && !provider.data ? "Reading the switch…" : provider.error ? provider.error : KYC_PROVIDER_EXPLANATION[state]}
                    </p>
                </div>
                <StatusBadge status={KYC_PROVIDER_META[state]} />
            </div>

            {digio ? (
                <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Request</dt>
                        <dd className="truncate font-mono text-xs text-foreground">{digio.requestId ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Answered</dt>
                        <dd className="text-foreground">{digio.verifiedAt ? formatDateTime(digio.verifiedAt) : "Not yet"}</dd>
                    </div>
                    {digio.message && (
                        <div>
                            <dt className="text-muted-foreground">Digio said</dt>
                            <dd className="mt-0.5 text-foreground">{digio.message}</dd>
                        </div>
                    )}
                </dl>
            ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                    This case came in as documents. A Digio check can be started for them instead;
                    its answer arrives on ADX&apos;s webhook like any other.
                </p>
            )}

            {imagesPurgedAt && (
                <p className="mt-3 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground" data-testid="digio-purged">
                    Images purged on {formatDate(imagesPurgedAt)} — Digio reference{" "}
                    <span className="font-mono text-foreground">{digio?.referenceId ?? digio?.requestId ?? "unknown"}</span>
                </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={restart}
                    disabled={!live || busy || verified || providerOff}
                    title={
                        !live
                            ? "KYC is read from the API"
                            : verified
                              ? "Already verified — nothing to restart"
                              : providerOff
                                ? state === "MANUAL"
                                    ? "Digio is switched off by ops"
                                    : "Digio is not answering; the probe will put it back"
                                : undefined
                    }
                >
                    {busy ? "Asking Digio…" : digio ? "Restart Digio" : "Start a Digio check"}
                </Button>
                {!verified && (
                    <Button
                        variant={providerOff ? "default" : "ghost"}
                        size="sm"
                        className="h-8"
                        onClick={onReviewManually}
                        disabled={manualReview}
                    >
                        {manualReview ? "Reviewing manually" : "Review manually"}
                    </Button>
                )}
            </div>
            {verified && <p className="mt-2 text-xs text-muted-foreground">Already verified; there is nothing to restart.</p>}
        </Card>
    );
}
