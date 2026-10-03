"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { dealCases } from "@/services/kyc";
import { filterUsers, usersService } from "@/services/users";

interface ReviewerDealingOptions {
    /**
     * Gives one admin these cases and answers how many were assigned — the
     * publisher desk's one bulk `POST /publishers/kyc-queue/assign`, or one
     * `PATCH …/:id/assign` per case on a desk with no bulk route.
     */
    assign: (ids: string[], adminUserId: string | "me") => Promise<number>;
    /** Re-reads the queue after a write. */
    onChanged: () => void;
    /** The party's plural, for the "nothing to assign" toast — "publishers", "advertisers". */
    plural: string;
}

/**
 * "Assign reviewers" and the bulk "Assign to me" / "Distribute across
 * reviewers", shared by every KYC queue that assigns: the open, unassigned
 * cases dealt in turn across the console's active admins
 * (`GET /users?role=ADMIN&closed=false`), behind a confirm. Assignment is a
 * filter, not ownership — any admin may still decide any case — and only a
 * row with a record can be assigned at all.
 */
export function useReviewerDealing({ assign, onChanged, plural }: ReviewerDealingOptions) {
    const [dealing, setDealing] = React.useState(false);
    const [assigning, setAssigning] = React.useState(false);
    const [confirmDeal, setConfirmDeal] = React.useState<{ reviewers: { id: string; name: string }[]; ids: string[] } | null>(null);

    const prepareDeal = async (ids: string[]) => {
        setDealing(true);
        try {
            const rows = await usersService.list({ closed: false, role: "ADMIN" });
            const reviewers = filterUsers(rows, { status: ["active"] }).map((row) => ({ id: row.id, name: row.displayName }));
            if (reviewers.length === 0) {
                toast.error("No active admin to assign to.");
                return;
            }
            if (ids.length === 0) {
                toast.info("Every open case already has a reviewer.");
                return;
            }
            setConfirmDeal({ reviewers, ids });
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not read the reviewers.");
        } finally {
            setDealing(false);
        }
    };

    const deal = async () => {
        if (!confirmDeal) return;
        setDealing(true);
        try {
            const hands = dealCases(confirmDeal.ids, confirmDeal.reviewers.map((reviewer) => reviewer.id));
            let assigned = 0;
            for (const hand of hands) assigned += await assign(hand.ids, hand.adminUserId);
            toast.success(`${assigned} case${assigned === 1 ? "" : "s"} distributed across ${hands.length} reviewer${hands.length === 1 ? "" : "s"}`);
            setConfirmDeal(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The assignment did not reach ADX.");
        } finally {
            setDealing(false);
        }
    };

    /** The selection's cases with a record, assigned to whoever is signed in. */
    const assignToMe = async (ids: string[], clear: () => void) => {
        if (ids.length === 0) {
            toast.info(`Nothing to assign: none of the selected ${plural} has a record yet.`);
            return;
        }
        setAssigning(true);
        try {
            const assigned = await assign(ids, "me");
            toast.success(`${assigned} case${assigned === 1 ? "" : "s"} assigned to you`);
            clear();
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The assignment did not reach ADX.");
        } finally {
            setAssigning(false);
        }
    };

    /** The bulk bar's two buttons over a selection, given the selection's ids with a record. */
    const bulkActions = (ids: string[], clear: () => void) => (
        <>
            <Button variant="outline" size="sm" className="h-8" disabled={assigning} onClick={() => void assignToMe(ids, clear)}>
                {assigning ? "Assigning…" : "Assign to me"}
            </Button>
            <Button variant="outline" size="sm" className="h-8" disabled={dealing} onClick={() => void prepareDeal(ids)}>
                Distribute across reviewers
            </Button>
        </>
    );

    /** The header's "Assign reviewers" over the open, unassigned cases. */
    const assignReviewersButton = (openUnassignedIds: string[]) => (
        <Button variant="outline" className="bg-card" disabled={dealing} onClick={() => void prepareDeal(openUnassignedIds)}>
            {dealing ? "Reading reviewers…" : "Assign reviewers"}
        </Button>
    );

    const dialog = (
        <ConfirmDialog
            open={confirmDeal !== null}
            onOpenChange={(open) => !open && setConfirmDeal(null)}
            title="Distribute these cases?"
            description={
                confirmDeal
                    ? `${confirmDeal.ids.length} case${confirmDeal.ids.length === 1 ? "" : "s"} will be dealt in turn across ${confirmDeal.reviewers.length} admin${confirmDeal.reviewers.length === 1 ? "" : "s"}: ${confirmDeal.reviewers.map((reviewer) => reviewer.name).join(", ")}. A filter, not ownership — anyone may still decide any case.`
                    : ""
            }
            confirmLabel="Assign reviewers"
            busy={dealing}
            onConfirm={() => void deal()}
        />
    );

    return { dealing, assignReviewersButton, bulkActions, dialog };
}
