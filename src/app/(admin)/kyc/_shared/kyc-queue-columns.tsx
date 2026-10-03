"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { SortableHeader } from "@/components/adx/data-table";
import { AccountStatePill } from "@/components/adx/account-state-pill";
import { NoAppAccount } from "@/components/adx/app-account";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AccountState } from "@/services/account-state";
import { escalationChip } from "@/services/kyc";
import { KYC_STATE_META, type KycQueueState } from "@/services/kyc-state";
import type { KycEscalation, KycRecorded, KycRequest } from "@/types";
import { DeskStamp } from "./desk-stamp";

/** The clock on a row — hours waiting against the review SLA, as the queue read measured it. */
export interface KycRowClock {
    ageHours: number | null;
    slaBreached: boolean;
    slaHoursLeft: number;
}

/**
 * One KYC queue, described for the shared table — 2 Oct 2026 (the owner:
 * "why can't they look uniform?"): the five tabs draw one table, in one
 * column order, from what each party's row carries.
 *
 *   [select, where the queue has bulk actions] · Party · [the party's own columns] · Method · Submitted / arrived ·
 *   Requested / recorded by · SLA · Working it · State · [row actions]
 *
 * A column the party's queue does not carry is left out rather than drawn
 * empty: the agent and employee reads carry no clock, no assignee and no
 * escalation, so their tables stop at the state.
 */
export interface KycQueueSpec<T> {
    /** The party column's header — "Publisher", "Advertiser", "Partner", "Agent", "Employee". */
    noun: string;
    name: (row: T) => string;
    /** The line under the name — the display id, the city, the contact. */
    line: (row: T) => string;
    /**
     * 2 Oct 2026: true for a party nobody signs in for, which then carries the
     * muted "No app account" beside its name (Users lists people, so it is not
     * there). Omit for a party that always has a login.
     */
    noAppAccount?: (row: T) => boolean;
    /** The party's own columns, drawn after the name where Publishers draws its entity type and who brought them in. */
    partyColumns?: ColumnDef<T>[];
    /** The Method cell — the online check's pill, or how many documents are in. */
    method: (row: T) => React.ReactNode;
    /** When the documents came in, formatted; null with nothing submitted. */
    submitted: (row: T) => string | null;
    /** When the party arrived (ISO); drawn while nothing is submitted. */
    arrivedAt: (row: T) => string | null;
    request: (row: T) => KycRequest | null;
    recorded: (row: T) => KycRecorded | null;
    /** The review clock; omit when the queue read carries none. */
    clock?: (row: T) => KycRowClock;
    /** Publishers: when the nightly sweep would escalate a case on its own, in hours of age. */
    autoEscalateAt?: number | null;
    /** Who is working the case; omit when the queue has no assignment. */
    assignee?: (row: T) => { id: string | null; name: string | null | undefined };
    /** Whether the row has a record — an assignee is only possible with one. */
    hasRecord: (row: T) => boolean;
    state: (row: T) => KycQueueState;
    /** The escalation pill beside the state; omit when the party is never escalated. */
    escalation?: (row: T) => KycEscalation | null;
    /**
     * 2 Oct 2026 (the account lifecycle): the account's own state — a
     * Suspended / Deactivated / Closed / Left pill beside the KYC state, so
     * a row brought in by "Show inactive accounts" says why it is not working.
     */
    accountState?: (row: T) => AccountState | null | undefined;
    /** The row's actions — the shared `KycRowActions`. */
    actions: (row: T) => React.ReactNode;
}

/** The columns of a KYC queue, in the one order every tab shares. `meId` names "You" in the Working it column. */
export function kycQueueColumns<T>(spec: KycQueueSpec<T>, meId: string | null): ColumnDef<T>[] {
    const noun = spec.noun.toLowerCase();
    const columns: ColumnDef<T>[] = [];

    columns.push({
        /* The "Columns" menu names a column by its id. */
        id: noun,
        accessorFn: (row) => spec.name(row),
        header: ({ column }) => <SortableHeader column={column}>{spec.noun}</SortableHeader>,
        cell: ({ row }) => (
            <div className="flex items-center gap-2.5">
                <InitialsAvatar name={spec.name(row.original)} size="sm" />
                <div>
                    <p className="font-medium text-foreground">
                        {spec.name(row.original)}
                        {spec.noAppAccount?.(row.original) && <NoAppAccount className="ml-1.5" />}
                    </p>
                    <p className="text-xs text-muted-foreground">{spec.line(row.original)}</p>
                </div>
            </div>
        ),
    });

    columns.push(...(spec.partyColumns ?? []));

    columns.push(
        {
            id: "method",
            header: "Method",
            cell: ({ row }) => spec.method(row.original),
        },
        {
            id: "submitted",
            header: "Submitted / arrived",
            cell: ({ row }) => {
                const submitted = spec.submitted(row.original);
                if (submitted) return <span className="text-muted-foreground">{submitted}</span>;
                const arrived = spec.arrivedAt(row.original);
                return arrived ? (
                    <span className="text-muted-foreground" title={`Nothing submitted; when the ${noun} arrived`}>
                        Arrived {formatDate(arrived)}
                    </span>
                ) : (
                    <span className="text-muted-foreground">—</span>
                );
            },
        },
        {
            id: "desk",
            header: "Requested / recorded by",
            cell: ({ row }) => <DeskStamp request={spec.request(row.original)} recorded={spec.recorded(row.original)} />,
        }
    );

    const clock = spec.clock;
    if (clock) {
        const autoEscalateAt = spec.autoEscalateAt ?? null;
        columns.push({
            id: "sla",
            accessorFn: (row) => clock(row).slaHoursLeft,
            header: ({ column }) => <SortableHeader column={column}>SLA</SortableHeader>,
            cell: ({ row }) => {
                const { ageHours, slaBreached, slaHoursLeft } = clock(row.original);
                if (ageHours === null) return <span className="text-muted-foreground">—</span>;
                /* Lot G: the nightly sweep's own threshold, beside the SLA — while the case is not already escalated. */
                const escalated = spec.escalation?.(row.original) ?? null;
                const untilAuto = autoEscalateAt === null || escalated ? null : Math.floor(autoEscalateAt - ageHours);
                return (
                    <div>
                        <span className={cn("font-medium", slaBreached || slaHoursLeft <= 6 ? "text-danger" : "text-muted-foreground")}>
                            {slaBreached ? `Breached · ${Math.floor(ageHours)}h` : `${slaHoursLeft}h left`}
                        </span>
                        {untilAuto !== null && (
                            <p className="text-[11px] text-muted-foreground">
                                {untilAuto > 0 ? `auto-escalates in ${untilAuto}h` : `auto-escalates tonight (${autoEscalateAt}h threshold)`}
                            </p>
                        )}
                    </div>
                );
            },
        });
    }

    const assignee = spec.assignee;
    if (assignee) {
        columns.push({
            id: "assigned",
            header: "Working it",
            cell: ({ row }) => {
                const { id, name } = assignee(row.original);
                if (id) return <span className="text-muted-foreground">{meId !== null && id === meId ? "You" : name?.trim() || id}</span>;
                return <span className="text-muted-foreground">{spec.hasRecord(row.original) ? "Nobody" : "—"}</span>;
            },
        });
    }

    columns.push(
        {
            id: "state",
            accessorFn: (row) => spec.state(row),
            header: "State",
            cell: ({ row }) => {
                const pill = spec.escalation ? escalationChip(spec.escalation(row.original)) : null;
                return (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={KYC_STATE_META[spec.state(row.original)]} />
                        {pill && <StatusBadge status={pill} />}
                        <AccountStatePill state={spec.accountState?.(row.original)} />
                    </div>
                );
            },
        },
        {
            id: "actions",
            enableHiding: false,
            header: "",
            cell: ({ row }) => spec.actions(row.original),
        }
    );

    return columns;
}
