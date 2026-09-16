"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Pencil, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { KpiCard } from "@/components/adx/kpi-card";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { ActiveFilters, FilterPanel, type Facet, type FilterSelection } from "@/components/adx/filter-panel";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import { isOpenIssue, issueFacets, personName, workService, type WorkIssue, type WorkListPage, type WorkPerson, type WorkProject, type WorkTaskCard } from "@/services/work";
import { WORK_ISSUE_SEVERITY_META, WORK_ISSUE_STATUS_META, type WorkIssueSeverity } from "@/types";

interface IssuesViewProps {
    page: WorkListPage<WorkIssue>;
    projects: WorkProject[];
    tasks: WorkTaskCard[];
    people: WorkPerson[];
    selection: FilterSelection;
    onSelectionChange: (next: FilterSelection) => void;
    query: string;
    onQueryChange: (value: string) => void;
    onChanged: () => void;
}

const NONE = "__none__";

const message = (caught: unknown, fallback: string) => (caught instanceof ApiError ? caught.message : fallback);

interface IssueDraft {
    title: string;
    description: string;
    severity: WorkIssueSeverity;
    taskId: string;
    projectId: string;
    assigneeId: string;
}

const EMPTY_DRAFT: IssueDraft = { title: "", description: "", severity: "MEDIUM", taskId: "", projectId: "", assigneeId: "" };

/**
 * The DR 10 frame `Risk & issues · /tasks/issues`, over `GET /work/issues`.
 *
 * The frame's three tiles, the queue with its filters on the left and the
 * evidence pane on the right are kept as drawn. What moved to the server:
 * every facet (status as chips the read counts, one severity, one
 * project, the search) goes on the query, the pane's actions are the
 * module's own moves — start work (`PATCH status`), resolve or won't fix
 * with a resolution (`POST /resolve`), reopen (`POST /reopen`) — and the
 * edit dialog is `PATCH`. What is gone: delete (no route), the issue
 * "type" (bug / blocker / change request / query) and the root cause,
 * which no column carries.
 */
export function IssuesView({ page, projects, tasks, people, selection, onSelectionChange, query, onQueryChange, onChanged }: IssuesViewProps) {
    const issues = page.items;
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [raiseOpen, setRaiseOpen] = React.useState(false);
    const [editOpen, setEditOpen] = React.useState(false);
    const [resolveOpen, setResolveOpen] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [draft, setDraft] = React.useState<IssueDraft>(EMPTY_DRAFT);
    const [editDraft, setEditDraft] = React.useState<IssueDraft>(EMPTY_DRAFT);
    const [resolution, setResolution] = React.useState<{ status: "RESOLVED" | "WONT_FIX"; text: string }>({ status: "RESOLVED", text: "" });

    /* --- What actually needs a decision, not a recount of the table --- */
    const urgent = issues.filter((issue) => issue.status === "OPEN" && (issue.severity === "CRITICAL" || issue.severity === "HIGH"));
    const working = issues.filter((issue) => issue.status === "IN_PROGRESS");
    const heldTasks = new Set(issues.filter(isOpenIssue).map((issue) => issue.taskId).filter(Boolean));
    const oldestUrgent = urgent[0];

    const facets: Facet[] = React.useMemo(
        () => [
            ...issueFacets(page.counts),
            {
                id: "project",
                label: "Project",
                type: "single" as const,
                options: projects.map((project) => ({ value: project.id, label: project.name })),
            },
        ],
        [page.counts, projects],
    );

    /* Keep a row selected so the detail pane is never a dead placeholder. */
    const selected = issues.find((issue) => issue.id === selectedId) ?? issues[0] ?? null;

    const taskItems = React.useMemo(() => tasks.map((task) => ({ value: task.id, label: task.title, description: task.displayId ?? undefined })), [tasks]);
    const taskOf = (id: string | null) => (id ? tasks.find((task) => task.id === id) : undefined);

    const raiseIssue = async () => {
        if (!draft.title.trim()) {
            toast.error("Give the issue a title.");
            return;
        }
        setBusy(true);
        try {
            const created = await workService.issues.create({
                title: draft.title.trim(),
                ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
                severity: draft.severity,
                ...(draft.taskId ? { taskId: draft.taskId } : {}),
                ...(draft.projectId ? { projectId: draft.projectId } : {}),
                ...(draft.assigneeId ? { assigneeId: draft.assigneeId } : {}),
            });
            toast.success(`${created.displayId ?? "Issue"} raised`, { description: created.title });
            setRaiseOpen(false);
            setDraft(EMPTY_DRAFT);
            setSelectedId(created.id);
            onChanged();
        } catch (caught) {
            toast.error(message(caught, "Could not raise the issue."));
        } finally {
            setBusy(false);
        }
    };

    const startWork = async (issue: WorkIssue) => {
        setBusy(true);
        try {
            await workService.issues.patch(issue.id, { status: "IN_PROGRESS" });
            toast.success(`${issue.displayId ?? "Issue"} marked in progress`);
            onChanged();
        } catch (caught) {
            toast.error(message(caught, "Could not update the issue."));
        } finally {
            setBusy(false);
        }
    };

    const resolve = async () => {
        if (!selected) return;
        if (!resolution.text.trim()) {
            toast.error("Say how it was resolved.");
            return;
        }
        setBusy(true);
        try {
            await workService.issues.resolve(selected.id, resolution.status, resolution.text);
            toast.success(`${selected.displayId ?? "Issue"} ${WORK_ISSUE_STATUS_META[resolution.status].label.toLowerCase()}`);
            setResolveOpen(false);
            setResolution({ status: "RESOLVED", text: "" });
            onChanged();
        } catch (caught) {
            toast.error(message(caught, "Could not resolve the issue."));
        } finally {
            setBusy(false);
        }
    };

    const reopen = async (issue: WorkIssue) => {
        setBusy(true);
        try {
            await workService.issues.reopen(issue.id);
            toast.success(`${issue.displayId ?? "Issue"} reopened`);
            onChanged();
        } catch (caught) {
            toast.error(message(caught, "Could not reopen the issue."));
        } finally {
            setBusy(false);
        }
    };

    const openEdit = () => {
        if (!selected) return;
        setEditDraft({
            title: selected.title,
            description: selected.description ?? "",
            severity: selected.severity,
            taskId: selected.taskId ?? "",
            projectId: selected.projectId ?? "",
            assigneeId: selected.assigneeId ?? "",
        });
        setEditOpen(true);
    };

    const saveEdit = async () => {
        if (!selected) return;
        if (!editDraft.title.trim()) {
            toast.error("A title is required.");
            return;
        }
        setBusy(true);
        try {
            await workService.issues.patch(selected.id, {
                title: editDraft.title.trim(),
                description: editDraft.description.trim() || null,
                severity: editDraft.severity,
                assigneeId: editDraft.assigneeId || null,
            });
            toast.success(`${selected.displayId ?? "Issue"} updated`);
            setEditOpen(false);
            onChanged();
        } catch (caught) {
            toast.error(message(caught, "Could not save the issue."));
        } finally {
            setBusy(false);
        }
    };

    const peopleSelect = (id: string, value: string, onChange: (value: string) => void) => (
        <Select value={value || NONE} onValueChange={(next) => onChange(next === NONE ? "" : next)}>
            <SelectTrigger id={id}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {people.map((person) => (
                    <SelectItem key={person.userId} value={person.userId}>
                        {personName(person)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );

    const severitySelect = (id: string, value: WorkIssueSeverity, onChange: (value: WorkIssueSeverity) => void) => (
        <Select value={value} onValueChange={(next) => onChange(next as WorkIssueSeverity)}>
            <SelectTrigger id={id}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {Object.entries(WORK_ISSUE_SEVERITY_META).map(([option, meta]) => (
                    <SelectItem key={option} value={option}>
                        {meta.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );

    return (
        <div className="space-y-4">
            {/* What needs attention ------------------------------------- */}
            <div className="grid gap-4 md:grid-cols-3">
                <KpiCard
                    stat={{
                        id: "urgent",
                        label: "Needs triage now",
                        value: String(urgent.length),
                        hint: oldestUrgent ? `Worst open: ${oldestUrgent.displayId ?? oldestUrgent.id}${oldestUrgent.task ? ` on ${oldestUrgent.task.title}` : ""}` : "No critical or high issues are open in this queue",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "working",
                        label: "Being worked",
                        value: String(working.length),
                        hint: working.length ? `Owned by ${new Set(working.map((issue) => issue.assigneeId ?? "nobody")).size} people` : "Nothing in progress",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "held",
                        label: "Tasks held up",
                        value: String(heldTasks.size),
                        hint: "Tasks with at least one unresolved issue in this queue",
                    }}
                />
            </div>

            {/* Queue + evidence ----------------------------------------- */}
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
                <Card className="rounded-lg border-border shadow-none">
                    <div className="space-y-2.5 border-b px-4 py-3">
                        <FilterPanel
                            facets={facets}
                            selection={selection}
                            onChange={onSelectionChange}
                            resultCount={page.total}
                            search={{ value: query, onChange: onQueryChange, placeholder: "Issue, title or id" }}
                        />
                        <ActiveFilters facets={facets} selection={selection} onChange={onSelectionChange} resultCount={page.total} />
                    </div>

                    {issues.length ? (
                        <ul className="max-h-[560px] divide-y overflow-y-auto" data-testid="issue-queue">
                            {issues.map((issue) => {
                                const active = selected?.id === issue.id;
                                return (
                                    <li key={issue.id}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedId(issue.id)}
                                            aria-current={active ? "true" : undefined}
                                            className={cn(
                                                "w-full px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                                active ? "bg-muted/60" : "hover:bg-muted/40",
                                            )}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs font-medium tabular-nums text-muted-foreground">{issue.displayId ?? issue.id}</span>
                                                <StatusBadge status={WORK_ISSUE_SEVERITY_META[issue.severity]} />
                                            </div>
                                            <p className="mt-1 truncate text-sm font-medium text-foreground">{issue.title}</p>
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{issue.task?.title ?? "On the project"}</p>
                                            <div className="mt-2 flex items-center justify-between gap-2">
                                                <span className="truncate text-xs text-muted-foreground">{issue.assignee ? personName(issue.assignee) : "Unassigned"}</span>
                                                <StatusBadge status={WORK_ISSUE_STATUS_META[issue.status]} />
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                            {query ? "No issues match that search." : page.total === 0 && Object.values(page.counts).every((n) => n === 0) ? "No issues yet — raise the first one when a task hits a barrier." : "Nothing in this queue right now."}
                        </p>
                    )}

                    <div className="border-t px-4 py-3">
                        <Button className="w-full" onClick={() => setRaiseOpen(true)}>
                            <Plus className="size-4" />
                            Raise an issue
                        </Button>
                    </div>
                </Card>

                {selected ? (
                    <Card className="rounded-lg border-border shadow-none">
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-base font-semibold text-foreground">
                                        {selected.displayId ?? selected.id}: {selected.title}
                                    </h2>
                                    <StatusBadge status={WORK_ISSUE_SEVERITY_META[selected.severity]} />
                                    <StatusBadge status={WORK_ISSUE_STATUS_META[selected.status]} />
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {selected.task ? (
                                        <>
                                            {selected.severity === "CRITICAL" && isOpenIssue(selected) ? "Blocking" : "On"}{" "}
                                            <Link href={`/tasks/${encodeURIComponent(selected.task.id)}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                                                {selected.task.title}
                                                <ArrowUpRight className="ml-0.5 inline size-3.5" />
                                            </Link>
                                        </>
                                    ) : (
                                        "Raised on the project, not a task"
                                    )}
                                    {selected.projectId && (
                                        <>
                                            {" "}
                                            in {projects.find((project) => project.id === selected.projectId)?.name ?? "its project"}
                                        </>
                                    )}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <Button variant="ghost" size="icon" aria-label={`Edit ${selected.displayId ?? selected.id}`} onClick={openEdit} disabled={busy}>
                                    <Pencil className="size-4" />
                                </Button>
                                {selected.status === "OPEN" && (
                                    <Button variant="outline" className="bg-card" onClick={() => void startWork(selected)} disabled={busy}>
                                        Start work
                                    </Button>
                                )}
                                {isOpenIssue(selected) && (
                                    <Button onClick={() => setResolveOpen(true)} disabled={busy}>
                                        Resolve
                                    </Button>
                                )}
                                {!isOpenIssue(selected) && (
                                    <Button variant="outline" className="bg-card" onClick={() => void reopen(selected)} disabled={busy}>
                                        <RotateCcw className="size-4" />
                                        Reopen
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="border-b px-5 py-4">
                            <p className="text-xs font-medium text-muted-foreground">What happened</p>
                            <p className="mt-1 max-w-prose text-sm leading-6 text-foreground">{selected.description || "No description was given."}</p>
                        </div>

                        <div className="grid gap-x-10 gap-y-4 px-5 py-4 lg:grid-cols-2">
                            <FieldList
                                items={[
                                    ["Assigned to", selected.assignee ? personName(selected.assignee) : "Unassigned"],
                                    ["Raised by", personName(selected.raisedBy)],
                                    ["Raised", formatDateTime(selected.createdAt)],
                                    ["Resolution date", selected.resolvedAt ? formatDate(selected.resolvedAt) : "Pending"],
                                ]}
                            />
                            <div>
                                <p className="text-xs font-medium text-muted-foreground">Resolution details</p>
                                <p className="mt-1 text-sm leading-6 text-foreground">{selected.resolution ?? "No resolution recorded yet."}</p>
                            </div>
                        </div>
                    </Card>
                ) : (
                    <Card className="rounded-lg border-border p-10 text-center shadow-none">
                        <p className="text-sm font-medium text-foreground">This queue is clear</p>
                        <p className="mt-1 text-sm text-muted-foreground">Switch to another queue, or raise an issue when a task hits a barrier.</p>
                    </Card>
                )}
            </div>

            {/* Edit issue dialog ---------------------------------------- */}
            <Dialog open={editOpen} onOpenChange={(open) => !busy && setEditOpen(open)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Edit {selected?.displayId ?? "issue"}</DialogTitle>
                        <DialogDescription>Status is changed from the detail pane, everything else here.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-1">
                        <div className="grid gap-1.5">
                            <Label htmlFor="edit-title">Title</Label>
                            <Input id="edit-title" value={editDraft.title} onChange={(event) => setEditDraft((d) => ({ ...d, title: event.target.value }))} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="edit-description">Description</Label>
                            <Textarea id="edit-description" rows={3} value={editDraft.description} onChange={(event) => setEditDraft((d) => ({ ...d, description: event.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="edit-severity">Severity</Label>
                                {severitySelect("edit-severity", editDraft.severity, (severity) => setEditDraft((d) => ({ ...d, severity })))}
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="edit-assignee">Assigned to</Label>
                                {peopleSelect("edit-assignee", editDraft.assigneeId, (assigneeId) => setEditDraft((d) => ({ ...d, assigneeId })))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="bg-card" onClick={() => setEditOpen(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button onClick={() => void saveEdit()} disabled={busy}>
                            Save changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Resolve dialog ------------------------------------------- */}
            <Dialog open={resolveOpen} onOpenChange={(open) => !busy && setResolveOpen(open)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Resolve {selected?.displayId ?? "issue"}</DialogTitle>
                        <DialogDescription>The resolution is kept on the issue; it can be reopened later.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-1">
                        <div className="grid gap-1.5">
                            <Label htmlFor="resolve-status">Outcome</Label>
                            <Select value={resolution.status} onValueChange={(status) => setResolution((r) => ({ ...r, status: status as "RESOLVED" | "WONT_FIX" }))}>
                                <SelectTrigger id="resolve-status">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="RESOLVED">{WORK_ISSUE_STATUS_META.RESOLVED.label}</SelectItem>
                                    <SelectItem value="WONT_FIX">{WORK_ISSUE_STATUS_META.WONT_FIX.label}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="resolve-text">Resolution</Label>
                            <Textarea id="resolve-text" rows={3} value={resolution.text} onChange={(event) => setResolution((r) => ({ ...r, text: event.target.value }))} placeholder="What was done, or why it will not be" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="bg-card" onClick={() => setResolveOpen(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button onClick={() => void resolve()} disabled={busy || !resolution.text.trim()}>
                            {WORK_ISSUE_STATUS_META[resolution.status].label}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Raise issue dialog --------------------------------------- */}
            <Dialog open={raiseOpen} onOpenChange={(open) => !busy && setRaiseOpen(open)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Raise an issue</DialogTitle>
                        <DialogDescription>Log a barrier against a task, or against a project as a whole.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-1">
                        <div className="grid gap-1.5">
                            <Label htmlFor="issue-task">Task</Label>
                            <Combobox
                                id="issue-task"
                                items={taskItems}
                                value={draft.taskId}
                                onValueChange={(taskId) => setDraft((d) => ({ ...d, taskId, projectId: taskOf(taskId)?.project?.id ?? d.projectId }))}
                                placeholder="No task — on the project"
                                searchPlaceholder="Search tasks"
                                emptyText="No open task matches."
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="issue-project">Project</Label>
                                <Select value={draft.projectId || NONE} onValueChange={(value) => setDraft((d) => ({ ...d, projectId: value === NONE ? "" : value }))}>
                                    <SelectTrigger id="issue-project">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>The task's project</SelectItem>
                                        {projects.map((project) => (
                                            <SelectItem key={project.id} value={project.id}>
                                                {project.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="issue-severity">Severity</Label>
                                {severitySelect("issue-severity", draft.severity, (severity) => setDraft((d) => ({ ...d, severity })))}
                            </div>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="issue-assignee">Assign to</Label>
                            {peopleSelect("issue-assignee", draft.assigneeId, (assigneeId) => setDraft((d) => ({ ...d, assigneeId })))}
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="issue-title">Title</Label>
                            <Input id="issue-title" value={draft.title} onChange={(event) => setDraft((d) => ({ ...d, title: event.target.value }))} placeholder="e.g. Site access refused" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="issue-description">Description</Label>
                            <Textarea id="issue-description" value={draft.description} onChange={(event) => setDraft((d) => ({ ...d, description: event.target.value }))} rows={3} placeholder="What is blocking the task?" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="bg-card" onClick={() => setRaiseOpen(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button onClick={() => void raiseIssue()} disabled={busy}>
                            Raise issue
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
