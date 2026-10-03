"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { announceSummary, bulkSummary, countNoun, planBulk, planLine, type BulkOutcome } from "@/lib/bulk";
import { formatMoney, formatNumber } from "@/lib/format";
import { orderLabel } from "@/services/orders";
import {
    REVIEW_PARTICIPLE,
    REVIEW_REASON_MIN,
    orderScreeningService,
    reasonOk,
    reviewSkip,
    runReview,
    sumImpacts,
    type CancelImpact,
    type ImpactTotal,
    type ReviewAction,
} from "@/services/order-screening";
import type { Order } from "@/types";
import { ReasonField } from "./[id]/order-ops-dialogs";

/**
 * The one confirm every review action goes through — 2 Oct 2026, order
 * screening. Hold, Release, Clear and Cancel as fraud, from a row's menu,
 * the bulk bar of the review queue, the orders list's "Hold for review",
 * and the order page's screening card: the same dialog, the same words.
 *
 * One order calls the single route; several call the bulk route, and the
 * plan says up front which are left alone and why ("2 will be held, 1
 * skipped (already held)."). The run never throws: the caller is handed the
 * outcome so the failed rows can stay ticked (the Access grants pattern).
 *
 * Cancel as fraud reads what cancelling would do for every order first —
 * the refund, the publisher's earnings reversed, the agents released — and
 * shows the sum before the button is live. It also needs a reason, which
 * goes on the order and the audit row. Hold needs one too; Release and
 * Clear take an optional note.
 */

export interface ReviewRequest<T extends Order = Order> {
    action: ReviewAction;
    rows: T[];
}

interface ReviewActionDialogProps<T extends Order> {
    request: ReviewRequest<T> | null;
    onOpenChange: (open: boolean) => void;
    /** After the run and its toast — the caller keeps the failures ticked and reloads. */
    onSettled: (outcome: BulkOutcome<T>) => void;
}

const COPY: Record<ReviewAction, { verb: string; destructive?: boolean; description: string; field: string; required: boolean; placeholder: string; hint: string }> = {
    HOLD: {
        verb: "Hold",
        description:
            "A held order is not dispatched, earns the publisher nothing and cannot be signed off until it is released. The advertiser only sees that the order is being reviewed.",
        field: "Reason",
        required: true,
        placeholder: "Large first order from a two-day-old account; checking the payment.",
        hint: `Required, at least ${REVIEW_REASON_MIN} characters. Written on the order and the ORDER_HELD audit row.`,
    },
    RELEASE: {
        verb: "Release",
        description: "The order picks up where it stopped: dispatch, earnings and sign-off go on as before. It stays flagged until it is cleared.",
        field: "Note",
        required: false,
        placeholder: "Payment confirmed with the bank.",
        hint: "Optional. Written on the ORDER_RELEASED audit row.",
    },
    CLEAR: {
        verb: "Clear",
        description:
            "Not fraud. The order is released if it was held and marked cleared, and today's reasons will not flag it again — only a new signal will.",
        field: "Note",
        required: false,
        placeholder: "Known agency, repeat customer.",
        hint: "Optional. Written on the order and the ORDER_RISK_CLEARED audit row.",
    },
    CONFIRM_FRAUD: {
        verb: "Cancel as fraud",
        destructive: true,
        description:
            "The order is marked confirmed fraud and cancelled through the normal cancel path, so refunds and reversals happen as on any cancel. It cannot be restarted. Suspending the advertiser is a separate decision.",
        field: "Reason",
        required: true,
        placeholder: "Stolen card; the bank confirmed the chargeback.",
        hint: `Required, at least ${REVIEW_REASON_MIN} characters. Written on the order and the ORDER_CONFIRMED_FRAUD audit row.`,
    },
};

export function ReviewActionDialog<T extends Order>({ request, onOpenChange, onSettled }: ReviewActionDialogProps<T>) {
    if (!request) return null;
    /* Keyed on the request, so each one starts with an empty reason and an unread impact. */
    return <ReviewDialogBody key={`${request.action}:${request.rows.map((row) => row.id).join(",")}`} request={request} onOpenChange={onOpenChange} onSettled={onSettled} />;
}

function ReviewDialogBody<T extends Order>({ request, onOpenChange, onSettled }: ReviewActionDialogProps<T> & { request: ReviewRequest<T> }) {
    const [text, setText] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [impact, setImpact] = React.useState<ImpactTotal | null>(null);

    const { action } = request;
    const plan = React.useMemo(() => planBulk(request.rows, (row) => reviewSkip(request.action, row)), [request]);
    const copy = COPY[action];
    const several = request.rows.length > 1;

    /* Cancel as fraud reads the impact of every order it would cancel before the button goes live. */
    React.useEffect(() => {
        if (action !== "CONFIRM_FRAUD" || plan.apply.length === 0) return;
        let active = true;
        void Promise.all(plan.apply.map((row) => orderScreeningService.cancelImpact(row.id).catch((): CancelImpact | null => null))).then((impacts) => {
            if (active) setImpact(sumImpacts(impacts));
        });
        return () => {
            active = false;
        };
    }, [action, plan]);

    const count = plan.apply.length;
    const first = plan.apply[0] ?? request.rows[0];
    const subject = several ? countNoun(count, ["order", "orders"]) : first ? orderLabel(first) : "the order";
    const textReady = copy.required ? reasonOk(text) : text.trim().length === 0 || reasonOk(text);
    /* Read first; and when every order read would be refused (ORDER_LIVE, already cancelled), the sentence is shown and the button stays off. */
    const impactReady = action !== "CONFIRM_FRAUD" || (impact !== null && !(impact.orders > 0 && impact.unread === 0 && impact.blocked === impact.orders));
    const description = [several ? planLine(plan, REVIEW_PARTICIPLE[action]) : null, copy.description].filter(Boolean).join(" ");

    async function confirm() {
        if (plan.apply.length === 0 || busy) return;
        setBusy(true);
        const outcome = await runReview(action, plan.apply, text);
        setBusy(false);
        if (plan.apply.length === 1) {
            const row = plan.apply[0]!;
            if (outcome.failed.length === 0) toast.success(`Order ${orderLabel(row)} ${REVIEW_PARTICIPLE[action]}`);
            else toast.error(outcome.failed[0]!.message);
        } else {
            announceSummary(bulkSummary(outcome, REVIEW_PARTICIPLE[action], (row) => orderLabel(row)));
        }
        onOpenChange(false);
        onSettled(outcome);
    }

    return (
        <ConfirmDialog
            open
            onOpenChange={(open) => !busy && onOpenChange(open)}
            title={`${copy.verb} ${subject}?`}
            description={description}
            confirmLabel={several ? `${copy.verb} ${subject}` : copy.verb}
            destructive={copy.destructive}
            busy={busy}
            disabled={count === 0 || !textReady || !impactReady}
            onConfirm={() => void confirm()}
        >
            <div className="space-y-4">
                {action === "CONFIRM_FRAUD" && count > 0 && <ImpactSummary total={impact} count={count} />}
                <ReasonField id={`review-${action.toLowerCase()}-text`} label={copy.field} value={text} onChange={setText} placeholder={copy.placeholder} hint={copy.hint} />
            </div>
        </ConfirmDialog>
    );
}

/** What cancelling would do, summed over the orders — read before the button goes live. */
export function ImpactSummary({ total, count }: { total: ImpactTotal | null; count: number }) {
    if (!total) {
        return (
            <p className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground" data-testid="cancel-impact">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Reading what cancelling {count === 1 ? "this order" : `these ${formatNumber(count)} orders`} would do…
            </p>
        );
    }
    const lines: [string, string][] = [
        ["Refunded to the advertiser", `${formatMoney(total.refund)}${total.refundTo.length ? ` · to ${total.refundTo.join(", ")}` : ""}`],
        ["Publisher earnings reversed", formatMoney(total.publisherReversal)],
        ["Already credited to the publisher (stays)", formatMoney(total.publisherAccrued)],
        ["Agents released", formatNumber(total.agentsReleased)],
    ];
    return (
        <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm" data-testid="cancel-impact">
            <dl className="space-y-1">
                {lines.map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-3">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-medium tabular-nums text-foreground">{value}</dd>
                    </div>
                ))}
            </dl>
            {total.campaignEffects.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 border-t pt-2 pl-4 text-xs text-muted-foreground">
                    {total.campaignEffects.map((effect) => (
                        <li key={effect}>{effect}</li>
                    ))}
                </ul>
            )}
            {total.blocked > 0 && (
                <div className="mt-2 border-t pt-2 text-xs text-danger" data-testid="cancel-blocked">
                    <p className="font-medium">
                        {total.blocked === total.orders && total.orders === 1 ? "This order cannot be cancelled:" : `${countNoun(total.blocked, ["order", "orders"])} cannot be cancelled:`}
                    </p>
                    {total.blockedReasons.map((reason) => (
                        <p key={reason} className="mt-0.5">
                            {reason}
                        </p>
                    ))}
                </div>
            )}
            {total.unread > 0 && (
                <p className="mt-2 border-t pt-2 text-xs text-warning">
                    Could not read the impact for {countNoun(total.unread, ["order", "orders"])}; the totals leave {total.unread === 1 ? "it" : "them"} out.
                </p>
            )}
        </div>
    );
}
