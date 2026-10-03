"use client";

import * as React from "react";
import Link from "next/link";
import { PauseCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { failureMessage } from "@/lib/bulk";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    REVIEW_STATE_META,
    RISK_BAND_META,
    SIGNAL_SIDE_LABEL,
    fraudCaseHref,
    orderScreeningService,
    reviewSkip,
    reviewStateOf,
    riskPercent,
    screeningSignals,
    type ReviewAction,
} from "@/services/order-screening";
import type { Order, OrderScreening } from "@/types";
import { useOrderReview } from "../order-review-actions";

/**
 * Order screening on the order page (2 Oct 2026). The banner while the
 * order is held, and the card: the score and what it says, every signal
 * in plain words with whose side it is on, where the review stands, who
 * held or cleared it and why, and the fraud case it is on. The moves sit at
 * the card's top right — Hold or Release, Clear, Cancel as fraud, Rescore —
 * through the same dialogs the review queue uses. Staff-only: nothing here
 * is ever on a party's screen.
 */

/** Who did it: a name, else "an admin"; null `heldById` is the automatic hold. */
const who = (name: string | null, id: string | null): string => name?.trim() || (id ? "an admin" : "automatically");

/** "Held — fraud review", over the page while the order is paused. */
export function HeldBanner({ screening }: { screening: OrderScreening | null | undefined }) {
    if (!screening?.heldAt) return null;
    const by = screening.heldById ? `by ${who(screening.heldByName, screening.heldById)}` : "automatically";
    return (
        <Card className="flex items-start gap-3 rounded-lg border-danger/40 bg-danger-soft p-4 shadow-none" data-testid="order-held-banner">
            <PauseCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            <div className="min-w-0 text-sm">
                <p className="font-medium text-foreground">Held — fraud review</p>
                <p className="mt-0.5 text-muted-foreground">
                    Held {by} on {formatDateTime(screening.heldAt)}
                    {screening.holdReason ? <> · {screening.holdReason}</> : null}. No dispatch, no publisher earnings and no sign-off until it is released or cleared. The advertiser only sees that the order is being reviewed.
                </p>
            </div>
        </Card>
    );
}

export function OrderScreeningCard({ order, onChanged }: { order: Order; onChanged?: () => void }) {
    const review = useOrderReview(onChanged);
    const [rescoring, setRescoring] = React.useState(false);
    const screening = order.screening;
    if (!screening) return null;

    const percent = riskPercent(screening.score);
    const state = reviewStateOf(screening);
    const signals = screeningSignals(screening);
    const held = state === "HELD";

    /* Hold or Release (whichever the order can take), then Clear and Cancel as fraud where they apply. */
    const moves: { action: ReviewAction; label: string; destructive?: boolean }[] = [
        held ? { action: "RELEASE", label: "Release" } : { action: "HOLD", label: "Hold" },
        { action: "CLEAR", label: "Clear" },
        { action: "CONFIRM_FRAUD", label: "Cancel as fraud", destructive: true },
    ];
    const shown = moves.filter((move) => reviewSkip(move.action, order) === null);

    async function rescore() {
        setRescoring(true);
        try {
            await orderScreeningService.rescore(order.id);
            toast.success("Order scored again");
            onChanged?.();
        } catch (cause) {
            toast.error(failureMessage(cause));
        } finally {
            setRescoring(false);
        }
    }

    const rescoreBlocked = review.permissionBlock("HOLD");

    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="order-screening">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Fraud screening</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        {screening.scoredAt ? `Scored ${formatDateTime(screening.scoredAt)}.` : "Not scored yet."} Every signal is listed with what it saw; a flag only asks a person to look.
                    </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {shown.map((move) => {
                        const blocked = review.permissionBlock(move.action);
                        return (
                            <Button
                                key={move.action}
                                variant="outline"
                                size="sm"
                                className={cn("bg-card", move.destructive && "text-danger hover:text-danger")}
                                disabled={blocked !== null}
                                title={blocked ?? undefined}
                                onClick={() => review.start(move.action, [order])}
                                data-testid={`screening-${move.action.toLowerCase().replace(/_/g, "-")}`}
                            >
                                {move.label}
                            </Button>
                        );
                    })}
                    {state !== "CONFIRMED_FRAUD" && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="bg-card"
                            disabled={rescoring || rescoreBlocked !== null}
                            title={rescoreBlocked ?? undefined}
                            onClick={() => void rescore()}
                            data-testid="screening-rescore"
                        >
                            <RefreshCw className={cn("mr-1.5 size-3.5", rescoring && "animate-spin")} aria-hidden />
                            Rescore
                        </Button>
                    )}
                </div>
            </div>

            <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,280px)_1fr]">
                <div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-semibold tabular-nums text-foreground" data-testid="screening-score">
                            {percent === null ? "—" : percent}
                        </span>
                        <span className="text-sm text-muted-foreground">/ 100</span>
                        {screening.band && <StatusBadge status={RISK_BAND_META[screening.band]} />}
                    </div>
                    <FieldList
                        className="mt-4"
                        items={[
                            ["Review", <StatusBadge key="state" status={REVIEW_STATE_META[state]} />],
                            [
                                state === "CLEARED" ? "Cleared" : state === "CONFIRMED_FRAUD" ? "Confirmed" : "Reviewed",
                                screening.reviewedAt ? (
                                    <span key="reviewed">
                                        {formatDateTime(screening.reviewedAt)}
                                        <span className="block text-xs font-normal text-muted-foreground">by {who(screening.reviewedByName, screening.reviewedById)}</span>
                                    </span>
                                ) : (
                                    <span key="reviewed" className="text-muted-foreground">
                                        Not yet
                                    </span>
                                ),
                            ],
                            [
                                "Hold",
                                screening.heldAt ? (
                                    <span key="hold">
                                        Since {formatDateTime(screening.heldAt)}
                                        <span className="block text-xs font-normal text-muted-foreground">
                                            {screening.heldById ? `by ${who(screening.heldByName, screening.heldById)}` : "automatically"}
                                        </span>
                                    </span>
                                ) : (
                                    <span key="hold" className="text-muted-foreground">
                                        Not held
                                    </span>
                                ),
                            ],
                            [
                                "Fraud case",
                                screening.fraudCaseId ? (
                                    <Link key="case" href={fraudCaseHref(screening.fraudCaseId)} className="text-primary underline-offset-4 hover:underline" data-testid="screening-case-link">
                                        Open case
                                    </Link>
                                ) : (
                                    <Button
                                        key="case"
                                        variant="link"
                                        size="sm"
                                        className="h-auto p-0"
                                        disabled={!review.live || !review.mayAct || review.opening === order.id}
                                        onClick={() => void review.openCase(order)}
                                    >
                                        Open a fraud case
                                    </Button>
                                ),
                            ],
                        ]}
                    />
                    {(screening.holdReason || screening.reviewNote) && (
                        <div className="mt-4 space-y-2 border-t pt-3 text-sm">
                            {screening.holdReason && (
                                <p>
                                    <span className="text-muted-foreground">Hold reason: </span>
                                    {screening.holdReason}
                                </p>
                            )}
                            {screening.reviewNote && (
                                <p>
                                    <span className="text-muted-foreground">Review note: </span>
                                    {screening.reviewNote}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Signals</p>
                    {signals.length === 0 ? (
                        <p className="mt-1.5 text-sm text-muted-foreground">{percent === null ? "Nothing read yet." : "Nothing found."}</p>
                    ) : (
                        <ul className="mt-1.5 divide-y rounded-md border" data-testid="screening-signals">
                            {signals.map((signal) => (
                                <li key={signal.key} className="flex items-start justify-between gap-3 px-3 py-2.5">
                                    <div className="min-w-0">
                                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                                            {signal.words}
                                            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{SIGNAL_SIDE_LABEL[signal.side]}</span>
                                            {signal.cleared && <span className="rounded-full bg-success-soft px-1.5 py-0.5 text-[10px] font-medium text-success">Cleared before</span>}
                                        </p>
                                        {signal.detail && <p className="mt-0.5 text-xs text-muted-foreground">{signal.detail}</p>}
                                    </div>
                                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title="What this signal added to the score">
                                        {signal.value === null ? "Not computed" : `+${Math.round(signal.contribution * 100)}`}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {review.dialogs}
        </Card>
    );
}
