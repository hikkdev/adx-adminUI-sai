"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { FieldList } from "@/components/adx/simple-table";
import { cn } from "@/lib/utils";
import type { RecurrenceFrequency, TeamMember, WorkTaskPriority } from "@/types";

interface CreateTaskWizardProps {
    projects: string[];
    people: TeamMember[];
}

const STEPS = ["Basics", "Schedule", "Team", "Review"];

const FREQUENCIES: { value: RecurrenceFrequency; label: string }[] = [
    { value: "none", label: "Does not repeat" },
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "yearly", label: "Yearly" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CreateTaskWizard({ projects, people }: CreateTaskWizardProps) {
    const router = useRouter();
    const [step, setStep] = React.useState(0);
    const [form, setForm] = React.useState({
        title: "",
        description: "",
        project: projects[0] ?? "Development",
        priority: "medium" as WorkTaskPriority,
        startDate: "2026-08-11",
        deadline: "2026-08-25",
        effort: "40",
        frequency: "none" as RecurrenceFrequency,
        occursOn: [] as string[],
        teamIds: [] as string[],
        reviewerId: people[0]?.id ?? "",
        requireApproval: true,
    });

    const patch = (partial: Partial<typeof form>) =>
        setForm((current) => ({ ...current, ...partial }));

    const stepValid = () => {
        if (step === 0) return form.title.trim().length > 2 && form.description.trim().length > 0;
        if (step === 1) return form.startDate <= form.deadline;
        if (step === 2) return form.teamIds.length > 0;
        return true;
    };

    const next = () => {
        if (!stepValid()) {
            toast.error(
                step === 0
                    ? "Give the task a title and a short description."
                    : step === 1
                      ? "The deadline must be on or after the start date."
                      : "Pick at least one team member."
            );
            return;
        }
        setStep((current) => Math.min(current + 1, STEPS.length - 1));
    };

    const submit = () => {
        toast.success("Task created", {
            description: `${form.title} assigned to ${form.teamIds.length} members.`,
        });
        router.push("/tasks/board");
    };

    const toggleTeam = (id: string) =>
        patch({
            teamIds: form.teamIds.includes(id)
                ? form.teamIds.filter((memberId) => memberId !== id)
                : [...form.teamIds, id],
        });

    const selectedNames = people
        .filter((person) => form.teamIds.includes(person.id))
        .map((person) => person.name);

    return (
        <div className="space-y-4">
            {/* Stepper */}
            <ol className="flex items-center gap-2">
                {STEPS.map((label, index) => (
                    <li key={label} className="flex flex-1 items-center gap-2">
                        <span
                            className={cn(
                                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                index < step
                                    ? "bg-success text-white"
                                    : index === step
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-muted-foreground"
                            )}
                        >
                            {index < step ? <Check className="size-3.5" /> : index + 1}
                        </span>
                        <span
                            className={cn(
                                "text-sm",
                                index === step
                                    ? "font-medium text-foreground"
                                    : "text-muted-foreground"
                            )}
                        >
                            {label}
                        </span>
                        {index < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
                    </li>
                ))}
            </ol>

            <Card className="rounded-lg border-border p-5 shadow-none">
                {step === 0 && (
                    <div className="grid gap-4">
                        <div className="grid gap-1.5">
                            <Label htmlFor="task-title">Title</Label>
                            <Input
                                id="task-title"
                                value={form.title}
                                onChange={(event) => patch({ title: event.target.value })}
                                placeholder="e.g. Mumbai Metro Station Audit"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="task-description">Description</Label>
                            <Textarea
                                id="task-description"
                                value={form.description}
                                onChange={(event) => patch({ description: event.target.value })}
                                rows={4}
                                placeholder="What does done look like?"
                            />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="grid gap-1.5">
                                <Label htmlFor="task-project">Project</Label>
                                <Select
                                    value={form.project}
                                    onValueChange={(value) => patch({ project: value })}
                                >
                                    <SelectTrigger id="task-project">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {projects.map((project) => (
                                            <SelectItem key={project} value={project}>
                                                {project}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="task-priority">Priority</Label>
                                <Select
                                    value={form.priority}
                                    onValueChange={(value) =>
                                        patch({ priority: value as WorkTaskPriority })
                                    }
                                >
                                    <SelectTrigger id="task-priority">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="high">High</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="low">Low</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                )}

                {step === 1 && (
                    <div className="grid gap-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="task-start">Start date</Label>
                                <Input
                                    id="task-start"
                                    type="date"
                                    value={form.startDate}
                                    onChange={(event) => patch({ startDate: event.target.value })}
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="task-deadline">Deadline</Label>
                                <Input
                                    id="task-deadline"
                                    type="date"
                                    value={form.deadline}
                                    onChange={(event) => patch({ deadline: event.target.value })}
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="task-effort">Effort estimate (hours)</Label>
                                <Input
                                    id="task-effort"
                                    type="number"
                                    min={1}
                                    value={form.effort}
                                    onChange={(event) => patch({ effort: event.target.value })}
                                />
                            </div>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="task-frequency">Recurrence</Label>
                            <Select
                                value={form.frequency}
                                onValueChange={(value) =>
                                    patch({ frequency: value as RecurrenceFrequency })
                                }
                            >
                                <SelectTrigger id="task-frequency" className="sm:w-64">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {FREQUENCIES.map((frequency) => (
                                        <SelectItem key={frequency.value} value={frequency.value}>
                                            {frequency.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {form.frequency === "weekly" && (
                            <div className="grid gap-1.5">
                                <Label>Occurs on</Label>
                                <div className="flex flex-wrap gap-1.5">
                                    {WEEKDAYS.map((day) => {
                                        const selected = form.occursOn.includes(day);
                                        return (
                                            <button
                                                key={day}
                                                type="button"
                                                onClick={() =>
                                                    patch({
                                                        occursOn: selected
                                                            ? form.occursOn.filter((d) => d !== day)
                                                            : [...form.occursOn, day],
                                                    })
                                                }
                                                className={cn(
                                                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                                                    selected
                                                        ? "border-primary bg-primary text-primary-foreground"
                                                        : "bg-card text-muted-foreground hover:text-foreground"
                                                )}
                                            >
                                                {day}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {step === 2 && (
                    <div className="grid gap-4">
                        <div className="grid gap-1.5">
                            <Label>Team members</Label>
                            <p className="text-xs text-muted-foreground">
                                Staff and field agents who will execute the task.
                            </p>
                            <ul className="mt-1 grid max-h-72 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
                                {people.map((person) => {
                                    const checked = form.teamIds.includes(person.id);
                                    return (
                                        <li key={person.id}>
                                            <button
                                                type="button"
                                                onClick={() => toggleTeam(person.id)}
                                                className={cn(
                                                    "flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors",
                                                    checked
                                                        ? "border-primary/40 bg-primary/5"
                                                        : "bg-card hover:bg-muted/50"
                                                )}
                                            >
                                                <InitialsAvatar name={person.name} size="sm" />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-medium text-foreground">
                                                        {person.name}
                                                    </span>
                                                    <span className="block text-xs text-muted-foreground">
                                                        {person.role}
                                                    </span>
                                                </span>
                                                {checked && (
                                                    <Check className="size-4 shrink-0 text-primary" />
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="grid gap-1.5">
                                <Label htmlFor="task-reviewer">Reviewer</Label>
                                <Select
                                    value={form.reviewerId}
                                    onValueChange={(value) => patch({ reviewerId: value })}
                                >
                                    <SelectTrigger id="task-reviewer">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {people
                                            .filter((person) => person.role !== "Field Agent")
                                            .map((person) => (
                                                <SelectItem key={person.id} value={person.id}>
                                                    {person.name}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <label className="flex items-center gap-2.5 self-end rounded-md border bg-card px-3 py-2.5">
                                <Checkbox
                                    checked={form.requireApproval}
                                    onCheckedChange={(checked) =>
                                        patch({ requireApproval: checked === true })
                                    }
                                />
                                <span className="text-sm text-foreground">
                                    Completion needs reviewer approval
                                </span>
                            </label>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="grid gap-4">
                        <FieldList
                            items={[
                                ["Title", form.title],
                                ["Project", form.project],
                                ["Priority", form.priority[0].toUpperCase() + form.priority.slice(1)],
                                ["Window", `${form.startDate} to ${form.deadline}`],
                                ["Effort", `${form.effort}h`],
                                [
                                    "Recurrence",
                                    form.frequency === "none"
                                        ? "Does not repeat"
                                        : form.frequency === "weekly" && form.occursOn.length
                                          ? `Weekly on ${form.occursOn.join(", ")}`
                                          : form.frequency[0].toUpperCase() + form.frequency.slice(1),
                                ],
                                ["Team", selectedNames.join(", ") || "None"],
                                [
                                    "Reviewer",
                                    people.find((person) => person.id === form.reviewerId)?.name ??
                                        "None",
                                ],
                                ["Approval required", form.requireApproval ? "Yes" : "No"],
                            ]}
                        />
                        <p className="text-xs text-muted-foreground">
                            The task starts in Draft and moves to To do once assigned members are
                            notified.
                        </p>
                    </div>
                )}
            </Card>

            <div className="flex items-center justify-between">
                <Button
                    variant="outline"
                    className="bg-card"
                    disabled={step === 0}
                    onClick={() => setStep((current) => Math.max(current - 1, 0))}
                >
                    <ChevronLeft className="size-4" />
                    Back
                </Button>
                {step < STEPS.length - 1 ? (
                    <Button onClick={next}>
                        Continue
                        <ChevronRight className="size-4" />
                    </Button>
                ) : (
                    <Button onClick={submit}>Create task</Button>
                )}
            </div>
        </div>
    );
}
