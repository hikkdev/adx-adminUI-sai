"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { hiddenExtras, partyRosterColumns, type PartyRosterSpec, type RosterRowAction } from "@/components/adx/party-roster-columns";
import { PartyRosterFilterBar, type PartyRosterFilterSpec, type PartyRosterFilterState, type RosterOwnFacet } from "@/components/adx/party-roster-filter-bar";
import { SUSPEND_PERMISSION, isClosedAccount, kycReviewHref, useRosterPermission } from "@/components/adx/party-roster-row-actions";
import { PartyRosterTable, type PartyRosterView } from "@/components/adx/party-roster-table";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { shapeKycSummary } from "@/services/kyc-state";
import { PRINT_PARTNER_DOOR_OPTIONS, ROSTER_ANY, rosterFiltersActive } from "@/services/party-roster";
import {
    PRINT_PARTNER_STATUS_OPTIONS,
    SIGN_IN_STATE_META,
    lastSignInLabel,
    canActivate,
    capabilitiesLine,
    printPartnerService,
    signInState,
    type PrintPartner,
} from "@/services/print-partners";
import { onboardingLine } from "@/types";
import { PartnerDialog } from "./partner-dialog";

/** Lot H: the app state, cut on the rows in hand — the list route has no facet for it. */
export type SignInFilter = "ACTIVE" | "INVITED" | "APPLIED" | "ALL";

interface PrintPartnersViewProps {
    /** Shops that applied from the app and wait for the desk to activate them — the server's count over the whole roster. */
    applicationsWaiting?: number;
    view: PartyRosterView<PrintPartner>;
    filters: PartyRosterFilterState;
    signIn: SignInFilter;
    onSignInChange: (signIn: SignInFilter) => void;
    onChanged: () => void;
}

/**
 * The bar's print-partner half: the three doors a shop comes through, no
 * type — a shop has none, so the app state takes Type's slot — and the
 * shared Status select — Active, Deactivated, Closed, Everyone (a shop is
 * never suspended by sections).
 */
export const PRINT_PARTNER_FILTER_SPEC: PartyRosterFilterSpec = {
    searchPlaceholder: "Search name, ID, phone, email, city",
    doors: PRINT_PARTNER_DOOR_OPTIONS,
    idPrefix: "print-partners",
    statuses: PRINT_PARTNER_STATUS_OPTIONS,
};

/** The app-state select's options, after "Any app state". */
export const APP_STATE_OPTIONS: readonly { value: Exclude<SignInFilter, "ALL">; label: string }[] = [
    { value: "ACTIVE", label: "Signed in" },
    { value: "APPLIED", label: "Applied from the app" },
    { value: "INVITED", label: "Invited, not signed in" },
];

/** The app state as the bar's own-facet select — "Any app state" is the bar's `ROSTER_ANY`. */
export function appStateFacet(signIn: SignInFilter, onChange: (signIn: SignInFilter) => void): RosterOwnFacet {
    return {
        label: "App state",
        all: "Any app state",
        value: signIn === "ALL" ? ROSTER_ANY : signIn,
        options: APP_STATE_OPTIONS,
        onChange: (value) => onChange(value === ROSTER_ANY ? "ALL" : (value as SignInFilter)),
    };
}

/**
 * The print partner's status slot in the shared row menu: "Activate" for
 * an application or an invite not yet switched on, then "Deactivate"
 * (danger) or "Reactivate". Nothing without `print.suspend` — the routes'
 * permission — and nothing on a closed account (2 Oct 2026: the roster row
 * carries its `accountState`), as on every other desk: the server refuses
 * to reactivate one, and a closed shop stays closed.
 */
export function printPartnerStatusActions(
    row: PrintPartner,
    options: { allowed: boolean; busy: boolean; onActivate: () => void; onDeactivate: () => void; onReactivate: () => void },
): RosterRowAction[] {
    if (!options.allowed || isClosedAccount(row.accountState)) return [];
    return [
        ...(canActivate(row) ? [{ label: "Activate", onSelect: options.onActivate, disabled: options.busy }] : []),
        row.isActive
            ? { label: "Deactivate", destructive: true, disabled: options.busy, onSelect: options.onDeactivate }
            : { label: "Reactivate", onSelect: options.onReactivate, disabled: options.busy },
    ];
}

/** "Review KYC" for a print-partner row: the case (`/kyc/print-partners/<kycId>`) when there is one, else the queue searched for it. */
export const printPartnerKycHref = (row: PrintPartner): string =>
    kycReviewHref("PRINT_PARTNER", { id: row.id, kycId: row.kyc?.kycId, search: row.displayId ?? row.name });

/**
 * What this desk showed beyond the shared layout — kept, hidden until the
 * table's "Columns" menu turns them on: the legal name and the contact
 * person, what the shop prints, its tax ids, the app state, the last
 * sign-in, and how it takes quotes.
 */
export const PRINT_PARTNER_EXTRA_COLUMNS: ColumnDef<PrintPartner>[] = [
    {
        id: "legal-name",
        accessorFn: (row) => row.legalName ?? "",
        header: "Legal name",
        cell: ({ row }) => <span className="block max-w-[14rem] truncate text-muted-foreground">{row.original.legalName ?? "—"}</span>,
    },
    {
        id: "contact-person",
        accessorFn: (row) => row.contactName ?? "",
        header: "Contact person",
        cell: ({ row }) => <span className="block max-w-[12rem] truncate text-muted-foreground">{row.original.contactName ?? "—"}</span>,
    },
    {
        id: "prints",
        header: "Prints",
        cell: ({ row }) => (
            <div className="min-w-0 max-w-[16rem]">
                <p className="truncate text-xs text-foreground" title={capabilitiesLine(row.original)}>
                    {capabilitiesLine(row.original)}
                </p>
                <p className="text-xs text-muted-foreground">
                    {[
                        row.original.maxWidthFt ? `up to ${row.original.maxWidthFt} ft` : null,
                        row.original.turnaroundDays !== null ? `${row.original.turnaroundDays}-day turnaround` : null,
                    ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                </p>
            </div>
        ),
    },
    {
        id: "gstin-pan",
        header: "GSTIN / PAN",
        cell: ({ row }) => (
            <div className="font-mono text-xs text-muted-foreground">
                <p>{row.original.gstin ?? "—"}</p>
                <p>{row.original.panNumber ?? "—"}</p>
            </div>
        ),
    },
    {
        id: "app",
        accessorFn: (row) => signInState(row),
        header: "App",
        cell: ({ row }) => {
            const state = signInState(row.original);
            return (
                <div className="min-w-0">
                    <StatusBadge status={SIGN_IN_STATE_META[state]} />
                    <p className="mt-0.5 whitespace-nowrap text-[11px] text-muted-foreground">
                        {state === "ACTIVE" && row.original.activatedAt
                            ? `since ${formatDate(row.original.activatedAt)}`
                            : state === "APPLIED" && row.original.appliedAt
                              ? `applied ${formatDate(row.original.appliedAt)} — review`
                              : state === "INVITED"
                                ? "account not switched on"
                                : "sessions ended"}
                    </p>
                </div>
            );
        },
    },
    {
        /* G13-B: `lastLoginAt` — when the partner last signed in to the app; "never" once activated and still unseen. */
        id: "last-sign-in",
        accessorFn: (row) => row.lastLoginAt ?? "",
        header: ({ column }) => <SortableHeader column={column}>Last sign-in</SortableHeader>,
        cell: ({ row }) => (
            <span className={cn("whitespace-nowrap text-xs", row.original.lastLoginAt ? "text-muted-foreground" : "text-muted-foreground/70")}>
                {lastSignInLabel(row.original, formatDateTime)}
            </span>
        ),
    },
    {
        id: "quotes",
        header: "Quotes",
        cell: ({ row }) => (
            <div className="flex flex-wrap gap-1">
                {row.original.rateCard.hasRateCard && <StatusBadge status={{ label: "Rate card", tone: "success" }} />}
                {row.original.acceptsQuoteRequests && <StatusBadge status={{ label: "Takes requests", tone: "info" }} />}
                {!row.original.rateCard.hasRateCard && !row.original.acceptsQuoteRequests && <span className="text-xs text-muted-foreground">By name only</span>}
            </div>
        ),
    },
];

/**
 * The print-partner roster — 29 Sep 2026, on the shared party layout
 * (`party-roster-columns`): Name · Contact · City · KYC status · Activity
 * (the jobs) · Joined · Onboarded — no Type, a shop has none — and the
 * shared filter bar. The row menu is the shared one: View details, Review
 * KYC, then Activate and Deactivate or Reactivate in the status slot —
 * none of them on a closed account.
 */
export function printPartnerRosterSpec(
    open: (row: PrintPartner) => void,
    reviewKyc: (row: PrintPartner) => void,
    statusActions?: (row: PrintPartner) => RosterRowAction[],
): PartyRosterSpec<PrintPartner> {
    return {
        idOwner: "PARTNER",
        name: (row) => row.name,
        displayId: (row) => row.displayId,
        mobile: (row) => row.mobile,
        email: (row) => row.email,
        city: (row) => row.city,
        kycState: (row) => shapeKycSummary(row.kyc, row.kycStatus).state,
        suspensionScopes: () => undefined,
        // 2 Oct 2026: the account-state pill every desk draws — Deactivated, Closed.
        accountState: (row) => row.accountState,
        // A server one release behind sends no state; the row's own switch still says "off the roster" then.
        statusChip: (row) => (row.isActive || row.accountState ? null : <StatusBadge status={{ label: "Off the roster", tone: "neutral" }} />),
        activity: { count: (row) => row.jobCount ?? null, noun: ["job", "jobs"], title: "Print jobs, every status" },
        joinedAt: (row) => row.createdAt,
        // The door the shop came through — a server one release behind sends none, and the row's own application stamp stands in.
        onboarded: (row) => (row.onboarding ? onboardingLine(row.onboarding) : row.appliedAt ? "Self-serve" : "Desk"),
        open,
        reviewKyc,
        statusActions,
        extraColumns: PRINT_PARTNER_EXTRA_COLUMNS,
    };
}

/**
 * The roster of shops ADX pays to print.
 *
 * Search, door, KYC state, city and the roster facet are the server's — the
 * page arrives cut and counted — so the table's own search box is not
 * drawn: two searches over one list, one of which only sees a page, is how
 * a shop goes missing.
 */
export function PrintPartnersView({ view, filters, signIn, onSignInChange, applicationsWaiting = 0, onChanged }: PrintPartnersViewProps) {
    const router = useRouter();
    const allowed = useRosterPermission(SUSPEND_PERMISSION.PRINT_PARTNER);
    const shown = React.useMemo<PartyRosterView<PrintPartner>>(
        () => (signIn === "ALL" ? view : { ...view, rows: view.rows.filter((partner) => signInState(partner) === signIn) }),
        [view, signIn],
    );
    const [adding, setAdding] = React.useState(false);
    const [deactivating, setDeactivating] = React.useState<PrintPartner | null>(null);
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    async function deactivate() {
        if (!deactivating) return;
        setBusy(true);
        try {
            await printPartnerService.deactivate(deactivating.id, reason);
            toast.success(`${deactivating.name} is off the roster`, {
                description: "No new job may name it. Jobs already open still run and are still paid.",
            });
            setDeactivating(null);
            setReason("");
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not deactivate the partner.");
        } finally {
            setBusy(false);
        }
    }

    const reactivate = React.useCallback(
        async (partner: PrintPartner) => {
            setBusy(true);
            try {
                await printPartnerService.reactivate(partner.id);
                toast.success(`${partner.name} is back on the roster`);
                onChanged();
            } catch (cause) {
                toast.error(cause instanceof Error ? cause.message : "Could not reactivate the partner.");
            } finally {
                setBusy(false);
            }
        },
        [onChanged]
    );

    /* Lot H: the account switched on from the row — the SMS goes out, OTP sign-in answers. */
    const activate = React.useCallback(
        async (partner: PrintPartner) => {
            setBusy(true);
            try {
                const result = await printPartnerService.activate(partner.id);
                toast.success(result.activated ? `${partner.name} can sign in` : `${partner.name} was already activated`, {
                    description: result.activated ? `An SMS told ${partner.mobile} the ADX app now takes this number.` : undefined,
                });
                onChanged();
            } catch (cause) {
                toast.error(cause instanceof Error ? cause.message : "Could not activate the account.");
            } finally {
                setBusy(false);
            }
        },
        [onChanged]
    );

    const columns = React.useMemo(
        () =>
            partyRosterColumns(
                printPartnerRosterSpec(
                    (row) => router.push(`/print-partners/${row.id}`),
                    (row) => router.push(printPartnerKycHref(row)),
                    (row) =>
                        printPartnerStatusActions(row, {
                            allowed,
                            busy,
                            onActivate: () => void activate(row),
                            onDeactivate: () => {
                                setReason("");
                                setDeactivating(row);
                            },
                            onReactivate: () => void reactivate(row),
                        }),
                ),
            ),
        [activate, allowed, busy, reactivate, router]
    );

    const filtered = rosterFiltersActive(filters.filters) || signIn !== "ALL";

    return (
        <div className="space-y-5">
            <PageHeader
                title="Print partners"
                subtitle="The shops ADX pays to print a booking. Ops add a partner and activate its account; the shop then signs in by OTP, keeps a rate card or takes quote requests, walks its jobs to handover, and is paid an approved cost net of TDS."
                actions={
                    <Button onClick={() => setAdding(true)}>
                        <Plus className="mr-1.5 size-4" />
                        Add partner
                    </Button>
                }
            />

            {/* New applications are work for the desk: said once, in a line, only when there are some (the owner, 1 Oct 2026 — the chip rows are gone). */}
            {applicationsWaiting > 0 && signIn !== "APPLIED" ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-2.5 text-sm" data-testid="pp-applications-notice">
                    <span>
                        {applicationsWaiting === 1 ? "1 shop applied from the app" : `${applicationsWaiting} shops applied from the app`} and {applicationsWaiting === 1 ? "waits" : "wait"} for review — check its details, then Activate it on its page.
                    </span>
                    <Button variant="outline" size="sm" onClick={() => onSignInChange("APPLIED")}>
                        Review
                    </Button>
                </div>
            ) : null}

            <PartyRosterTable
                columns={columns}
                view={shown}
                noun="print partner"
                filterBar={
                    <PartyRosterFilterBar
                        spec={PRINT_PARTNER_FILTER_SPEC}
                        state={filters}
                        refreshing={view.refreshing}
                        statusCounts={view.statusCounts}
                        facet={appStateFacet(signIn, onSignInChange)}
                    />
                }
                onRowClick={(row) => router.push(`/print-partners/${row.id}`)}
                getRowId={(row) => row.id}
                initialColumnVisibility={hiddenExtras({ extraColumns: PRINT_PARTNER_EXTRA_COLUMNS })}
                emptyState={
                    <EmptyState
                        icon={Printer}
                        title={filtered ? "No print partner matches" : "No print partner here"}
                        description={
                            filtered
                                ? "Nobody on the roster matches these filters."
                                : "Nobody on the roster matches this. A partner is added at the desk with its GSTIN, PAN and the address the agent collects from."
                        }
                        action={
                            <Button variant="outline" className="bg-card" onClick={() => setAdding(true)}>
                                <Plus className="mr-1.5 size-4" />
                                Add partner
                            </Button>
                        }
                    />
                }
            />

            <PartnerDialog
                open={adding}
                onOpenChange={setAdding}
                onSaved={(partner) => {
                    onChanged();
                    router.push(`/print-partners/${partner.id}`);
                }}
            />

            <ConfirmDialog
                open={deactivating !== null}
                onOpenChange={(open) => !open && setDeactivating(null)}
                title={`Take ${deactivating?.name ?? "this partner"} off the roster?`}
                description="No new job may name it. Jobs already open run to the end, their costs are still approved and still paid — a shop that printed the banners is owed for them whatever happened since. It can be put back at any time."
                confirmLabel="Deactivate"
                destructive
                busy={busy}
                onConfirm={() => void deactivate()}
            >
                <Textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="Why — appended to the partner's notes. Optional."
                />
            </ConfirmDialog>
        </div>
    );
}
