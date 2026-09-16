"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, FolderKanban, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { ActiveFilters, FilterPanel, type Facet, type FilterSelection } from "@/components/adx/filter-panel";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { personName, projectFacets, projectStatusMeta, workService, type WorkListPage, type WorkProject } from "@/services/work";
import { WORK_PROJECT_KIND_LABEL } from "@/types";
import { ProjectDialog } from "./project-dialog";

/** What the overview knows of an ACTIVE project's tasks. */
export interface ProjectStats {
    open: number;
    verified: number;
    progress: number;
}

interface ProjectsViewProps {
    page: WorkListPage<WorkProject>;
    /** By project id; an archived project (or one the overview did not name) has none. */
    stats: Map<string, ProjectStats>;
    departmentNames: Map<string, string>;
    cityNames: Map<string, string>;
    selection: FilterSelection;
    onSelectionChange: (next: FilterSelection) => void;
    query: string;
    onQueryChange: (value: string) => void;
    onChanged: () => void;
}

/** The department or the city a project frames — the name when a side read knows it, the id otherwise. */
export function projectScope(project: WorkProject, departmentNames: Map<string, string>, cityNames: Map<string, string>): string {
    if (project.kind === "DEPARTMENT") return project.departmentId ? (departmentNames.get(project.departmentId) ?? project.departmentId) : "—";
    return project.cityId ? (cityNames.get(project.cityId) ?? project.cityId) : "—";
}

/**
 * Lot AB, package AB-C: the fourth Tasks tab, `Projects · /tasks/projects`,
 * over `GET /work/projects`. A table of the frames tasks sit in, the
 * facets on the query (the status chips the read counts, one kind, the
 * search), a row opening the Board filtered to that project; New project
 * and Edit share one dialog, Archive confirms then `POST /:id/archive`.
 * The open / verified / progress columns are the overview's per-project
 * numbers, which it carries for ACTIVE projects only.
 */
export function ProjectsView({ page, stats, departmentNames, cityNames, selection, onSelectionChange, query, onQueryChange, onChanged }: ProjectsViewProps) {
    const router = useRouter();
    const [dialog, setDialog] = React.useState<{ open: boolean; project: WorkProject | null }>({ open: false, project: null });
    const [archiving, setArchiving] = React.useState<WorkProject | null>(null);
    const [busy, setBusy] = React.useState(false);

    const facets: Facet[] = React.useMemo(() => projectFacets(page.counts), [page.counts]);

    const archive = async () => {
        if (!archiving) return;
        setBusy(true);
        try {
            await workService.projects.archive(archiving.id);
            toast.success(`${archiving.displayId ?? archiving.name} archived`, { description: "Its tasks keep their history; nothing new is filed under it." });
            setArchiving(null);
            onChanged();
        } catch (caught) {
            toast.error(caught instanceof ApiError ? caught.message : "Could not archive the project.");
        } finally {
            setBusy(false);
        }
    };

    const columns = React.useMemo<ColumnDef<WorkProject>[]>(
        () => [
            {
                accessorKey: "displayId",
                header: "ID",
                cell: ({ row }) => <span className="text-xs tabular-nums text-muted-foreground">{row.original.displayId ?? row.original.id}</span>,
            },
            {
                accessorKey: "name",
                header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{row.original.name}</p>
                        {row.original.description && <p className="truncate text-xs text-muted-foreground">{row.original.description}</p>}
                    </div>
                ),
            },
            {
                accessorKey: "kind",
                header: "Kind",
                cell: ({ row }) => <span className="text-sm text-foreground">{WORK_PROJECT_KIND_LABEL[row.original.kind]}</span>,
            },
            {
                id: "scope",
                header: "Department / city",
                accessorFn: (project) => projectScope(project, departmentNames, cityNames),
                cell: ({ getValue }) => <span className="text-sm text-foreground">{getValue<string>()}</span>,
            },
            {
                id: "owner",
                header: "Owner",
                accessorFn: (project) => personName(project.owner),
                cell: ({ row }) => (
                    <span className="inline-flex items-center gap-2">
                        <InitialsAvatar name={personName(row.original.owner)} size="sm" />
                        <span className="text-sm text-foreground">{personName(row.original.owner)}</span>
                    </span>
                ),
            },
            {
                id: "open",
                header: ({ column }) => <SortableHeader column={column}>Open tasks</SortableHeader>,
                accessorFn: (project) => stats.get(project.id)?.open ?? -1,
                cell: ({ row }) => {
                    const stat = stats.get(row.original.id);
                    return <span className="tabular-nums">{stat ? stat.open : "—"}</span>;
                },
            },
            {
                id: "verified",
                header: ({ column }) => <SortableHeader column={column}>Verified</SortableHeader>,
                accessorFn: (project) => stats.get(project.id)?.verified ?? -1,
                cell: ({ row }) => {
                    const stat = stats.get(row.original.id);
                    return <span className="tabular-nums">{stat ? stat.verified : "—"}</span>;
                },
            },
            {
                id: "progress",
                header: ({ column }) => <SortableHeader column={column}>Progress</SortableHeader>,
                accessorFn: (project) => stats.get(project.id)?.progress ?? -1,
                cell: ({ row }) => {
                    const stat = stats.get(row.original.id);
                    if (!stat) return <span className="text-xs text-muted-foreground">—</span>;
                    return (
                        <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-primary" style={{ width: `${stat.progress}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground">{stat.progress}%</span>
                        </div>
                    );
                },
            },
            {
                id: "window",
                header: "Window",
                accessorFn: (project) => project.startsAt ?? "",
                cell: ({ row }) =>
                    row.original.startsAt || row.original.endsAt ? (
                        <span className="text-xs text-muted-foreground">
                            {row.original.startsAt ? formatDate(row.original.startsAt) : "…"} – {row.original.endsAt ? formatDate(row.original.endsAt) : "…"}
                        </span>
                    ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                    ),
            },
            {
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => <StatusBadge status={projectStatusMeta(row.original.status)} />,
            },
            {
                id: "actions",
                header: "",
                enableSorting: false,
                enableHiding: false,
                size: 44,
                cell: ({ row }) => {
                    const project = row.original;
                    return (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${project.name}`}>
                                    <MoreHorizontal className="size-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => setDialog({ open: true, project })}>
                                    <Pencil className="size-4" />
                                    Edit
                                </DropdownMenuItem>
                                {project.status !== "ARCHIVED" && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onSelect={() => setArchiving(project)} className="text-danger focus:text-danger">
                                            <Archive className="size-4" />
                                            Archive
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    );
                },
            },
        ],
        [stats, departmentNames, cityNames],
    );

    const untouched = page.total === 0 && !query && Object.values(page.counts).every((n) => n === 0);

    const empty = untouched ? (
        <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="A project frames a department's or a region's tasks and issues. Open the first one and the Board can be filtered by it."
            action={
                <Button onClick={() => setDialog({ open: true, project: null })}>
                    <Plus className="size-4" />
                    New project
                </Button>
            }
        />
    ) : (
        <EmptyState icon={FolderKanban} title="Nothing matches" description={query ? "No project matches that search." : "No project is in this queue right now — widen the filters."} />
    );

    return (
        <div className="space-y-4">
            <Card className="rounded-lg border-border shadow-none">
                <div className="space-y-2.5 border-b px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <FilterPanel facets={facets} selection={selection} onChange={onSelectionChange} resultCount={page.total} search={{ value: query, onChange: onQueryChange, placeholder: "Project name or id" }} />
                        <Button onClick={() => setDialog({ open: true, project: null })}>
                            <Plus className="size-4" />
                            New project
                        </Button>
                    </div>
                    <ActiveFilters facets={facets} selection={selection} onChange={onSelectionChange} resultCount={page.total} />
                </div>
                <div className="p-4">
                    <DataTable
                        columns={columns}
                        data={page.items}
                        showColumnToggle={false}
                        onRowClick={(project) => router.push(`/tasks/board?projectId=${encodeURIComponent(project.id)}`)}
                        emptyState={empty}
                        initialPageSize={20}
                    />
                </div>
            </Card>

            <ProjectDialog
                open={dialog.open}
                onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
                project={dialog.project}
                cityName={dialog.project?.cityId ? (cityNames.get(dialog.project.cityId) ?? "") : ""}
                onSaved={onChanged}
            />

            <ConfirmDialog
                open={archiving !== null}
                onOpenChange={(open) => !open && !busy && setArchiving(null)}
                title={archiving ? `Archive ${archiving.displayId ?? archiving.name}?` : "Archive project?"}
                description="An archived project keeps its tasks and their history but takes nothing new; it leaves the Board's picker and the overview. This cannot be undone from the console."
                confirmLabel="Archive"
                destructive
                busy={busy}
                onConfirm={() => void archive()}
            />
        </div>
    );
}
