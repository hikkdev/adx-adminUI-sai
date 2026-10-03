"use client";

import * as React from "react";
import Link from "next/link";
import { BellRing, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BulkAction } from "@/components/adx/bulk-actions";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { ApiError } from "@/lib/api-client";
import { failureMessage, runEach } from "@/lib/bulk";
import { formatDateTime, formatMoney, sumMoney } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { campaignService, canCancel, type CampaignStatus, type CancelImpact as CancelImpactRead } from "@/services/campaigns";

/**
 * The campaign actions the list, the launch queue and the campaign page
 * share — 2 Oct 2026. Each is the single-row route; the bulk bar runs it
 * over the ticked rows a few at a time (`@/lib/bulk`), so every campaign
 * keeps its own audit row exactly as if it had been done by hand:
 *
 *   Remind advertiser   `POST /campaigns/:id/remind-payment`   awaiting payment only; once a day
 *   Cancel…             `POST /campaigns/:id/cancel { reason }` after the refund it would open is shown
 *                       (`GET /campaigns/:id/cancel-impact`, the cancel path's own sum, applied to nothing)
 */

/** What a campaign is called in a summary — the name and its reference. */
export const campaignRowLabel = (row: { name: string; reference: string }): string => `${row.name} (${row.reference})`;

const campaignNoun = ["campaign", "campaigns"] as const;

/** The cancel route's reason bounds. */
export const CANCEL_REASON_MIN = 3;
export const CANCEL_REASON_MAX = 500;
export const cancelReasonFits = (reason: string): boolean => reason.trim().length >= CANCEL_REASON_MIN && reason.trim().length <= CANCEL_REASON_MAX;

/** Any row the actions take: a list row or a launch-queue row. */
export interface ActionableCampaign {
    id: string;
    name: string;
    reference: string;
    status: CampaignStatus;
}

/* ------------------------------------------------------------------ */
/* Remind advertiser                                                   */
/* ------------------------------------------------------------------ */

/** The toast a reminder answers with — 429 is "already reminded today", said plainly. */
export function remindFailure(cause: unknown): string {
    if (cause instanceof ApiError && cause.status === 429) return "Already reminded in the last 24 hours — one reminder a day per campaign.";
    return failureMessage(cause);
}

/** One reminder from a row menu or a button, with its toast. */
export async function remindAdvertiser(row: ActionableCampaign): Promise<boolean> {
    try {
        const result = await campaignService.remindPayment(row.id);
        const what = result?.about === "RESERVATION_FEE" ? "the reservation fee" : "the campaign";
        const owed = result?.amountDue ? ` (${formatMoney(result.amountDue)})` : "";
        toast.success(`Reminder sent for ${row.name}`, {
            description: `The advertiser was asked to pay ${what}${owed}. ${
                result?.nextAllowedAt ? `The next reminder can go after ${formatDateTime(result.nextAllowedAt)}.` : "The next reminder can go in 24 hours."
            }`,
        });
        return true;
    } catch (cause) {
        toast.error(`Could not remind about ${row.name}`, { description: remindFailure(cause) });
        return false;
    }
}

/* ------------------------------------------------------------------ */
/* Cancel… — the refund impact first                                   */
/* ------------------------------------------------------------------ */

/** Whether the cancel would hand a wallet hold back (paid, not started). */
const hasHoldReleased = (impact: CancelImpactRead | null): boolean => Boolean(impact?.holdReleased && Number(impact.holdReleased) > 0);

interface ImpactLine {
    row: ActionableCampaign;
    preview: CancelImpactRead | null;
    /** Why the dry run did not answer. */
    error: string | null;
}

/** The dry runs, three at a time, never throwing — a row whose preview failed says so. */
async function loadImpact(rows: readonly ActionableCampaign[]): Promise<ImpactLine[]> {
    const lines = new Map<string, ImpactLine>();
    const outcome = await runEach(rows, async (row) => {
        const preview = await campaignService.cancelImpact(row.id);
        lines.set(row.id, { row, preview, error: null });
    });
    for (const failure of outcome.failed) lines.set(failure.row.id, { row: failure.row, preview: null, error: failure.message });
    return rows.map((row) => lines.get(row.id) ?? { row, preview: null, error: "No answer" });
}

/**
 * What cancelling these would do to the money, before anything is sent —
 * the refund each would open at the refund desk, and the total. A backend
 * without the dry run is said plainly rather than guessed at.
 */
export function CancelImpact({ rows }: { rows: readonly ActionableCampaign[] }) {
    const key = rows.map((row) => row.id).join(",");
    const impact = useApiResource<ImpactLine[]>(`cancel-impact:${key}`, () => loadImpact(rows));
    if (rows.length === 0) return null;
    if (impact.loading && !impact.data) {
        return <p className="text-xs text-muted-foreground">Working out the refund each cancel would open…</p>;
    }
    const lines = impact.data ?? [];
    const answered = lines.filter((line) => line.preview);
    if (answered.length === 0) {
        return (
            <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground" data-testid="cancel-impact">
                The refund could not be worked out in advance. On cancel, the unused days of what was paid are recorded as a pending
                refund; finance releases or refuses it at the{" "}
                <Link href="/finance/refunds" className="underline underline-offset-4">
                    refund desk
                </Link>
                .
            </p>
        );
    }
    const refunds = answered.filter((line) => line.preview?.refundNeeded && line.preview.refundAmount);
    const total = sumMoney(refunds.map((line) => line.preview?.refundAmount ?? null));
    const released = answered.filter((line) => hasHoldReleased(line.preview)).length;
    return (
        <div className="space-y-2 rounded-md bg-muted/60 p-3 text-xs" data-testid="cancel-impact">
            <p className="font-medium text-foreground">
                {refunds.length === 0
                    ? "No refund would be opened."
                    : `${formatMoney(total)} to refund across ${refunds.length} ${refunds.length === 1 ? "campaign" : "campaigns"} — pending at the refund desk until finance releases it.`}
            </p>
            {released > 0 && <p className="text-muted-foreground">{`${released} not started yet: the money held for ${released === 1 ? "it goes" : "them goes"} back to the wallet.`}</p>}
            <ul className="max-h-32 space-y-0.5 overflow-y-auto text-muted-foreground">
                {lines.map((line) => (
                    <li key={line.row.id} className="flex justify-between gap-3">
                        <span className="truncate">{line.row.name}</span>
                        <span className="shrink-0 tabular-nums">
                            {line.error
                                ? "not worked out"
                                : line.preview?.refundNeeded && line.preview.refundAmount
                                  ? formatMoney(line.preview.refundAmount)
                                  : hasHoldReleased(line.preview)
                                    ? `${formatMoney(line.preview?.holdReleased ?? null)} back to the wallet`
                                    : "no refund"}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** The reason box both cancels share — the advertiser is told it. */
export function CancelReasonField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
    return (
        <div className="grid gap-1.5">
            <Label htmlFor={id}>Reason — the advertiser is told</Label>
            <Textarea id={id} rows={3} value={value} maxLength={CANCEL_REASON_MAX} onChange={(event) => onChange(event.target.value)} placeholder="The advertiser asked to call it off." />
        </div>
    );
}

/** Cancel… on one campaign — the refund impact, a reason, then the cancel route. */
export function CancelCampaignDialog({ campaign, onOpenChange, onDone }: { campaign: ActionableCampaign | null; onOpenChange: (open: boolean) => void; onDone: () => void }) {
    /* The reason belongs to the campaign it was typed for: another campaign opens the box empty. */
    const [draft, setDraft] = React.useState<{ for: string | null; text: string }>({ for: null, text: "" });
    const reason = campaign && draft.for === campaign.id ? draft.text : "";
    const setReason = (text: string) => setDraft({ for: campaign?.id ?? null, text });
    const [busy, setBusy] = React.useState(false);
    return (
        <ConfirmDialog
            open={campaign !== null}
            onOpenChange={onOpenChange}
            title="Cancel this campaign?"
            description="The booked spots are released and the advertiser is told why."
            confirmLabel="Cancel campaign"
            destructive
            busy={busy}
            disabled={!cancelReasonFits(reason)}
            onConfirm={async () => {
                if (!campaign) return;
                setBusy(true);
                try {
                    await campaignService.cancel(campaign.id, reason.trim());
                    toast.success(`${campaign.name} cancelled`);
                    onOpenChange(false);
                    onDone();
                } catch (cause) {
                    toast.error(`Could not cancel ${campaign.name}`, { description: failureMessage(cause) });
                } finally {
                    setBusy(false);
                }
            }}
        >
            {campaign ? (
                <div className="space-y-3">
                    <CancelImpact rows={[campaign]} />
                    <CancelReasonField id="cancel-reason" value={reason} onChange={setReason} />
                </div>
            ) : null}
        </ConfirmDialog>
    );
}

/**
 * The list's bulk actions over the ticked rows: Remind advertiser (only the
 * ones awaiting payment; the rest are skipped and the dialog says how
 * many) and Cancel… (the refund impact over the ones that can still be
 * cancelled, then one reason for all).
 */
export function useCampaignBulkActions<T extends ActionableCampaign>(selected: readonly T[]): BulkAction<T>[] {
    const [reason, setReason] = React.useState("");
    const cancellable = selected.filter((row) => canCancel(row.status));
    return [
        {
            key: "remind",
            label: "Remind advertiser",
            icon: BellRing,
            skip: (row) => (row.status === "PENDING_PAYMENT" ? null : "not awaiting payment"),
            participle: "reminded",
            noun: campaignNoun,
            phrase: (count) => `Remind about ${count}`,
            description: "Each advertiser is sent a reminder to pay. One reminder a day per campaign; one sent in the last 24 hours fails and stays ticked.",
            run: (row) => campaignService.remindPayment(row.id),
        },
        {
            key: "cancel",
            label: "Cancel…",
            icon: XCircle,
            skip: (row) => (canCancel(row.status) ? null : "already finished or cancelled"),
            participle: "cancelled",
            noun: campaignNoun,
            phrase: (count) => `Cancel ${count}`,
            description: "The booked spots are released and each advertiser is told the reason.",
            destructive: true,
            ready: cancelReasonFits(reason),
            onOpen: () => setReason(""),
            body: (
                <div className="space-y-3">
                    <CancelImpact rows={cancellable} />
                    <CancelReasonField id="bulk-cancel-reason" value={reason} onChange={setReason} />
                </div>
            ),
            run: (row) => campaignService.cancel(row.id, reason.trim()),
        },
    ];
}
