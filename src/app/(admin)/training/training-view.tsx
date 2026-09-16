"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, GraduationCap, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import {
    durationLabel,
    nextOrdinal,
    passesForFree,
    trainingService,
    unlockAfterLabel,
    type ModuleRow,
} from "@/services/training";
import { NewModuleDialog } from "./new-module-dialog";
import { TRAINING_SUBTITLE, TRAINING_TITLE, TrainingNav } from "./training-nav";

interface TrainingViewProps {
    modules: ModuleRow[];
    /** Refetches the list after a write actually lands. */
    onChanged: () => void;
}

/**
 * The modules table — no DR 10 frame, so the Growth CMS's table over the
 * real contract: order, title, duration, the question count, the pass mark,
 * what unlocks it, and whether it is on.
 *
 * The question count is the column that matters. An ACTIVE module with no
 * questions is on every agent's index and counted as passed for the
 * certificate — so it is called out in red rather than shown as a quiet 0.
 * The Active switch PATCHes and is optimistic about it — it moves at once
 * and moves back if the server refuses — with the toast said only once the
 * write landed.
 */
export function TrainingView({ modules, onChanged }: TrainingViewProps) {
    const router = useRouter();
    const [creating, setCreating] = React.useState(false);

    const columns = React.useMemo<ColumnDef<ModuleRow>[]>(
        () => [
            {
                id: "order",
                accessorKey: "ordinal",
                header: ({ column }) => <SortableHeader column={column}>Order</SortableHeader>,
                cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.ordinal}</span>,
            },
            {
                id: "title",
                accessorKey: "title",
                header: ({ column }) => <SortableHeader column={column}>Title</SortableHeader>,
                cell: ({ row }) => (
                    <div className="min-w-0 max-w-[24rem]">
                        <p className="font-medium text-foreground">{row.original.title}</p>
                        {row.original.summary && (
                            <p className="truncate text-xs text-muted-foreground">{row.original.summary}</p>
                        )}
                    </div>
                ),
            },
            {
                id: "duration",
                accessorKey: "durationMins",
                header: ({ column }) => <SortableHeader column={column}>Duration</SortableHeader>,
                cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{durationLabel(row.original.durationMins)}</span>,
            },
            {
                id: "questions",
                accessorKey: "questionCount",
                header: ({ column }) => <SortableHeader column={column}>Questions</SortableHeader>,
                cell: ({ row }) =>
                    passesForFree(row.original) ? (
                        <span className="inline-flex items-center gap-1 text-danger" title="Active with no questions: every agent passes it for free">
                            <AlertTriangle className="size-3.5" aria-hidden />
                            <span className="tabular-nums">0</span>
                            <span className="text-xs">no quiz</span>
                        </span>
                    ) : (
                        <span className="tabular-nums">{row.original.questionCount}</span>
                    ),
            },
            {
                id: "pass",
                accessorKey: "passPercent",
                header: "Pass mark",
                cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.passPercent}%</span>,
            },
            {
                id: "unlock",
                accessorKey: "unlockAfterOrdinal",
                header: "Unlock after",
                cell: ({ row }) => <span className="text-muted-foreground">{unlockAfterLabel(row.original.unlockAfterOrdinal)}</span>,
            },
            {
                id: "active",
                accessorKey: "isActive",
                header: "Active",
                enableHiding: false,
                cell: ({ row }) => <ActiveSwitch module={row.original} onChanged={onChanged} />,
            },
        ],
        [onChanged],
    );

    const active = modules.filter((module) => module.isActive).length;
    const empty = modules.filter(passesForFree).length;
    const subtitle = empty
        ? `${active} active of ${modules.length} · ${empty} active with no quiz`
        : `${active} active of ${modules.length}`;

    return (
        <div className="space-y-5">
            <PageHeader
                title={TRAINING_TITLE}
                subtitle={modules.length ? subtitle : TRAINING_SUBTITLE}
                actions={
                    <Button onClick={() => setCreating(true)}>
                        <Plus className="mr-1.5 size-4" />
                        New module
                    </Button>
                }
            />
            <TrainingNav />
            <DataTable
                columns={columns}
                data={modules}
                searchPlaceholder="Search modules"
                initialPageSize={10}
                onRowClick={(module) => router.push(`/training/${module.id}`)}
                emptyState={
                    <EmptyState
                        icon={GraduationCap}
                        title="No modules yet"
                        description="A module is a lesson with a quiz. Every active module is on every agent's index, and the certificate is minted the moment the last one is passed."
                        action={
                            <Button onClick={() => setCreating(true)}>
                                <Plus className="mr-1.5 size-4" />
                                New module
                            </Button>
                        }
                    />
                }
            />
            <NewModuleDialog
                open={creating}
                onOpenChange={setCreating}
                defaultOrdinal={nextOrdinal(modules)}
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
function ActiveSwitch({ module, onChanged }: { module: ModuleRow; onChanged: () => void }) {
    const [optimistic, setOptimistic] = React.useState<{ value: boolean; base: boolean } | null>(null);
    const checked = optimistic && optimistic.base === module.isActive ? optimistic.value : module.isActive;

    async function toggle(isActive: boolean) {
        setOptimistic({ value: isActive, base: module.isActive });
        try {
            const saved = await trainingService.patchModule(module.id, { isActive });
            toast.success(`${saved.title} switched ${saved.isActive ? "on" : "off"}`, {
                description: saved.isActive
                    ? saved.questionCount === 0
                        ? "It is on every agent's index with no quiz — every agent passes it for free until one is added."
                        : "It appears on every agent's index from their next read."
                    : "It leaves every agent's index; modules already passed keep their pass.",
            });
            onChanged();
        } catch (cause) {
            setOptimistic(null);
            toast.error(cause instanceof Error ? cause.message : "Could not change that module.");
        }
    }

    return (
        <Switch
            checked={checked}
            aria-label={`${module.title} active`}
            onCheckedChange={(next) => void toggle(next)}
        />
    );
}
