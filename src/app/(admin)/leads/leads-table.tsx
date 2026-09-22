"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus, Upload } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { compareMoney, formatINR } from "@/lib/format";
import { agentLabel, type AgentSummary } from "@/services/agents";
import {
    LEAD_SIDE_LABEL,
    LEAD_STATUSES,
    LEAD_TEMPERATURES,
    STAGE_META,
    TEMPERATURE_META,
    daysInStage,
    stageRank,
    temperatureMeta,
    type LeadTemperature,
    assignedLabel,
    isUnassigned,
    leadStatusLabel,
    leadsService,
    whereLabel,
    type Lead,
    type LeadStatus,
    type LeadsPage,
} from "@/services/leads";
import { ConvertLeadDialog, CreateLeadDialog, ImportLeadsDialog } from "./leads-dialogs";
import { LostDialog } from "./lost-dialog";

interface LeadsTableProps {
    page: LeadsPage;
    status: LeadStatus | "ALL";
    onStatusChange: (status: LeadStatus | "ALL") => void;
    /** LH1: the temperature facet. */
    temperature: LeadTemperature | "ALL";
    onTemperatureChange: (temperature: LeadTemperature | "ALL") => void;
    unassignedOnly: boolean;
    onUnassignedOnlyChange: (value: boolean) => void;
    /** The roster, for naming the assignee and filling the Assign dialog. */
    agents: AgentSummary[];
    onChanged: () => void;
}

/**
 * The value the Assign dialog uses for "nobody".
 *
 * A Radix Select item may not have an empty string as its value, and the field
 * it writes is nullable, so the empty choice needs a sentinel of its own rather
 * than borrowing "".
 */
const OPEN_POOL = "__open_pool__";

export function LeadsTable({
    page,
    status,
    onStatusChange,
    temperature,
    onTemperatureChange,
    unassignedOnly,
    onUnassignedOnlyChange,
    agents,
    onChanged,
}: LeadsTableProps) {
    const [assignTarget, setAssignTarget] = React.useState<Lead | null>(null);
    const [assignChoice, setAssignChoice] = React.useState<string>("");
    const [lostTarget, setLostTarget] = React.useState<Lead | null>(null);
    const [convertTarget, setConvertTarget] = React.useState<Lead | null>(null);
    const [importing, setImporting] = React.useState(false);
    const [creating, setCreating] = React.useState(false);

    /** Agent id → how the console says their name, for the Assigned column. */
    const agentNames = React.useMemo(
        () => new Map(agents.map((agent) => [agent.id, agentLabel(agent)])),
        [agents],
    );

    /* No selection column. The listings and campaigns tables carry one, but
       neither this desk nor those two has a bulk action behind it, and a
       checkbox that can never do anything is a control offering work it cannot
       perform — the same coupling `DataTable` enforces in the other direction
       when it adds the column for a caller who passes `bulkActions`. Everything
       the desk can do to a lead is in the row menu. */
    const columns = React.useMemo<ColumnDef<Lead>[]>(
        () => [
            {
                id: "business",
                accessorKey: "businessName",
                header: ({ column }) => <SortableHeader column={column}>Business</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.businessName} size="sm" />
                        <div className="min-w-0">
                            <Link
                                href={`/leads/${row.original.id}`}
                                className="font-medium text-foreground underline-offset-4 hover:underline"
                            >
                                {row.original.businessName}
                            </Link>
                            <p className="text-[11px] text-muted-foreground">
                                <span className="font-mono tabular-nums">{row.original.displayId}</span>
                                {/* Which side of the marketplace this shop would
                                    join. Nothing else on the row says, and a
                                    publisher lead and an advertiser lead are
                                    worked by different agents. */}
                                {" · "}
                                {LEAD_SIDE_LABEL[row.original.side]}
                            </p>
                        </div>
                    </div>
                ),
            },
            {
                id: "category",
                accessorFn: (lead) => lead.category ?? "",
                header: "Category",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {/* Printed as the API stores it. Title-casing it here
                            would be the console inventing a vocabulary the
                            rest of the platform does not share. */}
                        {row.original.category ?? "—"}
                    </span>
                ),
            },
            {
                id: "where",
                accessorFn: (lead) => whereLabel(lead),
                header: "Where",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{whereLabel(row.original)}</span>
                ),
            },
            {
                id: "assigned",
                accessorFn: (lead) => assignedLabel(lead),
                header: "Assigned",
                cell: ({ row }) => {
                    const id = row.original.assignedAgentId;
                    if (id === null) {
                        // A real state, said in words: any agent in range may
                        // take this one. A blank cell would read as missing data.
                        return (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                Open pool
                            </span>
                        );
                    }
                    // `GET /leads` joins no agent, so the name comes from the
                    // roster when it loaded and the id stands in when it did not.
                    const name = agentNames.get(id);
                    return name ? (
                        <span className="text-foreground">{name}</span>
                    ) : (
                        <span className="font-mono text-[11px] text-muted-foreground">{id}</span>
                    );
                },
            },
            {
                id: "estimate",
                accessorFn: (lead) => lead.estimatedCommission ?? "",
                header: ({ column }) => (
                    <SortableHeader column={column}>Est. commission</SortableHeader>
                ),
                // Sorted in whole paise rather than by turning two decimal
                // strings into floats, which is the one arithmetic this column
                // does and the one place a float would round the order wrong.
                sortingFn: (a, b) =>
                    compareMoney(a.original.estimatedCommission, b.original.estimatedCommission),
                cell: ({ row }) => (
                    <div className="min-w-[110px]">
                        <span className="font-medium">
                            {/* Null is nobody having estimated it, which is not
                                zero — and this is the column the desk sorts the
                                day's work by. `Number` appears here and nowhere
                                else: the value is a string everywhere it is
                                stored, compared or sent. */}
                            {row.original.estimatedCommission === null
                                ? "—"
                                : formatINR(Number(row.original.estimatedCommission))}
                        </span>
                        {row.original.visitBooked && (
                            <p className="mt-0.5 text-[11px] font-medium text-success">
                                {/* Said beside the money on purpose: a booked
                                    visit is what turns an estimate into a
                                    figure worth reading. */}
                                Visit booked
                            </p>
                        )}
                    </div>
                ),
            },
            {
                id: "temperature",
                accessorFn: (lead) => lead.score ?? -1,
                header: ({ column }) => <SortableHeader column={column}>Temperature</SortableHeader>,
                cell: ({ row }) => {
                    // LH1: the computed temperature with its score; the value
                    // under it is what the business is worth to ADX, not the fee.
                    const meta = temperatureMeta(row.original.temperature);
                    return (
                        <div className="min-w-[120px]">
                            <div className="flex items-center gap-1.5">
                                <StatusBadge status={meta} />
                                {typeof row.original.score === "number" && <span className="text-xs tabular-nums text-muted-foreground">{row.original.score}</span>}
                            </div>
                            {row.original.estimatedValue && (
                                <p className="mt-0.5 text-[11px] text-muted-foreground">Worth {formatINR(Number(row.original.estimatedValue))}</p>
                            )}
                        </div>
                    );
                },
            },
            {
                id: "stage",
                accessorFn: (lead) => (lead.stage ? stageRank(lead.stage) : -1),
                header: ({ column }) => <SortableHeader column={column}>Stage</SortableHeader>,
                cell: ({ row }) => {
                    // LH2: where the deal is, and how long it has sat there.
                    const stage = row.original.stage;
                    if (!stage) return <span className="text-muted-foreground">—</span>;
                    const days = daysInStage(row.original.stageChangedAt);
                    return (
                        <div className="min-w-[110px]">
                            <StatusBadge status={STAGE_META[stage]} />
                            {days !== null && <p className="mt-0.5 text-[11px] text-muted-foreground">{days === 0 ? "today" : `${days} d here`}</p>}
                        </div>
                    );
                },
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    // The badge the API sent. The console does not keep its own
                    // opinion of what a HOT lead should say.
                    <StatusBadge status={row.original.pill} />
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
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem asChild>
                                <Link href={`/leads/${row.original.id}`}>Open</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={() => {
                                    setAssignChoice(row.original.assignedAgentId ?? "");
                                    setAssignTarget(row.original);
                                }}
                            >
                                {isUnassigned(row.original) ? "Assign to an agent" : "Reassign"}
                            </DropdownMenuItem>
                            {/* A converted lead is finished, and the API refuses
                                to move one; offering the action would be a
                                button that always fails. */}
                            {row.original.status === "CONVERTED" ||
                            row.original.status === "LOST" ? null : (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={() => setConvertTarget(row.original)}>
                                        Convert to an account
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        className="text-danger focus:text-danger"
                                        onSelect={() => setLostTarget(row.original)}
                                    >
                                        Close as lost
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ),
            },
        ],
        [agentNames],
    );

    const shown = page.items.length;
    const hot = page.counts.HOT ?? 0;
    /* `total` is the server's count under the filters in force, so it is the
       real size of the open pool when the toggle is on rather than however
       much of it fitted on this page. */
    const scope = unassignedOnly ? "in the open pool" : "leads";

    return (
        <div className="space-y-5">
            <PageHeader
                title="Leads"
                subtitle={
                    shown < page.total
                        ? `${hot} hot · showing the first ${shown} of ${page.total} ${scope} — narrow the status to see the rest`
                        : `${hot} hot · ${page.total} ${scope}`
                }
                actions={
                    <>
                        <Button variant="outline" className="bg-card" onClick={() => setImporting(true)}>
                            <Upload className="mr-1.5 size-4" aria-hidden />
                            Import
                        </Button>
                        <Button onClick={() => setCreating(true)}>
                            <Plus className="mr-1.5 size-4" aria-hidden />
                            Create lead
                        </Button>
                    </>
                }
            />
            <DataTable
                columns={columns}
                data={page.items}
                searchPlaceholder="Search business, locality or city"
                initialPageSize={10}
                toolbar={
                    <>
                        <Select
                            value={status}
                            onValueChange={(value) => onStatusChange(value as LeadStatus | "ALL")}
                        >
                            <SelectTrigger className="h-9 w-[220px] bg-card">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Status: All ({page.total})</SelectItem>
                                {LEAD_STATUSES.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {/* The count comes from the server and is
                                            computed without this filter, so every
                                            option can say how many it would show. */}
                                        {leadStatusLabel(value)} ({page.counts[value] ?? 0})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={temperature} onValueChange={(value) => onTemperatureChange(value as LeadTemperature | "ALL")}>
                            <SelectTrigger className="h-9 w-[190px] bg-card" aria-label="Temperature">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Temperature: All</SelectItem>
                                {LEAD_TEMPERATURES.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {TEMPERATURE_META[value].label} ({page.temperatureCounts?.[value] ?? 0})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="flex h-9 items-center gap-2 rounded-md border bg-card px-3">
                            <Switch
                                id="leads-unassigned-only"
                                checked={unassignedOnly}
                                onCheckedChange={onUnassignedOnlyChange}
                            />
                            <Label
                                htmlFor="leads-unassigned-only"
                                className="cursor-pointer text-sm font-normal text-muted-foreground"
                            >
                                Unassigned only
                            </Label>
                        </div>
                    </>
                }
            />

            <ConfirmDialog
                open={assignTarget !== null}
                onOpenChange={(open) => !open && setAssignTarget(null)}
                title={assignTarget ? `Put an agent on ${assignTarget.businessName}?` : "Assign lead"}
                description="The agent sees it in their own list and can call, book a visit or convert it. Returning a lead to the open pool leaves it for whoever is nearest."
                confirmLabel="Save assignment"
                disabled={assignChoice === ""}
                onConfirm={async () => {
                    const target = assignTarget;
                    const choice = assignChoice;
                    setAssignTarget(null);
                    if (!target || choice === "") return;
                    const agentId = choice === OPEN_POOL ? null : choice;
                    try {
                        await leadsService.assign(target.id, agentId);
                        // Said only after the API answered. A toast for a write
                        // that did not happen is how a desk loses a lead.
                        toast.success(
                            agentId === null
                                ? `${target.businessName} returned to the open pool`
                                : `${target.businessName} assigned to ${agentNames.get(agentId) ?? agentId}`,
                        );
                        onChanged();
                    } catch (error) {
                        toast.error(
                            error instanceof Error ? error.message : "Could not assign this lead",
                        );
                    }
                }}
            >
                <div className="space-y-2">
                    <Label htmlFor="leads-assign-agent">Agent</Label>
                    <Select value={assignChoice} onValueChange={setAssignChoice}>
                        <SelectTrigger id="leads-assign-agent" className="h-9">
                            <SelectValue placeholder="Pick an agent" />
                        </SelectTrigger>
                        <SelectContent>
                            {/* Only offered on a lead that is currently somebody's.
                                On an open one it would be a no-op. */}
                            {assignTarget && !isUnassigned(assignTarget) && (
                                <SelectItem value={OPEN_POOL}>Return to the open pool</SelectItem>
                            )}
                            {agents.map((agent) => (
                                <SelectItem key={agent.id} value={agent.id}>
                                    {agentLabel(agent)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {agents.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                            The agent roster did not load, so there is nobody to pick. Reload the
                            page and try again.
                        </p>
                    )}
                </div>
            </ConfirmDialog>

            <ImportLeadsDialog open={importing} onOpenChange={setImporting} onImported={onChanged} />
            <CreateLeadDialog open={creating} onOpenChange={setCreating} agents={agents} onCreated={onChanged} />
            <ConvertLeadDialog
                lead={convertTarget}
                onOpenChange={(open) => !open && setConvertTarget(null)}
                onConverted={onChanged}
            />

            {/* LH2 (D11): a loss carries its reason. */}
            <LostDialog lead={lostTarget} onOpenChange={(open) => !open && setLostTarget(null)} onLost={onChanged} />
        </div>
    );
}
