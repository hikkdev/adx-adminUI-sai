"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import {
    INTAKE_STATUS_META,
    INTAKE_USER_TYPE_LABEL,
    intakeName,
    onboardingService,
    type IntakeStatus,
    type WireIntakeSubmission,
} from "@/services/onboarding";

interface IntakeRecordProps {
    submission: WireIntakeSubmission;
    onChanged: () => void;
}

type Action = "review" | "approve" | "reject" | "cancel";

const ACTION_STATUS: Record<Action, IntakeStatus> = {
    review: "UNDER_REVIEW",
    approve: "APPROVED",
    reject: "REJECTED",
    cancel: "CANCELLED",
};

const HIDDEN_KEYS = new Set(["inviteToConsole"]);

/**
 * One intake, and its decision — Lot D (Q131).
 *
 * The record is drawn field by field as it was typed; the decision is the
 * status endpoint. APPROVED is the one that does something: an agent
 * intake becomes an agent profile through `agents.createAgent`, an
 * employee intake an HR row (and a console invitation when asked for).
 * Provisioning runs before the status moves, so a failure leaves the
 * record where it was, and only once, so a second press creates nothing
 * twice. A rejection needs its reason; a cancellation is how anything past
 * DRAFT is closed without a decision.
 */
export function IntakeRecord({ submission, onChanged }: IntakeRecordProps) {
    const [action, setAction] = React.useState<Action | null>(null);
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const name = intakeName(submission);
    const closed = submission.status === "APPROVED" || submission.status === "REJECTED" || submission.status === "CANCELLED";
    const provisioned = submission.provisioned ?? null;

    const move = async (next: Action) => {
        setBusy(true);
        try {
            const updated = await onboardingService.setStatus(submission.id, ACTION_STATUS[next], next === "reject" ? reason : undefined);
            const made = updated.provisioned;
            toast.success(
                next === "approve"
                    ? `${name} approved${made?.agentId ? " — agent profile created" : made?.employeeId ? " — employee record created" : ""}`
                    : next === "reject"
                      ? `${name} rejected`
                      : next === "cancel"
                        ? "Intake cancelled"
                        : "Marked under review",
                {
                    description:
                        made?.inviteSkipped === "NO_EMAIL"
                            ? "No email on the record, so no console invitation was sent."
                            : made?.inviteId
                              ? "A console invitation is on its way."
                              : undefined,
                }
            );
            setReason("");
            setAction(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The decision did not reach ADX.");
        } finally {
            setBusy(false);
        }
    };

    const fields = Object.entries(submission.data).filter(([key]) => !HIDDEN_KEYS.has(key));
    const profileHref =
        submission.userType === "AGENT" && provisioned?.agentId
            ? `/agents/${provisioned.agentId}`
            : submission.userType === "EMPLOYEE" && provisioned?.employeeId
              ? `/kyc/employees/${provisioned.employeeId}`
              : null;

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href={`/onboarding/submissions?userType=${submission.userType}`}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Onboarding intake
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{INTAKE_USER_TYPE_LABEL[submission.userType]} intake</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{name}</h1>
                            <StatusBadge status={INTAKE_STATUS_META[submission.status]} />
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Submitted {formatDateTime(submission.createdAt)}
                            {submission.flowTemplate ? ` · ${submission.flowTemplate.name} v${submission.flowTemplate.version}` : ""}
                        </p>
                    </div>
                    {!closed && (
                        <div className="flex flex-wrap items-center gap-2">
                            {submission.status !== "UNDER_REVIEW" && (
                                <Button variant="outline" className="bg-card" disabled={busy} onClick={() => void move("review")}>
                                    Mark under review
                                </Button>
                            )}
                            <Button variant="outline" className="bg-card" disabled={busy} onClick={() => setAction("cancel")}>
                                Cancel intake
                            </Button>
                            <Button variant="outline" className="bg-card text-danger hover:text-danger" disabled={busy} onClick={() => setAction("reject")}>
                                Reject
                            </Button>
                            <Button disabled={busy} onClick={() => setAction("approve")}>
                                Approve
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-5">
                <Card className="rounded-lg border-border p-5 shadow-none xl:col-span-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What was submitted</h3>
                    {fields.length === 0 ? (
                        <p className="mt-3 text-sm text-muted-foreground">Nothing typed beyond the person.</p>
                    ) : (
                        <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                            {fields.map(([key, value]) => (
                                <div key={key}>
                                    <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{key}</dt>
                                    <dd className="mt-0.5 break-words text-sm font-medium text-foreground">
                                        {typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value)}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    )}
                    {submission.userType === "EMPLOYEE" && submission.data["inviteToConsole"] !== undefined && (
                        <p className="mt-3 text-xs text-muted-foreground">A console invitation goes out to their email on approval.</p>
                    )}
                </Card>

                <div className="space-y-4 xl:col-span-2">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">The person</h3>
                        {submission.user ? (
                            <dl className="mt-3 space-y-2 text-sm">
                                <div className="flex justify-between gap-4">
                                    <dt className="text-muted-foreground">Name</dt>
                                    <dd className="font-medium text-foreground">{submission.user.name ?? "—"}</dd>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <dt className="text-muted-foreground">Mobile</dt>
                                    <dd className="font-mono text-xs text-foreground">{submission.user.mobile}</dd>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <dt className="text-muted-foreground">Email</dt>
                                    <dd className="text-foreground">{submission.user.email ?? "—"}</dd>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <dt className="text-muted-foreground">Roles</dt>
                                    <dd className="text-foreground">{submission.user.roles?.length ? submission.user.roles.map((role) => role.role).join(", ") : "none yet"}</dd>
                                </div>
                            </dl>
                        ) : (
                            <p className="mt-3 text-sm text-muted-foreground">
                                No account is linked. {submission.userType === "EMPLOYEE" ? "An employee intake cannot be approved until one is." : ""}
                            </p>
                        )}
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decision</h3>
                        {submission.reviewedAt ? (
                            <dl className="mt-3 space-y-2 text-sm">
                                <div className="flex justify-between gap-4">
                                    <dt className="text-muted-foreground">Moved</dt>
                                    <dd className="text-foreground">{formatDateTime(submission.reviewedAt)}</dd>
                                </div>
                                {submission.reviewedById && (
                                    <div className="flex justify-between gap-4">
                                        <dt className="text-muted-foreground">By</dt>
                                        <dd className="truncate font-mono text-xs text-foreground">{submission.reviewedById}</dd>
                                    </div>
                                )}
                                {submission.rejectionReason && <div className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">{submission.rejectionReason}</div>}
                            </dl>
                        ) : (
                            <p className="mt-3 text-sm text-muted-foreground">Nobody has moved this record yet.</p>
                        )}
                        {profileHref && (
                            <Button variant="outline" size="sm" className="mt-3 h-8" asChild>
                                <Link href={profileHref}>{submission.userType === "AGENT" ? "Open the agent" : "Record their KYC"}</Link>
                            </Button>
                        )}
                        {submission.status === "APPROVED" && !profileHref && (
                            <p className="mt-3 text-xs text-muted-foreground">
                                {submission.userType === "AGENT" || submission.userType === "EMPLOYEE"
                                    ? "Approved earlier; the profile it created is on its own page."
                                    : "Approved. Publisher, advertiser and partner intakes provision nothing themselves."}
                            </p>
                        )}
                    </Card>
                </div>
            </div>

            <ConfirmDialog
                open={action !== null}
                onOpenChange={(open) => !open && setAction(null)}
                title={
                    action === "approve"
                        ? `Approve ${name}?`
                        : action === "reject"
                          ? `Reject ${name}?`
                          : "Cancel this intake?"
                }
                description={
                    action === "approve"
                        ? submission.userType === "AGENT"
                            ? "An agent profile is created through the same door the direct screen uses; their KYC is recorded afterwards under KYC › Agents."
                            : submission.userType === "EMPLOYEE"
                              ? "An HR record is created for the linked account, and a console invitation sent if the intake asked for one; their KYC is recorded afterwards under KYC › Employees."
                              : "The intake is marked approved. Nothing is provisioned for this type."
                        : action === "reject"
                          ? "The record is closed with your reason. It cannot be reopened; a fresh intake can be submitted."
                          : "The record is closed without a decision. Nothing is created."
                }
                confirmLabel={action === "approve" ? "Approve" : action === "reject" ? "Reject" : "Cancel intake"}
                destructive={action === "reject" || action === "cancel"}
                busy={busy}
                disabled={action === "reject" && reason.trim().length === 0}
                onConfirm={() => action && void move(action)}
            >
                {action === "reject" && (
                    <Textarea
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Why — kept on the record…"
                        className="min-h-20 resize-none"
                        aria-label="Reason for rejection"
                    />
                )}
            </ConfirmDialog>
        </div>
    );
}
