import type { Metadata } from "next";
import { PageHeader } from "@/components/adx/page-header";
import { api } from "@/services";
import { TasksNav } from "../tasks-nav";
import { IssuesView } from "./issues-view";

export const metadata: Metadata = { title: "Risk & Issues" };

export default async function TaskIssuesPage() {
    const [issues, tasks, people] = await Promise.all([
        api.tasks.issues(),
        api.tasks.list(),
        api.tasks.people(),
    ]);

    return (
        <div className="space-y-5">
            <PageHeader
                title="Risk & issues"
                subtitle="Performance barriers raised against tasks, with resolution context."
            />
            <TasksNav />
            <IssuesView issues={issues} tasks={tasks} people={people} />
        </div>
    );
}
