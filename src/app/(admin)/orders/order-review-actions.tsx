"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { RosterMenuEntry } from "@/components/adx/party-roster-columns";
import { SUSPEND_PERMISSION, useRosterPermission } from "@/components/adx/party-roster-row-actions";
import { SuspendDialog } from "@/components/adx/suspend-dialog";
import { isLive } from "@/lib/api-config";
import { failureMessage } from "@/lib/bulk";
import {
    NO_ACT_PERMISSION,
    NO_CANCEL_PERMISSION,
    ORDER_SCREENING_PERMISSION,
    caseIdOf,
    fraudCaseHref,
    orderScreeningService,
    reviewSkip,
    type ReviewAction,
} from "@/services/order-screening";
import type { Order } from "@/types";
import { ReviewActionDialog, type ReviewRequest } from "./review-action-dialog";

/**
 * What a person may do to a screened order, wherever it is drawn — the
 * review queue's row menu and bulk bar, and the order page's screening
 * card (2 Oct 2026). One hook so the three places offer the same moves
 * under the same words, behind the same permissions, through the same
 * dialogs:
 *
 *   View order · Hold… · Release · Clear (not fraud) · Cancel as fraud…
 *   · Suspend advertiser… · Open fraud case
 *
 * Automation never goes past a reversible hold: cancelling as fraud and
 * suspending are always a person's click here.
 */

const OFFLINE = "Connect the console to the ADX backend first.";

/** The menu's and the buttons' words for each action. */
export const REVIEW_ACTION_LABEL: Record<ReviewAction, string> = {
    HOLD: "Hold…",
    RELEASE: "Release",
    CLEAR: "Clear (not fraud)",
    CONFIRM_FRAUD: "Cancel as fraud…",
};

export function useOrderReview(onChanged?: () => void) {
    const router = useRouter();
    const live = isLive("orders");
    const mayAct = useRosterPermission(ORDER_SCREENING_PERMISSION.act);
    const mayCancel = useRosterPermission(ORDER_SCREENING_PERMISSION.cancel);
    const maySuspend = useRosterPermission(SUSPEND_PERMISSION.ADVERTISER);
    const [request, setRequest] = React.useState<(ReviewRequest & { keep?: (rows: Order[]) => void }) | null>(null);
    const [suspending, setSuspending] = React.useState<Order | null>(null);
    const [opening, setOpening] = React.useState<string | null>(null);

    /** Why this viewer may not take the action at all, or null. */
    const permissionBlock = React.useCallback(
        (action: ReviewAction): string | null => {
            if (!live) return OFFLINE;
            if (!mayAct) return NO_ACT_PERMISSION;
            if (action === "CONFIRM_FRAUD" && !mayCancel) return NO_CANCEL_PERMISSION;
            return null;
        },
        [live, mayAct, mayCancel],
    );

    /** Why the action is off for this order, or null when it may be taken — the permission first, then the order's own state. */
    const blocked = React.useCallback(
        (action: ReviewAction, order: Order): string | null => {
            const permission = permissionBlock(action);
            if (permission) return permission;
            const skip = reviewSkip(action, order);
            return skip ? `Not for this order: ${skip}.` : null;
        },
        [permissionBlock],
    );

    const start = React.useCallback((action: ReviewAction, rows: Order[], keep?: (rows: Order[]) => void) => setRequest({ action, rows, keep }), []);

    const openCase = React.useCallback(
        async (order: Order) => {
            const existing = order.screening?.fraudCaseId;
            if (existing) {
                router.push(fraudCaseHref(existing));
                return;
            }
            setOpening(order.id);
            try {
                const answer = await orderScreeningService.openFraudCase(order.id);
                const caseId = caseIdOf(answer);
                const number = answer.fraudCase?.displayId ? ` ${answer.fraudCase.displayId}` : "";
                // 201 opened a case on the advertiser; 200 added the order to the one already open.
                if (answer.attached && !answer.opened) toast.success(`Added to the open fraud case${number}`, { description: "The advertiser already had a case open; the order is noted on it." });
                else toast.success(`Fraud case${number} opened`, { description: "Opened on the advertiser, with this order noted on it." });
                if (caseId) router.push(fraudCaseHref(caseId));
                else onChanged?.();
            } catch (cause) {
                toast.error(failureMessage(cause));
            } finally {
                setOpening(null);
            }
        },
        [router, onChanged],
    );

    const business = (order: Order) => order.placedBy?.business ?? null;

    /** The row's "⋯" menu, in the rosters' style. */
    const menu = React.useCallback(
        (order: Order): RosterMenuEntry[] => {
            const item = (action: ReviewAction): RosterMenuEntry => ({
                kind: "item",
                label: REVIEW_ACTION_LABEL[action],
                onSelect: () => start(action, [order]),
                disabled: blocked(action, order) !== null,
                destructive: action === "CONFIRM_FRAUD",
            });
            const caseOpen = Boolean(order.screening?.fraudCaseId);
            return [
                { kind: "label", label: "Actions" },
                { kind: "item", label: "View order", onSelect: () => router.push(`/orders/${order.id}`) },
                { kind: "separator" },
                item("HOLD"),
                item("RELEASE"),
                item("CLEAR"),
                item("CONFIRM_FRAUD"),
                { kind: "separator" },
                {
                    kind: "item",
                    label: "Suspend advertiser…",
                    destructive: true,
                    onSelect: () => setSuspending(order),
                    disabled: !live || !maySuspend || business(order) === null,
                },
                {
                    kind: "item",
                    label: caseOpen ? "Open fraud case" : "Open a fraud case",
                    onSelect: () => void openCase(order),
                    disabled: opening === order.id || (!caseOpen && (!live || !mayAct)),
                },
            ];
        },
        [blocked, start, router, live, maySuspend, mayAct, openCase, opening],
    );

    const suspendedParty = suspending ? business(suspending) : null;
    const dialogs = (
        <>
            <ReviewActionDialog
                request={request}
                onOpenChange={(open) => !open && setRequest(null)}
                onSettled={(outcome) => {
                    // The failed orders stay ticked for another go; the rest leave or change on the reload.
                    request?.keep?.(outcome.failed.map((failure) => failure.row));
                    onChanged?.();
                }}
            />
            {suspendedParty && (
                <SuspendDialog
                    open
                    onOpenChange={(open) => !open && setSuspending(null)}
                    partyType="ADVERTISER"
                    partyId={suspendedParty.id}
                    partyName={suspendedParty.name}
                    current={[]}
                    onDone={() => onChanged?.()}
                />
            )}
        </>
    );

    return { live, mayAct, mayCancel, permissionBlock, blocked, start, openCase, opening, menu, dialogs };
}
