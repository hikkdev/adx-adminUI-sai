import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/adx/page-header";
import { api } from "@/services";
import { TasksNav } from "./tasks-nav";
import { TasksOverview } from "./tasks-overview";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage() {
    const [tasks, issues] = await Promise.all([api.tasks.list(), api.tasks.issues()]);

    return (
        <div className="space-y-5">
            <PageHeader
                title="Tasks"
                subtitle="Internal work items across departments and field regions."
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" className="bg-card" asChild>
                            <Link href="/tasks/issues">
                                Risk log
                                <ArrowRight className="size-4" />
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link href="/tasks/new">
                                <Plus className="size-4" />
                                Create task
                            </Link>
                        </Button>
                    </div>
                }
            />
            <TasksNav />
            <TasksOverview tasks={tasks} issues={issues} />
        </div>
    );
}
