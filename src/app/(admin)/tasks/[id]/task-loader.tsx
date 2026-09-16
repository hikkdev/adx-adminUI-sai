"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import type { AuditRow } from "@/services/audit";
import { workService, type WorkTaskDetail } from "@/services/work";
import { TasksOffline } from "../tasks-offline";
import { TaskDetail } from "./task-detail";

/**
 * The task's data: the whole record in one read (`GET /work/tasks/:id` —
 * the project, parent, children, people, reviewers with their marks,
 * prerequisites, dependents, comments, hours with totals, issues, the
 * linked record) and, beside it, the trail every audit row wrote against
 * it (`GET /audit/targets/WorkTask/:id`), which is where the status moves
 * and the date changes come from. Every write reloads both.
 */
export function TaskLoader({ id }: { id: string }) {
    const live = isLive("work");
    const task = useApiResource<WorkTaskDetail | null>(`work:task:${id}:${live}`, () => (live ? workService.tasks.get(id) : Promise.resolve(null)));
    const history = useApiResource<AuditRow[]>(`work:task:history:${id}:${live}`, () => (live ? workService.tasks.history(id).catch(() => [] as AuditRow[]) : Promise.resolve([])));

    if (!live) return <TasksOffline title="Task" subtitle="One task: its people, its dates, its work log and its history." />;

    const reload = () => {
        task.reload();
        history.reload();
    };

    return <ResourceBoundary resource={task}>{(data) => (data ? <TaskDetail task={data} history={history.data ?? []} historyError={history.error} onChanged={reload} /> : null)}</ResourceBoundary>;
}
