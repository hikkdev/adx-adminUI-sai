"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { workService, type WorkProject, type WorkTaskDetail } from "@/services/work";
import { TasksOffline } from "../../tasks-offline";
import { TaskEditForm } from "./task-edit-form";

/** The task to edit and the ACTIVE projects its Placement card offers. */
export function TaskEditLoader({ id }: { id: string }) {
    const live = isLive("work");
    const task = useApiResource<WorkTaskDetail | null>(`work:task:edit:${id}:${live}`, () => (live ? workService.tasks.get(id) : Promise.resolve(null)));
    const projects = useApiResource<WorkProject[]>(`work:task:edit:projects:${live}`, () =>
        live ? workService.projects.list({ status: ["ACTIVE"], pageSize: 100, sort: "name" }).then((page) => page.items).catch(() => [] as WorkProject[]) : Promise.resolve([]),
    );

    if (!live) return <TasksOffline title="Edit task" subtitle="The task's fields, saved as one patch." />;

    return <ResourceBoundary resource={task}>{(data) => (data ? <TaskEditForm task={data} projects={projects.data ?? []} /> : null)}</ResourceBoundary>;
}
