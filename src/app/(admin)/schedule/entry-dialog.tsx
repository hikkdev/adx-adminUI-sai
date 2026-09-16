"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { PERSON_KIND_META, personLabel, type Person } from "@/services/employees";
import {
    createBody,
    entryFormError,
    entryPatch,
    prettyDay,
    scheduleService,
    type EntryForm,
    type ScheduleEntry,
} from "@/services/schedule";

interface EntryDialogProps {
    /** Null adds on `date`; an entry edits. */
    entry: ScheduleEntry | null;
    date: string;
    people: Person[];
    /** The departments the staff rows name, for the picker; the entry's own is kept selectable. */
    departments: string[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

const NO_DEPARTMENT = "__none__";

/**
 * The DR 10 frame's "Add schedule entry" modal — title, time, department,
 * assigned to — over `POST /schedule`, and the same form over
 * `PATCH /schedule/:id` for an edit. The assignee is anybody the registry
 * knows, staff or agent (Q99), drawn with their kind; an end time and
 * notes are the two fields the route takes that the frame did not draw.
 */
export function EntryDialog({ entry, date, people, departments, open, onOpenChange, onSaved }: EntryDialogProps) {
    const [form, setForm] = React.useState<EntryForm>({
        title: entry?.title ?? "",
        date: entry?.date ?? date,
        startTime: entry?.startTime ?? "10:00",
        endTime: entry?.endTime ?? "",
        notes: entry?.notes ?? "",
        assigneeUserId: entry?.assigneeUserId ?? "",
        department: entry?.department ?? "",
    });
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const patch = (partial: Partial<EntryForm>) => setForm((current) => ({ ...current, ...partial }));

    const options = form.department && !departments.includes(form.department) ? [form.department, ...departments] : departments;
    const assignee = people.find((person) => person.userId === form.assigneeUserId) ?? null;
    /* An entry against somebody the registry no longer lists keeps them
       selectable, named from the entry's own `assignee` (E10-1). */
    const keptAssignee = !assignee && form.assigneeUserId ? (entry?.assignee?.name?.trim() || form.assigneeUserId) : null;

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const problem = entryFormError(form);
        if (problem) {
            setError(problem);
            return;
        }
        setSaving(true);
        setError(null);
        try {
            if (entry) {
                const body = entryPatch(entry, form);
                if (body) await scheduleService.update(entry.id, body);
                toast.success(`${form.title.trim()} updated`);
            } else {
                await scheduleService.create(createBody(form));
                toast.success("Added to the schedule", { description: `${form.startTime} on ${prettyDay(form.date)}.` });
            }
            onOpenChange(false);
            onSaved();
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Could not save the entry.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={submit} noValidate>
                    <DialogHeader>
                        <DialogTitle>{entry ? "Edit schedule entry" : "Add schedule entry"}</DialogTitle>
                        <DialogDescription>Goes on {prettyDay(form.date)}.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-1">
                        <div className="grid gap-1.5">
                            <Label htmlFor="sch-title">Title</Label>
                            <Input
                                id="sch-title"
                                value={form.title}
                                onChange={(event) => patch({ title: event.target.value })}
                                placeholder="e.g. Site visit briefing"
                                maxLength={160}
                                autoFocus
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="sch-date">Day</Label>
                                <Input id="sch-date" type="date" value={form.date} onChange={(event) => patch({ date: event.target.value })} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="sch-start">Time</Label>
                                <Input id="sch-start" type="time" value={form.startTime} onChange={(event) => patch({ startTime: event.target.value })} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="sch-end">Until</Label>
                                <Input id="sch-end" type="time" value={form.endTime} onChange={(event) => patch({ endTime: event.target.value })} />
                            </div>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="sch-department">Department</Label>
                            <Select
                                value={form.department || NO_DEPARTMENT}
                                onValueChange={(value) => patch({ department: value === NO_DEPARTMENT ? "" : value })}
                            >
                                <SelectTrigger id="sch-department">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_DEPARTMENT}>No department</SelectItem>
                                    {options.map((name) => (
                                        <SelectItem key={name} value={name}>
                                            {name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="sch-assignee">Assigned to</Label>
                            <Select value={form.assigneeUserId} onValueChange={(value) => patch({ assigneeUserId: value })}>
                                <SelectTrigger id="sch-assignee">
                                    <SelectValue placeholder="Pick a person">
                                        {assignee ? personLabel(assignee) : keptAssignee || undefined}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {keptAssignee && <SelectItem value={form.assigneeUserId}>{keptAssignee}</SelectItem>}
                                    {people.map((person) => (
                                        <SelectItem key={person.userId} value={person.userId}>
                                            <span className="flex items-center gap-2">
                                                {personLabel(person)}
                                                <StatusBadge status={PERSON_KIND_META[person.kind]} />
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">Active staff and agents who can sign in — both assignable.</p>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="sch-notes">Notes</Label>
                            <Textarea
                                id="sch-notes"
                                value={form.notes}
                                onChange={(event) => patch({ notes: event.target.value })}
                                rows={2}
                                maxLength={2000}
                                placeholder="Optional"
                            />
                        </div>
                        {error && (
                            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                                {error}
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" className="bg-card" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? "Saving…" : entry ? "Save" : "Add entry"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
