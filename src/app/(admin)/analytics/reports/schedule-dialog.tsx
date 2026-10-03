"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
    CADENCE_LABEL,
    REPORT_CADENCES,
    REPORT_FORMATS,
    declaredFilters,
    filtersFor,
    parseRecipients,
    reportsService,
    scheduleFiltersBody,
    schedulePatch,
    scheduleProblem,
    scheduleWindow,
    windowProblem,
    type FixedWindow,
    type ReportCadence,
    type ReportFormat,
    type ReportKind,
    type ReportSchedule,
} from "@/services/reports";
import { ReportFilters } from "./report-filters";

interface ScheduleDialogProps {
    catalogue: ReportKind[];
    /** Null to create; a row to edit. The kind of a row cannot change. */
    schedule: ReportSchedule | null;
    /** The kind the New button was pressed beside, when creating. */
    initialKind?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

/**
 * The frame's "New export" form as a dialog — `POST /reports/schedules`
 * and `PATCH /reports/schedules/:id`. G13-B/C: the frame's Date range is
 * here as an optional fixed window — by default a schedule renders its
 * cadence's own window (yesterday, the seven days before, the previous
 * month); a fixed `{ from, to }` is written to `filters.window` and rendered
 * on every run instead, at most a year wide. XLSX is not offered because
 * the server renders CSV and PDF.
 */
export function ScheduleDialog({ catalogue, schedule, initialKind, open, onOpenChange, onSaved }: ScheduleDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {open && (
                    <ScheduleForm
                        key={schedule ? `${schedule.id}:${schedule.updatedAt}` : `new:${initialKind ?? ""}`}
                        catalogue={catalogue}
                        schedule={schedule}
                        initialKind={initialKind}
                        onOpenChange={onOpenChange}
                        onSaved={onSaved}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function ScheduleForm({ catalogue, schedule, initialKind, onOpenChange, onSaved }: Omit<ScheduleDialogProps, "open">) {
    const [kindKey, setKindKey] = React.useState(schedule?.kind ?? initialKind ?? catalogue[0]?.kind ?? "");
    const [name, setName] = React.useState(schedule?.name ?? "");
    const [cadence, setCadence] = React.useState<ReportCadence>(schedule?.cadence ?? "WEEKLY");
    const [format, setFormat] = React.useState<ReportFormat>(schedule?.format ?? "CSV");
    const [recipientsText, setRecipientsText] = React.useState(schedule?.recipients.join(", ") ?? "");
    const [enabled, setEnabled] = React.useState(schedule?.enabled ?? true);
    const [typed, setTyped] = React.useState<Record<string, string>>(() => declaredFilters(schedule?.filters));
    const stored = scheduleWindow(schedule?.filters);
    const [fixed, setFixed] = React.useState<boolean>(stored !== null);
    const [from, setFrom] = React.useState(stored?.from ?? "");
    const [to, setTo] = React.useState(stored?.to ?? "");
    const [busy, setBusy] = React.useState(false);

    const kind = catalogue.find((entry) => entry.kind === kindKey) ?? null;
    const window: FixedWindow | null = fixed ? { from, to } : null;
    const windowIssue = window ? windowProblem(window) : null;
    const problem = scheduleProblem({ name, recipientsText }) ?? windowIssue ?? (kind ? null : "Pick a report.");
    const filters = scheduleFiltersBody(filtersFor(kind, typed), window);
    const { recipients } = parseRecipients(recipientsText);
    const patch = schedule ? schedulePatch(schedule, { name, cadence, format, recipients, filters, enabled }) : null;
    const dirty = schedule ? Object.keys(patch ?? {}).length > 0 : true;

    const submit = async () => {
        if (problem || !kind) {
            toast.error(problem ?? "Pick a report.");
            return;
        }
        setBusy(true);
        try {
            if (schedule) {
                const saved = await reportsService.updateSchedule(schedule.id, patch ?? {});
                toast.success(`"${saved.name}" saved`, {
                    description: saved.enabled && saved.nextRunAt ? `Next run ${new Date(saved.nextRunAt).toLocaleString("en-IN")}.` : "Paused — nothing is mailed until it is enabled again.",
                });
            } else {
                const created = await reportsService.createSchedule({ kind: kind.kind, name: name.trim(), cadence, format, recipients, filters, enabled });
                toast.success(`"${created.name}" scheduled`, {
                    description: created.recipients.length
                        ? `${CADENCE_LABEL[created.cadence]} at 06:00 IST to ${created.recipients.length} ${created.recipients.length === 1 ? "address" : "addresses"}.`
                        : `${CADENCE_LABEL[created.cadence]} at 06:00 IST to every admin with an email.`,
                });
            }
            onOpenChange(false);
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not save the schedule.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle>{schedule ? "Edit schedule" : "New schedule"}</DialogTitle>
                <DialogDescription>
                    Rendered at 06:00 IST on the cadence and mailed to each recipient as a link that lives thirty days. Leave the recipients empty to mail
                    every admin with an email.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
                <div className="space-y-1.5">
                    <Label htmlFor="sch-kind">Report</Label>
                    <Select value={kindKey} onValueChange={(value) => { setKindKey(value); setTyped({}); }} disabled={schedule !== null}>
                        <SelectTrigger id="sch-kind">
                            <SelectValue placeholder="Pick a report" />
                        </SelectTrigger>
                        <SelectContent>
                            {catalogue.map((entry) => (
                                <SelectItem key={entry.kind} value={entry.kind}>
                                    {entry.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {kind && <p className="text-xs text-muted-foreground">{kind.description}</p>}
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="sch-name">Name</Label>
                    <Input id="sch-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={kind ? `${kind.name} for finance` : "What this schedule is for"} maxLength={120} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="sch-cadence">Frequency</Label>
                        <Select value={cadence} onValueChange={(value) => setCadence(value as ReportCadence)}>
                            <SelectTrigger id="sch-cadence">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {REPORT_CADENCES.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {CADENCE_LABEL[value]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Format</Label>
                        <div className="flex gap-1.5">
                            {REPORT_FORMATS.map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    onClick={() => setFormat(option)}
                                    aria-pressed={format === option}
                                    className={cn(
                                        "h-9 flex-1 rounded-lg border text-xs font-medium transition-colors",
                                        format === option ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="sch-recipients">Recipients</Label>
                    <Input id="sch-recipients" value={recipientsText} onChange={(event) => setRecipientsText(event.target.value)} placeholder="finance@example.com, ops@example.com" />
                    <p className="text-xs text-muted-foreground">Separate addresses with commas. Empty means every admin with an email, resolved when it fires.</p>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="sch-window">Date range</Label>
                    <Select value={fixed ? "fixed" : "cadence"} onValueChange={(value) => setFixed(value === "fixed")}>
                        <SelectTrigger id="sch-window">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="cadence">The cadence&rsquo;s own window</SelectItem>
                            <SelectItem value="fixed">Fixed window</SelectItem>
                        </SelectContent>
                    </Select>
                    {fixed && (
                        <div className="grid gap-2 sm:grid-cols-2">
                            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="Window start" />
                            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="Window end" />
                        </div>
                    )}
                    <p className={cn("text-xs", windowIssue ? "text-danger" : "text-muted-foreground")}>
                        {windowIssue ??
                            (fixed
                                ? "Indian days, inclusive, at most a year: every run renders this same range."
                                : "Daily renders yesterday, weekly the seven days before, monthly the previous month.")}
                    </p>
                </div>
                <ReportFilters kind={kind} idPrefix="sch" typed={typed} onChange={(key, value) => setTyped((current) => ({ ...current, [key]: value }))} />
                <label className="flex items-center justify-between gap-4">
                    <span>
                        <span className="block text-sm font-medium text-foreground">Enabled</span>
                        <span className="block text-xs text-muted-foreground">Paused, it keeps its settings and mails nothing.</span>
                    </span>
                    <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Enabled" />
                </label>
            </div>
            <DialogFooter>
                <Button variant="outline" className="bg-card" onClick={() => onOpenChange(false)} disabled={busy}>
                    Cancel
                </Button>
                <Button onClick={() => void submit()} disabled={busy || problem !== null || !dirty}>
                    {busy ? "Saving…" : schedule ? "Save changes" : "Schedule report"}
                </Button>
            </DialogFooter>
        </>
    );
}
