"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Briefcase, MapPin, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate } from "@/lib/format";
import {
    CANDIDATE_STAGE_META,
    JOB_STATUS_META,
    type Candidate,
    type JobOpening,
} from "@/types";

interface HiringViewProps {
    jobs: JobOpening[];
    candidates: Candidate[];
}

export function HiringView({ jobs, candidates }: HiringViewProps) {
    const columns = React.useMemo<ColumnDef<Candidate>[]>(
        () => [
            {
                accessorKey: "name",
                header: ({ column }) => <SortableHeader column={column}>Candidate</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.name} />
                        <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                                {row.original.name}
                            </p>
                            <p className="text-xs text-muted-foreground">{row.original.email}</p>
                        </div>
                    </div>
                ),
            },
            {
                accessorKey: "role",
                header: ({ column }) => <SortableHeader column={column}>Applying for</SortableHeader>,
                cell: ({ row }) => (
                    <div>
                        <p className="text-foreground">{row.original.role}</p>
                        <p className="text-xs text-muted-foreground">{row.original.department}</p>
                    </div>
                ),
            },
            {
                accessorKey: "experience",
                header: "Experience",
            },
            {
                accessorKey: "appliedOn",
                header: ({ column }) => <SortableHeader column={column}>Applied</SortableHeader>,
                cell: ({ row }) => formatDate(row.original.appliedOn),
            },
            {
                accessorKey: "mobile",
                header: "Mobile",
            },
            {
                accessorKey: "stage",
                header: "Stage",
                cell: ({ row }) => (
                    <StatusBadge status={CANDIDATE_STAGE_META[row.original.stage]} />
                ),
            },
        ],
        []
    );

    return (
        <div className="space-y-6">
            <section className="space-y-3">
                <PageHeader
                    size="section"
                    title="Open positions"
                    subtitle="Roles currently advertised on the careers page."
                />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {jobs.map((job) => (
                        <Card key={job.id} className="rounded-lg border-border p-5 shadow-none">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="truncate text-sm font-semibold text-foreground">
                                        {job.title}
                                    </h3>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {job.department} · {job.workType}
                                    </p>
                                </div>
                                <StatusBadge status={JOB_STATUS_META[job.status]} />
                            </div>
                            <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                                <p className="flex items-center gap-1.5">
                                    <MapPin className="size-3.5" />
                                    {job.location}
                                </p>
                                <p className="flex items-center gap-1.5">
                                    <Briefcase className="size-3.5" />
                                    {job.salaryBand} · {job.openings}{" "}
                                    {job.openings === 1 ? "opening" : "openings"}
                                </p>
                                <p className="flex items-center gap-1.5">
                                    <Users className="size-3.5" />
                                    {job.applicants} applicants · posted {formatDate(job.postedOn)}
                                </p>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-3">
                                {job.tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </Card>
                    ))}
                </div>
            </section>

            <section className="space-y-3">
                <PageHeader
                    size="section"
                    title="Candidates"
                    subtitle="Everyone in the pipeline across the open roles."
                />
                <DataTable
                    columns={columns}
                    data={candidates}
                    searchPlaceholder="Search candidates"
                />
            </section>
        </div>
    );
}
