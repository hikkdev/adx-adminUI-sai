"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, Landmark, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips, type FilterChip } from "@/components/adx/filter-chips";
import { KpiCard } from "@/components/adx/kpi-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { useAuth } from "@/lib/auth";
import { compareMoney, formatDate, formatDateTime, formatMoney, sumMoney } from "@/lib/format";
import { shortId } from "@/services/finance";
import {
    CAMPAIGN_REFUND_STATUSES,
    CAMPAIGN_REFUND_STATUS_META,
    REFUND_DESTINATION_LABEL,
    REFUND_REASON_LABEL,
    REFUND_REQUEST_STATUSES,
    REFUND_REQUEST_STATUS_META,
    approvalConsequence,
    isCashDestination,
    isDecisionRefused,
    refundRequestActions,
    refundsService,
    type CampaignRefund,
    type CampaignRefundStatus,
    type ListPage,
    type RefundRequest,
    type RefundRequestStatus,
} from "@/services/refunds";
import type { KpiStat } from "@/types";

/** Both decisions on both queues need `finance.approve`; the buttons say so rather than 403. */
const APPROVE = "finance.approve";

const FOUR_EYES = "The person who releases a refund may not be the person who asked for it.";

/* ------------------------------------------------------------------ */
/* Campaign refunds                                                    */
/* ------------------------------------------------------------------ */

interface CampaignRefundsViewProps {
    page: ListPage<CampaignRefund>;
    status: CampaignRefundStatus | "ALL";
    onStatusChange: (status: CampaignRefundStatus | "ALL") => void;
    onChanged: () => void;
}

/**
 * What cancelled campaigns owe.
 *
 * The cancel wrote the row; nothing has moved. Releasing credits the wallet
 * with REFUND legs out of the payables the capture put the money into, and
 * refusing keeps the row with the reason appended. Four eyes: the API
 * refuses a release by the requester (403), and a row somebody else decided
 * first (409) — both are shown as the message they carry, not as a failure.
 */
export function CampaignRefundsView({ page, status, onStatusChange, onChanged }: CampaignRefundsViewProps) {
    const { user, can } = useAuth();
    const mayApprove = can(APPROVE);
    const [acting, setActing] = React.useState<{ row: CampaignRefund; action: "release" | "reject" } | null>(null);
    const [text, setText] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const pending = page.items.filter((row) => row.status === "PENDING");
    const kpis: KpiStat[] = [
        { id: "pending", label: "Awaiting finance", value: String(page.counts.PENDING ?? 0), hint: "Across every page" },
        {
            id: "owed",
            label: "Owed on this page",
            value: formatMoney(sumMoney(pending.map((row) => row.amount))),
            hint: "Pending rows shown below",
        },
        { id: "released", label: "Released", value: String(page.counts.RELEASED ?? 0), hint: "Credited to a wallet" },
    ];

    async function confirm() {
        if (!acting) return;
        const { row, action } = acting;
        if (action === "reject" && !text.trim()) return;
        setBusy(true);
        try {
            if (action === "release") {
                await refundsService.releaseCampaignRefund(row.id, text);
                toast.success(`${formatMoney(row.amount)} released`, {
                    description: `Credited to the advertiser's wallet for ${row.campaign?.reference ?? "the campaign"}.`,
                });
            } else {
                await refundsService.rejectCampaignRefund(row.id, text.trim());
                toast.success("Refund refused", { description: "Nothing moved; the reason is on the record." });
            }
            setActing(null);
            setText("");
            onChanged();
        } catch (cause) {
            if (isDecisionRefused(cause)) {
                toast.error(cause.message, { description: cause.status === 403 ? FOUR_EYES : undefined });
                if (cause.status === 409) onChanged();
            } else {
                toast.error(cause instanceof Error ? cause.message : "Could not record that decision.");
            }
        } finally {
            setBusy(false);
        }
    }

    const columns = React.useMemo<ColumnDef<CampaignRefund>[]>(
        () => [
            {
                id: "campaign",
                accessorFn: (row) => row.campaign?.name ?? row.campaignId,
                header: "Campaign",
                cell: ({ row }) =>
                    row.original.campaign ? (
                        <div className="min-w-0">
                            <Link
                                href={`/campaigns/${row.original.campaign.id}`}
                                className="block truncate font-medium text-foreground underline-offset-4 hover:underline"
                            >
                                {row.original.campaign.name}
                            </Link>
                            <p className="truncate font-mono text-xs text-muted-foreground">
                                {row.original.campaign.reference}
                            </p>
                        </div>
                    ) : (
                        <span className="text-muted-foreground">Campaign no longer exists</span>
                    ),
            },
            {
                id: "advertiser",
                accessorFn: (row) => row.advertiser?.name ?? row.campaign?.advertiserId ?? "",
                header: "Advertiser",
                /* E10-1: the advertiser by name off the row; the display id under it. */
                cell: ({ row }) => {
                    const advertiser = row.original.advertiser ?? null;
                    const advertiserId = advertiser?.id ?? row.original.campaign?.advertiserId ?? null;
                    if (!advertiserId) return "—";
                    return (
                        <div className="min-w-0">
                            <Link
                                href={`/advertisers/${advertiserId}`}
                                className="block truncate font-medium text-foreground underline-offset-4 hover:underline"
                            >
                                {advertiser?.name?.trim() || shortId(advertiserId, "ADV-")}
                            </Link>
                            {advertiser?.displayId && (
                                <p className="truncate font-mono text-xs text-muted-foreground">{advertiser.displayId}</p>
                            )}
                        </div>
                    );
                },
            },
            {
                id: "amount",
                accessorKey: "amount",
                header: ({ column }) => <SortableHeader column={column}>Owed</SortableHeader>,
                sortingFn: (a, b) => compareMoney(a.original.amount, b.original.amount),
                cell: ({ row }) => <span className="font-medium tabular-nums">{formatMoney(row.original.amount)}</span>,
            },
            {
                id: "reason",
                accessorKey: "reason",
                header: "Reason",
                cell: ({ row }) => (
                    <p className="max-w-[20rem] truncate text-xs text-muted-foreground" title={row.original.reason}>
                        {row.original.reason}
                    </p>
                ),
            },
            {
                id: "createdAt",
                accessorKey: "createdAt",
                header: ({ column }) => <SortableHeader column={column}>Requested</SortableHeader>,
                cell: ({ row }) => (
                    <div className="min-w-0 whitespace-nowrap">
                        <p className="text-muted-foreground">{formatDate(row.original.createdAt)}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                            by {row.original.requestedByUserId === user?.id ? "you" : shortId(row.original.requestedByUserId)}
                        </p>
                    </div>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <StatusBadge status={CAMPAIGN_REFUND_STATUS_META[row.original.status]} />
                        {row.original.releasedAt && (
                            <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(row.original.releasedAt)}</p>
                        )}
                    </div>
                ),
            },
            {
                id: "actions",
                enableHiding: false,
                header: "",
                cell: ({ row }) => {
                    if (row.original.status !== "PENDING") return null;
                    const own = row.original.requestedByUserId === user?.id;
                    const blocked = !mayApprove || own || !row.original.campaign;
                    const why = !mayApprove
                        ? "Needs the finance.approve permission."
                        : own
                          ? FOUR_EYES
                          : !row.original.campaign
                            ? "The campaign behind this refund no longer exists."
                            : undefined;
                    return (
                        <div className="flex items-center justify-end gap-1.5" title={why}>
                            <Button
                                size="sm"
                                variant="outline"
                                className="bg-card text-danger hover:text-danger"
                                disabled={blocked}
                                onClick={() => {
                                    setText("");
                                    setActing({ row: row.original, action: "reject" });
                                }}
                            >
                                <X className="mr-1 size-3.5" />
                                Refuse
                            </Button>
                            <Button
                                size="sm"
                                disabled={blocked}
                                onClick={() => {
                                    setText("");
                                    setActing({ row: row.original, action: "release" });
                                }}
                            >
                                <Check className="mr-1 size-3.5" />
                                Release
                            </Button>
                        </div>
                    );
                },
            },
        ],
        [mayApprove, user?.id]
    );

    const chips: FilterChip<CampaignRefundStatus | "ALL">[] = [
        ...CAMPAIGN_REFUND_STATUSES.map((value) => ({
            value,
            label: CAMPAIGN_REFUND_STATUS_META[value].label,
            count: page.counts[value],
        })),
        { value: "ALL" as const, label: "All" },
    ];

    return (
        <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
                {kpis.map((stat) => (
                    <KpiCard key={stat.id} stat={stat} />
                ))}
            </div>

            <Card className="rounded-lg border-border bg-muted/30 p-4 shadow-none">
                <p className="text-sm text-foreground">
                    <strong>Four eyes.</strong> {FOUR_EYES} The API refuses the release, and the buttons on a
                    refund you raised are disabled here for the same reason. Releasing credits the wallet
                    through the ledger; refusing moves nothing and keeps your reason on the record.
                </p>
            </Card>

            <FilterChips<CampaignRefundStatus | "ALL"> value={status} onChange={onStatusChange} chips={chips} />

            <DataTable
                columns={columns}
                data={page.items}
                searchPlaceholder="Search campaigns, references, reasons…"
                initialPageSize={20}
                emptyState={
                    <EmptyState
                        icon={Undo2}
                        title="Nothing in this queue"
                        description="A campaign refund is recorded when a campaign is cancelled after its money was captured. None is waiting under this filter."
                    />
                }
            />

            <ConfirmDialog
                open={acting !== null}
                onOpenChange={(open) => !open && setActing(null)}
                title={acting?.action === "release" ? "Release this refund?" : "Refuse this refund?"}
                description={
                    acting?.action === "release"
                        ? `${formatMoney(acting?.row.amount)} is credited to the advertiser's wallet now, out of the payables the capture put it into. The posting is reversible only from the ledger screen.`
                        : "Nothing moves. Your reason is appended to the record so the refusal stays explicable later."
                }
                confirmLabel={acting?.action === "release" ? "Release refund" : "Refuse refund"}
                destructive={acting?.action === "reject"}
                busy={busy}
                disabled={acting?.action === "reject" && !text.trim()}
                onConfirm={confirm}
            >
                <div className="space-y-1.5">
                    <Label htmlFor="campaign-refund-text">{acting?.action === "release" ? "Note (optional)" : "Reason"}</Label>
                    <Textarea
                        id="campaign-refund-text"
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        rows={3}
                        maxLength={400}
                        placeholder={
                            acting?.action === "release"
                                ? "Goes on the wallet statement line. Defaults to the campaign reference and the cancel's reason."
                                : "Why the refund is refused. Required."
                        }
                    />
                </div>
            </ConfirmDialog>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Refund requests                                                     */
/* ------------------------------------------------------------------ */

interface RefundRequestsViewProps {
    page: ListPage<RefundRequest>;
    status: RefundRequestStatus | "ALL";
    onStatusChange: (status: RefundRequestStatus | "ALL") => void;
    onChanged: () => void;
}

type RequestAction = { row: RefundRequest; action: "decide" | "markPaid" | "fail" };

/**
 * Money an advertiser wants back.
 *
 * Raised on the advertiser page, frozen the moment it was recorded, decided
 * here. The destination was fixed at raise and decides what approval does:
 * wallet credit is settled at approval; a bank transfer is debited at
 * approval and waits APPROVED until finance marks it paid with the UTR or
 * fails it, which returns the money to the wallet.
 */
export function RefundRequestsView({ page, status, onStatusChange, onChanged }: RefundRequestsViewProps) {
    const { user, can } = useAuth();
    const mayApprove = can(APPROVE);
    const [acting, setActing] = React.useState<RequestAction | null>(null);
    const [text, setText] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const kpis: KpiStat[] = [
        { id: "pending", label: "Awaiting decision", value: String(page.counts.PENDING ?? 0), hint: "Frozen in the wallet meanwhile" },
        { id: "approved", label: "Approved, to pay", value: String(page.counts.APPROVED ?? 0), hint: "Bank transfers finance still owes" },
        { id: "paid", label: "Paid", value: String(page.counts.PAID ?? 0), hint: "UTR on the record" },
    ];

    async function run(label: string, action: () => Promise<unknown>, after?: string) {
        setBusy(true);
        try {
            await action();
            toast.success(label, after ? { description: after } : undefined);
            setActing(null);
            setText("");
            onChanged();
        } catch (cause) {
            if (isDecisionRefused(cause)) {
                toast.error(cause.message, { description: cause.status === 403 ? FOUR_EYES : undefined });
                if (cause.status === 409) onChanged();
            } else {
                toast.error(cause instanceof Error ? cause.message : "That did not go through.");
            }
        } finally {
            setBusy(false);
        }
    }

    const columns = React.useMemo<ColumnDef<RefundRequest>[]>(
        () => [
            {
                id: "amount",
                accessorKey: "amount",
                header: ({ column }) => <SortableHeader column={column}>Amount</SortableHeader>,
                sortingFn: (a, b) => compareMoney(a.original.amount, b.original.amount),
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <p className="font-medium tabular-nums text-foreground">{formatMoney(row.original.amount)}</p>
                        {/* E6: the row joins the wallet's owner, so the desk names them. */}
                        {row.original.advertiser ? (
                            <Link
                                href={`/advertisers/${row.original.advertiser.id}`}
                                className="block truncate text-xs text-foreground underline-offset-4 hover:underline"
                            >
                                {row.original.advertiser.name}
                            </Link>
                        ) : null}
                        <Link
                            href={`/finance/wallets/${row.original.walletId}`}
                            className="font-mono text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                            Wallet {shortId(row.original.walletId)}
                        </Link>
                    </div>
                ),
            },
            {
                id: "destination",
                accessorKey: "destination",
                header: "Goes to",
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <p className="text-foreground">{REFUND_DESTINATION_LABEL[row.original.destination]}</p>
                        {isCashDestination(row.original.destination) && (
                            <p className="text-[11px] text-muted-foreground">
                                {row.original.consentNote ? "Consent recorded" : "No consent note"}
                            </p>
                        )}
                    </div>
                ),
            },
            {
                id: "reason",
                accessorFn: (row) => `${REFUND_REASON_LABEL[row.reason]} ${row.note}`,
                header: "Why",
                cell: ({ row }) => (
                    <div className="min-w-0 max-w-[22rem]">
                        <p className="text-foreground">{REFUND_REASON_LABEL[row.original.reason]}</p>
                        <p className="truncate text-xs text-muted-foreground" title={row.original.note}>
                            {row.original.note}
                        </p>
                    </div>
                ),
            },
            {
                id: "createdAt",
                accessorKey: "createdAt",
                header: ({ column }) => <SortableHeader column={column}>Raised</SortableHeader>,
                cell: ({ row }) => (
                    <div className="min-w-0 whitespace-nowrap">
                        <p className="text-muted-foreground">{formatDate(row.original.createdAt)}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                            by {row.original.raisedByUserId === user?.id ? "you" : shortId(row.original.raisedByUserId)}
                        </p>
                    </div>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <StatusBadge status={REFUND_REQUEST_STATUS_META[row.original.status]} />
                        {row.original.railReference && (
                            <p className="mt-1 font-mono text-[11px] text-muted-foreground">UTR {row.original.railReference}</p>
                        )}
                        {row.original.decisionNote && !row.original.railReference && (
                            <p className="mt-1 max-w-[16rem] truncate text-[11px] text-muted-foreground" title={row.original.decisionNote}>
                                {row.original.decisionNote}
                            </p>
                        )}
                    </div>
                ),
            },
            {
                id: "actions",
                enableHiding: false,
                header: "",
                cell: ({ row }) => {
                    const allowed = refundRequestActions(row.original);
                    const own = row.original.raisedByUserId === user?.id;
                    if (allowed.decide) {
                        return (
                            <div className="flex justify-end" title={own ? FOUR_EYES : undefined}>
                                <Button
                                    size="sm"
                                    disabled={own}
                                    onClick={() => {
                                        setText("");
                                        setActing({ row: row.original, action: "decide" });
                                    }}
                                >
                                    Decide
                                </Button>
                            </div>
                        );
                    }
                    if (allowed.markPaid) {
                        const why = mayApprove ? undefined : "Needs the finance.approve permission.";
                        return (
                            <div className="flex items-center justify-end gap-1.5" title={why}>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="bg-card text-danger hover:text-danger"
                                    disabled={!mayApprove}
                                    onClick={() => {
                                        setText("");
                                        setActing({ row: row.original, action: "fail" });
                                    }}
                                >
                                    Fail
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={!mayApprove}
                                    onClick={() => {
                                        setText("");
                                        setActing({ row: row.original, action: "markPaid" });
                                    }}
                                >
                                    <Landmark className="mr-1 size-3.5" />
                                    Mark paid
                                </Button>
                            </div>
                        );
                    }
                    return (
                        <span className="block text-right text-xs text-muted-foreground">
                            {row.original.paidAt
                                ? formatDate(row.original.paidAt)
                                : row.original.decidedAt
                                  ? formatDate(row.original.decidedAt)
                                  : "—"}
                        </span>
                    );
                },
            },
        ],
        [mayApprove, user?.id]
    );

    const chips: FilterChip<RefundRequestStatus | "ALL">[] = [
        ...REFUND_REQUEST_STATUSES.map((value) => ({
            value,
            label: REFUND_REQUEST_STATUS_META[value].label,
            count: page.counts[value],
        })),
        { value: "ALL" as const, label: "All" },
    ];

    const selected = acting?.row ?? null;

    return (
        <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
                {kpis.map((stat) => (
                    <KpiCard key={stat.id} stat={stat} />
                ))}
            </div>

            <FilterChips<RefundRequestStatus | "ALL"> value={status} onChange={onStatusChange} chips={chips} />

            <DataTable
                columns={columns}
                data={page.items}
                searchPlaceholder="Search notes and reasons…"
                initialPageSize={20}
                emptyState={
                    <EmptyState
                        icon={Undo2}
                        title="Nothing in this queue"
                        description="A refund request is raised from an advertiser's wallet tab and arrives here frozen. None is waiting under this filter."
                    />
                }
            />

            {/* The decision: approve or refuse in one dialog, with the destination and its consequence in front of the person. */}
            <Dialog open={acting?.action === "decide"} onOpenChange={(open) => !open && setActing(null)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Decide this refund request</DialogTitle>
                        <DialogDescription>
                            {selected ? `${formatMoney(selected.amount)}, raised ${formatDateTime(selected.createdAt)}.` : ""}
                        </DialogDescription>
                    </DialogHeader>
                    {selected && (
                        <div className="space-y-4">
                            <dl className="space-y-2 text-sm">
                                <div className="flex items-start justify-between gap-4">
                                    <dt className="text-muted-foreground">Destination</dt>
                                    <dd className="text-right font-medium text-foreground">
                                        {REFUND_DESTINATION_LABEL[selected.destination]}
                                    </dd>
                                </div>
                                {selected.destination === "BANK_TRANSFER" && (
                                    <div className="flex items-start justify-between gap-4">
                                        <dt className="text-muted-foreground">Pays to</dt>
                                        <dd className="text-right font-mono text-xs text-foreground">
                                            {selected.payoutMethodId ? `Method ${shortId(selected.payoutMethodId)}` : "No method named"}
                                        </dd>
                                    </div>
                                )}
                                <div className="flex items-start justify-between gap-4">
                                    <dt className="text-muted-foreground">Reason</dt>
                                    <dd className="text-right text-foreground">{REFUND_REASON_LABEL[selected.reason]}</dd>
                                </div>
                            </dl>
                            <Card className="rounded-lg border-border bg-muted/40 p-3 shadow-none">
                                <p className="text-xs text-muted-foreground">{selected.note}</p>
                            </Card>
                            {isCashDestination(selected.destination) && (
                                <Card
                                    className={
                                        selected.consentNote
                                            ? "rounded-lg border-border p-3 shadow-none"
                                            : "rounded-lg border-danger/40 bg-danger-soft p-3 shadow-none"
                                    }
                                >
                                    <p className="text-xs font-medium text-foreground">Advertiser&apos;s consent to a cash refund</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {selected.consentNote ??
                                            "None recorded. A cash refund needs the advertiser's recorded agreement; the API will refuse this approval."}
                                    </p>
                                </Card>
                            )}
                            <p className="text-xs text-muted-foreground">{approvalConsequence(selected)}</p>
                            <div className="space-y-1.5">
                                <Label htmlFor="refund-decision-note">Decision note (optional)</Label>
                                <Textarea
                                    id="refund-decision-note"
                                    value={text}
                                    onChange={(event) => setText(event.target.value)}
                                    rows={2}
                                    maxLength={1000}
                                    placeholder="Kept on the request for whoever reads it later."
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setActing(null)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button
                            variant="outline"
                            className="text-danger hover:text-danger"
                            disabled={busy || !selected}
                            onClick={() =>
                                selected &&
                                void run("Refund refused", () =>
                                    refundsService.decideRefundRequest(selected.id, { approve: false, decisionNote: text })
                                , "The frozen amount is released back to the wallet's spendable balance.")
                            }
                        >
                            <X className="mr-1 size-3.5" />
                            Refuse
                        </Button>
                        <Button
                            disabled={busy || !selected || (isCashDestination(selected.destination) && !selected.consentNote)}
                            onClick={() =>
                                selected &&
                                void run(
                                    "Refund approved",
                                    () => refundsService.decideRefundRequest(selected.id, { approve: true, decisionNote: text }),
                                    selected.destination === "WALLET_CREDIT"
                                        ? "Credit is back in the advertiser's spendable balance."
                                        : "Debited from the wallet; mark it paid once the transfer is made."
                                )
                            }
                        >
                            <Check className="mr-1 size-3.5" />
                            Approve
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={acting?.action === "markPaid"}
                onOpenChange={(open) => !open && setActing(null)}
                title="Mark this refund paid?"
                description={`${formatMoney(selected?.amount)} has left ADX's bank account. The payables leg is discharged against cash; the UTR is what reconciliation matches the bank line to.`}
                confirmLabel="Mark paid"
                busy={busy}
                disabled={!text.trim()}
                onConfirm={() =>
                    selected && void run("Refund marked paid", () => refundsService.markRefundPaid(selected.id, text.trim()))
                }
            >
                <div className="space-y-1.5">
                    <Label htmlFor="refund-utr">UTR</Label>
                    <Input
                        id="refund-utr"
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        placeholder="The bank's reference for the transfer"
                        className="font-mono"
                        maxLength={120}
                    />
                </div>
            </ConfirmDialog>

            <ConfirmDialog
                open={acting?.action === "fail"}
                onOpenChange={(open) => !open && setActing(null)}
                title="Record the transfer as failed?"
                description={`${formatMoney(selected?.amount)} returns to the advertiser's wallet as a REFUND credit and the payables leg is reversed. The request stays on the record as failed.`}
                confirmLabel="Record failure"
                destructive
                busy={busy}
                disabled={!text.trim()}
                onConfirm={() => selected && void run("Transfer recorded as failed", () => refundsService.failRefund(selected.id, text.trim()))}
            >
                <div className="space-y-1.5">
                    <Label htmlFor="refund-fail-reason">Reason</Label>
                    <Textarea
                        id="refund-fail-reason"
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        rows={3}
                        maxLength={400}
                        placeholder="What the bank said — account closed, IFSC invalid…"
                    />
                </div>
            </ConfirmDialog>
        </div>
    );
}
