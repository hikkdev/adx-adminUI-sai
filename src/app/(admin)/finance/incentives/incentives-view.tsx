"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { BadgeIndianRupee, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { compareMoney, formatDate, formatMoney, isZeroMoney, sumMoney } from "@/lib/format";
import type { AgentSummary } from "@/services/agents";
import {
    INCENTIVE_EVENTS,
    INCENTIVE_STATUS_META,
    financeService,
    incentiveEventLabel,
    shortId,
    type Incentive,
    type IncentiveEvent,
    type IncentiveStatus,
} from "@/services/finance";
import type { KpiStat } from "@/types";

interface IncentivesViewProps {
    incentives: Incentive[];
    /** The roster, for naming the agent on a row. Empty when it did not load. */
    agents: AgentSummary[];
    status: IncentiveStatus | "ALL";
    onStatusChange: (status: IncentiveStatus | "ALL") => void;
    /** Lot B: cuts the page by what the incentive was for. E6: `?event=`, on the server. */
    event: IncentiveEvent | "ALL";
    onEventChange: (event: IncentiveEvent | "ALL") => void;
    /** Lot B: `?orderId=` — "what was this order's commission?". */
    orderId: string;
    onOrderIdChange: (orderId: string) => void;
    onChanged: () => void;
}

/**
 * Agent incentives awaiting ops.
 *
 * An incentive is earned automatically — an agent onboards a publisher, assists
 * a campaign, hits a milestone — and credited by nobody automatically. It sits
 * at PENDING_VERIFICATION until a person checks the work actually happened,
 * which is the same rule the withdrawal queue runs on and for the same reason.
 *
 * Crediting moves net-of-tax money into the agent's wallet: the amount is the
 * gross, `taxWithheld` is TDS at the rate in force when it was earned, and
 * `netAmount` is what actually lands. Both are shown, because "you earned
 * ₹2,000" and "₹2,000 arrived" are different sentences and the difference is
 * the point of withholding at credit rather than at withdrawal.
 */
export function IncentivesView({
    incentives,
    agents,
    status,
    onStatusChange,
    event,
    onEventChange,
    orderId,
    onOrderIdChange,
    onChanged,
}: IncentivesViewProps) {
    const [acting, setActing] = React.useState<{ row: Incentive; action: "credit" | "reject" } | null>(
        null
    );
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    /* D12: the agent's name where the tail of an id used to be. The roster is
       read once per page load; a row whose agent is not on it — or a roster
       that did not load — falls back to the AGT- short id. */
    const byId = React.useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
    const agentName = React.useCallback(
        (agentId: string): string => byId.get(agentId)?.user?.name?.trim() || shortId(agentId, "AGT-"),
        [byId],
    );

    const pending = incentives.filter((row) => row.status === "PENDING_VERIFICATION");

    const kpis: KpiStat[] = [
        {
            id: "awaiting",
            label: "Awaiting ops",
            value: String(pending.length),
            hint: "Nothing credits itself",
        },
        {
            id: "gross",
            label: "Gross in the queue",
            value: formatMoney(sumMoney(pending.map((row) => row.amount))),
            hint: "Before tax withheld at credit",
        },
        {
            id: "net",
            label: "Net if all credited",
            value: formatMoney(sumMoney(pending.map((row) => row.netAmount))),
            hint: "What would reach agent wallets",
        },
    ];

    async function confirm() {
        if (!acting) return;
        const { row, action } = acting;
        if (action === "reject" && !reason.trim()) return;

        setBusy(true);
        try {
            if (action === "credit") {
                await financeService.creditIncentive(row.id);
                toast.success(`${formatMoney(row.netAmount)} credited`, {
                    description: `${incentiveEventLabel(row.event)} for ${agentName(row.agentId)}. It clears into their wallet immediately.`,
                });
            } else {
                await financeService.rejectIncentive(row.id, reason.trim());
                toast.success("Incentive rejected", {
                    description: "The agent is told why; nothing moves into their wallet.",
                });
            }
            setActing(null);
            setReason("");
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not record that decision.");
        } finally {
            setBusy(false);
        }
    }

    const columns = React.useMemo<ColumnDef<Incentive>[]>(
        () => [
            {
                id: "event",
                accessorKey: "event",
                header: ({ column }) => <SortableHeader column={column}>What for</SortableHeader>,
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                            {incentiveEventLabel(row.original.event)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                            {row.original.note ?? (row.original.orderId ? null : "No note given")}
                            {/* The order is a real id the backend issued, and
                                /orders/[id] reads the API, so the link opens
                                the order the commission was recorded on. */}
                            {row.original.orderId && (
                                <Link
                                    href={`/orders/${row.original.orderId}`}
                                    className="font-mono underline-offset-4 hover:text-foreground hover:underline"
                                >
                                    {row.original.note ? " · " : ""}
                                    Order {shortId(row.original.orderId, "ORD-")}
                                </Link>
                            )}
                            {/* E6: the party the work was for, when the event names one. */}
                            {row.original.publisherId && (
                                <Link
                                    href={`/publishers/${row.original.publisherId}`}
                                    className="underline-offset-4 hover:text-foreground hover:underline"
                                >
                                    {row.original.note || row.original.orderId ? " · " : ""}
                                    Publisher {shortId(row.original.publisherId, "PUB-")}
                                </Link>
                            )}
                            {row.original.advertiserId && (
                                <Link
                                    href={`/advertisers/${row.original.advertiserId}`}
                                    className="underline-offset-4 hover:text-foreground hover:underline"
                                >
                                    {row.original.note || row.original.orderId || row.original.publisherId ? " · " : ""}
                                    Advertiser {shortId(row.original.advertiserId, "ADV-")}
                                </Link>
                            )}
                        </p>
                    </div>
                ),
            },
            {
                id: "agent",
                accessorKey: "agentId",
                header: "Agent",
                cell: ({ row }) => {
                    const agent = byId.get(row.original.agentId);
                    return (
                        <div className="min-w-0">
                            <Link
                                href={`/agents/${row.original.agentId}`}
                                className="block truncate text-foreground underline-offset-4 hover:underline"
                            >
                                {agentName(row.original.agentId)}
                            </Link>
                            <p className="truncate text-xs text-muted-foreground">
                                {agent?.displayId ?? (agent ? shortId(row.original.agentId, "AGT-") : "Not on the roster")}
                            </p>
                        </div>
                    );
                },
            },
            {
                id: "tier",
                accessorKey: "tier",
                header: "Tier",
                cell: ({ row }) => (
                    // Copied onto the row when it was earned, so a promotion does
                    // not retrospectively re-rate work already done.
                    <span className="text-muted-foreground">{row.original.tier}</span>
                ),
            },
            {
                id: "amount",
                accessorKey: "amount",
                header: ({ column }) => <SortableHeader column={column}>Gross</SortableHeader>,
                sortingFn: (a, b) => compareMoney(a.original.amount, b.original.amount),
                cell: ({ row }) => (
                    <span className="font-medium tabular-nums">{formatMoney(row.original.amount)}</span>
                ),
            },
            {
                id: "tax",
                accessorKey: "taxWithheld",
                header: "TDS",
                cell: ({ row }) => (
                    <span className="tabular-nums text-muted-foreground">
                        {isZeroMoney(row.original.taxWithheld)
                            ? "None"
                            : formatMoney(row.original.taxWithheld)}
                    </span>
                ),
            },
            {
                id: "net",
                accessorKey: "netAmount",
                header: ({ column }) => <SortableHeader column={column}>Net</SortableHeader>,
                sortingFn: (a, b) => compareMoney(a.original.netAmount, b.original.netAmount),
                cell: ({ row }) => (
                    <span className="font-medium tabular-nums">
                        {formatMoney(row.original.netAmount)}
                    </span>
                ),
            },
            {
                id: "createdAt",
                accessorKey: "createdAt",
                header: ({ column }) => <SortableHeader column={column}>Earned</SortableHeader>,
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-muted-foreground">
                        {formatDate(row.original.createdAt)}
                    </span>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <StatusBadge status={INCENTIVE_STATUS_META[row.original.status]} />
                        {row.original.rejectionReason && (
                            <p className="mt-1 max-w-[16rem] truncate text-xs text-muted-foreground">
                                {row.original.rejectionReason}
                            </p>
                        )}
                    </div>
                ),
            },
            {
                id: "actions",
                enableHiding: false,
                header: "",
                cell: ({ row }) =>
                    row.original.status === "PENDING_VERIFICATION" ? (
                        <div className="flex items-center justify-end gap-1.5">
                            <Button
                                size="sm"
                                variant="outline"
                                className="bg-card text-danger hover:text-danger"
                                onClick={() => {
                                    setReason("");
                                    setActing({ row: row.original, action: "reject" });
                                }}
                            >
                                <X className="mr-1 size-3.5" />
                                Reject
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => setActing({ row: row.original, action: "credit" })}
                            >
                                <Check className="mr-1 size-3.5" />
                                Credit
                            </Button>
                        </div>
                    ) : (
                        <span className="block text-right text-xs text-muted-foreground">
                            {row.original.verifiedAt ? formatDate(row.original.verifiedAt) : "—"}
                        </span>
                    ),
            },
        ],
        [agentName, byId]
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="Agent incentives"
                subtitle="Earned by an agent, credited by a person. Tax is withheld here, at credit, not when the agent withdraws."
            />

            <div className="grid gap-4 sm:grid-cols-3">
                {kpis.map((stat) => (
                    <KpiCard key={stat.id} stat={stat} />
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <FilterChips<IncentiveStatus | "ALL">
                    value={status}
                    onChange={onStatusChange}
                    chips={[
                        { value: "PENDING_VERIFICATION", label: "Awaiting ops" },
                        { value: "CREDITED", label: "Credited" },
                        { value: "REJECTED", label: "Rejected" },
                        { value: "ALL", label: "All" },
                    ]}
                />
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Select
                        value={event}
                        onValueChange={(value) => onEventChange(value as IncentiveEvent | "ALL")}
                    >
                        <SelectTrigger className="h-8 w-52" aria-label="What for">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Every kind of work</SelectItem>
                            {INCENTIVE_EVENTS.map((item) => (
                                <SelectItem key={item} value={item}>
                                    {incentiveEventLabel(item)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input
                        value={orderId}
                        onChange={(input) => onOrderIdChange(input.target.value)}
                        placeholder="Order id"
                        aria-label="Order id"
                        className="h-8 w-48 font-mono text-xs"
                    />
                </div>
            </div>

            <DataTable
                columns={columns}
                data={incentives}
                searchPlaceholder="Search notes, tiers, agents…"
                initialPageSize={20}
                emptyState={
                    <EmptyState
                        icon={BadgeIndianRupee}
                        title="Nothing in this queue"
                        description="Incentives arrive here as agents earn them — onboarding a publisher or an advertiser, installing an order, visiting a site, assisting a campaign, hitting a milestone."
                    />
                }
            />

            <ConfirmDialog
                open={acting !== null}
                onOpenChange={(open) => !open && setActing(null)}
                title={
                    acting?.action === "credit" ? "Credit this incentive?" : "Reject this incentive?"
                }
                description={
                    acting?.action === "credit"
                        ? `${formatMoney(acting?.row.netAmount)} moves into the agent's wallet now, net of ${
                              acting && isZeroMoney(acting.row.taxWithheld)
                                  ? "no tax at the rate in force"
                                  : formatMoney(acting?.row.taxWithheld)
                          }. It is cleared money — an incentive has no clearing window.`
                        : "Nothing moves. The agent is told why, and the incentive stays on the record as rejected rather than disappearing."
                }
                confirmLabel={acting?.action === "credit" ? "Credit the agent" : "Reject incentive"}
                destructive={acting?.action === "reject"}
                busy={busy}
                disabled={acting?.action === "reject" && !reason.trim()}
                onConfirm={confirm}
            >
                {acting?.action === "reject" ? (
                    <div className="space-y-1.5">
                        <Label htmlFor="incentive-reason">Reason</Label>
                        <Textarea
                            id="incentive-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            rows={3}
                            placeholder="What could not be verified. Shown to the agent."
                        />
                        <p className="text-xs text-muted-foreground">
                            Required. The backend refuses a rejection without one.
                        </p>
                    </div>
                ) : (
                    <Card className="rounded-lg border-border bg-muted/40 p-3 shadow-none">
                        <p className="text-xs text-muted-foreground">
                            Crediting posts to the ledger and to the agent&rsquo;s wallet in one
                            transaction. It cannot be taken back by editing — only by reversing the
                            posting from the ledger screen.
                        </p>
                    </Card>
                )}
            </ConfirmDialog>
        </div>
    );
}
