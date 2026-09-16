import type { Metadata } from "next";
import { TaskLoader } from "./task-loader";

export const metadata: Metadata = { title: "Task Detail" };

interface TaskDetailPageProps {
    params: Promise<{ id: string }>;
}

/** The DR 10 frame `Task detail · /tasks/:id`, over `GET /work/tasks/:id` and the task's audit trail (Lot AA). */
export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
    const { id } = await params;
    return <TaskLoader id={id} />;
}
