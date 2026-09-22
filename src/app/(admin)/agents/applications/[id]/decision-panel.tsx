"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import {
    AGENT_GRADES,
    ENGAGEMENT_LABEL,
    GRADE_META,
    agentApplicationService,
    decisionsFor,
    type AgentEngagementType,
    type AgentGrade,
    type ApplicationView,
    type DecisionInput,
} from "@/services/agent-applications";
import type { EmployeeRow } from "@/services/employees";

interface DecisionPanelProps {
    view: ApplicationView;
    staff: EmployeeRow[];
    onView: (next: ApplicationView) => void;
}

/** ISO day, `days` from today. */
export function dayFromNow(days: number, from = new Date()): string {
    const d = new Date(from);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}
/** ISO day, `months` from today. */
export function monthsFromNow(months: number, from = new Date()): string {
    const d = new Date(from);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
}

/**
 * What the desk owes the application: activate with the grade and the
 * engagement, put it on hold with what it is waiting for, reject with the
 * reason the applicant reads, or resume a held one. The buttons follow the
 * stage — the server refuses anything else with DECISION_NOT_ALLOWED.
 */
export function DecisionPanel({ view, staff, onView }: DecisionPanelProps) {
    const allowed = decisionsFor(view.agent.stage);
    const [open, setOpen] = React.useState<DecisionInput["decision"] | null>(null);
    const [busy, setBusy] = React.useState(false);
    const stage = view.agent.stage;
    const submitted = view.agent.applicationSubmittedAt;

    const decide = async (input: DecisionInput) => {
        setBusy(true);
        try {
            const next = await agentApplicationService.decide(view.agent.id, input);
            onView(next);
            setOpen(null);
            const name = view.person.name ?? view.agent.displayId ?? "The applicant";
            if (input.decision === "ACTIVATE") toast.success(`${name} is now an ADX agent`, { description: `Grade ${input.grade} · work starts arriving in their app.` });
            else if (input.decision === "REJECT") toast.success(`${name}'s application was rejected`, { description: "They read the reason in the app." });
            else if (input.decision === "HOLD") toast.success("On hold", { description: "The applicant reads what it is waiting for." });
            else toast.success("Back under review");
        } catch (cause) {
            if (cause instanceof ApiError && (cause.code === "SCREENING_INCOMPLETE" || cause.code === "TRAINING_INCOMPLETE")) {
                toast.error(cause.code === "SCREENING_INCOMPLETE" ? "Screening not done" : "Training not certified", { description: `${cause.message}. Waive it on the activation form if the desk judged otherwise.` });
            } else if (cause instanceof ApiError && cause.code === "IDENTITY_UNVERIFIED") {
                toast.error("Identity not verified", { description: "Approve every identity paper, verify the KYC, or tick that the originals were checked in person." });
            } else if (cause instanceof ApiError && cause.code === "APPLICATION_INCOMPLETE") {
                const missing = ((cause.details as { missing?: string[] } | undefined)?.missing ?? []).join(", ");
                toast.error("Not complete yet", { description: missing || cause.message });
            } else {
                toast.error(cause instanceof Error ? cause.message : "The decision did not reach ADX.");
            }
        } finally {
            setBusy(false);
        }
    };

    const word =
        stage === "ON_HOLD"
            ? view.agent.holdReason
            : stage === "REJECTED"
              ? view.agent.rejectionReason
              : null;

    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="decision-panel">
            <h3 className="text-base font-semibold text-foreground">Decision</h3>
            <p className="mt-1 text-sm text-muted-foreground">
                {stage === "ACTIVE"
                    ? `Activated ${view.agent.activatedAt ? formatDateTime(view.agent.activatedAt) : ""} — the engagement is on the agent's page.`
                    : stage === "REJECTED" || stage === "WITHDRAWN" || stage === "EXITED"
                      ? "Nothing more happens to this application."
                      : submitted
                        ? `Submitted ${formatDateTime(submitted)}. Check the papers, then decide.`
                        : "Not submitted yet. The desk can finish the steps for them, or wait for the app."}
            </p>
            {word && <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-foreground">{word}</p>}
            {view.agent.reviewNote && stage !== "ON_HOLD" && stage !== "REJECTED" && <p className="mt-3 text-xs text-muted-foreground">Desk note: {view.agent.reviewNote}</p>}
            {allowed.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                    {allowed.includes("ACTIVATE") && (
                        <Button onClick={() => setOpen("ACTIVATE")} disabled={busy} data-testid="decision-activate">
                            Activate
                        </Button>
                    )}
                    {allowed.includes("RESUME") && (
                        <Button variant="outline" className="bg-card" onClick={() => setOpen("RESUME")} disabled={busy}>
                            Resume review
                        </Button>
                    )}
                    {allowed.includes("HOLD") && (
                        <Button variant="outline" className="bg-card" onClick={() => setOpen("HOLD")} disabled={busy}>
                            Put on hold
                        </Button>
                    )}
                    {allowed.includes("REJECT") && (
                        <Button variant="outline" className="bg-card text-danger" onClick={() => setOpen("REJECT")} disabled={busy}>
                            Reject
                        </Button>
                    )}
                </div>
            )}

            <ActivateDialog open={open === "ACTIVATE"} view={view} staff={staff} busy={busy} onOpenChange={(o) => setOpen(o ? "ACTIVATE" : null)} onConfirm={decide} />
            <NoteDialog
                kind={open === "HOLD" || open === "REJECT" ? open : null}
                busy={busy}
                onCancel={() => setOpen(null)}
                onConfirm={(note) => void decide({ decision: open as "HOLD" | "REJECT", note })}
            />
            <ConfirmDialog
                open={open === "RESUME"}
                onOpenChange={(o) => setOpen(o ? "RESUME" : null)}
                title="Resume the review?"
                description="The hold is lifted and the application goes back under review."
                confirmLabel="Resume"
                busy={busy}
                onConfirm={() => void decide({ decision: "RESUME" })}
            />
        </Card>
    );
}

interface ActivateDialogProps {
    open: boolean;
    view: ApplicationView;
    staff: EmployeeRow[];
    busy: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (input: DecisionInput) => Promise<void>;
}

/**
 * Activation names the grade and the engagement. Gig is the default for a
 * field agent (paid per job, no term); contract for a sales agent — six
 * months with a three-month probation, the same defaults the server would
 * fill in. The identity tick is only offered while the papers are not yet
 * verified: the desk vouches for originals it has seen.
 */
export function ActivateDialog({ open, view, staff, busy, onOpenChange, onConfirm }: ActivateDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                {/* The form mounts with the content, so every opening starts from the side's defaults. */}
                {open && <ActivateForm view={view} staff={staff} busy={busy} onCancel={() => onOpenChange(false)} onConfirm={onConfirm} />}
            </DialogContent>
        </Dialog>
    );
}

function ActivateForm({ view, staff, busy, onCancel, onConfirm }: { view: ApplicationView; staff: EmployeeRow[]; busy: boolean; onCancel: () => void; onConfirm: (input: DecisionInput) => Promise<void> }) {
    const sales = view.agent.side === "ADVERTISER";
    const [grade, setGrade] = React.useState<AgentGrade>(sales ? "G2" : "G1");
    const [engagementType, setEngagementType] = React.useState<AgentEngagementType>(sales ? "CONTRACT" : "GIG");
    const [startAt, setStartAt] = React.useState(() => dayFromNow(0));
    const [endAt, setEndAt] = React.useState(() => monthsFromNow(6));
    const [probationEndsAt, setProbationEndsAt] = React.useState(() => monthsFromNow(3));
    const [managerId, setManagerId] = React.useState("");
    const [weeklyHours, setWeeklyHours] = React.useState("");
    const [territory, setTerritory] = React.useState(view.profile.territory ?? "");
    const [homeZone, setHomeZone] = React.useState(view.profile.homeZone ?? "");
    const [inPerson, setInPerson] = React.useState(false);
    const [waiveScreening, setWaiveScreening] = React.useState(false);
    const [waiveTraining, setWaiveTraining] = React.useState(false);
    const [gradeNote, setGradeNote] = React.useState("");
    const [note, setNote] = React.useState("");

    const staffItems = React.useMemo(
        () => staff.map((row) => ({ value: row.id, label: row.name, description: [row.designation, row.department].filter(Boolean).join(" · ") || undefined })),
        [staff],
    );
    const identityOk = view.identity.verified || inPerson;
    const contract = engagementType === "CONTRACT";
    const hours = weeklyHours.trim() ? Number(weeklyHours) : undefined;
    // AG-4: the screen and the certificate gate activation unless waived, and a waiver wants its reason in the note.
    const screeningOpen = view.screening ? !view.screening.done || (sales && (grade === "G3" || grade === "G4") && !view.screening.secondRoundPassed) : false;
    // An older server says nothing about availability; then the server alone judges the training gate.
    const trainingOpen = view.training.available === true && view.training.state !== "CERTIFIED";
    const waiving = (screeningOpen && waiveScreening) || (trainingOpen && waiveTraining);
    const gated = (screeningOpen && !waiveScreening) || (trainingOpen && !waiveTraining);
    const ready = identityOk && !gated && (!waiving || note.trim().length >= 3) && (!contract || endAt > startAt) && (hours === undefined || (Number.isInteger(hours) && hours >= 1 && hours <= 84));

    const submit = () =>
        onConfirm({
            decision: "ACTIVATE",
            grade,
            gradeNote: gradeNote.trim() || undefined,
            engagementType,
            engagementStartAt: startAt,
            engagementEndAt: contract ? endAt : undefined,
            probationEndsAt: contract ? probationEndsAt : undefined,
            reportingManagerId: managerId || undefined,
            weeklyHours: hours,
            territory: territory.trim() || undefined,
            homeZone: homeZone.trim() || undefined,
            identityCheckedInPerson: inPerson || undefined,
            waiveScreening: screeningOpen && waiveScreening ? true : undefined,
            waiveTraining: trainingOpen && waiveTraining ? true : undefined,
            note: note.trim() || undefined,
        });

    return (
        <>
                <DialogHeader>
                    <DialogTitle>Activate {view.person.name ?? view.agent.displayId ?? "this applicant"}</DialogTitle>
                    <DialogDescription>
                        The grade decides which publishers or advertisers they are put in front of; the engagement is the terms ADX keeps them on. Both can change later without a new decision.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-5">
                    <div className="grid gap-1.5">
                        <Label>Grade</Label>
                        <RadioGroup value={grade} onValueChange={(v) => setGrade(v as AgentGrade)} className="grid gap-2 sm:grid-cols-2">
                            {AGENT_GRADES.map((code) => (
                                <label key={code} htmlFor={`grade-${code}`} className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-left">
                                    <RadioGroupItem id={`grade-${code}`} value={code} className="mt-0.5" />
                                    <span>
                                        <span className="block text-sm font-medium text-foreground">
                                            {code} · {GRADE_META[code].label}
                                        </span>
                                        <span className="mt-0.5 block text-xs text-muted-foreground">{GRADE_META[code].handles}</span>
                                    </span>
                                </label>
                            ))}
                        </RadioGroup>
                        <Input value={gradeNote} onChange={(e) => setGradeNote(e.target.value)} placeholder="Why this grade (optional) — e.g. three years at Zomato, spoke well at the interview" className="mt-1" />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="engagement-type">Engagement</Label>
                            <Select value={engagementType} onValueChange={(v) => setEngagementType(v as AgentEngagementType)}>
                                <SelectTrigger id="engagement-type" className="bg-card">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(ENGAGEMENT_LABEL) as AgentEngagementType[]).map((type) => (
                                        <SelectItem key={type} value={type}>
                                            {ENGAGEMENT_LABEL[type]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="engagement-start">Starts</Label>
                            <Input id="engagement-start" type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                        </div>
                        {contract && (
                            <>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="engagement-end">Contract ends</Label>
                                    <Input id="engagement-end" type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="probation-end">Probation ends</Label>
                                    <Input id="probation-end" type="date" value={probationEndsAt} onChange={(e) => setProbationEndsAt(e.target.value)} />
                                </div>
                            </>
                        )}
                        <div className="grid gap-1.5">
                            <Label htmlFor="reporting-manager">Reports to</Label>
                            <Combobox id="reporting-manager" items={staffItems} value={managerId} onValueChange={setManagerId} placeholder="Pick a staff member (optional)" searchPlaceholder="Name or designation" emptyText="Nobody on the staff matches." />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="weekly-hours">Hours a week</Label>
                            <Input id="weekly-hours" inputMode="numeric" value={weeklyHours} onChange={(e) => setWeeklyHours(e.target.value)} placeholder="Optional · 1 to 84" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="territory">Territory</Label>
                            <Input id="territory" value={territory} onChange={(e) => setTerritory(e.target.value)} placeholder="South Bengaluru" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="home-zone">Home zone</Label>
                            <Input id="home-zone" value={homeZone} onChange={(e) => setHomeZone(e.target.value)} placeholder="Koramangala" />
                        </div>
                    </div>

                    {!view.identity.verified && (
                        <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3">
                            <Checkbox checked={inPerson} onCheckedChange={(checked) => setInPerson(checked === true)} className="mt-0.5" id="identity-in-person" aria-label="The originals were checked in person" />
                            <span>
                                <span className="block text-sm font-medium text-foreground">The originals were checked in person</span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                    The identity papers are not verified yet — approve each one on the Papers tab, verify the KYC, or vouch here that the desk saw the originals.
                                </span>
                            </span>
                        </label>
                    )}

                    {screeningOpen && (
                        <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3">
                            <Checkbox checked={waiveScreening} onCheckedChange={(checked) => setWaiveScreening(checked === true)} className="mt-0.5" id="waive-screening" aria-label="Waive the screening" />
                            <span>
                                <span className="block text-sm font-medium text-foreground">Waive the screening</span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {sales && (grade === "G3" || grade === "G4") && view.screening?.done
                                        ? `A ${grade} activation wants a passed second-round interview. Waive it here and say why in the note.`
                                        : `The screen is not done: ${view.screening?.missing.join("; ") || "the desk has not ticked it"}. Waive it here and say why in the note.`}
                                </span>
                            </span>
                        </label>
                    )}
                    {trainingOpen && (
                        <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3">
                            <Checkbox checked={waiveTraining} onCheckedChange={(checked) => setWaiveTraining(checked === true)} className="mt-0.5" id="waive-training" aria-label="Waive the training" />
                            <span>
                                <span className="block text-sm font-medium text-foreground">Waive the training</span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">The ADX training is not certified yet. Waive it here — trained on the job, say — and say why in the note.</span>
                            </span>
                        </label>
                    )}

                    <div className="grid gap-1.5">
                        <Label htmlFor="activate-note">Note for the record{waiving ? " — why the waiver" : ""}</Label>
                        <Textarea id="activate-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional" />
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" className="bg-card" onClick={onCancel} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="button" disabled={!ready || busy} onClick={() => void submit()} data-testid="activate-confirm">
                        {busy ? "Activating…" : "Activate as an agent"}
                    </Button>
                </DialogFooter>
        </>
    );
}

/** Hold and reject both need the words the applicant will read. */
function NoteDialog({ kind, busy, onCancel, onConfirm }: { kind: "HOLD" | "REJECT" | null; busy: boolean; onCancel: () => void; onConfirm: (note: string) => void }) {
    return (
        <Dialog open={kind !== null} onOpenChange={(open) => (!open ? onCancel() : undefined)}>
            <DialogContent className="sm:max-w-md">
                {kind !== null && <NoteForm kind={kind} busy={busy} onCancel={onCancel} onConfirm={onConfirm} />}
            </DialogContent>
        </Dialog>
    );
}

function NoteForm({ kind, busy, onCancel, onConfirm }: { kind: "HOLD" | "REJECT"; busy: boolean; onCancel: () => void; onConfirm: (note: string) => void }) {
    const [note, setNote] = React.useState("");
    const reject = kind === "REJECT";
    return (
        <>
                <DialogHeader>
                    <DialogTitle>{reject ? "Reject the application" : "Put the application on hold"}</DialogTitle>
                    <DialogDescription>
                        {reject
                            ? "The applicant reads this in the app. A rejected application cannot be reopened; they would apply afresh."
                            : "The applicant reads what the hold is waiting for — an original to bring in, a paper to renew. Resume when it arrives."}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-1.5">
                    <Label htmlFor="decision-note">{reject ? "Why" : "Waiting for"}</Label>
                    <Textarea id="decision-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={reject ? "The references did not confirm the employment." : "Bring the original Aadhaar to the office."} />
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" className="bg-card" onClick={onCancel} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="button" variant={reject ? "destructive" : "default"} disabled={note.trim().length < 3 || busy} onClick={() => onConfirm(note.trim())}>
                        {busy ? "Saving…" : reject ? "Reject" : "Put on hold"}
                    </Button>
                </DialogFooter>
        </>
    );
}
