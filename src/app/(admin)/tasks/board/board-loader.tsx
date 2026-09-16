"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { workService, type WorkBoard, type WorkListPage, type WorkProject, type WorkTaskCard } from "@/services/work";
import { TasksNav } from "../tasks-nav";
import { TasksOffline } from "../tasks-offline";
import { BoardView, type BoardTab } from "./board-view";

/**
 * The board's data: `GET /work/board?projectId` for every column but
 * ARCHIVED, `GET /work/projects` (ACTIVE) for the picker, and — only when
 * the Archived tab is open — `GET /work/tasks?status=ARCHIVED`, the one
 * list read that names archived rows. A status move reloads the board.
 * `?projectId=` opens the board filtered to that project — how a row of
 * the Projects tab lands here.
 */
export function BoardLoader() {
    const live = isLive("work");
    const params = useSearchParams();
    const [projectId, setProjectId] = React.useState<string | null>(params.get("projectId") || null);
    const [tab, setTab] = React.useState<BoardTab>("table");

    const board = useApiResource<WorkBoard | null>(`work:board:${projectId ?? ""}:${live}`, () => (live ? workService.board(projectId ? { projectId } : {}) : Promise.resolve(null)));
    const projects = useApiResource<WorkProject[]>(`work:board:projects:${live}`, () =>
        live ? workService.projects.list({ status: ["ACTIVE"], pageSize: 100, sort: "name" }).then((page) => page.items).catch(() => [] as WorkProject[]) : Promise.resolve([]),
    );
    const archived = useApiResource<WorkListPage<WorkTaskCard> | null>(`work:board:archived:${projectId ?? ""}:${tab === "archive"}:${live}`, () =>
        live && tab === "archive" ? workService.tasks.list({ status: ["ARCHIVED"], ...(projectId ? { projectId } : {}), sort: "UPDATED", pageSize: 100 }) : Promise.resolve(null),
    );

    if (!live) return <TasksOffline title="Board" subtitle="Every task as a list, kanban board or timeline." />;

    const reload = () => {
        board.reload();
        archived.reload();
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title="Board"
                subtitle="Every task as a list, kanban board or timeline."
                actions={
                    <Button asChild>
                        <Link href="/tasks/new">
                            <Plus className="size-4" />
                            Create task
                        </Link>
                    </Button>
                }
            />
            <TasksNav />
            <ResourceBoundary resource={board}>
                {(data) =>
                    data ? (
                        <BoardView
                            board={data}
                            archived={archived.data}
                            archivedError={archived.error}
                            projects={projects.data ?? []}
                            projectId={projectId}
                            onProjectChange={setProjectId}
                            tab={tab}
                            onTabChange={setTab}
                            onChanged={reload}
                        />
                    ) : null
                }
            </ResourceBoundary>
        </div>
    );
}
