"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import {
    INTERVIEW_MODE_LABEL,
    INTERVIEW_OUTCOME_META,
    agentApplicationService,
    type AgentInterviewMode,
    type ApplicationInterview,
    type ApplicationView,
    type InterviewOutcomeInput,
} from "@/services/agent-applications";
import type { EmployeeRow } from "@/services/employees";

interface ScreeningCardProps {
    view: ApplicationView;
    staff: EmployeeRow[];
    closed: boolean;
    onView: (next: ApplicationView) => void;
}

/** "2026-09-25T10:30" for a datetime-local input, in the browser's zone, an hour from now rounded up. */
export function defaultSlot(now = new Date()): string {
    const d = new Date(now.getTime() + 60 * 60 * 1000);
    d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local value → ISO with the browser's offset, as the schema takes it. */
export function toOffsetIso(local: string): string {
    const d = new Date(local);
    const offset = -d.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
    return `${local}:00${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`;
}

/**
 * AG-4: the screen. A field agent is screened on paper — the identity
 * verified and every paper approved — or by the desk's tick. A sales agent
 * sits the assessment (theirs, on the training engine) and an interview the
 * desk books here and marks out of five; a second round comes before a
 * G3/G4 activation. The tick stands in for all of it when the desk judged by
 * hand.
 */
export function ScreeningCard({ view, staff, closed, onView }: ScreeningCardProps) {
    const screening = view.screening;
    const [booking, setBooking] = React.useState<1 | 2 | null>(null);
    const [deciding, setDeciding] = React.useState<ApplicationInterview | null>(null);
    const [ticking, setTicking] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const sales = view.agent.side === "ADVERTISER";

    if (!screening) {
        return (
            <Card className="rounded-lg border-border p-5 shadow-none">
                <h3 className="text-base font-semibold text-foreground">Screening</h3>
                <p className="mt-2 text-sm text-muted-foreground">The server does not report the screen yet.</p>
            </Card>
        );
    }

    const screen = async (clear: boolean, note?: string) => {
        setBusy(true);
        try {
            onView(await agentApplicationService.screen(view.agent.id, { note, clear }));
            toast.success(clear ? "Screening tick taken back" : "Screened", { description: clear ? undefined : "The desk's word stands for the paper check, the assessment and the interview." });
            setTicking(false);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The tick did not reach ADX.");
        } finally {
            setBusy(false);
        }
    };

    const interviews = screening.interviews;
    const managerName = (id: string | null) => (id ? (staff.find((row) => row.id === id)?.name ?? "A staff member") : "—");

    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="screening-card">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Screening</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {sales
                            ? "The sales assessment in the app, then an interview the desk books and marks; a second round before a G3 or G4 activation."
                            : "The paper screen: identity verified and every paper approved — or your tick, when you judged in person."}
                    </p>
                </div>
                <StatusBadge status={screening.done ? { label: "Screened", tone: "success" } : screening.owedBy === "APPLICANT" ? { label: "With the applicant", tone: "warning" } : { label: "With the desk", tone: "info" }} />
            </div>

            {!screening.done && screening.missing.length > 0 && (
                <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground">
                    {screening.missing.map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
            )}
            {screening.screenedAt && (
                <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-foreground">
                    Ticked by the desk {formatDateTime(screening.screenedAt)}
                    {screening.screeningNote ? ` — ${screening.screeningNote}` : ""}
                </p>
            )}

            {sales && (
                <div className="mt-4 border-t pt-4" data-testid="screening-assessment">
                    <h4 className="text-sm font-semibold text-foreground">Assessment</h4>
                    {screening.assessmentModules.length === 0 ? (
                        <p className="mt-1 text-sm text-muted-foreground">No assessment is published for sales agents yet — Training › add a module of kind Assessment for sales agents.</p>
                    ) : (
                        <ul className="mt-2 space-y-1.5">
                            {screening.assessmentModules.map((module) => (
                                <li key={module.id} className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-foreground">
                                        {module.title}
                                        <span className="text-muted-foreground">
                                            {" "}
                                            · {module.passPercent}% to pass{module.timeLimitMins ? ` · ${module.timeLimitMins} min` : ""}
                                        </span>
                                    </span>
                                    <StatusBadge
                                        status={
                                            module.best
                                                ? { label: `${module.best.percent}% · ${module.best.score}/${module.best.total}`, tone: module.best.passed ? "success" : "danger" }
                                                : { label: "Not sat", tone: "neutral" }
                                        }
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {sales && (
                <div className="mt-4 border-t pt-4" data-testid="screening-interviews">
                    <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-foreground">Interviews</h4>
                        {!closed && (
                            <div className="flex gap-1.5">
                                <Button size="sm" variant="outline" className="h-7 bg-card px-2 text-xs" onClick={() => setBooking(1)} data-testid="interview-book-1">
                                    Book round 1
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 bg-card px-2 text-xs" onClick={() => setBooking(2)} data-testid="interview-book-2">
                                    Book round 2
                                </Button>
                            </div>
                        )}
                    </div>
                    {interviews.length === 0 ? (
                        <p className="mt-1 text-sm text-muted-foreground">None booked yet.</p>
                    ) : (
                        <ul className="mt-2 divide-y divide-border">
                            {interviews.map((interview) => (
                                <li key={interview.id} className="flex flex-wrap items-center gap-3 py-2" data-testid={`interview-${interview.id}`}>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-foreground">
                                            Round {interview.round} · {formatDateTime(interview.scheduledAt)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {INTERVIEW_MODE_LABEL[interview.mode]}
                                            {interview.location ? ` · ${interview.location}` : ""} · with {managerName(interview.interviewerId)}
                                            {interview.marks !== null ? ` · ${interview.marks}/5` : ""}
                                            {interview.notes ? ` · ${interview.notes}` : ""}
                                        </p>
                                    </div>
                                    <StatusBadge status={INTERVIEW_OUTCOME_META[interview.outcome]} />
                                    {!closed && interview.outcome === "SCHEDULED" && (
                                        <Button size="sm" variant="outline" className="h-7 bg-card px-2 text-xs" onClick={() => setDeciding(interview)} data-testid={`interview-decide-${interview.id}`}>
                                            Record outcome
                                        </Button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {!closed && (
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                    {screening.screenedAt ? (
                        <Button variant="outline" className="bg-card" disabled={busy} onClick={() => void screen(true)}>
                            Take the tick back
                        </Button>
                    ) : (
                        <Button variant="outline" className="bg-card" disabled={busy} onClick={() => setTicking(true)} data-testid="screening-tick">
                            Mark as screened
                        </Button>
                    )}
                </div>
            )}

            <Dialog open={ticking} onOpenChange={setTicking}>
                <DialogContent className="sm:max-w-md">{ticking && <TickForm busy={busy} onCancel={() => setTicking(false)} onConfirm={(note) => void screen(false, note)} />}</DialogContent>
            </Dialog>
            <Dialog open={booking !== null} onOpenChange={(open) => (!open ? setBooking(null) : undefined)}>
                <DialogContent className="sm:max-w-lg">
                    {booking !== null && <BookForm view={view} staff={staff} round={booking} onCancel={() => setBooking(null)} onBooked={(next) => { onView(next); setBooking(null); }} />}
                </DialogContent>
            </Dialog>
            <Dialog open={deciding !== null} onOpenChange={(open) => (!open ? setDeciding(null) : undefined)}>
                <DialogContent className="sm:max-w-md">
                    {deciding && <OutcomeForm view={view} interview={deciding} onCancel={() => setDeciding(null)} onDecided={(next) => { onView(next); setDeciding(null); }} />}
                </DialogContent>
            </Dialog>
        </Card>
    );
}

function TickForm({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: (note?: string) => void }) {
    const [note, setNote] = React.useState("");
    return (
        <>
            <DialogHeader>
                <DialogTitle>Mark as screened</DialogTitle>
                <DialogDescription>Your word stands for the paper check, the assessment and the interview. Say what you judged and how.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
                <Label htmlFor="screen-note">Note</Label>
                <Textarea id="screen-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Papers checked against the originals; three years with Swiggy confirmed on the phone." />
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onCancel} disabled={busy}>
                    Cancel
                </Button>
                <Button type="button" onClick={() => onConfirm(note.trim() || undefined)} disabled={busy} data-testid="screening-tick-confirm">
                    {busy ? "Saving…" : "Mark as screened"}
                </Button>
            </DialogFooter>
        </>
    );
}

function BookForm({ view, staff, round, onCancel, onBooked }: { view: ApplicationView; staff: EmployeeRow[]; round: 1 | 2; onCancel: () => void; onBooked: (next: ApplicationView) => void }) {
    const [when, setWhen] = React.useState(() => defaultSlot());
    const [mode, setMode] = React.useState<AgentInterviewMode>("IN_PERSON");
    const [location, setLocation] = React.useState("ADX office");
    const [interviewerId, setInterviewerId] = React.useState("");
    const [notes, setNotes] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const staffItems = React.useMemo(() => staff.map((row) => ({ value: row.id, label: row.name, description: [row.designation, row.department].filter(Boolean).join(" · ") || undefined })), [staff]);

    const book = async () => {
        setBusy(true);
        try {
            const next = await agentApplicationService.scheduleInterview(view.agent.id, {
                round,
                scheduledAt: toOffsetIso(when),
                mode,
                location: mode === "IN_PERSON" ? location.trim() || undefined : undefined,
                interviewerId: interviewerId || undefined,
                notes: notes.trim() || undefined,
            });
            toast.success(`Round ${round} interview booked`, { description: "The applicant has been told the slot." });
            onBooked(next);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The interview was not booked.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle>Book a round {round} interview</DialogTitle>
                <DialogDescription>{round === 2 ? "The second round, before a G3 or G4 activation." : "The applicant is told the slot by SMS, push and email."}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
                <div className="grid gap-1.5">
                    <Label htmlFor="interview-when">When</Label>
                    <Input id="interview-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                        <Label htmlFor="interview-mode">How</Label>
                        <Select value={mode} onValueChange={(v) => setMode(v as AgentInterviewMode)}>
                            <SelectTrigger id="interview-mode" className="bg-card">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(INTERVIEW_MODE_LABEL) as AgentInterviewMode[]).map((m) => (
                                    <SelectItem key={m} value={m}>
                                        {INTERVIEW_MODE_LABEL[m]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {mode === "IN_PERSON" && (
                        <div className="grid gap-1.5">
                            <Label htmlFor="interview-where">Where</Label>
                            <Input id="interview-where" value={location} onChange={(e) => setLocation(e.target.value)} />
                        </div>
                    )}
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="interview-with">Interviewer</Label>
                    <Combobox id="interview-with" items={staffItems} value={interviewerId} onValueChange={setInterviewerId} placeholder="Pick a staff member (optional)" searchPlaceholder="Name or designation" emptyText="Nobody on the staff matches." />
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="interview-notes">Notes</Label>
                    <Textarea id="interview-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional — what to probe." />
                </div>
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onCancel} disabled={busy}>
                    Cancel
                </Button>
                <Button type="button" onClick={() => void book()} disabled={busy || !when} data-testid="interview-book-confirm">
                    {busy ? "Booking…" : "Book"}
                </Button>
            </DialogFooter>
        </>
    );
}

function OutcomeForm({ view, interview, onCancel, onDecided }: { view: ApplicationView; interview: ApplicationInterview; onCancel: () => void; onDecided: (next: ApplicationView) => void }) {
    const [outcome, setOutcome] = React.useState<InterviewOutcomeInput["outcome"]>("PASSED");
    const [marks, setMarks] = React.useState("4");
    const [notes, setNotes] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const held = outcome === "PASSED" || outcome === "FAILED";

    const record = async () => {
        setBusy(true);
        try {
            const next = await agentApplicationService.recordInterview(view.agent.id, interview.id, { outcome, marks: held ? Number(marks) : undefined, notes: notes.trim() || undefined });
            toast.success(`Round ${interview.round}: ${INTERVIEW_OUTCOME_META[outcome].label.toLowerCase()}`);
            onDecided(next);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The outcome did not reach ADX.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle>Round {interview.round} — the outcome</DialogTitle>
                <DialogDescription>Marks out of five when it was held. A pass or a fail is told to the applicant, with your note.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
                <RadioGroup value={outcome} onValueChange={(v) => setOutcome(v as InterviewOutcomeInput["outcome"])} className="grid gap-2 sm:grid-cols-2">
                    {(["PASSED", "FAILED", "NO_SHOW", "CANCELLED"] as const).map((value) => (
                        <label key={value} htmlFor={`outcome-${value}`} className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 text-sm text-foreground">
                            <RadioGroupItem id={`outcome-${value}`} value={value} />
                            {INTERVIEW_OUTCOME_META[value].label}
                        </label>
                    ))}
                </RadioGroup>
                {held && (
                    <div className="grid gap-1.5">
                        <Label htmlFor="interview-marks">Marks out of five</Label>
                        <Select value={marks} onValueChange={setMarks}>
                            <SelectTrigger id="interview-marks" className="w-32 bg-card">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {["1", "2", "3", "4", "5"].map((m) => (
                                    <SelectItem key={m} value={m}>
                                        {m}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
                <div className="grid gap-1.5">
                    <Label htmlFor="interview-outcome-notes">Notes</Label>
                    <Textarea id="interview-outcome-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Spoke well about closing; weak on follow-up." />
                </div>
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onCancel} disabled={busy}>
                    Cancel
                </Button>
                <Button type="button" onClick={() => void record()} disabled={busy} data-testid="interview-outcome-confirm">
                    {busy ? "Saving…" : "Record"}
                </Button>
            </DialogFooter>
        </>
    );
}
