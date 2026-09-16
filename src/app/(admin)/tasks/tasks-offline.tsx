"use client";

import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { TasksNav } from "./tasks-nav";

/** What every Tasks screen says while the console is not reading the API: there are no task fixtures to fall back to. */
export function TasksOffline({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div className="space-y-5">
            <PageHeader title={title} subtitle={subtitle} />
            <TasksNav />
            <EmptyState
                icon={PlugZap}
                title="The Tasks section reads the API"
                description="This console is running without a backend, and there are no task fixtures — a task is real work on a real person's plate. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to work the section."
            />
        </div>
    );
}
