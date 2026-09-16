"use client";

import * as React from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { StatusBadge } from "@/components/adx/status-badge";
import { FieldList, SimpleTable } from "@/components/adx/simple-table";
import { ApiError } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { listingsService, type RepriceLogEntry } from "@/services/listings";
import { applyConsequence, bindingRefusal, pricingService, type BindingRefusal } from "@/services/pricing";
import { GATE_STATE_META, rateCardService, type GateReading } from "@/services/rate-cards";
import { FACTOR_MODE_META, type FactorProposal, type PriceIndicator, type PricingSettings, type SuggestedRate } from "@/types/pricing-engine";

/** A read that may legitimately answer 400 or 409 — the listing cannot be compared, or has no comparables. */
type Maybe<T> = { value: T; reason: null } | { value: null; reason: string };

async function attempt<T>(read: () => Promise<T>): Promise<Maybe<T>> {
    try {
        return { value: await read(), reason: null };
    } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 400 || cause.status === 409 || cause.status === 404)) {
            return { value: null, reason: cause.message };
        }
        throw cause;
    }
}

interface Loaded {
    indicator: Maybe<PriceIndicator>;
    gate: GateReading;
    proposals: FactorProposal[];
    suggested: Maybe<SuggestedRate>;
    settings: PricingSettings;
    /** E10-2: the appliedRatePerDay trail off `GET /listings/:id/reprice-log`, newest first. */
    reprices: RepriceLogEntry[];
}

const INDICATOR_META: Record<PriceIndicator["state"], { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
    NO_DATA: { label: "No comparables", tone: "neutral" },
    TOO_LOW: { label: "Too low", tone: "danger" },
    LOW_SIDE: { label: "On the low side", tone: "warning" },
    GOOD: { label: "In range", tone: "success" },
    TOO_HIGH: { label: "Too high", tone: "danger" },
};

/**
 * The listing page's Pricing tab (Lot E, Q125).
 *
 * Four reads about one spot: the indicator (what the market within 200 m
 * says about its rate), the gate (what the rate card in force says), the
 * factor proposals (what the engine suggests and what a person applied),
 * and the suggested rate (base plus applied factors — the offer). Apply and
 * Unapply are the only writes, and each says what the factor's mode will
 * do to the price before it is pressed; a binding apply above the cap
 * comes back 409 with the price case it raised, and the tab says so.
 *
 * The reprice history is the listing module's own read (E10-2) rather
 * than the audit trail filtered here: the shape is the tab's, and it no
 * longer depends on the audit domain being live.
 */
export function ListingPricingTab({ listingId, ratePerDay, onRepriced }: { listingId: string; ratePerDay: string | null; onRepriced: () => void }) {
    const live = isLive("pricingEngine");
    const [nonce, setNonce] = React.useState(0);
    const resource = useApiResource<Loaded>(`listing:${listingId}:pricing:${nonce}:${live}`, async () => {
        const [indicator, gate, proposals, suggested, settings, reprices] = await Promise.all([
            attempt(() => pricingService.listingIndicator(listingId)),
            rateCardService.gate(listingId),
            pricingService.listingFactors(listingId),
            attempt(() => pricingService.suggestedRate(listingId)),
            pricingService.settings(),
            listingsService.repriceLog(listingId),
        ]);
        return { indicator, gate, proposals, suggested, settings, reprices };
    });

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-5 text-sm text-muted-foreground shadow-none">
                Pricing reads the engine. Set NEXT_PUBLIC_USE_API=true and point the console at the ADX backend.
            </Card>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(data) => (
                <PricingPanel
                    listingId={listingId}
                    ratePerDay={ratePerDay}
                    data={data}
                    onChanged={() => {
                        setNonce((n) => n + 1);
                        onRepriced();
                    }}
                />
            )}
        </ResourceBoundary>
    );
}

function PricingPanel({ listingId, ratePerDay, data, onChanged }: { listingId: string; ratePerDay: string | null; data: Loaded; onChanged: () => void }) {
    const [pending, setPending] = React.useState<{ proposal: FactorProposal; applied: boolean } | null>(null);
    const [refusal, setRefusal] = React.useState<BindingRefusal | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [refreshing, setRefreshing] = React.useState(false);

    async function refresh() {
        setRefreshing(true);
        try {
            await pricingService.refreshFactors(listingId);
            toast.success("Proposals refreshed", { description: "The engine re-ran its rules; nothing was applied." });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not refresh the proposals.");
        } finally {
            setRefreshing(false);
        }
    }

    async function confirmApply() {
        if (!pending) return;
        setBusy(true);
        setRefusal(null);
        try {
            await pricingService.applyFactor(listingId, pending.proposal.factorId, pending.applied);
            toast.success(`${pending.applied ? "Applied" : "Un-applied"} ${pending.proposal.name}`, {
                description:
                    pending.proposal.mode === "BINDING"
                        ? "If it bound today, the listing was repriced and the publisher told."
                        : "The suggested rate changes; the listing's own rate does not.",
            });
            setPending(null);
            onChanged();
        } catch (cause) {
            const refused = bindingRefusal(cause);
            if (refused) {
                setRefusal(refused);
                setPending(null);
            } else {
                toast.error(cause instanceof Error ? cause.message : "Could not record that decision.");
            }
        } finally {
            setBusy(false);
        }
    }

    const { indicator, gate, proposals, suggested, settings, reprices } = data;
    const gateMeta = GATE_STATE_META[gate.state];

    return (
        <div className="space-y-4">
            {refusal && (
                <Card className="rounded-lg border-danger/40 bg-danger-soft p-4 shadow-none">
                    <p className="text-sm font-medium text-foreground">Not applied — the move was above the cap</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {refusal.message}
                        {refusal.from && refusal.to ? ` (${formatMoney(refusal.from)} → ${formatMoney(refusal.to)} a day` + (refusal.capPct !== null ? `, cap ${refusal.capPct}%` : "") + ")." : ""}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                        <Button size="sm" asChild>
                            <Link href="/pricing/approvals">Open the price case</Link>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRefusal(null)}>
                            Dismiss
                        </Button>
                    </div>
                </Card>
            )}

            <div className="grid gap-4 lg:grid-cols-3">
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-base font-semibold text-foreground">Indicator</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">What comparable spots within the radius are listed at.</p>
                    {indicator.value ? (
                        <div className="mt-4 space-y-3">
                            <StatusBadge status={INDICATOR_META[indicator.value.state]} />
                            <p className="text-sm text-foreground">{indicator.value.message}</p>
                            <FieldList
                                items={[
                                    ["This listing", ratePerDay ? `${formatMoney(ratePerDay)} / day` : "Unpriced"],
                                    ["Range", indicator.value.range ? `${formatMoney(indicator.value.range.low)} – ${formatMoney(indicator.value.range.high)}` : "—"],
                                    ["Ceiling after surge", indicator.value.effectiveHigh ? formatMoney(indicator.value.effectiveHigh) : "—"],
                                    ["Contributors", `${indicator.value.contributorCount}${indicator.value.thin ? " (thin)" : ""}${indicator.value.staleContributors ? `, ${indicator.value.staleContributors} stale` : ""}`],
                                    ["Evidence", indicator.value.tier ?? "—"],
                                    ["Surge", indicator.value.surge ? `${indicator.value.surge.name ?? "A window"} · +${indicator.value.surge.upliftPct}% until ${formatDateTime(indicator.value.surge.endsAt)}` : "None"],
                                ]}
                            />
                        </div>
                    ) : (
                        <p className="mt-4 text-sm text-muted-foreground">{indicator.reason}</p>
                    )}
                </Card>

                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-base font-semibold text-foreground">Rate-card gate</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">Whether this price is one ADX has agreed to.</p>
                    <div className="mt-4 space-y-3">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={gateMeta} />
                            {gate.belowFloor && <StatusBadge status={{ label: "Below floor", tone: "danger" }} />}
                        </span>
                        {gate.state === "NOT_COVERED" && (
                            <p className="text-sm text-muted-foreground">No active card prices this kind of spot here, so the gate passes. That is a coverage gap, not a decision.</p>
                        )}
                        {(gate.state === "OK" || gate.state === "BELOW_FLOOR") && (
                            <FieldList
                                items={[
                                    ["Card rate", `${formatMoney(gate.cardRate)} / day`],
                                    ["Floor", `${formatMoney(gate.floor)} / day`],
                                    ...(gate.state === "BELOW_FLOOR" ? ([["Listed at", `${formatMoney(gate.rate)} / day`]] as [string, React.ReactNode][]) : []),
                                    [
                                        "Card",
                                        <Link key="card" href={`/pricing/rate-cards/${gate.cardId}`} className="text-primary hover:underline">
                                            Open the card
                                        </Link>,
                                    ],
                                ]}
                            />
                        )}
                        {(gate.state === "APPROVED_BELOW_FLOOR" || gate.state === "AWAITING_APPROVAL") && (
                            <p className="text-sm text-muted-foreground">
                                {gate.state === "APPROVED_BELOW_FLOOR" ? "A person approved this price under the floor." : "A price case is waiting for a decision."}{" "}
                                <Link href="/pricing/approvals" className="text-primary hover:underline">
                                    Open the queue
                                </Link>
                            </p>
                        )}
                    </div>
                </Card>

                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-base font-semibold text-foreground">Suggested rate</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">Base plus the applied factors — the offer an exclusive publisher reads.</p>
                    {suggested.value ? (
                        <div className="mt-4 space-y-3">
                            <p className="text-2xl font-semibold tabular-nums text-foreground">
                                {formatMoney(suggested.value.ratePerDay)} <span className="text-sm font-normal text-muted-foreground">/ day</span>
                            </p>
                            <FieldList
                                items={[
                                    ["Base (midpoint)", formatMoney(suggested.value.base)],
                                    ["Compound multiplier", `×${suggested.value.compoundMultiplier}${suggested.value.cappedOut ? " — at the ceiling" : ""}`],
                                    [
                                        "Applied",
                                        suggested.value.applied.length
                                            ? suggested.value.applied.map((factor) => `${factor.name} (${factor.kind === "MULTIPLIER" ? "×" : "₹"}${factor.value}, ${FACTOR_MODE_META[factor.mode].label.toLowerCase()})`).join("; ")
                                            : "None",
                                    ],
                                ]}
                            />
                            {suggested.value.cappedOut && (
                                <p className="text-xs text-danger">The applied multipliers compound past the engine&rsquo;s cap. Flagged, not clamped — look at the factors.</p>
                            )}
                        </div>
                    ) : (
                        <p className="mt-4 text-sm text-muted-foreground">{suggested.reason}</p>
                    )}
                </Card>
            </div>

            <Card className="overflow-hidden rounded-lg border-border shadow-none">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
                    <div>
                        <h3 className="text-base font-semibold text-foreground">Pricing factors</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            The engine proposes; a person applies. Advisory changes the offer, binding reprices the listing — by at most{" "}
                            {Math.round(Number(settings.maxBindingChangePct) * 100)}% of the current rate.
                        </p>
                    </div>
                    <Button variant="outline" size="sm" className="bg-card" disabled={refreshing} onClick={() => void refresh()}>
                        <RefreshCw className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} />
                        Refresh proposals
                    </Button>
                </div>
                {proposals.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                        No active factor is defined for this listing&rsquo;s media type — or the listing has no media type yet.
                    </p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-5 py-2.5">Factor</th>
                                <th className="px-3 py-2.5">Mode</th>
                                <th className="px-3 py-2.5 text-right">Value</th>
                                <th className="px-3 py-2.5">Engine</th>
                                <th className="px-3 py-2.5">Decision</th>
                                <th className="px-3 py-2.5 text-right">Wrote</th>
                                <th className="px-5 py-2.5 text-right"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {proposals.map((proposal) => (
                                <tr key={proposal.factorId} className="border-b last:border-0">
                                    <td className="px-5 py-3">
                                        <p className="font-medium text-foreground">{proposal.name}</p>
                                        {proposal.description && <p className="text-xs text-muted-foreground">{proposal.description}</p>}
                                    </td>
                                    <td className="px-3 py-3">
                                        <span className="inline-flex flex-wrap items-center gap-1.5">
                                            <StatusBadge status={FACTOR_MODE_META[proposal.mode]} />
                                            {proposal.mode === "BINDING" && proposal.bindingDuringSurgeOnly && <span className="text-xs text-muted-foreground">surge only</span>}
                                        </span>
                                    </td>
                                    <td className="px-3 py-3 text-right tabular-nums">{proposal.kind === "MULTIPLIER" ? `×${proposal.multiplier}` : `₹${proposal.baseAdjust}`}</td>
                                    <td className="px-3 py-3">
                                        <StatusBadge status={proposal.suggested ? { label: "Proposed", tone: "info" } : { label: "Not proposed", tone: "neutral" }} />
                                    </td>
                                    <td className="px-3 py-3">
                                        <StatusBadge status={proposal.applied ? { label: "Applied", tone: "success" } : { label: "Not applied", tone: "neutral" }} />
                                    </td>
                                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                                        {proposal.appliedRatePerDay ? `${formatMoney(proposal.appliedRatePerDay)} / day` : "—"}
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        <Button
                                            size="sm"
                                            variant={proposal.applied ? "ghost" : "outline"}
                                            className={proposal.applied ? "" : "bg-card"}
                                            onClick={() => setPending({ proposal, applied: !proposal.applied })}
                                        >
                                            {proposal.applied ? "Unapply" : "Apply"}
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Card>

            <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Repriced by a factor</h3>
                <SimpleTable<RepriceLogEntry & { key: string }>
                    rows={reprices.map((row, index) => ({ ...row, key: `${row.at}:${row.factor.id ?? index}` }))}
                    rowKey={(row) => row.key}
                    emptyMessage="No binding factor has moved this listing's rate."
                    columns={[
                        { key: "when", label: "When", render: (row) => <span className="text-muted-foreground">{formatDateTime(row.at)}</span> },
                        {
                            key: "factor",
                            label: "Factor",
                            render: (row) => (
                                <span className="text-foreground">
                                    {row.factor.name ?? row.factor.id ?? "—"}
                                    <span className="text-muted-foreground">
                                        {row.factor.applied === null ? "" : ` · ${row.factor.applied ? "applied" : "un-applied"}`}
                                        {row.factor.surgeId ? " · during a surge" : ""}
                                    </span>
                                </span>
                            ),
                        },
                        {
                            key: "by",
                            label: "By",
                            render: (row) => <span className="text-muted-foreground">{row.by.name ?? (row.by.id ? "An account since removed" : "The engine")}</span>,
                        },
                        {
                            key: "rate",
                            label: "Rate / day",
                            className: "text-right",
                            render: (row) => {
                                if (!row.to) return <span className="text-muted-foreground">—</span>;
                                return (
                                    <span className="tabular-nums">
                                        {row.from ? formatMoney(row.from) : "unpriced"} → {formatMoney(row.to)}
                                    </span>
                                );
                            },
                        },
                    ]}
                />
            </div>

            <ConfirmDialog
                open={pending !== null}
                onOpenChange={(open) => {
                    if (!open) setPending(null);
                }}
                title={pending ? `${pending.applied ? "Apply" : "Unapply"} "${pending.proposal.name}"?` : "Apply factor"}
                description={pending ? applyConsequence(pending.proposal, pending.applied, settings.maxBindingChangePct) : ""}
                confirmLabel={pending?.applied ? "Apply" : "Unapply"}
                destructive={pending?.proposal.mode === "BINDING"}
                busy={busy}
                onConfirm={() => void confirmApply()}
            />
        </div>
    );
}
