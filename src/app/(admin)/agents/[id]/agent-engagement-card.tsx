"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatDateTime } from "@/lib/format";
import {
    AGENT_EXIT_REASONS,
    AGENT_GRADES,
    ENGAGEMENT_LABEL,
    EXIT_REASON_LABEL,
    GRADE_META,
    STAGE_META,
    agentApplicationService,
    gradeLabel,
    type AgentEngagementType,
    type AgentExitReason,
    type AgentGrade,
    type AgentStage,
} from "@/services/agent-applications";

/** The facts the card draws — `Agent.engagement` on the detail page, `view.agent` on the workbench. */
export interface EngagementFacts {
    stage: string;
    grade: string | null;
    type: string | null;
    startAt: string | null;
    endAt: string | null;
    probationEndsAt: string | null;
    reportingManagerId: string | null;
    weeklyHours: number | null;
    activatedAt: string | null;
    exitedAt: string | null;
    exitReason: string | null;
    rehireEligible: boolean;
}

interface AgentEngagementCardProps {
    agentId: string;
    name: string;
    facts: EngagementFacts;
    /** The reporting manager's name when the caller could look it up. */
    managerName?: string | null;
    /** Where the application workbench lives, for the link — omitted on the workbench itself. */
    applicationHref?: string | null;
    onChanged: () => void;
}

const isStage = (value: string): value is AgentStage => value in STAGE_META;

/**
 * AG-3: the engagement the desk set at activation, and the two things that
 * change afterwards — the grade (at a renewal or a promotion, with a note)
 * and the end of the engagement (with the reason, whether ADX would take
 * them back, and a blacklist for fraud). Ending stops work at once; the
 * profile stays for the record.
 */
export function AgentEngagementCard({ agentId, name, facts, managerName, applicationHref, onChanged }: AgentEngagementCardProps) {
    const [grading, setGrading] = React.useState(false);
    const [exiting, setExiting] = React.useState(false);
    const stageMeta = isStage(facts.stage) ? STAGE_META[facts.stage] : { label: facts.stage, tone: "neutral" as const };
    const active = facts.stage === "ACTIVE";
    const exited = facts.stage === "EXITED";
    const grade = facts.grade && AGENT_GRADES.includes(facts.grade as AgentGrade) ? (facts.grade as AgentGrade) : null;
    const type = facts.type && facts.type in ENGAGEMENT_LABEL ? ENGAGEMENT_LABEL[facts.type as AgentEngagementType] : facts.type;
    const exitReason = facts.exitReason && facts.exitReason in EXIT_REASON_LABEL ? EXIT_REASON_LABEL[facts.exitReason as AgentExitReason] : facts.exitReason;

    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="agent-engagement-card">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Engagement</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {active
                            ? "The terms ADX keeps this agent on, and the grade that decides whom they are put in front of."
                            : exited
                              ? "This engagement has ended. The profile stays for the record."
                              : "Set at activation, from the application."}
                    </p>
                </div>
                <StatusBadge status={stageMeta} />
            </div>
            <FieldList
                className="mt-4"
                items={[
                    ["Grade", grade ? `${gradeLabel(grade)} — ${GRADE_META[grade].handles}` : "—"],
                    ["Engagement", type ?? "—"],
                    ["Starts", facts.startAt ? formatDate(facts.startAt) : "—"],
                    ["Ends", facts.endAt ? formatDate(facts.endAt) : facts.type === "GIG" ? "Open-ended" : "—"],
                    ["Probation until", facts.probationEndsAt ? formatDate(facts.probationEndsAt) : "—"],
                    ["Reports to", managerName ?? (facts.reportingManagerId ? "A staff member" : "—")],
                    ["Hours a week", facts.weeklyHours ?? "—"],
                    ["Activated", facts.activatedAt ? formatDateTime(facts.activatedAt) : "—"],
                    ...(exited
                        ? ([
                              ["Ended", facts.exitedAt ? formatDateTime(facts.exitedAt) : "—"],
                              ["Reason", exitReason ?? "—"],
                              ["Would rehire", facts.rehireEligible ? "Yes" : "No"],
                          ] as [string, React.ReactNode][])
                        : []),
                ]}
            />
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                {active && (
                    <>
                        <Button variant="outline" className="bg-card" onClick={() => setGrading(true)} data-testid="engagement-change-grade">
                            Change grade
                        </Button>
                        <Button variant="outline" className="bg-card text-danger" onClick={() => setExiting(true)} data-testid="engagement-end">
                            End engagement
                        </Button>
                    </>
                )}
                {applicationHref && (
                    <Button variant="outline" className="bg-card" asChild>
                        <Link href={applicationHref}>Application record</Link>
                    </Button>
                )}
            </div>
            <GradeDialog open={grading} onOpenChange={setGrading} agentId={agentId} name={name} current={grade} onChanged={onChanged} />
            <ExitDialog open={exiting} onOpenChange={setExiting} agentId={agentId} name={name} onChanged={onChanged} />
        </Card>
    );
}

function GradeDialog({
    open,
    onOpenChange,
    agentId,
    name,
    current,
    onChanged,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    agentId: string;
    name: string;
    current: AgentGrade | null;
    onChanged: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {open && <GradeForm agentId={agentId} name={name} current={current} onClose={() => onOpenChange(false)} onChanged={onChanged} />}
            </DialogContent>
        </Dialog>
    );
}

function GradeForm({
    agentId,
    name,
    current,
    onClose,
    onChanged,
}: {
    agentId: string;
    name: string;
    current: AgentGrade | null;
    onClose: () => void;
    onChanged: () => void;
}) {
    const [grade, setGrade] = React.useState<AgentGrade>(current ?? "G1");
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const save = async () => {
        setBusy(true);
        try {
            await agentApplicationService.setGrade(agentId, {
                grade,
                note: note.trim() || undefined,
            });
            toast.success(`${name} is now ${gradeLabel(grade)}`);
            onClose();
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The grade did not change.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle>Change {name}&rsquo;s grade</DialogTitle>
                <DialogDescription>
                    At a renewal, a promotion, or after a review. The grade decides which publishers or advertisers they handle.
                </DialogDescription>
            </DialogHeader>
            <RadioGroup value={grade} onValueChange={(v) => setGrade(v as AgentGrade)} className="grid gap-2 sm:grid-cols-2">
                {AGENT_GRADES.map((code) => (
                    <label key={code} htmlFor={`regrade-${code}`} className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-left">
                        <RadioGroupItem id={`regrade-${code}`} value={code} className="mt-0.5" />
                        <span>
                            <span className="block text-sm font-medium text-foreground">
                                {code} · {GRADE_META[code].label}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">{GRADE_META[code].handles}</span>
                        </span>
                    </label>
                ))}
            </RadioGroup>
            <div className="grid gap-1.5">
                <Label htmlFor="regrade-note">Why</Label>
                <Textarea
                    id="regrade-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Optional — six months at G1 with a 4.8 rating."
                />
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button type="button" onClick={() => void save()} disabled={busy || grade === current}>
                    {busy ? "Saving…" : "Set grade"}
                </Button>
            </DialogFooter>
        </>
    );
}

function ExitDialog({
    open,
    onOpenChange,
    agentId,
    name,
    onChanged,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    agentId: string;
    name: string;
    onChanged: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {open && <ExitForm agentId={agentId} name={name} onClose={() => onOpenChange(false)} onChanged={onChanged} />}
            </DialogContent>
        </Dialog>
    );
}

function ExitForm({ agentId, name, onClose, onChanged }: { agentId: string; name: string; onClose: () => void; onChanged: () => void }) {
    const [reason, setReason] = React.useState<AgentExitReason>("RESIGNED");
    const [note, setNote] = React.useState("");
    const [rehire, setRehire] = React.useState(true);
    const [blacklist, setBlacklist] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    /** Fraud and misconduct are not rehired unless the desk ticks it back on. */
    const pickReason = (next: AgentExitReason) => {
        setReason(next);
        if (next === "FRAUD" || next === "MISCONDUCT") setRehire(false);
    };

    const save = async () => {
        setBusy(true);
        try {
            await agentApplicationService.exit(agentId, {
                reason,
                note: note.trim() || undefined,
                rehireEligible: rehire && !blacklist,
                blacklist,
            });
            toast.success(`${name}'s engagement has ended`, {
                description: "Work stops at once; the profile stays for the record.",
            });
            onClose();
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The exit did not reach ADX.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle>End {name}&rsquo;s engagement</DialogTitle>
                <DialogDescription>
                    They stop receiving work at once and the app shows the engagement has ended. Their wallet, orders and history stay on the record.
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
                <div className="grid gap-1.5">
                    <Label htmlFor="exit-reason">Reason</Label>
                    <Select value={reason} onValueChange={(v) => pickReason(v as AgentExitReason)}>
                        <SelectTrigger id="exit-reason" className="bg-card">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {AGENT_EXIT_REASONS.map((code) => (
                                <SelectItem key={code} value={code}>
                                    {EXIT_REASON_LABEL[code]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="exit-note">Note for the record</Label>
                    <Textarea id="exit-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional" />
                </div>
                <label className="flex cursor-pointer items-center gap-3">
                    <Checkbox checked={rehire && !blacklist} disabled={blacklist} onCheckedChange={(checked) => setRehire(checked === true)} id="exit-rehire" />
                    <span className="text-sm text-foreground">ADX would take them back</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3">
                    <Checkbox checked={blacklist} onCheckedChange={(checked) => setBlacklist(checked === true)} id="exit-blacklist" />
                    <span className="text-sm text-foreground">Blacklist — their papers can never be filed on another application</span>
                </label>
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button type="button" variant="destructive" onClick={() => void save()} disabled={busy}>
                    {busy ? "Ending…" : "End engagement"}
                </Button>
            </DialogFooter>
        </>
    );
}
