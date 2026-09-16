"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Inbox, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { DecideClosureDialog } from "@/components/adx/close-account-dialog";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import {
    CLOSURE_DECISIONS,
    CLOSURE_DECISION_META,
    personLabel,
    type ClosureCase,
    type ClosureDecision,
    type ListPage,
} from "@/services/users";
import { UsersNav } from "../users-nav";

interface ClosuresViewProps {
    page: ListPage<ClosureCase>;
    decision: ClosureDecision | "ALL";
    onDecisionChange: (decision: ClosureDecision | "ALL") => void;
    query: string;
    onQueryChange: (value: string) => void;
    onChanged: () => void;
}

/**
 * The closure queue.
 *
 * No DR 10 frame draws it, so it is composed from the console's own parts:
 * the Users tab strip, a DataTable with the decision facet in its toolbar,
 * and the decide dialog the person's page already uses. A pending row opens
 * the decision; a decided row opens its record — who decided, when, and what
 * was written off.
 */
export function ClosuresView({ page, decision, onDecisionChange, query, onQueryChange, onChanged }: ClosuresViewProps) {
    const [target, setTarget] = React.useState<ClosureCase | null>(null);

    const columns = React.useMemo<ColumnDef<ClosureCase>[]>(
        () => [
            {
                id: "person",
                accessorFn: (row) => personLabel(row.user, row.userId),
                header: ({ column }) => <SortableHeader column={column}>Account</SortableHeader>,
                cell: ({ row }) => {
                    const label = personLabel(row.original.user, row.original.userId);
                    return (
                        <div className="flex items-center gap-2.5">
                            <InitialsAvatar name={label} size="sm" />
                            <div className="min-w-0">
                                <p className="font-medium text-foreground">{label}</p>
                                <p className="text-[11px] text-muted-foreground">
                                    {row.original.user?.mobile ?? row.original.userId}
                                </p>
                            </div>
                        </div>
                    );
                },
            },
            {
                id: "reason",
                accessorKey: "reason",
                header: "Reason",
                cell: ({ row }) => (
                    <div className="max-w-[28rem]">
                        <p className="truncate text-foreground">{row.original.reason}</p>
                        {row.original.ticketId && (
                            <p className="text-[11px] text-muted-foreground">
                                Ticket <span className="font-mono">{row.original.ticketId}</span>
                            </p>
                        )}
                    </div>
                ),
            },
            {
                id: "snapshot",
                accessorFn: (row) => row.walletBalance ?? "",
                header: "When raised",
                cell: ({ row }) => (
                    <div className="text-xs text-muted-foreground">
                        {/* The four numbers the case recorded. A snapshot, not a
                            gate: the decision re-runs the review. */}
                        <p className="font-medium text-foreground">{formatMoney(row.original.walletBalance)} in wallet</p>
                        <p>
                            {row.original.withdrawalsInFlight} in flight · {row.original.openOrders} orders ·{" "}
                            {row.original.openWork} agent work
                        </p>
                    </div>
                ),
            },
            {
                id: "requested",
                accessorKey: "requestedAt",
                header: ({ column }) => <SortableHeader column={column}>Raised</SortableHeader>,
                cell: ({ row }) => (
                    <span className="tabular-nums text-muted-foreground">{formatDateTime(row.original.requestedAt)}</span>
                ),
            },
            {
                id: "decision",
                accessorKey: "decision",
                header: "Decision",
                cell: ({ row }) => (
                    <div>
                        <StatusBadge status={CLOSURE_DECISION_META[row.original.decision]} />
                        {row.original.decidedAt && (
                            <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(row.original.decidedAt)}</p>
                        )}
                    </div>
                ),
            },
        ],
        [],
    );

    const shown = page.items.length;
    const pending = page.counts.PENDING ?? 0;

    return (
        <div className="space-y-5">
            <UsersNav />
            <PageHeader
                title="Closure cases"
                subtitle={
                    shown < page.total
                        ? `${pending} pending · showing the first ${shown} of ${page.total} — narrow the decision to see the rest`
                        : `${pending} pending · ${page.total} case${page.total === 1 ? "" : "s"}`
                }
            />
            <DataTable
                columns={columns}
                data={page.items}
                initialPageSize={10}
                onRowClick={setTarget}
                emptyState={
                    <EmptyState
                        icon={Inbox}
                        title={decision === "PENDING" ? "Nothing waiting" : "No cases"}
                        description={
                            decision === "PENDING"
                                ? "Every closure somebody asked for has been decided. A new case is raised from a person's page, or by the person from the app."
                                : "No closure case matches this filter."
                        }
                    />
                }
                toolbar={
                    <>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                            <Input
                                value={query}
                                onChange={(event) => onQueryChange(event.target.value)}
                                placeholder="Name or mobile"
                                aria-label="Search closure cases"
                                className="h-9 w-[240px] bg-card pl-8"
                            />
                        </div>
                        <Select
                            value={decision}
                            onValueChange={(value) => onDecisionChange(value as ClosureDecision | "ALL")}
                        >
                            <SelectTrigger className="h-9 w-[200px] bg-card">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Decision: All</SelectItem>
                                {CLOSURE_DECISIONS.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {/* Counted by the server with this facet
                                            removed, so every option can say how
                                            many it would show. */}
                                        {CLOSURE_DECISION_META[value].label} ({page.counts[value] ?? 0})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </>
                }
            />

            {target && target.decision === "PENDING" && (
                <DecideClosureDialog
                    closureCase={target}
                    open
                    onOpenChange={(open) => !open && setTarget(null)}
                    onDecided={onChanged}
                />
            )}
            {target && target.decision !== "PENDING" && (
                <DecidedCaseDialog closureCase={target} onClose={() => setTarget(null)} />
            )}
        </div>
    );
}

/** A case that has been decided: the record, read-only. */
function DecidedCaseDialog({ closureCase, onClose }: { closureCase: ClosureCase; onClose: () => void }) {
    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Closure case</DialogTitle>
                    <DialogDescription>
                        {personLabel(closureCase.user, closureCase.userId)}
                        {closureCase.user?.mobile ? ` · ${closureCase.user.mobile}` : ""}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <StatusBadge status={CLOSURE_DECISION_META[closureCase.decision]} />
                    <div className="rounded-md bg-muted/50 px-3 py-2.5 text-sm">
                        <p className="font-medium text-foreground">{closureCase.reason}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Raised {formatDateTime(closureCase.requestedAt)}
                            {closureCase.ticketId ? ` · ticket ${closureCase.ticketId}` : ""}
                        </p>
                    </div>
                    <FieldList
                        items={[
                            ["Decided", closureCase.decidedAt ? formatDateTime(closureCase.decidedAt) : "—"],
                            ["Balance when raised", formatMoney(closureCase.walletBalance)],
                            ["Withdrawals in flight", String(closureCase.withdrawalsInFlight)],
                            ["Open orders", String(closureCase.openOrders)],
                            ["Open agent work", String(closureCase.openWork)],
                        ]}
                    />
                    {closureCase.lossNote && (
                        <div className="rounded-md border px-3 py-2.5 text-sm">
                            <p className="text-xs font-medium text-muted-foreground">Loss note</p>
                            <p className="mt-1 text-foreground">{closureCase.lossNote}</p>
                        </div>
                    )}
                    {closureCase.user && (
                        <p className="text-xs text-muted-foreground">
                            <Link href={`/users/${closureCase.user.id}`} className="underline underline-offset-4 hover:text-foreground">
                                Open the account
                            </Link>
                        </p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
