import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { api } from "@/services";
import { CreateTaskWizard } from "./create-task-wizard";

export const metadata: Metadata = { title: "Create Task" };

export default async function CreateTaskPage() {
    const [projects, people] = await Promise.all([api.tasks.projects(), api.tasks.people()]);

    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <Link
                href="/tasks"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
                <ChevronLeft className="size-4" />
                Tasks
            </Link>
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Create task
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Assign internal work to a department team or a field region.
                </p>
            </div>
            <CreateTaskWizard projects={projects.filter((p) => p !== "All")} people={people} />
        </div>
    );
}
