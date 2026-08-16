import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/services";
import { TaskDetail } from "./task-detail";

export const metadata: Metadata = { title: "Task Detail" };

interface TaskDetailPageProps {
    params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
    const { id } = await params;
    const [task, tracking, issues] = await Promise.all([
        api.tasks.get(id),
        api.tasks.tracking(id),
        api.tasks.issues(),
    ]);
    if (!task || !tracking) notFound();

    return (
        <TaskDetail
            task={task}
            tracking={tracking}
            issues={issues.filter((issue) => issue.taskId === task.id)}
        />
    );
}
