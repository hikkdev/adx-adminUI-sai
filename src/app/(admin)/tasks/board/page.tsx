import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/adx/page-header";
import { api } from "@/services";
import { TasksNav } from "../tasks-nav";
import { BoardView } from "./board-view";

export const metadata: Metadata = { title: "Task Board" };

export default async function TaskBoardPage() {
    const tasks = await api.tasks.list();

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
            <BoardView tasks={tasks} />
        </div>
    );
}
