import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, GitBranch, Layers } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/adx/page-header";
import { formatDate } from "@/lib/format";
import { api } from "@/services";
import { FlowsNav } from "./flows-nav";

export const metadata: Metadata = { title: "Flow Editor" };

export default async function FlowsPage() {
    const flows = await api.flows.list();

    return (
        <div className="space-y-5">
            <PageHeader
                title="Flow Editor"
                subtitle="The dynamic form flows the mobile apps render for onboarding and listings."
            />
            <FlowsNav />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {flows.map((flow) => {
                    const fieldCount = flow.screens.reduce(
                        (sum, screen) => sum + screen.fields.length,
                        0
                    );
                    return (
                        <Card
                            key={flow.key}
                            className="flex flex-col rounded-lg border-border p-5 shadow-none transition-shadow hover:shadow-sm"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h2 className="truncate text-base font-semibold text-foreground">
                                        {flow.label}
                                    </h2>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {flow.audience}
                                    </p>
                                </div>
                                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                                    {flow.screens.length} screens
                                </span>
                            </div>
                            <p className="mt-3 flex-1 text-sm text-muted-foreground">
                                {flow.description}
                            </p>
                            <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                    <Layers className="size-3.5" />
                                    {fieldCount} fields
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <GitBranch className="size-3.5" />
                                    {flow.branches.length
                                        ? `${flow.branches.length} ${flow.branches.length === 1 ? "branch" : "branches"}`
                                        : "No branching"}
                                </span>
                            </div>
                            <div className="mt-3 flex items-center justify-between border-t pt-3">
                                <span className="text-xs text-muted-foreground">
                                    Updated {formatDate(flow.updated)}
                                </span>
                                <Link
                                    href={`/flows/${flow.key}`}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                >
                                    Open board
                                    <ArrowRight className="size-3.5" />
                                </Link>
                            </div>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
