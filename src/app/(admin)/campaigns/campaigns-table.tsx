"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { AuthorizeDialog } from "./authorize-dialog";
import { DataTable, SortableHeader, selectionColumn } from "@/components/adx/data-table";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatINR } from "@/lib/format";
import {
    CAMPAIGN_STATUSES,
    CAMPAIGN_STATUS_TONE,
    campaignService,
    campaignStatusLabel,
    flightLabel,
    spendShare,
    type CampaignRow,
    type CampaignStatus,
    type CampaignsPage,
} from "@/services/campaigns";

interface CampaignsTableProps {
    page: CampaignsPage;
    status: CampaignStatus | "ALL";
    onStatusChange: (status: CampaignStatus | "ALL") => void;
    onChanged: () => void;
}

export function CampaignsTable({ page, status, onStatusChange, onChanged }: CampaignsTableProps) {
    const router = useRouter();
    const [cancelTarget, setCancelTarget] = React.useState<CampaignRow | null>(null);
    const [busy, setBusy] = React.useState(false);

    /**
     * Launching a campaign commits money, so it goes through the real endpoint
     * with the reference typed back and, above the threshold, a second admin
     * (Lot C, Q88). The dialog is the one the campaign page uses.
     */
    const [authorizeTarget, setAuthorizeTarget] = React.useState<CampaignRow | null>(null);

    const columns = React.useMemo<ColumnDef<CampaignRow>[]>(
        () => [
            selectionColumn<CampaignRow>(),
            {
                id: "campaign",
                accessorKey: "name",
                header: ({ column }) => <SortableHeader column={column}>Campaign</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.brandName ?? row.original.name} size="sm" />
                        <div className="min-w-0">
                            <p className="font-medium text-foreground">{row.original.name}</p>
                            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                                {row.original.reference}
                            </p>
                        </div>
                    </div>
                ),
            },
            {
                id: "brand",
                accessorFn: (campaign) => campaign.brandName ?? "",
                header: "Brand",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.brandName ?? "—"}</span>
                ),
            },
            {
                id: "budget",
                accessorFn: (campaign) => Number(campaign.budget ?? 0),
                header: ({ column }) => <SortableHeader column={column}>Budget</SortableHeader>,
                cell: ({ row }) => {
                    const share = spendShare(row.original);
                    return (
                        <div className="min-w-[120px]">
                            <span className="font-medium">
                                {/* A draft has no budget yet. That is not zero. */}
                                {row.original.budget ? formatINR(Number(row.original.budget)) : "—"}
                            </span>
                            {share !== null && (
                                <>
                                    <div className="mt-1 h-1 w-full rounded-full bg-muted">
                                        <div
                                            className="h-1 rounded-full bg-primary"
                                            style={{ width: `${share}%` }}
                                        />
                                    </div>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                        {/* DR 06 draws this as "37% of ₹50,000". It is
                                            what the chosen spots come to, not money
                                            already spent — nothing meters delivery. */}
                                        {share}% committed
                                    </p>
                                </>
                            )}
                        </div>
                    );
                },
            },
            {
                id: "spots",
                accessorKey: "spotCount",
                header: "Spots",
                cell: ({ row }) => <span className="tabular-nums">{row.original.spotCount}</span>,
            },
            {
                id: "flight",
                accessorFn: (campaign) => campaign.endDate ?? "",
                header: ({ column }) => <SortableHeader column={column}>Flight</SortableHeader>,
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{flightLabel(row.original)}</span>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <StatusBadge
                        status={{
                            label: campaignStatusLabel(row.original.status),
                            tone: CAMPAIGN_STATUS_TONE[row.original.status],
                        }}
                    />
                ),
            },
            {
                id: "actions",
                enableHiding: false,
                size: 48,
                cell: ({ row }) => (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                                <MoreHorizontal className="size-4" />
                                <span className="sr-only">Row actions</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem
                                onSelect={() => router.push(`/campaigns/${row.original.id}`)}
                            >
                                Open campaign
                            </DropdownMenuItem>
                            {/* Only a campaign that has been paid for can launch;
                                offering it on a draft would be a button that
                                always fails. */}
                            {row.original.status === "PENDING_PAYMENT" ? (
                                <DropdownMenuItem disabled={busy} onSelect={() => setAuthorizeTarget(row.original)}>
                                    Authorise and launch
                                </DropdownMenuItem>
                            ) : null}
                            {row.original.status === "LIVE" || row.original.status === "SCHEDULED" ? (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        className="text-danger focus:text-danger"
                                        onSelect={() => setCancelTarget(row.original)}
                                    >
                                        Cancel campaign
                                    </DropdownMenuItem>
                                </>
                            ) : null}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ),
            },
        ],
        [router, busy],
    );

    const awaiting = page.counts.PENDING_PAYMENT ?? 0;
    const shown = page.items.length;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Campaigns"
                subtitle={
                    shown < page.total
                        ? `${awaiting} awaiting payment · showing the first ${shown} of ${page.total}`
                        : `${awaiting} awaiting payment · ${page.total} campaigns`
                }
                actions={
                    <Button asChild>
                        <Link href="/campaigns/new">
                            <Plus className="mr-1.5 size-4" />
                            New campaign
                        </Link>
                    </Button>
                }
            />
            <DataTable
                columns={columns}
                data={page.items}
                searchPlaceholder="Search campaigns, reference or brand"
                initialPageSize={10}
                onRowClick={(campaign) => router.push(`/campaigns/${campaign.id}`)}
                toolbar={
                    <Select
                        value={status}
                        onValueChange={(value) => onStatusChange(value as CampaignStatus | "ALL")}
                    >
                        <SelectTrigger className="h-9 w-[220px] bg-card">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Status: All ({page.total})</SelectItem>
                            {CAMPAIGN_STATUSES.map((value) => (
                                <SelectItem key={value} value={value}>
                                    {campaignStatusLabel(value)} ({page.counts[value] ?? 0})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                }
            />

            <AuthorizeDialog
                campaign={
                    authorizeTarget
                        ? { id: authorizeTarget.id, name: authorizeTarget.name, reference: authorizeTarget.reference, total: authorizeTarget.committed }
                        : null
                }
                onOpenChange={(open) => !open && setAuthorizeTarget(null)}
                onDone={() => {
                    setAuthorizeTarget(null);
                    onChanged();
                }}
            />
            <ConfirmDialog
                open={cancelTarget !== null}
                onOpenChange={(open) => !open && setCancelTarget(null)}
                title="Cancel this campaign?"
                description="The booked spots are released and the advertiser is told. Money already committed is refunded through the wallet, which finance releases separately."
                confirmLabel="Cancel campaign"
                destructive
                onConfirm={async () => {
                    const target = cancelTarget;
                    setCancelTarget(null);
                    if (!target) return;
                    try {
                        await campaignService.cancel(target.id, "Cancelled by ADX from the console");
                        toast.success(`${target.name} cancelled`);
                        onChanged();
                    } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Could not cancel it");
                    }
                }}
            >
                <p className="text-xs text-muted-foreground">
                    The unused days are recorded as a pending campaign refund. Finance releases or refuses
                    it at the{" "}
                    <Link href="/finance/refunds" className="underline underline-offset-4">
                        refund desk
                    </Link>
                    .
                </p>
            </ConfirmDialog>
        </div>
    );
}
