"use client";

import * as React from "react";
import Link from "next/link";
import { StatusBadge, TrafficLight } from "@/components/adx/status-badge";
import { isLive } from "@/lib/api-config";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useApiResource } from "@/lib/use-api-resource";
import { BREAKER_STATE_META, formatLatency, verificationService, type ProviderHealth, type VerificationHealth } from "@/services/verification";
import type { Tone } from "@/types";

/** Where the routing card lives — the KYC line links here. */
export const VERIFICATION_ROUTING_HREF = "/settings/integrations#verification-routing";

/** `GET /verification/health`, read once per mount — the KYC line and the routing card share it. */
export function useVerificationHealth() {
    const live = isLive("kyc");
    return useApiResource<VerificationHealth | null>(`verification:health:${live}`, () => (live ? verificationService.health() : Promise.resolve(null)));
}

/**
 * One row per provider — configured, the breaker's state, the last day's
 * success rate and p95 latency, and today's failovers. "Success" is the
 * provider answering; a definite no is an answer, only a technical failure
 * counts against it.
 */
export function VerificationProviderRows({ providers }: { providers: ProviderHealth[] }) {
    if (providers.length === 0) return <p className="text-sm text-muted-foreground">No providers reported.</p>;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="verification-provider-rows">
                <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-1.5 pr-3 font-medium">Provider</th>
                        <th className="py-1.5 pr-3 font-medium">Keys</th>
                        <th className="py-1.5 pr-3 font-medium">Breaker</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Success · 24 h</th>
                        <th className="py-1.5 pr-3 text-right font-medium">p95</th>
                        <th className="py-1.5 text-right font-medium">Failovers today</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {providers.map((provider) => (
                        <tr key={provider.name} data-testid={`verification-provider-${provider.name}`}>
                            <td className="py-2 pr-3 font-medium text-foreground">{provider.label}</td>
                            <td className="py-2 pr-3">
                                <StatusBadge status={provider.configured ? { label: "Configured", tone: "success" } : { label: "Not configured", tone: "neutral" }} />
                            </td>
                            <td className="py-2 pr-3">
                                <span title={provider.breaker.retryAt ? `Asked again from ${formatDateTime(provider.breaker.retryAt)}` : undefined}>
                                    <StatusBadge status={BREAKER_STATE_META[provider.breaker.state] ?? { label: provider.breaker.state, tone: "neutral" }} />
                                </span>
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                                {provider.last24h.successRate === null ? "—" : `${provider.last24h.successRate}%`}
                                <span className="ml-1 text-xs text-muted-foreground">of {provider.last24h.attempts}</span>
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums text-foreground">{formatLatency(provider.last24h.p95LatencyMs)}</td>
                            <td className="py-2 text-right tabular-nums text-foreground">{provider.failoversToday}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/** A provider's state in a word, lower-cased for the line — "answering", "left alone", "trying again", "not set up". */
export function providerStateWord(provider: ProviderHealth): { word: string; tone: Tone } {
    if (!provider.configured) return { word: "not set up", tone: "neutral" };
    const meta = BREAKER_STATE_META[provider.breaker.state] ?? { label: provider.breaker.state, tone: "neutral" as const };
    return { word: meta.label.toLowerCase(), tone: meta.tone };
}

/**
 * Provider health in one line under the KYC tabs — 2 Oct 2026 (one layout
 * for the five tabs): "Digio · answering — Cashfree Secure ID · answering —
 * Backup for KYC off · Verification routing →", from the same
 * `GET /verification/health` read the routing card's full table draws.
 * Nothing while the KYC domain is off.
 */
export function VerificationProvidersLine({ className }: { className?: string }) {
    const live = isLive("kyc");
    const health = useVerificationHealth();
    if (!live) return null;
    return (
        <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground", className)} data-testid="verification-providers-line">
            {health.loading && !health.data ? (
                <span>Reading the verification providers…</span>
            ) : health.error ? (
                <span className="text-danger">Couldn&apos;t read the verification providers: {health.error}</span>
            ) : health.data ? (
                <>
                    {health.data.providers.map((provider) => {
                        const state = providerStateWord(provider);
                        return (
                            <React.Fragment key={provider.name}>
                                <span
                                    className="inline-flex items-center gap-1.5"
                                    data-testid={`verification-provider-line-${provider.name}`}
                                    title={provider.breaker.retryAt ? `Asked again from ${formatDateTime(provider.breaker.retryAt)}` : undefined}
                                >
                                    <TrafficLight tone={state.tone} className="size-1.5" />
                                    <span className="font-medium text-foreground">{provider.label}</span>· {state.word}
                                </span>
                                <span aria-hidden>—</span>
                            </React.Fragment>
                        );
                    })}
                    <span>Backup for KYC {health.data.hostedKycBackup === "ON" ? "on" : "off"}</span>
                    <span aria-hidden>·</span>
                </>
            ) : null}
            <Link href={VERIFICATION_ROUTING_HREF} className="font-medium text-primary underline-offset-4 hover:underline">
                Verification routing →
            </Link>
        </div>
    );
}
