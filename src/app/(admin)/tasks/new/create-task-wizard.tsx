"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FieldList } from "@/components/adx/simple-table";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
    EMPTY_WIZARD,
    LINKED_KIND_LABEL,
    RECURRENCE_FREQUENCIES,
    RECURRENCE_FREQUENCY_LABEL,
    createTaskBody,
    personName,
    wizardStepError,
    workService,
    type TaskWizardForm,
    type WorkPerson,
    type WorkProject,
    type WorkRecurrenceFrequency,
    type WorkTaskCard,
} from "@/services/work";
import { WORK_PRIORITY_META, WORK_PROJECT_KIND_LABEL, type WorkPriority } from "@/types";
import { LinkedRecordPicker } from "../linked-record-picker";
import { PeoplePicker } from "../people-picker";
import { ProjectDialog } from "../projects/project-dialog";

interface CreateTaskWizardProps {
    projects: WorkProject[];
    /** The open tasks a prerequisite or a parent can be chosen from. */
    tasks: WorkTaskCard[];
    initial?: Partial<Pick<TaskWizardForm, "projectId" | "parentTaskId">>;
    /** The create call — swapped in tests. */
    create?: typeof workService.tasks.create;
}

const STEPS = ["Basics", "Schedule", "Team", "Review"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const NONE = "__none__";
/** The project combobox's last item: opens the project dialog inline and picks what it creates (Lot AB). */
const NEW_PROJECT = "__new_project__";

/**
 * The DR 10 frame `Create task · /tasks/new` — four steps, then
 * `POST /work/tasks` with everything at once (`createTaskBody`).
 *
 * The frame's stepper and its steps are kept: Basics, Schedule, Team,
 * Review. What each holds is the create body's own fields — the project
 * combobox, the priority, the record the task is about (a kind and a
 * search over that section's list), the tags; the dates, the estimate,
 * the recurrence (daily / weekly / monthly, until a date or a count); the
 * assignees and the reviewers, each reviewer with the approver toggle,
 * and the prerequisites. A sub-task inherits its parent's project — the
 * server says so with a 409 when the wizard names another.
 */
export function CreateTaskWizard({ projects: listed, tasks, initial, create = workService.tasks.create }: CreateTaskWizardProps) {
    const router = useRouter();
    const [step, setStep] = React.useState(0);
    const [busy, setBusy] = React.useState(false);
    const [form, setForm] = React.useState<TaskWizardForm>({ ...EMPTY_WIZARD, ...initial });
    /* Projects opened from the combobox itself, ahead of the list the loader read. */
    const [opened, setOpened] = React.useState<WorkProject[]>([]);
    const [projectDialogOpen, setProjectDialogOpen] = React.useState(false);
    const projects = React.useMemo(() => [...opened, ...listed.filter((project) => !opened.some((own) => own.id === project.id))], [opened, listed]);
    const [people, setPeople] = React.useState<Map<string, WorkPerson>>(new Map());
    const [linkedLabel, setLinkedLabel] = React.useState<string | null>(null);
    const [tagDraft, setTagDraft] = React.useState("");

    const patch = (partial: Partial<TaskWizardForm>) => setForm((current) => ({ ...current, ...partial }));
    const remember = (list: WorkPerson[]) =>
        setPeople((current) => {
            const next = new Map(current);
            for (const person of list) next.set(person.userId, person);
            return next;
        });
    const nameOf = (userId: string) => personName(people.get(userId) ?? { userId, name: null });

    const projectItems = React.useMemo(
        () => [
            ...projects.map((project) => ({ value: project.id, label: project.name, description: `${project.displayId ?? ""} ${WORK_PROJECT_KIND_LABEL[project.kind]}`.trim() })),
            { value: NEW_PROJECT, label: "New project…", description: "Open a department or region project and file the task under it" },
        ],
        [projects],
    );
    const taskItems = React.useMemo(() => tasks.map((task) => ({ value: task.id, label: task.title, description: task.displayId ?? undefined })), [tasks]);
    const parent = tasks.find((task) => task.id === form.parentTaskId);

    const next = () => {
        const error = wizardStepError(form, step);
        if (error) {
            toast.error(error);
            return;
        }
        setStep((current) => Math.min(current + 1, STEPS.length - 1));
    };

    const submit = async () => {
        for (let i = 0; i < 3; i++) {
            const error = wizardStepError(form, i);
            if (error) {
                setStep(i);
                toast.error(error);
                return;
            }
        }
        setBusy(true);
        try {
            const task = await create(createTaskBody(form));
            toast.success("Task created", { description: `${task.displayId ?? task.title} assigned to ${task.assignees.length} ${task.assignees.length === 1 ? "person" : "people"}.` });
            router.push(`/tasks/${encodeURIComponent(task.id)}`);
        } catch (caught) {
            toast.error(caught instanceof ApiError ? caught.message : "Could not create the task.");
            setBusy(false);
        }
    };

    const addTag = () => {
        const tag = tagDraft.trim();
        if (!tag) return;
        if (!form.tags.includes(tag)) patch({ tags: [...form.tags, tag] });
        setTagDraft("");
    };

    const toggleApprover = (userId: string) => patch({ reviewers: form.reviewers.map((reviewer) => (reviewer.userId === userId ? { ...reviewer, approver: !reviewer.approver } : reviewer)) });

    return (
        <div className="space-y-4">
            {/* Stepper */}
            <ol className="flex items-center gap-2">
                {STEPS.map((label, index) => (
                    <li key={label} className="flex flex-1 items-center gap-2">
                        <span
                            className={cn(
                                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                index < step ? "bg-success text-white" : index === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                            )}
                        >
                            {index < step ? <Check className="size-3.5" /> : index + 1}
                        </span>
                        <span className={cn("text-sm", index === step ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span>
                        {index < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
                    </li>
                ))}
            </ol>

            <Card className="rounded-lg border-border p-5 shadow-none">
                {step === 0 && (
                    <div className="grid gap-4">
                        <div className="grid gap-1.5">
                            <Label htmlFor="task-title">Title</Label>
                            <Input id="task-title" value={form.title} onChange={(event) => patch({ title: event.target.value })} placeholder="e.g. Mumbai Metro station audit" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="task-description">Description</Label>
                            <Textarea id="task-description" value={form.description} onChange={(event) => patch({ description: event.target.value })} rows={4} placeholder="What does done look like?" />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="grid gap-1.5">
                                <Label htmlFor="task-project">Project</Label>
                                <Combobox
                                    id="task-project"
                                    items={projectItems}
                                    value={form.projectId}
                                    onValueChange={(projectId) => (projectId === NEW_PROJECT ? setProjectDialogOpen(true) : patch({ projectId }))}
                                    placeholder={parent ? "Its parent's project" : "No project"}
                                    searchPlaceholder="Search projects"
                                    emptyText="No active project matches."
                                    disabled={Boolean(parent)}
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="task-priority">Priority</Label>
                                <Select value={form.priority} onValueChange={(value) => patch({ priority: value as WorkPriority })}>
                                    <SelectTrigger id="task-priority">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(WORK_PRIORITY_META).map(([value, meta]) => (
                                            <SelectItem key={value} value={value}>
                                                {meta.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="grid gap-1.5">
                                <Label htmlFor="task-parent">Sub-task of</Label>
                                <Combobox
                                    id="task-parent"
                                    items={taskItems}
                                    value={form.parentTaskId}
                                    onValueChange={(parentTaskId) => patch({ parentTaskId, projectId: tasks.find((task) => task.id === parentTaskId)?.project?.id ?? form.projectId })}
                                    placeholder="A task of its own"
                                    searchPlaceholder="Search tasks"
                                    emptyText="No open task matches."
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="task-status">Starts as</Label>
                                <Select value={form.status} onValueChange={(value) => patch({ status: value as "DRAFT" | "TODO" })}>
                                    <SelectTrigger id="task-status">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="TODO">To do — the assignees are told</SelectItem>
                                        <SelectItem value="DRAFT">Draft — not yet on anyone's list</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <LinkedRecordPicker
                            kind={form.linkedKind}
                            id={form.linkedId}
                            label={linkedLabel}
                            onChange={(linked) => {
                                patch({ linkedKind: linked.kind, linkedId: linked.id });
                                setLinkedLabel(linked.label);
                            }}
                        />
                        <div className="grid gap-1.5">
                            <Label htmlFor="task-tags">Tags</Label>
                            <div className="flex flex-wrap items-center gap-1.5">
                                {form.tags.map((tag) => (
                                    <span key={tag} className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs font-medium text-foreground">
                                        {tag}
                                        <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => patch({ tags: form.tags.filter((t) => t !== tag) })} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                                            <X className="size-3" />
                                        </button>
                                    </span>
                                ))}
                                <Input
                                    id="task-tags"
                                    value={tagDraft}
                                    onChange={(event) => setTagDraft(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === ",") {
                                            event.preventDefault();
                                            addTag();
                                        }
                                    }}
                                    onBlur={addTag}
                                    placeholder="Add a tag and press Enter"
                                    className="h-8 w-52"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {step === 1 && (
                    <div className="grid gap-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="task-start">Start date</Label>
                                <Input id="task-start" type="date" value={form.startDate} onChange={(event) => patch({ startDate: event.target.value })} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="task-deadline">Deadline</Label>
                                <Input id="task-deadline" type="date" value={form.deadline} onChange={(event) => patch({ deadline: event.target.value })} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="task-effort">Effort estimate (hours)</Label>
                                <Input id="task-effort" type="number" min={0} step="0.5" value={form.effort} onChange={(event) => patch({ effort: event.target.value })} />
                            </div>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="task-frequency">Recurrence</Label>
                            <Select value={form.frequency} onValueChange={(value) => patch({ frequency: value as WorkRecurrenceFrequency | "NONE", occursOn: [] })}>
                                <SelectTrigger id="task-frequency" className="sm:w-64">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="NONE">Does not repeat</SelectItem>
                                    {RECURRENCE_FREQUENCIES.map((frequency) => (
                                        <SelectItem key={frequency} value={frequency}>
                                            {RECURRENCE_FREQUENCY_LABEL[frequency]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">A repeating task spawns its next copy when this one is verified, the dates advanced by the frequency.</p>
                        </div>
                        {form.frequency === "WEEKLY" && (
                            <div className="grid gap-1.5">
                                <Label>Occurs on</Label>
                                <div className="flex flex-wrap gap-1.5">
                                    {WEEKDAYS.map((day) => {
                                        const selected = form.occursOn.includes(day);
                                        return (
                                            <button
                                                key={day}
                                                type="button"
                                                aria-pressed={selected}
                                                onClick={() => patch({ occursOn: selected ? form.occursOn.filter((d) => d !== day) : [...form.occursOn, day] })}
                                                className={cn(
                                                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                                                    selected ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
                                                )}
                                            >
                                                {day}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {form.frequency === "MONTHLY" && (
                            <div className="grid gap-1.5 sm:w-64">
                                <Label htmlFor="task-occurs-on">Occurs on</Label>
                                <Input id="task-occurs-on" value={form.occursOn[0] ?? ""} onChange={(event) => patch({ occursOn: event.target.value ? [event.target.value] : [] })} placeholder="e.g. 1st, or the last Friday" />
                            </div>
                        )}
                        {form.frequency !== "NONE" && (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="task-recurrence-end">Until</Label>
                                    <Input id="task-recurrence-end" type="date" value={form.recurrenceEnd} onChange={(event) => patch({ recurrenceEnd: event.target.value })} />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="task-occurrences">Or a number of times</Label>
                                    <Input id="task-occurrences" type="number" min={1} value={form.totalOccurrences} onChange={(event) => patch({ totalOccurrences: event.target.value })} placeholder="the original counts as 1" />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {step === 2 && (
                    <div className="grid gap-5">
                        <div className="grid gap-1.5">
                            <Label htmlFor="task-assignees">Assignees</Label>
                            <p className="text-xs text-muted-foreground">Staff and field agents who will do the work. Each is told when the task is created.</p>
                            <PeoplePicker id="task-assignees" value={form.assigneeIds} onChange={(assigneeIds, list) => (remember(list), patch({ assigneeIds }))} />
                        </div>
                        <div className="grid gap-1.5 border-t pt-4">
                            <Label htmlFor="task-reviewers">Reviewers</Label>
                            <p className="text-xs text-muted-foreground">
                                Who signs the task off when it reaches review. Mark an approver and the task verifies only once every approver has approved; with no reviewers it verifies on completion.
                            </p>
                            <PeoplePicker
                                id="task-reviewers"
                                value={form.reviewers.map((reviewer) => reviewer.userId)}
                                onChange={(userIds, list) => {
                                    remember(list);
                                    patch({ reviewers: userIds.map((userId) => form.reviewers.find((reviewer) => reviewer.userId === userId) ?? { userId, approver: false }) });
                                }}
                                placeholder="Search reviewers"
                                renderPicked={(person) => {
                                    const reviewer = form.reviewers.find((r) => r.userId === person.userId);
                                    return (
                                        <label className="ml-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                            <Checkbox checked={reviewer?.approver ?? false} onCheckedChange={() => toggleApprover(person.userId)} aria-label={`${personName(person)} is an approver`} className="size-3.5" />
                                            approver
                                        </label>
                                    );
                                }}
                            />
                        </div>
                        <div className="grid gap-1.5 border-t pt-4">
                            <Label htmlFor="task-prerequisites">Prerequisites</Label>
                            <p className="text-xs text-muted-foreground">Tasks that must be verified before this one can start.</p>
                            <Combobox
                                id="task-prerequisites"
                                multiple
                                items={taskItems.filter((item) => item.value !== form.parentTaskId)}
                                value={form.prerequisiteIds}
                                onValueChange={(prerequisiteIds) => patch({ prerequisiteIds })}
                                placeholder="None"
                                searchPlaceholder="Search tasks"
                                emptyText="No open task matches."
                            />
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="grid gap-4">
                        <FieldList
                            items={[
                                ["Title", form.title],
                                ["Project", projects.find((project) => project.id === form.projectId)?.name ?? (parent ? `${parent.project?.name ?? "Its parent's"}` : "None")],
                                ["Sub-task of", parent?.title ?? "—"],
                                ["Priority", WORK_PRIORITY_META[form.priority].label],
                                ["Starts as", form.status === "TODO" ? "To do" : "Draft"],
                                ["Window", form.startDate || form.deadline ? `${form.startDate || "…"} to ${form.deadline || "…"}` : "No dates"],
                                ["Effort", form.effort.trim() ? `${form.effort}h` : "—"],
                                [
                                    "Recurrence",
                                    form.frequency === "NONE"
                                        ? "Does not repeat"
                                        : `${RECURRENCE_FREQUENCY_LABEL[form.frequency]}${form.occursOn.length ? ` on ${form.occursOn.join(", ")}` : ""}${form.recurrenceEnd ? ` until ${form.recurrenceEnd}` : form.totalOccurrences.trim() ? `, ${form.totalOccurrences} times` : ""}`,
                                ],
                                ["About", form.linkedKind && form.linkedId ? `${LINKED_KIND_LABEL[form.linkedKind]}: ${linkedLabel ?? form.linkedId}` : "—"],
                                ["Tags", form.tags.join(", ") || "—"],
                                ["Assignees", form.assigneeIds.map(nameOf).join(", ") || "None"],
                                ["Reviewers", form.reviewers.map((reviewer) => `${nameOf(reviewer.userId)}${reviewer.approver ? " (approver)" : ""}`).join(", ") || "None — verifies on completion"],
                                ["Prerequisites", form.prerequisiteIds.map((id) => tasks.find((task) => task.id === id)?.title ?? id).join(", ") || "None"],
                            ]}
                        />
                        <p className="text-xs text-muted-foreground">
                            {form.status === "TODO" ? "The task lands on the assignees' lists as To do and each is notified." : "The task starts as a draft; move it to To do when it is ready."}
                        </p>
                    </div>
                )}
            </Card>

            <ProjectDialog
                open={projectDialogOpen}
                onOpenChange={setProjectDialogOpen}
                onSaved={(project) => {
                    setOpened((current) => [project, ...current.filter((own) => own.id !== project.id)]);
                    patch({ projectId: project.id });
                }}
            />

            <div className="flex items-center justify-between">
                <Button variant="outline" className="bg-card" disabled={step === 0 || busy} onClick={() => setStep((current) => Math.max(current - 1, 0))}>
                    <ChevronLeft className="size-4" />
                    Back
                </Button>
                {step < STEPS.length - 1 ? (
                    <Button onClick={next}>
                        Continue
                        <ChevronRight className="size-4" />
                    </Button>
                ) : (
                    <Button onClick={() => void submit()} disabled={busy}>
                        {busy ? "Creating…" : "Create task"}
                    </Button>
                )}
            </div>
        </div>
    );
}
