"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DetailShell } from "@/components/adx/detail-shell";
import { FieldList, SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import {
    CLOSED_STAGES,
    EDUCATION_LABEL,
    IN_PROGRESS_STAGES,
    PLATFORM_LABEL,
    SIDE_ROLE_LABEL,
    SOURCE_LABEL,
    STAGE_META,
    STEP_LABEL,
    STEP_STATE_META,
    VEHICLE_LABEL,
    agentApplicationService,
    applicantName,
    gradeLabel,
    type AgentSourceKind,
    type ApplicationView,
    type LadderStep,
} from "@/services/agent-applications";
import type { EmployeeRow } from "@/services/employees";
import { AgentEngagementCard } from "../../[id]/agent-engagement-card";
import { DecisionPanel } from "./decision-panel";
import { EditApplicationDialog } from "./edit-application-dialog";
import { PapersTab } from "./papers-tab";
import { ScreeningCard } from "./screening-card";

interface ApplicationWorkbenchProps {
    view: ApplicationView;
    staff: EmployeeRow[];
    /** Re-read from the server — after an activation, a grade change or an exit. */
    onChanged: () => void;
}

/**
 * AG-3: one application on the desk. The same ladder the applicant climbs
 * in the app, with the desk able to do every step for someone at the
 * counter — write their details, file their papers, record the terms shown
 * on paper, submit for them — and then the desk's own steps: review each
 * paper, and decide. Every write hands the fresh view back, so the page
 * updates in place; a decision re-reads the whole thing.
 */
export function ApplicationWorkbench({ view: initial, staff, onChanged }: ApplicationWorkbenchProps) {
    const [view, setView] = React.useState(initial);
    /* A re-read from the loader replaces the working copy — adjusted during render, the React way, not in an effect. */
    const [seen, setSeen] = React.useState(initial);
    if (seen !== initial) {
        setSeen(initial);
        setView(initial);
    }
    const [editing, setEditing] = React.useState(false);
    const [recordingTerms, setRecordingTerms] = React.useState(false);
    const [submitting, setSubmitting] = React.useState(false);
    const [busy, setBusy] = React.useState(false);

    const stage = view.agent.stage;
    const closed = CLOSED_STAGES.includes(stage);
    const inProgress = IN_PROGRESS_STAGES.includes(stage);
    const name = applicantName({ user: { name: view.person.name, mobile: view.person.mobile }, displayId: view.agent.displayId });
    const manager = view.agent.engagement.reportingManagerId ? staff.find((row) => row.id === view.agent.engagement.reportingManagerId) : null;
    const source = SOURCE_LABEL[view.agent.sourceKind as AgentSourceKind] ?? view.agent.sourceKind;
    const subtitle = [view.agent.displayId, SIDE_ROLE_LABEL[view.agent.side], source, view.profile.city].filter(Boolean).join(" · ");

    const recordTerms = async () => {
        setBusy(true);
        try {
            setView(await agentApplicationService.recordAgreement(view.agent.id));
            toast.success("Terms recorded", { description: "Accepted at the desk, in your name." });
            setRecordingTerms(false);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The terms were not recorded.");
        } finally {
            setBusy(false);
        }
    };

    const submit = async () => {
        setBusy(true);
        try {
            setView(await agentApplicationService.submit(view.agent.id));
            toast.success("Under review", { description: "The application is with ADX; decide from the panel." });
            setSubmitting(false);
        } catch (cause) {
            if (cause instanceof ApiError && cause.code === "APPLICATION_INCOMPLETE") {
                const missing = ((cause.details as { missing?: string[] } | undefined)?.missing ?? []).join(", ");
                toast.error("Not complete yet", { description: missing || cause.message });
            } else {
                toast.error(cause instanceof Error ? cause.message : "The application was not submitted.");
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <DetailShell
            backHref="/agents/applications"
            backLabel="Applications"
            title={name}
            subtitle={subtitle}
            actions={
                <div className="flex flex-wrap items-center gap-2">
                    {!closed && (
                        <Button variant="outline" className="bg-card" onClick={() => setEditing(true)} data-testid="application-edit">
                            Edit details
                        </Button>
                    )}
                    {!closed && !view.agreement.accepted && (
                        <Button variant="outline" className="bg-card" onClick={() => setRecordingTerms(true)} data-testid="application-record-terms">
                            Record terms shown at desk
                        </Button>
                    )}
                    {inProgress && view.ladder.canSubmit && (
                        <Button onClick={() => setSubmitting(true)} data-testid="application-submit">
                            Submit for review
                        </Button>
                    )}
                    {(stage === "ACTIVE" || stage === "EXITED") && (
                        <Button variant="outline" className="bg-card" asChild>
                            <Link href={`/agents/${view.agent.id}`}>Agent page</Link>
                        </Button>
                    )}
                    <Button variant="outline" className="bg-card" asChild>
                        <Link href={`/kyc/agents/${view.agent.id}`}>KYC record</Link>
                    </Button>
                    <EditApplicationDialog view={view} open={editing} onOpenChange={setEditing} onSaved={setView} />
                    <ConfirmDialog
                        open={recordingTerms}
                        onOpenChange={setRecordingTerms}
                        title="Record the terms as accepted?"
                        description={`Only after ${name} has read the ${view.agent.side === "PUBLISHER" ? "field" : "sales"} agent terms on paper and signed. The acceptance is recorded in your name, with the version shown.`}
                        confirmLabel="Record acceptance"
                        busy={busy}
                        onConfirm={() => void recordTerms()}
                    />
                    <ConfirmDialog
                        open={submitting}
                        onOpenChange={setSubmitting}
                        title="Submit the application?"
                        description="It goes under review, the applicant is told, and the desk decides from the panel on the overview."
                        confirmLabel="Submit"
                        busy={busy}
                        onConfirm={() => void submit()}
                    />
                </div>
            }
            kpis={[
                { id: "stage", label: "Stage", value: STAGE_META[stage].label, hint: view.ladder.nextStep ? `Next: ${STEP_LABEL[view.ladder.nextStep]}` : closed ? "Closed" : stage === "ACTIVE" ? "Working" : "With ADX" },
                { id: "side", label: "Applying as", value: SIDE_ROLE_LABEL[view.agent.side], hint: source },
                { id: "grade", label: "Grade", value: gradeLabel(view.agent.grade), hint: view.agent.grade ? "Set by the desk" : "Set at activation" },
                view.agent.applicationSubmittedAt
                    ? { id: "submitted", label: "Submitted", value: formatDate(view.agent.applicationSubmittedAt) }
                    : { id: "identity", label: "Identity", value: view.identity.verified ? "Verified" : "Not yet", hint: view.identity.kycStatus ? `KYC ${view.identity.kycStatus.toLowerCase()}` : "From the papers or the KYC" },
            ]}
            tabs={[
                {
                    value: "overview",
                    label: "Overview",
                    content: (
                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="space-y-4">
                                <LadderCard view={view} />
                                {/* AG-4: the screen — the assessment, the interviews, the desk's tick. */}
                                <ScreeningCard view={view} staff={staff} closed={closed} onView={setView} />
                            </div>
                            <div className="space-y-4">
                                <DecisionPanel view={view} staff={staff} onView={(next) => { setView(next); onChanged(); }} />
                                {(stage === "ACTIVE" || stage === "EXITED") && (
                                    <AgentEngagementCard
                                        agentId={view.agent.id}
                                        name={name}
                                        facts={{
                                            stage,
                                            grade: view.agent.grade,
                                            type: view.agent.engagement.type,
                                            startAt: view.agent.engagement.startAt,
                                            endAt: view.agent.engagement.endAt,
                                            probationEndsAt: view.agent.engagement.probationEndsAt,
                                            reportingManagerId: view.agent.engagement.reportingManagerId,
                                            weeklyHours: view.agent.engagement.weeklyHours,
                                            activatedAt: view.agent.activatedAt,
                                            exitedAt: view.agent.exit.at,
                                            exitReason: view.agent.exit.reason,
                                            rehireEligible: view.agent.exit.rehireEligible,
                                        }}
                                        managerName={manager?.name ?? null}
                                        onChanged={onChanged}
                                    />
                                )}
                            </div>
                        </div>
                    ),
                },
                {
                    value: "papers",
                    label: `Papers${view.documents.some((d) => d.status === "SUBMITTED") ? " · to review" : ""}`,
                    content: <PapersTab view={view} closed={closed} onView={setView} />,
                },
                {
                    value: "details",
                    label: "Details",
                    content: <DetailsTab view={view} />,
                },
            ]}
        />
    );
}

/** The seven steps with what each still needs — the applicant's four, then the desk's three. */
function LadderCard({ view }: { view: ApplicationView }) {
    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="application-ladder">
            <h3 className="text-base font-semibold text-foreground">The ladder</h3>
            <p className="mt-1 text-sm text-muted-foreground">
                The same steps the app shows the applicant. The desk can do the first four for them; the last three are ADX&rsquo;s.
            </p>
            <ol className="mt-4 divide-y divide-border">
                {view.ladder.steps.map((step) => (
                    <StepRow key={step.key} step={step} next={view.ladder.nextStep === step.key} />
                ))}
            </ol>
            <FieldList
                className="mt-4 border-t pt-4"
                items={[
                    ["Identity", view.identity.verified ? "Verified" : view.identity.kycStatus ? `KYC ${view.identity.kycStatus.toLowerCase()}` : "From the papers"],
                    ["Payout account", view.bank.onFile ? "On file" : "None yet"],
                    ["ADX terms", view.agreement.accepted ? `Accepted · v${view.agreement.currentVersion ?? "—"}` : "Not accepted"],
                    // DS-1: the e-signature at activation, while the policy asks for one.
                    ...(view.signing?.required
                        ? [
                              [
                                  "E-signature",
                                  view.signing.satisfied
                                      ? "Signed through Digio"
                                      : view.signing.status === "REQUESTED" || view.signing.status === "PARTIALLY_SIGNED"
                                        ? `Awaiting signature — the agent works once it is signed${view.signing.mock ? " (mock rail)" : ""}`
                                        : view.signing.status
                                          ? `${view.signing.status.toLowerCase().replace("_", " ")} — send it again from Agreements › Signatures`
                                          : "Sent at activation",
                              ] as [string, string],
                          ]
                        : []),
                    ["Training", view.training.state === "CERTIFIED" ? "Certified" : view.training.state === "REVOKED" ? "Certificate revoked" : "Not certified"],
                ]}
            />
        </Card>
    );
}

function StepRow({ step, next }: { step: LadderStep; next: boolean }) {
    const meta = STEP_STATE_META[step.state];
    return (
        <li className="flex items-start gap-3 py-2.5" data-testid={`ladder-${step.key}`}>
            <span
                className={cn(
                    "mt-1.5 size-2.5 shrink-0 rounded-full",
                    step.state === "DONE" ? "bg-success" : step.state === "ACTION_NEEDED" ? "bg-danger" : step.state === "WAITING" ? "bg-info" : next ? "bg-primary" : "bg-border",
                )}
                aria-hidden
            />
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{STEP_LABEL[step.key]}</p>
                {step.missing.length > 0 && step.state !== "DONE" && <p className="text-xs text-muted-foreground">{step.missing.join(" · ")}</p>}
            </div>
            <StatusBadge status={meta} />
        </li>
    );
}

/** Everything the applicant told us, read-only; Edit details writes it. */
function DetailsTab({ view }: { view: ApplicationView }) {
    const p = view.profile;
    const publisher = view.agent.side === "PUBLISHER";
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-lg border-border p-5 shadow-none">
                <h3 className="text-base font-semibold text-foreground">The person</h3>
                <FieldList
                    className="mt-4"
                    items={[
                        ["Name", view.person.name ?? "—"],
                        ["Mobile", view.person.mobile ?? "—"],
                        ["Email", view.person.email ?? "—"],
                        ["Date of birth", view.person.dateOfBirth ? formatDate(view.person.dateOfBirth) : "—"],
                        ["Gender", view.person.gender ?? "—"],
                        ["City", [p.city, p.state].filter(Boolean).join(", ") || "—"],
                        ["Languages", p.languages.length ? p.languages.join(", ") : "—"],
                        ["Current address", p.currentAddress ?? "—"],
                        ["Permanent address", p.permanentAddress ?? "—"],
                        ["Vehicle", p.vehicleType ? `${VEHICLE_LABEL[p.vehicleType]}${p.vehicleNumber ? ` · ${p.vehicleNumber}` : ""}` : "—"],
                        ["Emergency contact", p.emergencyContactName ? `${p.emergencyContactName}${p.emergencyContactRelation ? ` (${p.emergencyContactRelation})` : ""} · ${p.emergencyContactPhone ?? "—"}` : "—"],
                        ["Territory", p.territory ?? "—"],
                        ["Home zone", p.homeZone ?? "—"],
                    ]}
                />
            </Card>
            {publisher ? (
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-base font-semibold text-foreground">Platforms ridden for</h3>
                    <SimpleTable
                        className="mt-4"
                        rows={view.platformExperiences}
                        rowKey={(row) => `${row.platform}-${row.partnerId ?? ""}`}
                        emptyMessage="None recorded."
                        columns={[
                            { key: "platform", label: "Platform", render: (row) => PLATFORM_LABEL[row.platform] ?? row.platform },
                            { key: "partnerId", label: "Partner id", render: (row) => row.partnerId ?? "—" },
                            { key: "years", label: "Years", render: (row) => (row.years === null ? "—" : String(row.years)) },
                            { key: "active", label: "Active", render: (row) => (row.active ? "Yes" : "No") },
                            { key: "note", label: "Rating", render: (row) => row.ratingNote ?? "—" },
                        ]}
                    />
                </Card>
            ) : (
                <>
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-base font-semibold text-foreground">Education and experience</h3>
                        <FieldList
                            className="mt-4"
                            items={[
                                ["Highest education", p.highestEducation ? EDUCATION_LABEL[p.highestEducation] : "—"],
                                ["Years in sales", p.salesExperienceYears ?? "—"],
                                ["Industries", p.industries.length ? p.industries.join(", ") : "—"],
                                ["Notice period", p.noticePeriodDays === null ? "—" : `${p.noticePeriodDays} days`],
                            ]}
                        />
                        <SimpleTable
                            className="mt-4"
                            rows={view.educations}
                            rowKey={(row) => `${row.level}-${row.institution ?? ""}-${row.year ?? ""}`}
                            emptyMessage="No qualifications recorded."
                            columns={[
                                { key: "level", label: "Level", render: (row) => EDUCATION_LABEL[row.level] ?? row.level },
                                { key: "degree", label: "Degree", render: (row) => row.degree ?? "—" },
                                { key: "institution", label: "Institution", render: (row) => row.institution ?? "—" },
                                { key: "year", label: "Year", render: (row) => (row.year === null ? "—" : String(row.year)) },
                            ]}
                        />
                    </Card>
                    <Card className="rounded-lg border-border p-5 shadow-none lg:col-span-2">
                        <h3 className="text-base font-semibold text-foreground">Employers</h3>
                        <SimpleTable
                            className="mt-4"
                            rows={view.employments}
                            rowKey={(row) => `${row.employer}-${row.fromMonth ?? ""}`}
                            emptyMessage="No employers recorded."
                            columns={[
                                { key: "employer", label: "Employer", render: (row) => row.employer },
                                { key: "role", label: "Role", render: (row) => row.role ?? "—" },
                                { key: "industry", label: "Industry", render: (row) => row.industry ?? "—" },
                                { key: "when", label: "When", render: (row) => `${row.fromMonth ?? "?"} – ${row.current ? "now" : (row.toMonth ?? "?")}` },
                                { key: "why", label: "Left because", render: (row) => row.reasonForLeaving ?? "—" },
                            ]}
                        />
                        <h3 className="mt-6 text-base font-semibold text-foreground">References</h3>
                        <SimpleTable
                            className="mt-4"
                            rows={view.references}
                            rowKey={(row) => `${row.name}-${row.phone}`}
                            emptyMessage="No references recorded — two are needed."
                            columns={[
                                { key: "name", label: "Name", render: (row) => row.name },
                                { key: "relation", label: "Relation", render: (row) => row.relation ?? "—" },
                                { key: "phone", label: "Phone", render: (row) => row.phone },
                            ]}
                        />
                    </Card>
                </>
            )}
            {view.agent.exit.at && (
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-base font-semibold text-foreground">Exit</h3>
                    <FieldList className="mt-4" items={[["Ended", formatDateTime(view.agent.exit.at)], ["Reason", view.agent.exit.reason ?? "—"], ["Note", view.agent.exit.note ?? "—"], ["Would rehire", view.agent.exit.rehireEligible ? "Yes" : "No"], ["Blacklisted", view.agent.exit.blacklisted ? "Yes" : "No"]]} />
                </Card>
            )}
        </div>
    );
}
