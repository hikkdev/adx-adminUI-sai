"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { workService, type WorkProject, type WorkTaskCard } from "@/services/work";
import { TasksOffline } from "../tasks-offline";
import { CreateTaskWizard } from "./create-task-wizard";

/**
 * The wizard's pickers: the ACTIVE projects (`GET /work/projects`) and the
 * open tasks a prerequisite or a parent can be chosen from (`GET
 * /work/tasks`, the hundred newest-updated); the people picker searches
 * on its own. `?projectId=` and `?parentTaskId=` pre-fill the form — how a
 * project page and a task's Sub-tasks card open it.
 */
export function CreateTaskLoader() {
    const live = isLive("work");
    const params = useSearchParams();
    const projects = useApiResource<WorkProject[]>(`work:new:projects:${live}`, () =>
        live ? workService.projects.list({ status: ["ACTIVE"], pageSize: 100, sort: "name" }).then((page) => page.items).catch(() => [] as WorkProject[]) : Promise.resolve([]),
    );
    const tasks = useApiResource<WorkTaskCard[]>(`work:new:tasks:${live}`, () =>
        live ? workService.tasks.list({ pageSize: 100, sort: "UPDATED" }).then((page) => page.items).catch(() => [] as WorkTaskCard[]) : Promise.resolve([]),
    );

    if (!live) return <TasksOffline title="Create task" subtitle="Assign internal work to a department team or a field region." />;

    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <Link href="/tasks" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                <ChevronLeft className="size-4" />
                Tasks
            </Link>
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Create task</h1>
                <p className="mt-1 text-sm text-muted-foreground">Assign internal work to a department team or a field region.</p>
            </div>
            <CreateTaskWizard
                projects={projects.data ?? []}
                tasks={tasks.data ?? []}
                initial={{ projectId: params.get("projectId") ?? "", parentTaskId: params.get("parentTaskId") ?? "" }}
            />
        </div>
    );
}
