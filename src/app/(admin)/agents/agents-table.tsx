"use client";

import * as React from "react";
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
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { DataTable, SortableHeader, selectionColumn } from "@/components/adx/data-table";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { AGENT_STATUS_META, type Agent } from "@/types";

interface AgentsTableProps {
    agents: Agent[];
}

const ZONES = [
    "South Bengaluru",
    "North Bengaluru",
    "Mumbai West",
    "Delhi NCR",
    "Chennai Central",
    "Hyderabad East",
    "Pune City",
    "Kochi Metro",
];

export function AgentsTable({ agents: seed }: AgentsTableProps) {
    const router = useRouter();
    const [agents, setAgents] = React.useState(seed);
    const [transferId, setTransferId] = React.useState<string | null>(null);
    const [targetZone, setTargetZone] = React.useState(ZONES[0]);

    const transferring = agents.find((agent) => agent.id === transferId) ?? null;

    const applyTransfer = () => {
        if (!transferring) return;
        const previous = agents;
        setAgents((current) =>
            current.map((agent) =>
                agent.id === transferring.id ? { ...agent, zone: targetZone } : agent
            )
        );
        setTransferId(null);
        toast.success(`${transferring.name} moved to ${targetZone}`, {
            action: { label: "Undo", onClick: () => setAgents(previous) },
        });
    };

    const columns = React.useMemo<ColumnDef<Agent>[]>(
        () => [
            selectionColumn<Agent>(),
            {
                id: "agent",
                accessorKey: "name",
                header: ({ column }) => <SortableHeader column={column}>Agent</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.name} size="sm" />
                        <span className="font-medium text-foreground">{row.original.name}</span>
                    </div>
                ),
            },
            {
                id: "zone",
                accessorKey: "zone",
                header: ({ column }) => <SortableHeader column={column}>Zone</SortableHeader>,
                cell: ({ row }) => (
                    <span className="font-medium text-foreground">{row.original.zone}</span>
                ),
            },
            {
                id: "works-from",
                accessorKey: "worksFrom",
                header: "Works from",
                cell: ({ row }) => (
                    <div>
                        <p className="text-foreground">{row.original.worksFrom}</p>
                        <p className="text-xs text-muted-foreground">
                            {row.original.area}, {row.original.city}
                        </p>
                    </div>
                ),
            },
            {
                id: "publishers",
                accessorKey: "publishersOnboarded",
                header: ({ column }) => <SortableHeader column={column}>Publishers</SortableHeader>,
                cell: ({ row }) => row.original.publishersOnboarded,
            },
            {
                id: "orders-mtd",
                accessorKey: "ordersCompleted",
                header: ({ column }) => <SortableHeader column={column}>Orders MTD</SortableHeader>,
                cell: ({ row }) => row.original.ordersCompleted,
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => <StatusBadge status={AGENT_STATUS_META[row.original.status]} />,
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
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => router.push(`/agents/${row.original.id}`)}>
                                View details
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => router.push("/orders")}>
                                View orders
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={() => {
                                    setTargetZone(
                                        ZONES.find((zone) => zone !== row.original.zone) ?? ZONES[0]
                                    );
                                    setTransferId(row.original.id);
                                }}
                            >
                                Transfer zone
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={() => toast.success(`Payout summary sent to ${row.original.name}`)}
                            >
                                Send payout summary
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
                title="Agents"
                actions={
                    <Button onClick={() => toast.info("Agents are onboarded through the ADX field app.")}>
                        <Plus className="mr-1.5 size-4" />
                        Add agent
                    </Button>
                }
            />
            <DataTable
                columns={columns}
                data={agents}
                searchPlaceholder="Search agents, territory, phone"
                initialPageSize={10}
                onRowClick={(agent) => router.push(`/agents/${agent.id}`)}
            />

            <Dialog open={transferId !== null} onOpenChange={(open) => !open && setTransferId(null)}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Transfer {transferring?.name}</DialogTitle>
                        <DialogDescription>
                            Current zone: {transferring?.zone}. Open orders stay with the agent.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-1.5 py-1">
                        <Label htmlFor="agent-zone">Move to</Label>
                        <Select value={targetZone} onValueChange={setTargetZone}>
                            <SelectTrigger id="agent-zone">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {ZONES.filter((zone) => zone !== transferring?.zone).map((zone) => (
                                    <SelectItem key={zone} value={zone}>
                                        {zone}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="bg-card" onClick={() => setTransferId(null)}>
                            Cancel
                        </Button>
                        <Button onClick={applyTransfer}>Transfer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
