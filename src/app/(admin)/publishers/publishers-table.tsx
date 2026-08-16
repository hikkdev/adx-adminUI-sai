"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus, Tag } from "lucide-react";
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
import { DataTable, SortableHeader, selectionColumn } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { CreatePublisherDialog } from "./create-publisher-dialog";
import { KYC_STATUS_META, type KycStatus, type Publisher } from "@/types";

interface PublishersTableProps {
    publishers: Publisher[];
}

export function PublishersTable({ publishers }: PublishersTableProps) {
    const router = useRouter();
    const [createOpen, setCreateOpen] = React.useState(false);
    const [kycFilter, setKycFilter] = React.useState<KycStatus | "all">("all");
    const [suspendTarget, setSuspendTarget] = React.useState<Publisher | null>(null);

    const filtered = React.useMemo(
        () =>
            kycFilter === "all"
                ? publishers
                : publishers.filter((publisher) => publisher.kycStatus === kycFilter),
        [publishers, kycFilter]
    );

    const columns = React.useMemo<ColumnDef<Publisher>[]>(
        () => [
            selectionColumn<Publisher>(),
            {
                id: "name",
                accessorKey: "name",
                header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.name} size="sm" />
                        <span className="font-medium text-foreground">{row.original.name}</span>
                    </div>
                ),
            },
            {
                id: "owner",
                accessorKey: "owner",
                header: "Owner",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.owner}</span>
                ),
            },
            {
                id: "kyc-status",
                accessorKey: "kycStatus",
                header: "KYC status",
                cell: ({ row }) => <StatusBadge status={KYC_STATUS_META[row.original.kycStatus]} />,
            },
            {
                id: "last-active",
                accessorKey: "lastActive",
                header: "Last active",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.lastActive}</span>
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
                                onSelect={() => router.push(`/publishers/${row.original.id}`)}
                            >
                                View details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={() =>
                                    toast.success(`KYC reminder sent to ${row.original.owner}`)
                                }
                            >
                                Send KYC reminder
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => router.push("/kyc")}>
                                Review KYC
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="text-danger focus:text-danger"
                                onSelect={() => setSuspendTarget(row.original)}
                            >
                                Suspend account
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ),
            },
        ],
        [router]
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="Publishers"
                actions={
                    <>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon" className="size-9 bg-card">
                                    <MoreHorizontal className="size-4" />
                                    <span className="sr-only">More actions</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    onSelect={() => toast.success("Publisher list exported as CSV")}
                                >
                                    Export CSV
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => router.push("/publishers/import")}>
                                    Import publishers
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button onClick={() => setCreateOpen(true)}>
                            <Plus className="mr-1.5 size-4" />
                            Add publisher
                        </Button>
                    </>
                }
            />

            <DataTable
                columns={columns}
                data={filtered}
                searchPlaceholder="Search publishers, PAN, GSTIN"
                initialPageSize={10}
                onRowClick={(publisher) => router.push(`/publishers/${publisher.id}`)}
                toolbar={
                    <Select
                        value={kycFilter}
                        onValueChange={(value) => setKycFilter(value as KycStatus | "all")}
                    >
                        <SelectTrigger className="h-9 w-[170px] bg-card">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">KYC: All</SelectItem>
                            <SelectItem value="verified">Verified</SelectItem>
                            <SelectItem value="under_review">Under review</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                        </SelectContent>
                    </Select>
                }
                bulkActions={(rows, clear) => (
                    <>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => {
                                toast.success(`KYC reminder sent to ${rows.length} publishers`);
                                clear();
                            }}
                        >
                            Send KYC reminder
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-danger hover:text-danger"
                            onClick={() => {
                                toast.success(`${rows.length} accounts suspended`);
                                clear();
                            }}
                        >
                            Suspend selected
                        </Button>
                    </>
                )}
                emptyState={
                    <EmptyState
                        icon={Tag}
                        title="No publishers yet"
                        description="Publishers will appear here once they sign up or are added by an agent."
                        action={
                            <Button onClick={() => setCreateOpen(true)}>
                                <Plus className="mr-1.5 size-4" />
                                Add publisher
                            </Button>
                        }
                    />
                }
            />

            <CreatePublisherDialog open={createOpen} onOpenChange={setCreateOpen} />

            <ConfirmDialog
                open={suspendTarget !== null}
                onOpenChange={(open) => !open && setSuspendTarget(null)}
                title="Suspend account?"
                description="Access removal begins immediately. Existing payouts continue to process, and access can be restored within 30 days."
                confirmLabel="Suspend account"
                destructive
                onConfirm={() => {
                    toast.success(`${suspendTarget?.name} suspended`);
                    setSuspendTarget(null);
                }}
            />
        </div>
    );
}
