"use client";

import * as React from "react";
import type { RosterRowAction } from "@/components/adx/party-roster-columns";
import { ReinstateDialog, SuspendDialog } from "@/components/adx/suspend-dialog";
import { isLive } from "@/lib/api-config";
import { useOptionalAuth } from "@/lib/auth";
import type { AccountState } from "@/services/account-state";
import type { SuspensionPartyType, SuspensionScope } from "@/services/suspension";

/**
 * What the party rosters' row menus do — 2 Oct 2026, beside the one menu in
 * `party-roster-columns` (the owner: "again 3 different variations"). The
 * desks declare their facts — the row's id, its KYC record, its sections in
 * force — and these helpers turn them into the same items on every desk:
 *
 *   Review KYC — the party's case when one exists, otherwise its KYC queue
 *                searched for the party.
 *   Suspend… / Reinstate — publishers, advertisers and agents, through the
 *                party pages' own dialogs (`suspend-dialog`).
 *
 * The print partners' Activate and Deactivate / Reactivate sit in the same
 * slot; they are the desk's own, built in `print-partners-view`.
 */

/* ------------------------------------------------------------------ */
/* Review KYC                                                          */
/* ------------------------------------------------------------------ */

export type RosterParty = "PUBLISHER" | "ADVERTISER" | "PRINT_PARTNER" | "AGENT";

/** Each party's KYC queue — the publishers' is the KYC section's front page. */
export const KYC_QUEUE_HREF: Record<RosterParty, string> = {
    PUBLISHER: "/kyc",
    ADVERTISER: "/kyc/advertisers",
    PRINT_PARTNER: "/kyc/print-partners",
    AGENT: "/kyc/agents",
};

export interface KycReviewFacts {
    /** The party's own id — the publisher, advertiser or agent case pages are keyed on it. */
    id: string;
    /** The KYC record's id, null before there is one — a case exists only then. */
    kycId: string | null | undefined;
    /** What the queue is searched for when there is no case: the account ID, else the name. */
    search: string | null | undefined;
}

/**
 * Where "Review KYC" goes. The case page answers 404 for a party with no
 * record, so a row without one is sent to its queue with `?q=` — every
 * party is a row there, whatever its state, and its row offers the request
 * and the desk record.
 */
export function kycReviewHref(party: RosterParty, facts: KycReviewFacts): string {
    if (facts.kycId) {
        switch (party) {
            case "PUBLISHER":
                return `/kyc/${encodeURIComponent(facts.id)}`;
            case "ADVERTISER":
                return `/kyc/advertisers/${encodeURIComponent(facts.id)}`;
            case "PRINT_PARTNER":
                // The print-partner case is read by the record's id (the partner's own resolves too).
                return `/kyc/print-partners/${encodeURIComponent(facts.kycId)}`;
            case "AGENT":
                return `/kyc/agents/${encodeURIComponent(facts.id)}`;
        }
    }
    const search = facts.search?.trim();
    return search ? `${KYC_QUEUE_HREF[party]}?q=${encodeURIComponent(search)}` : KYC_QUEUE_HREF[party];
}

/* ------------------------------------------------------------------ */
/* Suspend… / Reinstate                                                */
/* ------------------------------------------------------------------ */

/** The permission each party's suspension routes require — what the server checks, so what the menu asks. */
export const SUSPEND_PERMISSION: Record<RosterParty, string> = {
    PUBLISHER: "supply.suspend",
    ADVERTISER: "demand.suspend",
    AGENT: "agents.suspend",
    PRINT_PARTNER: "print.suspend",
};

/** 2 Oct 2026: a listing's suspension routes (`/listings/:id/suspend`, `/reinstate`) ask the supply permission — the Listings table's status slot. */
export const LISTING_SUSPEND_PERMISSION = "supply.suspend";

/** Whether the row's account is shut for good — no status action is offered on it. */
export const isClosedAccount = (state: AccountState | null | undefined): boolean => state === "CLOSED" || state === "EXITED";

export interface SuspensionRowFacts {
    id: string;
    name: string;
    /** The sections in force now; empty or absent when nothing is. */
    scopes: readonly SuspensionScope[] | null | undefined;
    accountState: AccountState | null | undefined;
}

/**
 * The status slot for a party that is suspended by sections: "Suspend…"
 * (danger) on a working row, "Reinstate" once anything is in force — never
 * on a closed account, nor without the permission.
 */
export function suspensionRowActions(
    facts: SuspensionRowFacts,
    options: { allowed: boolean; live: boolean; onSuspend: () => void; onReinstate: () => void },
): RosterRowAction[] {
    if (!options.allowed || isClosedAccount(facts.accountState)) return [];
    if ((facts.scopes?.length ?? 0) > 0) return [{ label: "Reinstate", onSelect: options.onReinstate, disabled: !options.live }];
    return [{ label: "Suspend…", destructive: true, onSelect: options.onSuspend, disabled: !options.live }];
}

/** The viewer's permission check — outside an `<AuthProvider>` (a test harness) nothing is held. */
export function useRosterPermission(permission: string): boolean {
    const auth = useOptionalAuth();
    return auth ? auth.can(permission) : false;
}

type Pending = { mode: "suspend" | "reinstate"; facts: SuspensionRowFacts } | null;

/**
 * The roster's suspension: the row items and the dialogs they open — the
 * party pages' own dialogs, so a suspension from the list is the same
 * decision, with the same sections and reason, as one from the page.
 */
export function useRosterSuspension(partyType: SuspensionPartyType, party: RosterParty | "LISTING", onDone: () => void) {
    const allowed = useRosterPermission(party === "LISTING" ? LISTING_SUSPEND_PERMISSION : SUSPEND_PERMISSION[party]);
    const live = isLive("suspension");
    const [pending, setPending] = React.useState<Pending>(null);

    const statusActions = React.useCallback(
        (facts: SuspensionRowFacts) =>
            suspensionRowActions(facts, {
                allowed,
                live,
                onSuspend: () => setPending({ mode: "suspend", facts }),
                onReinstate: () => setPending({ mode: "reinstate", facts }),
            }),
        [allowed, live],
    );

    const close = (open: boolean) => {
        if (!open) setPending(null);
    };
    const dialogs = pending ? (
        pending.mode === "suspend" ? (
            <SuspendDialog
                open
                onOpenChange={close}
                partyType={partyType}
                partyId={pending.facts.id}
                partyName={pending.facts.name}
                current={[...(pending.facts.scopes ?? [])]}
                onDone={onDone}
            />
        ) : (
            <ReinstateDialog
                open
                onOpenChange={close}
                partyType={partyType}
                partyId={pending.facts.id}
                partyName={pending.facts.name}
                current={[...(pending.facts.scopes ?? [])]}
                onDone={onDone}
            />
        )
    ) : null;

    return { statusActions, dialogs };
}
