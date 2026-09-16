"use client";

import * as React from "react";
import Link from "next/link";
import {
    CalendarDays,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    ExternalLink,
    MoreHorizontal,
    Pause,
    Pencil,
    Play,
    Plus,
    RotateCcw,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { EmptyState } from "@/components/adx/empty-state";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PERSON_KIND_META, personDetail, personLabel, type Person } from "@/services/employees";
import type { StatusMeta } from "@/types";
import {
    assigneeNames,
    busyDays,
    entriesOn,
    entrySlot,
    holidaysByDay,
    isoDay,
    istTimeOf,
    logLine,
    overlayHref,
    overlayKindMeta,
    overlayOn,
    prettyDay,
    scheduleService,
    scheduleStatusMeta,
    type ScheduleEntry,
    type ScheduleLogPage,
    type ScheduleStatus,
    type ScheduleWindow,
} from "@/services/schedule";
import { EntryDialog } from "./entry-dialog";

interface ScheduleViewProps {
    diary: ScheduleWindow;
    /** Null while the log is still loading. */
    log: ScheduleLogPage | null;
    logError: string | null;
    people: Person[];
    today: string;
    view: { year: number; month: number };
    onViewChange: (view: { year: number; month: number }) => void;
    selectedDate: string;
    onSelectDate: (date: string) => void;
    /** The selected person's user id, or null for everyone. */
    person: string | null;
    onPersonChange: (userId: string | null) => void;
    /** E10-1: whether the registry was asked for the people who have left too (`?includeInactive=`). */
    showFormer: boolean;
    onShowFormerChange: (show: boolean) => void;
    onChanged: () => void;
}

/** A person who has left: the registry lists them only under "Show former", flagged `active: false`. */
const FORMER_META: StatusMeta = { label: "Former", tone: "neutral" };

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

const EVERYONE = "__everyone__";

const message = (caught: unknown, fallback: string) => (caught instanceof ApiError ? caught.message : fallback);

/**
 * The DR 10 frame `Schedule · /schedule`.
 *
 * The frame's two cards are kept as drawn: the month grid with the
 * selected day's entries under it on the left, the change log on the
 * right, "Add entry" top right. What is added is what Q99 decided: a
 * person picker above the grid (staff and agents, both assignable), and —
 * only when a person is picked — their field work overlaid on the day in
 * a distinct dashed style, read-only, each row linking out to the visits
 * board or the order. Holidays shade their cells. The log has no
 * "Clear all": the trail is the record of the diary, not part of it.
 */
export function ScheduleView({
    diary,
    log,
    logError,
    people,
    today,
    view,
    onViewChange,
    selectedDate,
    onSelectDate,
    person,
    onPersonChange,
    showFormer,
    onShowFormerChange,
    onChanged,
}: ScheduleViewProps) {
    const [editing, setEditing] = React.useState<ScheduleEntry | "new" | null>(null);
    const [deleting, setDeleting] = React.useState<ScheduleEntry | null>(null);
    const [busy, setBusy] = React.useState(false);

    /* The registry's labels, then every name the window and the log carry
       themselves (E10-1) — so an entry against somebody who has left is
       named even while the picker is not showing former people. */
    const names = assigneeNames(diary, log, new Map(people.map((row) => [row.userId, personLabel(row)] as const)));
    const peopleById = new Map(people.map((row) => [row.userId, row] as const));
    /* An entry can only be put against somebody the registry still knows. */
    const assignable = people.filter((row) => row.active !== false);
    const departments = [...new Set(people.map((row) => (row.kind === "STAFF" ? row.department?.trim() : null)).filter((name): name is string => Boolean(name)))].sort();

    const daysInMonth = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate();
    const firstWeekday = new Date(Date.UTC(view.year, view.month, 1)).getUTCDay();
    const markedDays = busyDays(diary);
    const holidays = holidaysByDay(diary);
    const dayEntries = entriesOn(diary, selectedDate);
    const dayOverlay = overlayOn(diary, selectedDate);
    const dayHolidays = holidays.get(selectedDate) ?? [];
    const selectedPerson = person ? (peopleById.get(person) ?? null) : null;

    const moveMonth = (delta: number) => {
        const next = new Date(Date.UTC(view.year, view.month + delta, 1));
        onViewChange({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
    };

    const setStatus = async (entry: ScheduleEntry, status: ScheduleStatus) => {
        setBusy(true);
        try {
            await scheduleService.setStatus(entry.id, status);
            toast.success(`${entry.title}: ${scheduleStatusMeta(status).label.toLowerCase()}`);
            onChanged();
        } catch (caught) {
            toast.error(message(caught, "Could not update the entry."));
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!deleting) return;
        setBusy(true);
        try {
            await scheduleService.remove(deleting.id);
            toast.success(`${deleting.title} removed`);
            setDeleting(null);
            onChanged();
        } catch (caught) {
            toast.error(message(caught, "Could not remove the entry."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title="Schedule"
                subtitle="Day by day staff assignments with a full change log."
                actions={
                    <Button onClick={() => setEditing("new")}>
                        <Plus className="size-4" />
                        Add entry
                    </Button>
                }
            />

            <div className="grid gap-4 xl:grid-cols-3">
                {/* Calendar + day list */}
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <Select value={person ?? EVERYONE} onValueChange={(value) => onPersonChange(value === EVERYONE ? null : value)}>
                        <SelectTrigger aria-label="Person" className="bg-card">
                            <SelectValue>
                                {selectedPerson ? (
                                    <span className="flex items-center gap-2">
                                        {personLabel(selectedPerson)}
                                        <StatusBadge status={PERSON_KIND_META[selectedPerson.kind]} />
                                        {selectedPerson.active === false && <StatusBadge status={FORMER_META} />}
                                    </span>
                                ) : person ? (
                                    (names.get(person) ?? person)
                                ) : (
                                    "Everyone"
                                )}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={EVERYONE}>Everyone</SelectItem>
                            {people.map((row) => (
                                <SelectItem key={row.userId} value={row.userId}>
                                    <span className="flex items-center gap-2">
                                        {personLabel(row)}
                                        <StatusBadge status={PERSON_KIND_META[row.kind]} />
                                        {row.active === false && <StatusBadge status={FORMER_META} />}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch checked={showFormer} onCheckedChange={onShowFormerChange} aria-label="Show former" />
                        Show former staff and agents
                    </label>
                    {selectedPerson && (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                            {personDetail(selectedPerson) ?? (selectedPerson.kind === "AGENT" ? "Field agent" : "Staff")}
                            {selectedPerson.kind === "AGENT" || diary.overlay.length > 0
                                ? " · field work overlaid from the visits, site visits and jobs on their day"
                                : ""}
                        </p>
                    )}

                    <div className="mt-4 flex items-center justify-between">
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
                            <span key={day} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                                {day}
                            </span>
                        ))}
                        {Array.from({ length: firstWeekday }).map((_, index) => (
                            <span key={`pad-${index}`} />
                        ))}
                        {Array.from({ length: daysInMonth }).map((_, index) => {
                            const day = index + 1;
                            const dateIso = isoDay(view.year, view.month, day);
                            const isSelected = dateIso === selectedDate;
                            const isToday = dateIso === today;
                            const holiday = holidays.get(dateIso);
                            return (
                                <span key={day} className="relative flex justify-center py-0.5">
                                    <button
                                        type="button"
                                        onClick={() => onSelectDate(dateIso)}
                                        title={holiday?.map((row) => row.name).join(", ")}
                                        className={cn(
                                            "flex size-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
                                            isSelected
                                                ? "bg-primary text-primary-foreground"
                                                : holiday
                                                  ? "bg-warning-soft text-warning hover:bg-warning-soft/70"
                                                  : isToday
                                                    ? "text-primary ring-1 ring-primary/40"
                                                    : "text-foreground hover:bg-muted",
                                        )}
                                    >
                                        {day}
                                    </button>
                                    {markedDays.has(dateIso) && !isSelected && (
                                        <span className="absolute bottom-0.5 size-1 rounded-full bg-primary" />
                                    )}
                                </span>
                            );
                        })}
                    </div>

                    <p className="mt-4 border-t pt-3 text-xs font-medium text-muted-foreground">
                        {prettyDay(selectedDate)}
                        {dayHolidays.length > 0 && (
                            <span className="ml-2 font-normal text-warning">
                                · {dayHolidays.map((row) => (row.region ? `${row.name} (${row.region})` : row.name)).join(", ")}
                            </span>
                        )}
                    </p>
                    <div className="mt-2 space-y-2.5">
                        {dayEntries.map((entry) => {
                            const done = entry.status === "COMPLETED";
                            const assignee = peopleById.get(entry.assigneeUserId) ?? null;
                            const assigneeName = entry.assignee?.name?.trim() || names.get(entry.assigneeUserId) || entry.assigneeUserId;
                            return (
                                <div key={entry.id} className={cn("rounded-lg border p-3", done && "opacity-70")}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <Clock className="size-3" />
                                                {entrySlot(entry)}
                                            </p>
                                            <p className={cn("mt-0.5 text-sm font-medium text-foreground", done && "text-muted-foreground line-through")}>
                                                {entry.title}
                                            </p>
                                            {entry.notes && <p className="mt-0.5 text-xs text-muted-foreground">{entry.notes}</p>}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                            <StatusBadge status={scheduleStatusMeta(entry.status)} />
                                            <DropdownMenu>
                                                <DropdownMenuTrigger
                                                    aria-label={`Actions for ${entry.title}`}
                                                    disabled={busy}
                                                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                >
                                                    <MoreHorizontal className="size-4" />
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    {!done && (
                                                        <>
                                                            {entry.status !== "IN_PROGRESS" && (
                                                                <DropdownMenuItem onClick={() => void setStatus(entry, "IN_PROGRESS")}>
                                                                    <Play className="size-4" />
                                                                    Start
                                                                </DropdownMenuItem>
                                                            )}
                                                            {entry.status === "IN_PROGRESS" && (
                                                                <DropdownMenuItem onClick={() => void setStatus(entry, "PAUSED")}>
                                                                    <Pause className="size-4" />
                                                                    Pause
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuItem onClick={() => void setStatus(entry, "COMPLETED")}>
                                                                <CheckCircle2 className="size-4" />
                                                                Mark done
                                                            </DropdownMenuItem>
                                                        </>
                                                    )}
                                                    {done && (
                                                        <DropdownMenuItem onClick={() => void setStatus(entry, "PENDING")}>
                                                            <RotateCcw className="size-4" />
                                                            Reopen
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuItem onClick={() => setEditing(entry)}>
                                                        <Pencil className="size-4" />
                                                        Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem className="text-danger focus:text-danger" onClick={() => setDeleting(entry)}>
                                                        <Trash2 className="size-4" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                        <InitialsAvatar name={assigneeName} size="sm" />
                                        <div className="min-w-0">
                                            <p className="flex items-center gap-1.5 truncate text-xs font-medium text-foreground">
                                                {assigneeName}
                                                {assignee && assignee.kind === "AGENT" && <StatusBadge status={PERSON_KIND_META.AGENT} />}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground">
                                                {entry.department ?? (assignee ? (personDetail(assignee) ?? "") : "")}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* The overlay: the selected person's field work, read-only, in its own style. */}
                        {dayOverlay.map((row) => (
                            <div
                                key={`${row.kind}:${row.id}`}
                                className="rounded-lg border border-dashed border-info/40 bg-info-soft/40 p-3"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <Clock className="size-3" />
                                            {row.at ? istTimeOf(row.at) : "No slot"}
                                            <StatusBadge status={overlayKindMeta(row.kind)} />
                                        </p>
                                        <p className="mt-0.5 text-sm font-medium text-foreground">{row.title}</p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {[row.where, row.status.replace(/_/g, " ").toLowerCase(), row.campaignTag]
                                                .filter(Boolean)
                                                .join(" · ")}
                                            {row.outcome ? ` · ${row.outcome}` : ""}
                                        </p>
                                    </div>
                                    <Link
                                        href={overlayHref(row)}
                                        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
                                    >
                                        Open
                                        <ExternalLink className="size-3" />
                                    </Link>
                                </div>
                            </div>
                        ))}

                        {dayEntries.length === 0 && dayOverlay.length === 0 && (
                            <p className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">
                                {selectedPerson
                                    ? `Nothing on ${personLabel(selectedPerson)}'s day.`
                                    : "Nothing scheduled for this day."}
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
                                Every create, status change and delete on the schedule in {MONTH_NAMES[view.month]} {view.year}
                            </p>
                        </div>
                        {log && log.total > log.items.length && (
                            <span className="text-xs text-muted-foreground">
                                Latest {log.items.length} of {log.total}
                            </span>
                        )}
                    </div>
                    {logError ? (
                        <p className="px-5 py-6 text-sm text-danger">{logError}</p>
                    ) : log === null ? (
                        <p className="px-5 py-6 text-sm text-muted-foreground">Reading the log…</p>
                    ) : log.items.length ? (
                        <ol className="divide-y">
                            {log.items.map((row) => {
                                const line = logLine(row, names);
                                return (
                                    <li key={line.id} className="flex items-start gap-3 px-5 py-3.5">
                                        <span
                                            className={cn(
                                                "mt-1.5 size-2 shrink-0 rounded-full",
                                                line.tone === "danger"
                                                    ? "bg-danger"
                                                    : line.tone === "success"
                                                      ? "bg-success"
                                                      : line.tone === "info"
                                                        ? "bg-info"
                                                        : line.tone === "warning"
                                                          ? "bg-warning"
                                                          : "bg-muted-foreground",
                                            )}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm text-foreground">
                                                <span className="font-medium">{line.entry}</span>{" "}
                                                <span className="text-muted-foreground">{line.action}</span>
                                            </p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                {line.detail} By {line.actor}.
                                            </p>
                                        </div>
                                        <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(line.at)}</span>
                                    </li>
                                );
                            })}
                        </ol>
                    ) : (
                        <div className="px-5 py-10">
                            <EmptyState
                                icon={CalendarDays}
                                title="No changes this month"
                                description="Schedule activity appears here as the team works."
                            />
                        </div>
                    )}
                </Card>
            </div>

            <EntryDialog
                key={editing === "new" ? `new:${selectedDate}` : (editing?.id ?? "closed")}
                entry={editing === "new" ? null : editing}
                date={selectedDate}
                people={assignable}
                departments={departments}
                open={editing !== null}
                onOpenChange={(open) => !open && setEditing(null)}
                onSaved={onChanged}
            />
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
                title={deleting ? `Delete ${deleting.title}?` : "Delete entry?"}
                description={deleting ? `Removed from ${prettyDay(deleting.date)}. The change log keeps the record of it.` : ""}
                confirmLabel="Delete"
                destructive
                busy={busy}
                onConfirm={() => void remove()}
            />
        </div>
    );
}
