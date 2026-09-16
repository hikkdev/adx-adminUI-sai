"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { compareMoney, formatDate, formatMoney } from "@/lib/format";
import {
    growthService,
    milestoneTypeLabel,
    targetLabel,
    unlockLabel,
    windowLabel,
    type TemplateRow,
} from "@/services/growth";
import { GROWTH_SUBTITLE, GROWTH_TITLE, GrowthNav } from "./growth-nav";
import { NewMilestoneDialog } from "./new-milestone-dialog";

interface GrowthViewProps {
    templates: TemplateRow[];
    /** Refetches the list after a write actually lands. */
    onChanged: () => void;
}

/**
 * The Growth CMS, live — the DR 10 frame's table over the real contract.
 *
 * The frame draws Milestone · Audience · Reward · Enrolled · Completed ·
 * Status. Three of those columns describe things the backend does not have
 * (see `services/growth.ts`), so the table shows what a template actually
 * is: its order on the board, its title, what it counts, the target in that
 * unit, the reward, how long it runs, when it starts, what unlocks it, and
 * whether it is on. The Active switch PATCHes and is optimistic about it —
 * it moves at once and moves back if the server refuses — with the toast
 * said only once the write landed.
 */
export function GrowthView({ templates, onChanged }: GrowthViewProps) {
    const router = useRouter();
    const [creating, setCreating] = React.useState(false);

    const nextSortOrder = templates.reduce((max, template) => Math.max(max, template.sortOrder + 1), 0);

    const columns = React.useMemo<ColumnDef<TemplateRow>[]>(
        () => [
            {
                id: "order",
                accessorKey: "sortOrder",
                header: ({ column }) => <SortableHeader column={column}>Order</SortableHeader>,
                cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.sortOrder}</span>,
            },
            {
                id: "title",
                accessorKey: "title",
                header: ({ column }) => <SortableHeader column={column}>Title</SortableHeader>,
                cell: ({ row }) => (
                    <div className="min-w-0 max-w-[22rem]">
                        <p className="font-medium text-foreground">{row.original.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{row.original.description}</p>
                    </div>
                ),
            },
            {
                id: "type",
                accessorKey: "type",
                header: "Type",
                cell: ({ row }) => <span className="text-muted-foreground">{milestoneTypeLabel(row.original.type)}</span>,
            },
            {
                id: "target",
                accessorKey: "target",
                header: ({ column }) => <SortableHeader column={column}>Target</SortableHeader>,
                cell: ({ row }) => <span className="tabular-nums">{targetLabel(row.original.type, row.original.target)}</span>,
            },
            {
                id: "reward",
                accessorKey: "rewardAmount",
                header: ({ column }) => <SortableHeader column={column}>Reward</SortableHeader>,
                sortingFn: (a, b) => compareMoney(a.original.rewardAmount, b.original.rewardAmount),
                cell: ({ row }) => <span className="font-medium tabular-nums">{formatMoney(row.original.rewardAmount)}</span>,
            },
            {
                id: "window",
                accessorKey: "windowDays",
                header: "Window",
                cell: ({ row }) => <span className="text-muted-foreground">{windowLabel(row.original.windowDays)}</span>,
            },
            {
                id: "starts",
                accessorKey: "startsAt",
                header: "Starts",
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-muted-foreground">
                        {row.original.startsAt ? formatDate(row.original.startsAt) : "—"}
                    </span>
                ),
            },
            {
                id: "unlock",
                accessorKey: "unlockAfter",
                header: "Unlock after",
                cell: ({ row }) => <span className="text-muted-foreground">{unlockLabel(row.original.unlockAfter)}</span>,
            },
            {
                id: "active",
                accessorKey: "isActive",
                header: "Active",
                enableHiding: false,
                cell: ({ row }) => <ActiveSwitch template={row.original} onChanged={onChanged} />,
            },
        ],
        [onChanged],
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title={GROWTH_TITLE}
                subtitle={GROWTH_SUBTITLE}
                actions={
                    <Button onClick={() => setCreating(true)}>
                        <Plus className="mr-1.5 size-4" />
                        New milestone
                    </Button>
                }
            />
            <GrowthNav />
            <DataTable
                columns={columns}
                data={templates}
                searchPlaceholder="Search milestones"
                initialPageSize={10}
                onRowClick={(template) => router.push(`/growth/${template.id}`)}
                emptyState={
                    <EmptyState
                        icon={Sparkles}
                        title="No milestones yet"
                        description="A milestone is a target every agent can work toward and a reward recorded when they claim it. The first one goes on every board the moment it is switched on."
                        action={
                            <Button onClick={() => setCreating(true)}>
                                <Plus className="mr-1.5 size-4" />
                                New milestone
                            </Button>
                        }
                    />
                }
            />
            <NewMilestoneDialog
                open={creating}
                onOpenChange={setCreating}
                defaultSortOrder={nextSortOrder}
                onCreated={onChanged}
            />
        </div>
    );
}

/**
 * The switch's optimistic position, kept beside the switch so the column
 * definitions stay stable and the row is not rebuilt under the pointer.
 *
 * `base` is what the server held when the switch was moved: the optimistic
 * value shows only while the row still says that, so once the refetch after
 * a save lands the server's own value takes over, and a refusal clears it.
 */
function ActiveSwitch({ template, onChanged }: { template: TemplateRow; onChanged: () => void }) {
    const [optimistic, setOptimistic] = React.useState<{ value: boolean; base: boolean } | null>(null);
    const checked = optimistic && optimistic.base === template.isActive ? optimistic.value : template.isActive;

    async function toggle(isActive: boolean) {
        setOptimistic({ value: isActive, base: template.isActive });
        try {
            const saved = await growthService.patchTemplate(template.id, { isActive });
            toast.success(`${saved.title} switched ${saved.isActive ? "on" : "off"}`, {
                description: saved.isActive
                    ? "It appears on every agent's board from their next read."
                    : "It leaves every agent's board; rows already completed keep their claim.",
            });
            onChanged();
        } catch (cause) {
            setOptimistic(null);
            toast.error(cause instanceof Error ? cause.message : "Could not change that milestone.");
        }
    }

    return (
        <Switch
            checked={checked}
            aria-label={`${template.title} active`}
            onCheckedChange={(next) => void toggle(next)}
        />
    );
}
