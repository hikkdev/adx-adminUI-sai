"use client";

import * as React from "react";
import {
    CalendarDays,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    MoreHorizontal,
    Pause,
    Play,
    Plus,
    RotateCcw,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/adx/empty-state";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
    SCHEDULE_STATUS_META,
    type ScheduleEntry,
    type ScheduleLogEntry,
    type ScheduleStatus,
} from "@/types";

interface ScheduleViewProps {
    initialEntries: ScheduleEntry[];
    initialLog: ScheduleLogEntry[];
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

const TODAY = { year: 2026, month: 7, day: 10 }; // 10 Aug 2026

const iso = (year: number, month: number, day: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const prettyDate = (dateIso: string) => {
    const [year, month, day] = dateIso.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        timeZone: "UTC",
    });
};

let entrySequence = 100;
let logSequence = 100;

export function ScheduleView({ initialEntries, initialLog }: ScheduleViewProps) {
    const [entries, setEntries] = React.useState(initialEntries);
    const [log, setLog] = React.useState(initialLog);
    const [view, setView] = React.useState({ year: TODAY.year, month: TODAY.month });
    const [selectedDate, setSelectedDate] = React.useState(
        iso(TODAY.year, TODAY.month, TODAY.day)
    );
    const [addOpen, setAddOpen] = React.useState(false);
    const [draft, setDraft] = React.useState({
        title: "",
        time: "10:00",
        assignee: "Darlene Robertson",
        department: "Design",
    });

    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const firstWeekday = new Date(view.year, view.month, 1).getDay();
    const scheduledDays = React.useMemo(() => {
        const days = new Set<string>();
        for (const entry of entries) days.add(entry.date);
        return days;
    }, [entries]);

    const dayEntries = entries
        .filter((entry) => entry.date === selectedDate)
        .sort((a, b) => a.time.localeCompare(b.time));

    const appendLog = (entry: string, action: string, detail: string) => {
        logSequence += 1;
        setLog((current) => [
            {
                id: `SLG-N${logSequence}`,
                at: `${selectedDate}T12:00:00`,
                entry,
                action,
                detail,
            },
            ...current,
        ]);
    };

    const setStatus = (id: string, status: ScheduleStatus) => {
        const target = entries.find((entry) => entry.id === id);
        if (!target) return;
        setEntries((current) =>
            current.map((entry) => (entry.id === id ? { ...entry, status } : entry))
        );
        appendLog(
            target.title,
            SCHEDULE_STATUS_META[status].label,
            `${target.assignee} · previously ${SCHEDULE_STATUS_META[target.status].label.toLowerCase()}.`
        );
        toast.success(`${target.title}: ${SCHEDULE_STATUS_META[status].label.toLowerCase()}`);
    };

    const removeEntry = (id: string) => {
        const target = entries.find((entry) => entry.id === id);
        if (!target) return;
        setEntries((current) => current.filter((entry) => entry.id !== id));
        appendLog(target.title, "Deleted", `Removed from ${prettyDate(target.date)}.`);
        toast.success(`${target.title} removed`);
    };

    const addEntry = () => {
        if (!draft.title.trim()) {
            toast.error("Give the entry a title.");
            return;
        }
        entrySequence += 1;
        const created: ScheduleEntry = {
            id: `SCH-N${entrySequence}`,
            date: selectedDate,
            time: draft.time,
            title: draft.title.trim(),
            assignee: draft.assignee,
            department: draft.department,
            status: "pending",
        };
        setEntries((current) => [...current, created]);
        appendLog(created.title, "Created", `Scheduled ${draft.time} on ${prettyDate(selectedDate)}.`);
        setAddOpen(false);
        setDraft((current) => ({ ...current, title: "" }));
        toast.success("Added to the schedule");
    };

    const moveMonth = (delta: number) => {
        setView((current) => {
            const next = new Date(current.year, current.month + delta, 1);
            return { year: next.getFullYear(), month: next.getMonth() };
        });
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title="Schedule"
                subtitle="Day by day staff assignments with a full change log."
                actions={
                    <Button onClick={() => setAddOpen(true)}>
                        <Plus className="size-4" />
                        Add entry
                    </Button>
                }
            />

            <div className="grid gap-4 xl:grid-cols-3">
                {/* Calendar + day list */}
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <div className="flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() => moveMonth(-1)}
                            aria-label="Previous month"
                            className="rounded-md border bg-card p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <ChevronLeft className="size-4" />
                        </button>
                        <span className="text-sm font-semibold text-foreground">
                            {MONTH_NAMES[view.month]} {view.year}
                        </span>
                        <button
                            type="button"
                            onClick={() => moveMonth(1)}
                            aria-label="Next month"
                            className="rounded-md border bg-card p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <ChevronRight className="size-4" />
                        </button>
                    </div>

                    <div className="mt-4 grid grid-cols-7 gap-y-1 text-center">
                        {WEEKDAYS.map((day) => (
                            <span
                                key={day}
                                className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70"
                            >
                                {day}
                            </span>
                        ))}
                        {Array.from({ length: firstWeekday }).map((_, index) => (
                            <span key={`pad-${index}`} />
                        ))}
                        {Array.from({ length: daysInMonth }).map((_, index) => {
                            const day = index + 1;
                            const dateIso = iso(view.year, view.month, day);
                            const isSelected = dateIso === selectedDate;
                            const isToday =
                                view.year === TODAY.year &&
                                view.month === TODAY.month &&
                                day === TODAY.day;
                            return (
                                <span key={day} className="relative flex justify-center py-0.5">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedDate(dateIso)}
                                        className={cn(
                                            "flex size-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
                                            isSelected
                                                ? "bg-primary text-primary-foreground"
                                                : isToday
                                                  ? "text-primary ring-1 ring-primary/40"
                                                  : "text-foreground hover:bg-muted"
                                        )}
                                    >
                                        {day}
                                    </button>
                                    {scheduledDays.has(dateIso) && !isSelected && (
                                        <span className="absolute bottom-0.5 size-1 rounded-full bg-primary" />
                                    )}
                                </span>
                            );
                        })}
                    </div>

                    <p className="mt-4 border-t pt-3 text-xs font-medium text-muted-foreground">
                        {prettyDate(selectedDate)}
                    </p>
                    <div className="mt-2 space-y-2.5">
                        {dayEntries.length ? (
                            dayEntries.map((entry) => (
                                <div
                                    key={entry.id}
                                    className={cn(
                                        "rounded-lg border p-3",
                                        entry.status === "completed" && "opacity-70"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <Clock className="size-3" />
                                                {entry.time}
                                            </p>
                                            <p
                                                className={cn(
                                                    "mt-0.5 text-sm font-medium text-foreground",
                                                    entry.status === "completed" &&
                                                        "text-muted-foreground line-through"
                                                )}
                                            >
                                                {entry.title}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                            <StatusBadge
                                                status={SCHEDULE_STATUS_META[entry.status]}
                                            />
                                            <DropdownMenu>
                                                <DropdownMenuTrigger
                                                    aria-label={`Actions for ${entry.title}`}
                                                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                >
                                                    <MoreHorizontal className="size-4" />
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    {entry.status !== "completed" && (
                                                        <>
                                                            {entry.status !== "in_progress" && (
                                                                <DropdownMenuItem
                                                                    onClick={() =>
                                                                        setStatus(entry.id, "in_progress")
                                                                    }
                                                                >
                                                                    <Play className="size-4" />
                                                                    Start
                                                                </DropdownMenuItem>
                                                            )}
                                                            {entry.status === "in_progress" && (
                                                                <DropdownMenuItem
                                                                    onClick={() =>
                                                                        setStatus(entry.id, "paused")
                                                                    }
                                                                >
                                                                    <Pause className="size-4" />
                                                                    Pause
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuItem
                                                                onClick={() =>
                                                                    setStatus(entry.id, "completed")
                                                                }
                                                            >
                                                                <CheckCircle2 className="size-4" />
                                                                Mark done
                                                            </DropdownMenuItem>
                                                        </>
                                                    )}
                                                    {entry.status === "completed" && (
                                                        <DropdownMenuItem
                                                            onClick={() => setStatus(entry.id, "pending")}
                                                        >
                                                            <RotateCcw className="size-4" />
                                                            Reopen
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        className="text-danger focus:text-danger"
                                                        onClick={() => removeEntry(entry.id)}
                                                    >
                                                        <Trash2 className="size-4" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                        <InitialsAvatar name={entry.assignee} size="sm" />
                                        <div className="min-w-0">
                                            <p className="truncate text-xs font-medium text-foreground">
                                                {entry.assignee}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground">
                                                {entry.department}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">
                                Nothing scheduled for this day.
                            </p>
                        )}
                    </div>
                </Card>

                {/* Change log */}
                <Card className="rounded-lg border-border shadow-none xl:col-span-2">
                    <div className="flex items-center justify-between border-b px-5 py-4">
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">Change log</h2>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                Every create, status change and delete on the schedule
                            </p>
                        </div>
                        {log.length > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="bg-card"
                                onClick={() => {
                                    setLog([]);
                                    toast.success("Change log cleared");
                                }}
                            >
                                Clear all
                            </Button>
                        )}
                    </div>
                    {log.length ? (
                        <ol className="divide-y">
                            {log.map((item) => (
                                <li key={item.id} className="flex items-start gap-3 px-5 py-3.5">
                                    <span
                                        className={cn(
                                            "mt-1.5 size-2 shrink-0 rounded-full",
                                            item.action === "Deleted"
                                                ? "bg-danger"
                                                : item.action === "Completed"
                                                  ? "bg-success"
                                                  : item.action === "Created"
                                                    ? "bg-info"
                                                    : "bg-warning"
                                        )}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-foreground">
                                            <span className="font-medium">{item.entry}</span>{" "}
                                            <span className="text-muted-foreground">
                                                {item.action.toLowerCase()}
                                            </span>
                                        </p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {item.detail}
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {formatDateTime(item.at)}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <div className="px-5 py-10">
                            <EmptyState
                                icon={CalendarDays}
                                title="No changes yet"
                                description="Schedule activity will appear here as the team works."
                            />
                        </div>
                    )}
                </Card>
            </div>

            {/* Add entry dialog */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add schedule entry</DialogTitle>
                        <DialogDescription>
                            Goes on {prettyDate(selectedDate)}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-1">
                        <div className="grid gap-1.5">
                            <Label htmlFor="sch-title">Title</Label>
                            <Input
                                id="sch-title"
                                value={draft.title}
                                onChange={(event) =>
                                    setDraft((current) => ({ ...current, title: event.target.value }))
                                }
                                placeholder="e.g. Site visit briefing"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="sch-time">Time</Label>
                                <Input
                                    id="sch-time"
                                    type="time"
                                    value={draft.time}
                                    onChange={(event) =>
                                        setDraft((current) => ({
                                            ...current,
                                            time: event.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="sch-department">Department</Label>
                                <Select
                                    value={draft.department}
                                    onValueChange={(value) =>
                                        setDraft((current) => ({ ...current, department: value }))
                                    }
                                >
                                    <SelectTrigger id="sch-department">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {["Design", "Development", "Management", "Sales", "Support"].map(
                                            (department) => (
                                                <SelectItem key={department} value={department}>
                                                    {department}
                                                </SelectItem>
                                            )
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="sch-assignee">Assigned to</Label>
                            <Select
                                value={draft.assignee}
                                onValueChange={(value) =>
                                    setDraft((current) => ({ ...current, assignee: value }))
                                }
                            >
                                <SelectTrigger id="sch-assignee">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {["Darlene Robertson", "Floyd Miles", "Admin"].map((person) => (
                                        <SelectItem key={person} value={person}>
                                            {person}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            className="bg-card"
                            onClick={() => setAddOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button onClick={addEntry}>Add entry</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
