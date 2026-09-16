import type { Metadata } from "next";
import { TaskEditLoader } from "./task-edit-loader";

export const metadata: Metadata = { title: "Edit Task" };

/** The DR 10 frame `Edit task · /tasks/:id/edit`, over `PATCH /work/tasks/:id` (Lot AA). */
export default async function TaskEditPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <TaskEditLoader id={id} />;
}
