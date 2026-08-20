import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/services";
import { TaskEditForm } from "./task-edit-form";

export const metadata: Metadata = { title: "Edit Task" };

export default async function TaskEditPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const task = await api.tasks.get(id);
    if (!task) notFound();

    return <TaskEditForm task={task} />;
}
