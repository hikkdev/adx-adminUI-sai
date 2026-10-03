"use client";

import * as React from "react";
import { CheckCircle2, PauseCircle, PlayCircle, Undo2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { BulkAction } from "@/components/adx/bulk-actions";
import { LISTING_SUSPEND_PERMISSION, useRosterPermission } from "@/components/adx/party-roster-row-actions";
import { isLive } from "@/lib/api-config";
import { LISTING_DECIDE_PERMISSION, SEND_BACK_OUTCOMES, SEND_BACK_REASON_MIN, listingReviewService, type SendBackOutcome } from "@/services/listing-review";
import type { AdminListing } from "@/services/listings";
import {
    SCOPE_LABEL,
    SUSPENSION_REASON_MAX,
    SUSPENSION_REASON_MIN,
    admittedScopes,
    scopeConsequence,
    suspensionService,
    type SuspensionScope,
} from "@/services/suspension";

/**
 * The Listings table's bulk actions — 2 Oct 2026, the owner: "Is there any
 * bulk actions here? I dont see any."
 *
 * Each is the single-row route the console already calls, run over the
 * ticked rows a few at a time through the shared bulk bar (`BulkActions`,
 * `@/lib/bulk`), so every listing keeps its own permission check and audit
 * row exactly as if it had been done by hand:
 *
 *   Approve        `POST /listings/:id/publish`            supply.approve
 *   Send back…     `POST /listings/:id/send-back`          supply.approve
 *                  (back for changes, or rejected — the review desk's two)
 *   Suspend…       `POST /listings/:id/suspend`            supply.suspend
 *   Reinstate      `POST /listings/:id/reinstate`          supply.suspend
 *
 * An action the viewer may not take is not offered at all. A row the action
 * does not apply to is skipped and the confirm dialog says how many and why;
 * the summary toast names every failure and the desk keeps those ticked.
 */

const awaitingReview = (row: AdminListing): string | null => (row.status === "PENDING_REVIEW" ? null : "not awaiting review");

/** What a failure is called in the summary: the title and its LST- reference. */
export const listingRowLabel = (row: AdminListing): string => (row.displayId ? `${row.title} (${row.displayId})` : row.title);

const listingNoun = ["listing", "listings"] as const;

export function useListingBulkActions(): BulkAction<AdminListing>[] {
    const mayDecide = useRosterPermission(LISTING_DECIDE_PERMISSION);
    /* Suspend… / Reinstate — the same two the verification queue offers (3 Oct 2026). */
    const suspension = useListingSuspensionBulkActions<AdminListing>((row) => ({ id: row.id, scopes: row.suspensionScopes }));

    /* The send-back's answer and reason — reset as the dialog opens. */
    const [outcome, setOutcome] = React.useState<SendBackOutcome>("CHANGES_REQUESTED");
    const [sendBackReason, setSendBackReason] = React.useState("");

    const sendBackTrimmed = sendBackReason.trim();
    const rejecting = outcome === "REJECTED";

    const actions: BulkAction<AdminListing>[] = [];

    if (mayDecide) {
        actions.push(
            {
                key: "approve",
                label: "Approve",
                icon: CheckCircle2,
                skip: awaitingReview,
                participle: "approved and live",
                noun: listingNoun,
                phrase: (count) => `Approve ${count}`,
                description: "Each one goes live on the marketplace. A rate under the rate-card floor with no price approval is refused, as it is on the review desk.",
                run: (row) => listingReviewService.approve(row.id),
            },
            {
                key: "send-back",
                label: "Send back…",
                icon: Undo2,
                skip: awaitingReview,
                participle: rejecting ? "rejected" : "sent back",
                noun: listingNoun,
                phrase: (count) => (rejecting ? `Reject ${count}` : `Send back ${count}`),
                description: "Each publisher is shown your reason word for word.",
                destructive: rejecting,
                ready: sendBackTrimmed.length >= SEND_BACK_REASON_MIN,
                onOpen: () => {
                    setOutcome("CHANGES_REQUESTED");
                    setSendBackReason("");
                },
                body: (
                    <div className="space-y-3">
                        <RadioGroup value={outcome} onValueChange={(value) => setOutcome(value as SendBackOutcome)} className="grid gap-2">
                            {SEND_BACK_OUTCOMES.map((option) => (
                                <label key={option.value} htmlFor={`bulk-outcome-${option.value}`} className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-left">
                                    <RadioGroupItem id={`bulk-outcome-${option.value}`} value={option.value} className="mt-0.5" />
                                    <span>
                                        <span className="block text-sm font-medium text-foreground">{option.label}</span>
                                        <span className="block text-xs text-muted-foreground">{option.description}</span>
                                    </span>
                                </label>
                            ))}
                        </RadioGroup>
                        <div className="grid gap-1.5">
                            <Label htmlFor="bulk-send-back-reason">What the publishers have to fix</Label>
                            <Textarea
                                id="bulk-send-back-reason"
                                value={sendBackReason}
                                onChange={(event) => setSendBackReason(event.target.value)}
                                rows={3}
                                placeholder="Photos are blurry — retake in daylight, showing the whole frame."
                            />
                        </div>
                    </div>
                ),
                run: (row) => listingReviewService.sendBack(row.id, { reason: sendBackTrimmed, outcome }),
            },
        );
    }

    actions.push(...suspension);
    return actions;
}

/** What the suspension actions read off a row — a listing on whichever desk lists it. */
export interface ListingSuspensionFacts {
    id: string;
    /** The sections in force now; empty or absent when none is. */
    scopes: readonly SuspensionScope[] | null | undefined;
    /**
     * Suspended by the supply sweep for a lapsed verification: no section is
     * in force, so there is nothing to reinstate — an accepted check lifts it.
     */
    lapseSuspended?: boolean;
}

/**
 * Suspend… and Reinstate over a selection of listings — the Listings table's
 * and, since 3 Oct 2026, the verification queue's, so the two desks offer the
 * one decision with the same sections, reason and skips. Not offered without
 * `supply.suspend` or while the suspension routes are not live.
 */
export function useListingSuspensionBulkActions<T>(facts: (row: T) => ListingSuspensionFacts): BulkAction<T>[] {
    const maySuspend = useRosterPermission(LISTING_SUSPEND_PERMISSION);
    const suspensionLive = isLive("suspension");
    /* The suspension's sections and reason. */
    const [scopes, setScopes] = React.useState<SuspensionScope[]>([]);
    const [suspendReason, setSuspendReason] = React.useState("");
    const [reinstateReason, setReinstateReason] = React.useState("");

    const suspendTrimmed = suspendReason.trim();
    const reinstateTrimmed = reinstateReason.trim();
    const reasonFits = (text: string) => text.length >= SUSPENSION_REASON_MIN && text.length <= SUSPENSION_REASON_MAX;
    const inForce = (row: T): readonly SuspensionScope[] => facts(row).scopes ?? [];

    const actions: BulkAction<T>[] = [];
    if (maySuspend && suspensionLive) {
        const offered = admittedScopes("LISTING");
        actions.push(
            {
                key: "suspend",
                label: "Suspend…",
                icon: PauseCircle,
                // Only the sections not already in force are sent; a row that has every one ticked in force already is left alone.
                skip: (row) => (scopes.length > 0 && scopes.every((scope) => inForce(row).includes(scope)) ? "already suspended that way" : null),
                participle: "suspended",
                noun: listingNoun,
                phrase: (count) => `Suspend ${count}`,
                description: "Each is recorded with your name and the reason, and lifted separately.",
                destructive: true,
                ready: scopes.length > 0 && reasonFits(suspendTrimmed),
                onOpen: () => {
                    setScopes([]);
                    setSuspendReason("");
                },
                body: (
                    <div className="space-y-3">
                        <fieldset className="space-y-2">
                            <legend className="sr-only">Sections</legend>
                            {offered.map((scope) => {
                                const id = `bulk-suspend-${scope.toLowerCase()}`;
                                return (
                                    <label key={scope} htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
                                        <Checkbox
                                            id={id}
                                            checked={scopes.includes(scope)}
                                            onCheckedChange={() => setScopes((list) => (list.includes(scope) ? list.filter((item) => item !== scope) : [...list, scope]))}
                                            aria-label={SCOPE_LABEL[scope]}
                                            className="mt-0.5"
                                        />
                                        <span className="min-w-0">
                                            <span className="block text-sm font-medium text-foreground">{SCOPE_LABEL[scope]}</span>
                                            <span className="block text-xs text-muted-foreground">{scopeConsequence(scope, "LISTING")}</span>
                                        </span>
                                    </label>
                                );
                            })}
                        </fieldset>
                        <div className="grid gap-1.5">
                            <Label htmlFor="bulk-suspend-reason">Reason</Label>
                            <Textarea
                                id="bulk-suspend-reason"
                                value={suspendReason}
                                onChange={(event) => setSuspendReason(event.target.value)}
                                rows={3}
                                maxLength={SUSPENSION_REASON_MAX}
                                placeholder="Permit under question with the municipality."
                            />
                        </div>
                    </div>
                ),
                run: (row) =>
                    suspensionService.suspend("LISTING", facts(row).id, {
                        scopes: offered.filter((scope) => scopes.includes(scope) && !inForce(row).includes(scope)),
                        reason: suspendTrimmed,
                    }),
            },
            {
                key: "reinstate",
                label: "Reinstate",
                icon: PlayCircle,
                skip: (row) => (inForce(row).length > 0 ? null : facts(row).lapseSuspended ? "suspended for the lapse — a new check lifts it" : "nothing suspended"),
                participle: "reinstated",
                noun: listingNoun,
                phrase: (count) => `Reinstate ${count}`,
                description: "Every section in force on each is lifted. Work a suspension stopped stays stopped.",
                ready: reasonFits(reinstateTrimmed),
                onOpen: () => setReinstateReason(""),
                body: (
                    <div className="grid gap-1.5">
                        <Label htmlFor="bulk-reinstate-reason">Reason</Label>
                        <Textarea
                            id="bulk-reinstate-reason"
                            value={reinstateReason}
                            onChange={(event) => setReinstateReason(event.target.value)}
                            rows={3}
                            maxLength={SUSPENSION_REASON_MAX}
                            placeholder="Permit renewed; nothing outstanding."
                        />
                    </div>
                ),
                // No scopes: lifting everything is what "reinstate" means to the server.
                run: (row) => suspensionService.reinstate("LISTING", facts(row).id, { reason: reinstateTrimmed }),
            },
        );
    }

    return actions;
}
