"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SortableHeader, selectionColumn } from "@/components/adx/data-table";
import { AccountStatePill } from "@/components/adx/account-state-pill";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { StatusBadge } from "@/components/adx/status-badge";
import { SuspendedChip } from "@/components/adx/suspended-chip";
import { VerifiedTick } from "@/components/adx/verified-tick";
import { formatDate, formatIndianMobile } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isInactive, type AccountState } from "@/services/account-state";
import { ID_LABEL, type IdOwner } from "@/services/identifiers";
import { kycStateMeta, type KycQueueState } from "@/services/kyc-state";
import { activityLine } from "@/services/party-roster";
import type { SuspensionScope } from "@/types";

/**
 * The party rosters' one column layout — 29 Sep 2026 (the owner: "Why this
 * table columns look different than advertisers?").
 *
 * Publishers, Advertisers, Print partners and Agents each pass their row's
 * accessors and their own bits — the activity they count, the row's menu,
 * where a row opens — and get back the same columns in the same order
 * under the same names, so the desks cannot drift apart again:
 *
 *   Name · Contact · Type · City · KYC status · Activity · Joined · Onboarded · (actions)
 *
 * Type is left out only for a party that has none (a print shop). What a
 * desk had beyond these stays available as `extraColumns`, drawn after
 * Onboarded and hidden until the table's "Columns" menu turns them on.
 * The row's "⋯" menu is the same on every desk too (`rosterRowMenu`).
 */

/** The column ids and headers, in order — what every desk draws and what the tests pin. */
export const PARTY_ROSTER_COLUMNS = [
    { id: "name", header: "Name" },
    { id: "contact", header: "Contact" },
    { id: "type", header: "Type" },
    { id: "city", header: "City" },
    { id: "kyc-status", header: "KYC status" },
    { id: "activity", header: "Activity" },
    { id: "joined", header: "Joined" },
    { id: "onboarded", header: "Onboarded" },
] as const;

export type PartyRosterColumnId = (typeof PARTY_ROSTER_COLUMNS)[number]["id"];

/** The headers a desk draws: every one, less Type for a party that has no type field. */
export function partyRosterHeaders(hasType: boolean): string[] {
    return PARTY_ROSTER_COLUMNS.filter((column) => hasType || column.id !== "type").map((column) => column.header);
}

/** One item in a row's status slot — after the separator, below "View details" and "Review KYC". */
export interface RosterRowAction {
    label: string;
    onSelect: () => void;
    /** The stopping action — Suspend…, Deactivate — drawn in the danger style. */
    destructive?: boolean;
    disabled?: boolean;
}

/**
 * One entry of a row's "⋯" menu, in the order it is drawn — 2 Oct 2026 (the
 * owner, of Print partners, Advertisers and Publishers side by side: "again
 * 3 different variations"). The same menu on every desk:
 *
 *   Actions
 *   View details · Review KYC
 *   ─────────
 *   the party's status action(s)
 *
 * The separator and the status slot are drawn only when the row has a
 * status action the viewer may take.
 */
export type RosterMenuEntry =
    | { kind: "label"; label: string }
    | { kind: "item"; label: string; onSelect: () => void; destructive?: boolean; disabled?: boolean }
    | { kind: "separator" };

/** The menu's heading — the same word on every desk. */
export const ROSTER_MENU_LABEL = "Actions";

/** The menu a row draws, from the desk's spec — the one helper every desk's "⋯" goes through. */
export function rosterRowMenu<T>(spec: Pick<PartyRosterSpec<T>, "open" | "reviewKyc" | "statusActions">, row: T): RosterMenuEntry[] {
    const status = spec.statusActions?.(row) ?? [];
    return [
        { kind: "label", label: ROSTER_MENU_LABEL },
        { kind: "item", label: "View details", onSelect: () => spec.open(row) },
        { kind: "item", label: "Review KYC", onSelect: () => spec.reviewKyc(row) },
        ...(status.length > 0 ? ([{ kind: "separator" }] as RosterMenuEntry[]) : []),
        ...status.map((action): RosterMenuEntry => ({ kind: "item", ...action })),
    ];
}

export interface PartyRosterSpec<T> {
    /** Whose account ID the Name cell prints — the ID rule in `services/identifiers`. */
    idOwner: IdOwner;
    name: (row: T) => string;
    displayId: (row: T) => string | null;
    /** The stored number; printed `+91 98765 43210` whatever form it was stored in. */
    mobile: (row: T) => string | null;
    email: (row: T) => string | null;
    /** The party's type, labelled. Omit for a party that has none — the column is not drawn. */
    type?: (row: T) => string | null;
    city: (row: T) => string | null;
    /** The KYC state the queue and the party page print (`services/kyc-state`). */
    kycState: (row: T) => KycQueueState;
    suspensionScopes: (row: T) => SuspensionScope[] | undefined;
    /**
     * 2 Oct 2026 (the account lifecycle): the row's `accountState`. A
     * Suspended / Deactivated / Closed / Left pill beside the KYC pill; while
     * it shows, it speaks for the suspension too (the sections on its tooltip).
     */
    accountState?: (row: T) => AccountState | null | undefined;
    /** A chip beside the KYC pill that only this party has — an agent's work status. Null for none. */
    statusChip?: (row: T) => React.ReactNode;
    /** The one count this party is judged on — spots, campaigns, jobs, accounts. Null when the read did not carry it. */
    activity: { count: (row: T) => number | null; noun: readonly [string, string]; title?: string };
    /** ISO date the party joined ADX. */
    joinedAt: (row: T) => string;
    /** The door and who opened it — "Desk · Asha Rao (Ops manager)". */
    onboarded: (row: T) => string;
    /** Opens the row — the "View details" item; the table's row click uses the same. */
    open: (row: T) => void;
    /** The "Review KYC" item: the party's case when there is one, else its queue searched for it (`kycReviewHref`). */
    reviewKyc: (row: T) => void;
    /**
     * The row's status slot, after the separator: Suspend… / Reinstate
     * (`suspensionRowActions`), or a print partner's Activate and
     * Deactivate / Reactivate. Empty on a closed account or without the
     * permission — the slot and its separator are not drawn then.
     */
    statusActions?: (row: T) => RosterRowAction[];
    /** The desk's own columns, after Onboarded and hidden until turned on (their ids must not clash with the shared ones). */
    extraColumns?: ColumnDef<T>[];
}

/** The ids of a desk's extra columns, hidden — `DataTable`'s `initialColumnVisibility`. */
export function hiddenExtras<T>(spec: Pick<PartyRosterSpec<T>, "extraColumns">): Record<string, boolean> {
    return Object.fromEntries((spec.extraColumns ?? []).map((column) => [column.id ?? "", false]).filter(([id]) => id !== ""));
}

/** The Name cell: the avatar, the name and the verified tick, the account ID labelled beneath. */
export function PartyNameCell({
    name,
    displayId,
    idOwner,
    verified,
    below,
}: {
    name: string;
    displayId: string | null;
    idOwner: IdOwner;
    verified: boolean;
    /** A line under the ID: the users list names what the login holds there. */
    below?: React.ReactNode;
}) {
    const id = displayId?.trim();
    return (
        <div className="flex min-w-0 items-center gap-2.5">
            <InitialsAvatar name={name} size="sm" />
            <div className="min-w-0">
                <p className="inline-flex max-w-full items-center gap-1.5 font-medium text-foreground">
                    <span className="truncate">{name}</span>
                    <VerifiedTick kycStatus={verified ? "VERIFIED" : null} />
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                    {id ? (
                        <>
                            {ID_LABEL[idOwner]} <span className="font-mono tabular-nums">{id}</span>
                        </>
                    ) : (
                        `${ID_LABEL[idOwner]} not issued yet`
                    )}
                </p>
                {below}
            </div>
        </div>
    );
}

/** The Contact cell: the phone as every roster prints it, the email beneath — always two lines, so rows keep one height. */
export function PartyContactCell({ mobile, email }: { mobile: string | null; email: string | null }) {
    const phone = formatIndianMobile(mobile);
    return (
        <div className="min-w-0 text-sm">
            <p className="whitespace-nowrap tabular-nums text-foreground">{phone || "—"}</p>
            <p className={cn("max-w-[14rem] truncate text-xs", email ? "text-muted-foreground" : "text-muted-foreground/70")} title={email ?? undefined}>
                {email || "No email"}
            </p>
        </div>
    );
}

/** The row's "⋯" menu, drawn from its entries — every list that shares the roster layout draws its menu through this. */
export function RosterRowMenu({ entries }: { entries: RosterMenuEntry[] }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Row actions</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52" data-testid="roster-row-menu">
                {entries.map((entry, index) =>
                    entry.kind === "label" ? (
                        <DropdownMenuLabel key={`label-${index}`}>{entry.label}</DropdownMenuLabel>
                    ) : entry.kind === "separator" ? (
                        <DropdownMenuSeparator key={`separator-${index}`} />
                    ) : (
                        <DropdownMenuItem
                            key={entry.label}
                            disabled={entry.disabled}
                            onSelect={entry.onSelect}
                            className={cn(entry.destructive && "text-danger focus:text-danger")}
                        >
                            {entry.label}
                        </DropdownMenuItem>
                    ),
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/**
 * The columns, from a desk's spec. Memoise the spec's inputs, not this:
 * the desks call it inside `React.useMemo` with their router and handlers.
 */
export function partyRosterColumns<T>(spec: PartyRosterSpec<T>): ColumnDef<T>[] {
    const columns: ColumnDef<T>[] = [
        selectionColumn<T>(),
        {
            id: "name",
            accessorFn: (row) => spec.name(row),
            header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
            cell: ({ row }) => (
                <PartyNameCell
                    name={spec.name(row.original)}
                    displayId={spec.displayId(row.original)}
                    idOwner={spec.idOwner}
                    verified={spec.kycState(row.original) === "VERIFIED"}
                />
            ),
        },
        {
            id: "contact",
            accessorFn: (row) => `${spec.mobile(row) ?? ""} ${spec.email(row) ?? ""}`,
            header: "Contact",
            enableSorting: false,
            cell: ({ row }) => <PartyContactCell mobile={spec.mobile(row.original)} email={spec.email(row.original)} />,
        },
    ];
    if (spec.type) {
        const type = spec.type;
        columns.push({
            id: "type",
            accessorFn: (row) => type(row) ?? "",
            header: "Type",
            cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{type(row.original) || "—"}</span>,
        });
    }
    columns.push(
        {
            id: "city",
            accessorFn: (row) => spec.city(row) ?? "",
            header: ({ column }) => <SortableHeader column={column}>City</SortableHeader>,
            cell: ({ row }) => <span className="text-muted-foreground">{spec.city(row.original) || "—"}</span>,
        },
        {
            id: "kyc-status",
            accessorFn: (row) => spec.kycState(row),
            header: "KYC status",
            cell: ({ row }) => {
                const account = spec.accountState?.(row.original);
                const scopes = spec.suspensionScopes(row.original);
                return (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={kycStateMeta(spec.kycState(row.original))} />
                        {spec.statusChip?.(row.original)}
                        {isInactive(account) ? <AccountStatePill state={account} scopes={scopes} /> : <SuspendedChip scopes={scopes} />}
                    </span>
                );
            },
        },
        {
            id: "activity",
            accessorFn: (row) => spec.activity.count(row) ?? -1,
            header: ({ column }) => <SortableHeader column={column}>Activity</SortableHeader>,
            cell: ({ row }) => {
                const count = spec.activity.count(row.original);
                return (
                    <span className="whitespace-nowrap tabular-nums text-foreground" title={spec.activity.title}>
                        {count === null ? "—" : activityLine(count, spec.activity.noun)}
                    </span>
                );
            },
        },
        {
            id: "joined",
            accessorFn: (row) => spec.joinedAt(row),
            header: ({ column }) => <SortableHeader column={column}>Joined</SortableHeader>,
            cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(spec.joinedAt(row.original))}</span>,
        },
        {
            id: "onboarded",
            accessorFn: (row) => spec.onboarded(row),
            header: "Onboarded",
            cell: ({ row }) => {
                const line = spec.onboarded(row.original);
                return (
                    <span className="block max-w-[14rem] truncate text-muted-foreground" title={line}>
                        {line}
                    </span>
                );
            },
        },
        ...(spec.extraColumns ?? []),
        {
            id: "actions",
            enableHiding: false,
            enableSorting: false,
            size: 48,
            cell: ({ row }) => <RosterRowMenu entries={rosterRowMenu(spec, row.original)} />,
        },
    );
    return columns;
}
