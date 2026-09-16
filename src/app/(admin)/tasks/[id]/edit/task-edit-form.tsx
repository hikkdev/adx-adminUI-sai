"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/adx/section-card";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
    RECURRENCE_FREQUENCIES,
    RECURRENCE_FREQUENCY_LABEL,
    editFormError,
    editFormOf,
    personDetail,
    personName,
    taskPatch,
    workService,
    type TaskEditForm as EditForm,
    type WorkProject,
    type WorkRecurrenceFrequency,
    type WorkTaskDetail,
} from "@/services/work";
import { WORK_PRIORITY_META, WORK_PROJECT_KIND_LABEL, WORK_TASK_STATUS_META, type WorkPriority } from "@/types";
import { LinkedRecordPicker } from "../../linked-record-picker";

interface TaskEditFormProps {
    task: WorkTaskDetail;
    projects: WorkProject[];
    /** The patch call — swapped in tests. */
    patch?: typeof workService.tasks.patch;
}

/**
 * The DR 10 frame `Edit task · /tasks/:id/edit`, over `PATCH /work/tasks/:id`.
 *
 * The frame's cards are kept — Details, Placement, Schedule, Effort on
 * the left; State and Team on the right — and the sticky bar counts the
 * changes and saves them as one patch of only what moved (`taskPatch`).
 * What each holds is the record's own: the project is a combobox over
 * the ACTIVE projects (a sub-task follows its parent's, so the field is
 * read-only there); the schedule is the planned start, the deadline and
 * the revised end with the recurrence beside them; Effort is the
 * estimate alone — buffer and slack have no column (Q70). The status is
 * not a field here: it moves under the module's rules from the task's
 * page. The team is shown, and edited from the task's page too.
 */
export function TaskEditForm({ task, projects, patch = workService.tasks.patch }: TaskEditFormProps) {
    const router = useRouter();
    const [busy, setBusy] = React.useState(false);
    const [form, setForm] = React.useState<EditForm>(() => editFormOf(task));
    const [linkedLabel, setLinkedLabel] = React.useState<string | null>(task.linked?.label ?? null);

    const set = <K extends keyof EditForm>(key: K, value: EditForm[K]) => setForm((current) => ({ ...current, [key]: value }));

    const pending = taskPatch(task, form);
    const changes = pending ? Object.keys(pending).length : 0;
    const error = editFormError(form);
    const titleMissing = !form.title.trim();
    const datesInverted = Boolean(form.startDate && form.deadline) && form.deadline < form.startDate;
    const canSave = changes > 0 && error === null;

    const projectItems = React.useMemo(
        () => projects.map((project) => ({ value: project.id, label: project.name, description: `${project.displayId ?? ""} ${WORK_PROJECT_KIND_LABEL[project.kind]}`.trim() })),
        [projects],
    );

    const save = async () => {
        if (!pending || error) {
            if (error) toast.error(error);
            return;
        }
        setBusy(true);
        try {
            const saved = await patch(task.id, pending);
            toast.success("Task updated", { description: saved.title });
            router.push(`/tasks/${encodeURIComponent(task.id)}`);
        } catch (caught) {
            toast.error(caught instanceof ApiError ? caught.message : "Could not save the task.");
            setBusy(false);
        }
    };

    return (
        <div className={cn("space-y-5", changes > 0 && "pb-24")}>
            <div>
                <Link href={`/tasks/${encodeURIComponent(task.id)}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <ChevronLeft className="size-4" />
                    {task.title}
                </Link>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Edit task</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">{task.displayId ?? task.id}</p>
            </div>

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="min-w-0 space-y-4">
                    <SectionCard title="Details">
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="title">Title</Label>
                                <Input
                                    id="title"
                                    value={form.title}
                                    onChange={(event) => set("title", event.target.value)}
                                    className={cn(titleMissing && "border-danger")}
                                    aria-invalid={titleMissing}
                                    aria-describedby={titleMissing ? "title-error" : undefined}
                                />
                                {titleMissing && (
                                    <p id="title-error" className="text-xs text-danger">
                                        A title is required
                                    </p>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="description">Description</Label>
                                <Textarea id="description" rows={4} value={form.description} onChange={(event) => set("description", event.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="tags">Tags</Label>
                                <Input id="tags" value={form.tags} onChange={(event) => set("tags", event.target.value)} placeholder="audit, mumbai — comma separated" />
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard title="Placement">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="project">Project</Label>
                                <Combobox
                                    id="project"
                                    items={projectItems}
                                    value={form.projectId}
                                    onValueChange={(projectId) => set("projectId", projectId)}
                                    placeholder="No project"
                                    searchPlaceholder="Search projects"
                                    emptyText="No active project matches."
                                    disabled={Boolean(task.parent)}
                                />
                                {task.parent && <p className="text-xs text-muted-foreground">A sub-task follows its parent&apos;s project.</p>}
                            </div>
                            <div className="space-y-1.5">
                                <Label>Parent task</Label>
                                <p className="flex h-10 items-center text-sm text-foreground">{task.parent ? task.parent.title : "None"}</p>
                            </div>
                        </div>
                        <div className="mt-4 border-t pt-4">
                            <LinkedRecordPicker
                                kind={form.linkedKind}
                                id={form.linkedId}
                                label={linkedLabel}
                                onChange={(linked) => {
                                    setForm((current) => ({ ...current, linkedKind: linked.kind, linkedId: linked.id }));
                                    setLinkedLabel(linked.label);
                                }}
                            />
                        </div>
                    </SectionCard>

                    <SectionCard title="Schedule">
                        <div className="grid gap-4 sm:grid-cols-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="start">Start date</Label>
                                <Input id="start" type="date" value={form.startDate} onChange={(event) => set("startDate", event.target.value)} className="tabular-nums" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="deadline">Deadline</Label>
                                <Input
                                    id="deadline"
                                    type="date"
                                    value={form.deadline}
                                    onChange={(event) => set("deadline", event.target.value)}
                                    className={cn("tabular-nums", datesInverted && "border-danger")}
                                    aria-invalid={datesInverted}
                                    aria-describedby={datesInverted ? "deadline-error" : undefined}
                                />
                                {datesInverted && (
                                    <p id="deadline-error" className="text-xs text-danger">
                                        Deadline is before the start date
                                    </p>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="revised">Revised end</Label>
                                <Input id="revised" type="date" value={form.revisedEndDate} onChange={(event) => set("revisedEndDate", event.target.value)} className="tabular-nums" />
                            </div>
                        </div>

                        <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="frequency">Repeats</Label>
                                <Select value={form.frequency} onValueChange={(value) => set("frequency", value as WorkRecurrenceFrequency | "NONE")}>
                                    <SelectTrigger id="frequency">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="NONE">Does not repeat</SelectItem>
                                        {RECURRENCE_FREQUENCIES.map((option) => (
                                            <SelectItem key={option} value={option}>
                                                {RECURRENCE_FREQUENCY_LABEL[option]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {form.frequency !== "NONE" && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="occurs-on">Occurs on</Label>
                                    <Input id="occurs-on" value={form.occursOn} onChange={(event) => set("occursOn", event.target.value)} placeholder="Mon, Wed, Fri" />
                                </div>
                            )}
                            {form.frequency !== "NONE" && (
                                <>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="recurrence-end">Until</Label>
                                        <Input id="recurrence-end" type="date" value={form.recurrenceEnd} onChange={(event) => set("recurrenceEnd", event.target.value)} className="tabular-nums" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="occurrences">Or a number of times</Label>
                                        <Input id="occurrences" type="number" min={1} value={form.totalOccurrences} onChange={(event) => set("totalOccurrences", event.target.value)} className="tabular-nums" />
                                    </div>
                                </>
                            )}
                        </div>
                        {task.recurrence?.occurrence && task.recurrence.occurrence > 1 && (
                            <p className="mt-3 text-xs text-muted-foreground">This is occurrence {task.recurrence.occurrence} of the series.</p>
                        )}
                    </SectionCard>

                    <SectionCard title="Effort">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="effort">Estimate (hours)</Label>
                                <Input id="effort" type="number" min={0} step="0.5" value={form.effort} onChange={(event) => set("effort", event.target.value)} className="tabular-nums" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="progress">Progress (%)</Label>
                                <Input id="progress" type="number" min={0} max={100} value={form.progress} onChange={(event) => set("progress", event.target.value)} className="tabular-nums" disabled={task.children.length > 0} />
                                {task.children.length > 0 && <p className="text-xs text-muted-foreground">The mean of the sub-tasks&apos; progress — set theirs.</p>}
                            </div>
                        </div>
                    </SectionCard>
                </div>

                <div className="space-y-4">
                    <SectionCard title="State">
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label>Status</Label>
                                <div className="flex items-center gap-2">
                                    <StatusBadge status={WORK_TASK_STATUS_META[task.status]} />
                                    <Link href={`/tasks/${encodeURIComponent(task.id)}`} className="text-xs text-muted-foreground hover:underline">
                                        moves from the task&apos;s page
                                    </Link>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="priority">Priority</Label>
                                <Select value={form.priority} onValueChange={(value) => set("priority", value as WorkPriority)}>
                                    <SelectTrigger id="priority">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(Object.keys(WORK_PRIORITY_META) as WorkPriority[]).map((option) => (
                                            <SelectItem key={option} value={option}>
                                                {WORK_PRIORITY_META[option].label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard title="Team" description={`${task.assignees.length} assigned · edited from the task's page`} contentClassName="px-5 py-1">
                        {task.assignees.length ? (
                            <ul className="divide-y">
                                {task.assignees.map((person) => (
                                    <li key={person.userId} className="flex items-center gap-2.5 py-3">
                                        <InitialsAvatar name={personName(person)} size="sm" />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-foreground">{personName(person)}</p>
                                            <p className="text-xs text-muted-foreground">{personDetail(person)}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="py-3 text-sm text-muted-foreground">Nobody is assigned.</p>
                        )}
                    </SectionCard>
                </div>
            </div>

            {changes > 0 && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur md:left-[243px]">
                    <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
                        <p className="text-sm text-muted-foreground">
                            <span className="font-medium tabular-nums text-foreground">{changes}</span> {changes === 1 ? "change" : "changes"}
                            {error && <span className="ml-2 text-danger">· {error}</span>}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" onClick={() => router.push(`/tasks/${encodeURIComponent(task.id)}`)} disabled={busy}>
                                Cancel
                            </Button>
                            <Button onClick={() => void save()} disabled={!canSave || busy}>
                                {busy ? "Saving…" : "Save"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
