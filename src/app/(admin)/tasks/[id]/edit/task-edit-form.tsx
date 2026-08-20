"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { SectionCard } from "@/components/adx/section-card";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { cn } from "@/lib/utils";
import {
    WORK_TASK_PRIORITY_META,
    WORK_TASK_STATUS_META,
    type RecurrenceFrequency,
    type WorkTask,
    type WorkTaskPriority,
    type WorkTaskStatus,
} from "@/types";

interface TaskEditFormProps {
    task: WorkTask;
}

const STATUS_FLOW: WorkTaskStatus[] = [
    "draft",
    "todo",
    "in_progress",
    "blocked",
    "pending_review",
    "verified",
    "archived",
];

const FREQUENCIES: RecurrenceFrequency[] = [
    "none",
    "daily",
    "weekly",
    "monthly",
    "quarterly",
    "yearly",
];

export function TaskEditForm({ task }: TaskEditFormProps) {
    const router = useRouter();
    const [dirty, setDirty] = React.useState<Set<string>>(new Set());
    const [form, setForm] = React.useState({
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        project: task.project,
        projectType: task.projectType,
        location: task.location,
        startDate: task.startDate,
        deadline: task.deadline,
        revisedEndDate: task.revisedEndDate,
        effortEstimate: task.effortEstimate,
        bufferTime: task.bufferTime,
        slackTime: task.slackTime,
        frequency: task.recurrence.frequency,
        occursOn: task.recurrence.occursOn ?? "",
    });

    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
        setForm((current) => ({ ...current, [key]: value }));
        setDirty((current) => new Set(current).add(String(key)));
    };

    const titleMissing = !form.title.trim();
    const datesInverted =
        Boolean(form.startDate && form.deadline) && form.deadline < form.startDate;
    const canSave = dirty.size > 0 && !titleMissing && !datesInverted;

    const save = () => {
        if (!canSave) return;
        setDirty(new Set());
        toast.success("Task updated", { description: form.title });
        router.push(`/tasks/${task.id}`);
    };

    return (
        <div className={cn("space-y-5", dirty.size > 0 && "pb-24")}>
            <div>
                <Link
                    href={`/tasks/${task.id}`}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    {task.title}
                </Link>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                    Edit task
                </h1>
                <p className="mt-0.5 text-sm text-muted-foreground">{task.id}</p>
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
                                <Textarea
                                    id="description"
                                    rows={4}
                                    value={form.description}
                                    onChange={(event) => set("description", event.target.value)}
                                />
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard title="Placement">
                        <div className="grid gap-4 sm:grid-cols-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="project">Project</Label>
                                <Input
                                    id="project"
                                    value={form.project}
                                    onChange={(event) => set("project", event.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="project-type">Project type</Label>
                                <Select
                                    value={form.projectType}
                                    onValueChange={(value) =>
                                        set("projectType", value as WorkTask["projectType"])
                                    }
                                >
                                    <SelectTrigger id="project-type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Department">Department</SelectItem>
                                        <SelectItem value="Region">Region</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="location">Location</Label>
                                <Input
                                    id="location"
                                    value={form.location}
                                    onChange={(event) => set("location", event.target.value)}
                                />
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard title="Schedule">
                        <div className="grid gap-4 sm:grid-cols-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="start">Start date</Label>
                                <Input
                                    id="start"
                                    type="date"
                                    value={form.startDate}
                                    onChange={(event) => set("startDate", event.target.value)}
                                    className="tabular-nums"
                                />
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
                                <Input
                                    id="revised"
                                    type="date"
                                    value={form.revisedEndDate}
                                    onChange={(event) => set("revisedEndDate", event.target.value)}
                                    className="tabular-nums"
                                />
                            </div>
                        </div>

                        <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="frequency">Repeats</Label>
                                <Select
                                    value={form.frequency}
                                    onValueChange={(value) =>
                                        set("frequency", value as RecurrenceFrequency)
                                    }
                                >
                                    <SelectTrigger id="frequency">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {FREQUENCIES.map((option) => (
                                            <SelectItem key={option} value={option}>
                                                {option === "none"
                                                    ? "Does not repeat"
                                                    : option[0].toUpperCase() + option.slice(1)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {form.frequency !== "none" && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="occurs-on">Occurs on</Label>
                                    <Input
                                        id="occurs-on"
                                        value={form.occursOn}
                                        onChange={(event) => set("occursOn", event.target.value)}
                                        placeholder="Mon, Wed, Fri"
                                    />
                                </div>
                            )}
                        </div>
                    </SectionCard>

                    <SectionCard title="Effort">
                        <div className="grid gap-4 sm:grid-cols-3">
                            {(
                                [
                                    ["effortEstimate", "Estimate"],
                                    ["bufferTime", "Buffer"],
                                    ["slackTime", "Slack"],
                                ] as const
                            ).map(([key, label]) => (
                                <div key={key} className="space-y-1.5">
                                    <Label htmlFor={key}>{label}</Label>
                                    <Input
                                        id={key}
                                        value={form[key]}
                                        onChange={(event) => set(key, event.target.value)}
                                        className="tabular-nums"
                                    />
                                </div>
                            ))}
                        </div>
                    </SectionCard>
                </div>

                <div className="space-y-4">
                    <SectionCard title="State">
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="status">Status</Label>
                                <Select
                                    value={form.status}
                                    onValueChange={(value) => set("status", value as WorkTaskStatus)}
                                >
                                    <SelectTrigger id="status">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {STATUS_FLOW.map((option) => (
                                            <SelectItem key={option} value={option}>
                                                {WORK_TASK_STATUS_META[option].label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="priority">Priority</Label>
                                <Select
                                    value={form.priority}
                                    onValueChange={(value) =>
                                        set("priority", value as WorkTaskPriority)
                                    }
                                >
                                    <SelectTrigger id="priority">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(
                                            Object.keys(
                                                WORK_TASK_PRIORITY_META
                                            ) as WorkTaskPriority[]
                                        ).map((option) => (
                                            <SelectItem key={option} value={option}>
                                                {WORK_TASK_PRIORITY_META[option].label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard
                        title="Team"
                        description={`${task.team.length} assigned`}
                        contentClassName="px-5 py-1"
                    >
                        <ul className="divide-y">
                            {task.team.map((member) => (
                                <li key={member.id} className="flex items-center gap-2.5 py-3">
                                    <InitialsAvatar name={member.name} size="sm" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {member.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {member.role}
                                        </p>
                                    </div>
                                    <Button variant="ghost" size="sm">
                                        Remove
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </SectionCard>
                </div>
            </div>

            {dirty.size > 0 && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur md:left-[243px]">
                    <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
                        <p className="text-sm text-muted-foreground">
                            <span className="font-medium tabular-nums text-foreground">
                                {dirty.size}
                            </span>{" "}
                            {dirty.size === 1 ? "change" : "changes"}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" onClick={() => router.push(`/tasks/${task.id}`)}>
                                Cancel
                            </Button>
                            <Button onClick={save} disabled={!canSave}>
                                Save
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
