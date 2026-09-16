"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionCard } from "@/components/adx/section-card";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { isLive } from "@/lib/api-config";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useApiResource } from "@/lib/use-api-resource";
import { workService, type WorkListPage, type WorkTaskCard } from "@/services/work";
import { WORK_PRIORITY_META, WORK_TASK_STATUS_META } from "@/types";

interface AssignedTasksCardProps {
    /** The person's user id — what `WorkTaskAssignee.userId` holds for employees and agents alike. */
    userId: string;
    /** How the card names the person: "Priya's open tasks". */
    name: string;
    className?: string;
}

/**
 * Lot AA: a person's open tasks on their own page — `GET /work/tasks?
 * assigneeUserId=`, deadline first, twenty at most — drawn on the employee
 * profile and the agent detail alike, because a task's people are the two
 * registries together (the people rule). ARCHIVED rows are outside the
 * list by the read's default; VERIFIED ones are shown, so a finished week
 * is visible. Fails soft: the page stands without it.
 */
export function AssignedTasksCard({ userId, name, className }: AssignedTasksCardProps) {
    const live = isLive("work");
    const tasks = useApiResource<WorkListPage<WorkTaskCard> | null>(`work:assigned:${userId}:${live}`, () =>
        live ? workService.tasks.list({ assigneeUserId: userId, sort: "DEADLINE", pageSize: 20 }) : Promise.resolve(null),
    );

    if (!live) return null;

    return (
        <SectionCard
            title="Assigned tasks"
            description={tasks.data ? `${tasks.data.total} on ${name}'s plate, deadline first` : `Tasks assigned to ${name} in the console's Tasks section`}
            actions={
                <Link href="/tasks/board" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    Task board
                    <ArrowRight className="size-3.5" />
                </Link>
            }
            className={className}
            contentClassName="p-0"
        >
            {tasks.error ? (
                <p className="px-5 py-4 text-sm text-muted-foreground">The Tasks section could not be read: {tasks.error}</p>
            ) : (
                <SimpleTable
                    columns={[
                        {
                            key: "task",
                            label: "Task",
                            render: (row: WorkTaskCard) => (
                                <Link href={`/tasks/${encodeURIComponent(row.id)}`} className="block min-w-0">
                                    <span className="block truncate font-medium text-foreground hover:underline">{row.title}</span>
                                    <span className="block text-xs text-muted-foreground">
                                        {row.displayId ?? row.id}
                                        {row.project ? ` · ${row.project.name}` : ""}
                                    </span>
                                </Link>
                            ),
                        },
                        { key: "priority", label: "Priority", render: (row) => <StatusBadge status={WORK_PRIORITY_META[row.priority]} /> },
                        {
                            key: "deadline",
                            label: "Deadline",
                            render: (row) => <span className={cn("tabular-nums", row.overdue && "font-medium text-danger")}>{row.deadline ? formatDate(row.deadline) : "—"}</span>,
                        },
                        { key: "progress", label: "Progress", className: "text-right", render: (row) => <span className="tabular-nums">{row.progress}%</span> },
                        { key: "status", label: "Status", render: (row) => <StatusBadge status={WORK_TASK_STATUS_META[row.status]} /> },
                    ]}
                    rows={tasks.data?.items ?? []}
                    rowKey={(row) => row.id}
                    className="rounded-none border-0"
                    emptyMessage={tasks.data ? `No tasks assigned to ${name}.` : "Reading the tasks…"}
                />
            )}
        </SectionCard>
    );
}
