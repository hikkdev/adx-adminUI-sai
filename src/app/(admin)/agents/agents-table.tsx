"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable, SortableHeader, selectionColumn } from "@/components/adx/data-table";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { SuspendedChip } from "@/components/adx/suspended-chip";
import { formatDate } from "@/lib/format";
import { hoursLabel, tierLabel, workingDaysLabel } from "@/services/agents";
import { AGENT_STATUS_META, type Agent } from "@/types";
import { CreateAgentDialog } from "./create-agent-dialog";

interface AgentsTableProps {
    agents: Agent[];
    /** Refetch the roster, so a created agent appears without a reload. */
    onCreated: () => void;
}

/**
 * The roster, as `GET /agents` lists it.
 *
 * The wireframe's columns were Agent / Zone / Works from / Publishers / Orders
 * MTD / Status. Zone and works-from are real since D5 — the home zone and
 * territory ops records, and the days and hours the agent works; publishers
 * onboarded and orders this month are aggregates nothing computes, and stay
 * gone rather than filled with a figure about somebody's work that nothing
 * checked — the rule the orders board set. The zone-transfer and
 * payout-summary actions went with them: both were toasts over nothing.
 */
export function AgentsTable({ agents, onCreated }: AgentsTableProps) {
    const router = useRouter();
    const [creating, setCreating] = React.useState(false);

    const columns = React.useMemo<ColumnDef<Agent>[]>(
        () => [
            selectionColumn<Agent>(),
            {
                id: "agent",
                accessorFn: (agent) => agent.name ?? agent.mobile,
                header: ({ column }) => <SortableHeader column={column}>Agent</SortableHeader>,
                cell: ({ row }) => {
                    const label = row.original.name ?? row.original.mobile;
                    return (
                        <div className="flex items-center gap-2.5">
                            <InitialsAvatar name={label} size="sm" />
                            <div>
                                <p className="font-medium text-foreground">{label}</p>
                                <p className="text-xs text-muted-foreground">
                                    {row.original.displayId ?? "No identifier yet"}
                                </p>
                            </div>
                        </div>
                    );
                },
            },
            {
                id: "mobile",
                accessorKey: "mobile",
                header: "Mobile",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.mobile}</span>
                ),
            },
            {
                id: "city",
                accessorFn: (agent) => [agent.city, agent.state].filter(Boolean).join(", "),
                header: ({ column }) => <SortableHeader column={column}>City</SortableHeader>,
                cell: ({ row }) => {
                    const place = [row.original.city, row.original.state].filter(Boolean).join(", ");
                    return <span className="text-foreground">{place || "—"}</span>;
                },
            },
            {
                id: "zone",
                accessorFn: (agent) => agent.homeZone ?? agent.territory ?? "",
                header: ({ column }) => <SortableHeader column={column}>Zone</SortableHeader>,
                cell: ({ row }) => (
                    <div>
                        <p className="text-foreground">{row.original.homeZone ?? "—"}</p>
                        {row.original.territory && (
                            <p className="text-xs text-muted-foreground">{row.original.territory}</p>
                        )}
                    </div>
                ),
            },
            {
                id: "works",
                header: "Works",
                cell: ({ row }) => (
                    <div>
                        <p className="text-foreground">{workingDaysLabel(row.original.workingDays)}</p>
                        <p className="text-xs text-muted-foreground">
                            {hoursLabel(row.original.hoursFrom, row.original.hoursTo)}
                        </p>
                    </div>
                ),
            },
            {
                id: "tier",
                accessorKey: "tier",
                header: ({ column }) => <SortableHeader column={column}>Tier</SortableHeader>,
                cell: ({ row }) => tierLabel(row.original.tier, row.original.tierLevel),
            },
            {
                id: "joined",
                accessorKey: "joinedAt",
                header: ({ column }) => <SortableHeader column={column}>Joined</SortableHeader>,
                cell: ({ row }) => formatDate(row.original.joinedAt),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={AGENT_STATUS_META[row.original.status]} />
                        {/* Lot A: only BLOCK_NEW moves the profile status; a frozen
                            wallet or a blocked sign-in shows here and nowhere else on the row. */}
                        {row.original.status !== "suspended" && <SuspendedChip scopes={row.original.suspensionScopes} />}
                    </span>
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
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => router.push(`/agents/${row.original.id}`)}>
                                View details
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => router.push("/orders")}>
                                View orders
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
                    <>
                        {/* Lot D (Q131): the intake — submitted, reviewed, approved into an agent through the same door. */}
                        <Button variant="outline" className="bg-card" asChild>
                            <Link href="/onboarding/submissions?userType=AGENT">Onboard</Link>
                        </Button>
                        <Button onClick={() => setCreating(true)}>
                            <Plus className="mr-1.5 size-4" />
                            Add agent
                        </Button>
                    </>
                }
            />
            <DataTable
                columns={columns}
                data={agents}
                searchPlaceholder="Search agents by name, number or city"
                initialPageSize={10}
                onRowClick={(agent) => router.push(`/agents/${agent.id}`)}
            />
            <CreateAgentDialog open={creating} onOpenChange={setCreating} onCreated={onCreated} />
        </div>
    );
}
