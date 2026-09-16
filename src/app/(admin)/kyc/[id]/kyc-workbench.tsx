"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, FileText, Minus, Plus, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { PrivateFile } from "@/components/adx/private-file";
import { StatusBadge } from "@/components/adx/status-badge";
import { useAuth } from "@/lib/auth";
import { KYC_CASE_STATUS_META, type KycCase } from "@/types";
import {
    escalationChip,
    flaggedFields,
    isLivenessRequired,
    kycFieldLabel,
    kycService,
    PUBLISHER_DESK_FACTS,
    PUBLISHER_KYC_FIELDS,
    recordedLine,
    requestLine,
    type DocumentDecision,
} from "@/services/kyc";
import { AccessRecord } from "./access-record";
import { DecisionHistory } from "../_shared/decision-history";
import { DigioCard } from "../_shared/digio-card";
import { DocumentDecisionControls } from "../_shared/document-review";
import { EscalateButton, EscalationCard } from "../_shared/escalation";
import { LivenessCard } from "../_shared/liveness-card";
import { RecordAtDeskButton } from "../_shared/record-at-desk-dialog";
import { RequestKycButton } from "../_shared/request-kyc-dialog";
import { ReuploadDialog } from "../_shared/reupload-dialog";

interface KycWorkbenchProps {
    kycCase: KycCase;
    /** Re-reads the case after a write, so every card draws what the server holds. */
    onChanged: () => void;
}

const checkTone = { pass: "success", fail: "danger", manual: "warning" } as const;
const checkLabel = { pass: "Pass", fail: "Fail", manual: "Manual" } as const;

/**
 * The publisher KYC workbench — D7, Lot A, Lot D.
 *
 * The frame's layout: the summary strip, the document viewer with its tabs
 * and zoom on the left, the checks, the reviewer's note, the Digio session
 * and the access record on the right. Lot D adds a decision on each tile,
 * a re-upload ask for the flagged ones, the liveness video, who is working
 * the case, and the history of what has been decided. Every document is
 * drawn through `<PrivateFile>`: the columns hold `/files/:id` URLs that
 * answer only with the bearer token.
 *
 * Lot G (Q127/142): "Escalate" is `POST /publishers/kyc-queue/:id/escalate
 * { reason }`; the header carries the Escalated pill with its source and
 * who it went to, and the card beside the checks shows when, from where,
 * to whom and why — G11-1: both people named by the case read itself. The
 * decision clears it.
 *
 * Lot N: while the record is not verified the header carries the desk's
 * two doors — Request KYC (`POST /publishers/kyc-queue/:id/request`) and
 * Record at the desk (`PUT /publishers/kyc-queue/:id`) — and says when the
 * KYC was requested, by whom and over which channel; the summary strip
 * names who recorded the documents.
 */
export function KycWorkbench({ kycCase, onChanged }: KycWorkbenchProps) {
    const router = useRouter();
    const { user } = useAuth();
    const [activeDoc, setActiveDoc] = React.useState(kycCase.documents[0]?.id);
    const [zoom, setZoom] = React.useState(100);
    const [note, setNote] = React.useState("");
    const [confirmAction, setConfirmAction] = React.useState<"approve" | "reject" | null>(null);
    const [deciding, setDeciding] = React.useState(false);
    const [assigning, setAssigning] = React.useState(false);
    const [reuploadOpen, setReuploadOpen] = React.useState(false);
    const [reuploadKey, setReuploadKey] = React.useState(0);
    const [manualReview, setManualReview] = React.useState(kycCase.method !== "DIGIO");
    const [livenessRefusal, setLivenessRefusal] = React.useState<string | null>(null);

    const currentDoc = kycCase.documents.find((doc) => doc.id === activeDoc) ?? kycCase.documents[0];
    const reviewOf = (field: string) => kycCase.documentReviews.find((review) => review.field === field);
    const flagged = flaggedFields(kycCase.documentReviews);
    const decided = kycCase.kycStatus === "VERIFIED" || kycCase.kycStatus === "REJECTED";
    const verified = kycCase.kycStatus === "VERIFIED";
    const digioHolding = kycCase.method === "DIGIO" && kycCase.kycStatus !== "VERIFIED" && (kycCase.digio?.status ?? "pending") === "pending";
    const decisionLocked = decided || (digioHolding && !manualReview);
    const assignedToMe = user !== null && kycCase.assignedToId === user.id;
    const escalatedChip = escalationChip(kycCase.escalation);

    /* Lot D: the decision stamps who and what they said; VERIFIED on a
       manual-path row is refused with 409 LIVENESS_REQUIRED until the video
       is in — explained on the liveness card rather than toasted away. */
    const finalize = async (action: "approve" | "reject") => {
        setDeciding(true);
        setLivenessRefusal(null);
        try {
            await kycService.review(kycCase.publisherId, action === "approve" ? "VERIFIED" : "REJECTED", note.trim() || undefined);
            toast.success(action === "approve" ? `${kycCase.applicant} approved and verified` : `${kycCase.applicant} rejected`, {
                description: note.trim() ? `Note recorded: “${note.trim()}”` : undefined,
            });
            router.push("/kyc");
        } catch (cause) {
            if (isLivenessRequired(cause)) {
                setLivenessRefusal(cause.message);
                toast.error("Verification refused: the liveness video is missing.", { description: cause.message });
            } else {
                toast.error(cause instanceof Error ? cause.message : "The decision did not reach ADX.");
            }
            setDeciding(false);
        }
    };

    const decideDocument = async (field: string, decision: DocumentDecision, text?: string) => {
        await kycService.reviewDocument(kycCase.publisherId, field, decision, text);
        onChanged();
    };

    const requestReupload = async (fields: string[], text: string) => {
        await kycService.requestReupload(kycCase.publisherId, fields, text);
        onChanged();
    };

    const assignToMe = async (clear: boolean) => {
        setAssigning(true);
        try {
            await kycService.assign(kycCase.publisherId, clear ? null : "me");
            toast.success(clear ? "Case unassigned" : "Case assigned to you", {
                description: "A filter, not ownership — any admin may still decide it.",
            });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The assignment did not reach ADX.");
        } finally {
            setAssigning(false);
        }
    };

    const panCheck = kycCase.checks.find((check) => check.label.includes("PAN"));
    const summary: [string, string][] = [
        ["Business", kycCase.applicant],
        ["Owner", kycCase.owner],
        ["PAN", panCheck ? panCheck.detail : "-"],
        ["GSTIN", kycCase.checks.find((check) => check.label === "GSTIN")?.detail ?? "-"],
        ["Region", kycCase.city],
        ["Submitted", kycCase.submittedAt],
        [
            "Brought in by",
            kycCase.selfOnboarded
                ? "Self-onboarded — nobody from ADX has met them"
                : kycCase.agent
                  ? [kycCase.agent.name ?? "An agent", kycCase.agent.displayId].filter(Boolean).join(" · ")
                  : "-",
        ],
        ["Method", kycCase.method === "DIGIO" ? "Digio" : "Documents uploaded"],
        ["Recorded by", recordedLine(kycCase.recorded) ?? "—"],
        [
            "Working it",
            kycCase.assignedToId ? (assignedToMe ? "You" : kycCase.assignedTo?.name?.trim() || kycCase.assignedToId) : "Nobody yet",
        ],
    ];
    /* E7-3: the age chip — hours waiting while PENDING, against the SLA the read named. */
    const ageChip =
        kycCase.ageHours === null
            ? null
            : kycCase.slaBreached
              ? { label: `Waiting ${Math.floor(kycCase.ageHours)}h · past SLA`, tone: "danger" as const }
              : { label: `Waiting ${Math.floor(kycCase.ageHours)}h · ${kycCase.slaHoursLeft}h left`, tone: kycCase.slaHoursLeft <= 6 ? ("warning" as const) : ("neutral" as const) };

    const reviewable = kycCase.documents.map((doc) => ({ field: doc.field, label: doc.type, url: doc.url }));
    const initialDocuments = Object.fromEntries(kycCase.documents.map((doc) => [doc.field, doc.url]));

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/kyc"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    KYC queue
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary">KYC review</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{kycCase.applicant}</h1>
                            <StatusBadge status={KYC_CASE_STATUS_META[kycCase.status]} />
                            {kycCase.request?.open && <StatusBadge status={{ label: "Requested · awaiting the publisher", tone: "info" }} />}
                            {escalatedChip && <StatusBadge status={escalatedChip} />}
                            {ageChip && <StatusBadge status={ageChip} />}
                        </div>
                        {kycCase.request && (
                            <p className="mt-1 text-sm text-muted-foreground" data-testid="request-line">
                                {requestLine(kycCase.request)}
                            </p>
                        )}
                        {kycCase.kycStatus === "NEEDS_INFO" && flagged.length > 0 && (
                            <p className="mt-1 text-sm text-muted-foreground" data-testid="needs-info-flagged">
                                Waiting on a re-upload of {flagged.map((item) => kycFieldLabel(item.field)).join(", ")}.
                            </p>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {!verified && (
                            <>
                                <RequestKycButton
                                    party={kycCase.applicant}
                                    hasAccount={kycCase.userId !== null}
                                    verified={verified}
                                    onRequest={(channel, text) => kycService.request(kycCase.publisherId, channel, text)}
                                    onRequested={onChanged}
                                />
                                <RecordAtDeskButton
                                    party={kycCase.applicant}
                                    userId={kycCase.userId}
                                    purpose="KYC"
                                    tiles={PUBLISHER_KYC_FIELDS}
                                    facts={PUBLISHER_DESK_FACTS}
                                    initial={{ documents: initialDocuments }}
                                    liveness={kycCase.liveness}
                                    needsInfo={kycCase.kycStatus === "NEEDS_INFO"}
                                    verified={verified}
                                    label="Record at the desk"
                                    onSubmit={async (body) => {
                                        await kycService.recordAtDesk(kycCase.publisherId, body);
                                        return { caseHref: `/kyc/${kycCase.publisherId}` };
                                    }}
                                    onRecorded={() => onChanged()}
                                />
                            </>
                        )}
                        <Button
                            variant="outline"
                            className="bg-card"
                            onClick={() => void assignToMe(assignedToMe)}
                            disabled={assigning || decided}
                        >
                            <UserCheck className="mr-1.5 size-4" aria-hidden />
                            {assignedToMe ? "Unassign me" : "Assign to me"}
                        </Button>
                        <EscalateButton
                            party={kycCase.applicant}
                            escalation={kycCase.escalation}
                            decided={decided}
                            onEscalate={async (reason) => {
                                await kycService.escalate(kycCase.publisherId, reason);
                                onChanged();
                            }}
                        />
                        <Button
                            variant="outline"
                            className="bg-card text-danger hover:text-danger"
                            onClick={() => setConfirmAction("reject")}
                            disabled={deciding || decisionLocked}
                            title={digioHolding && !manualReview ? "Digio is still holding this case — choose Review manually to decide by hand" : undefined}
                        >
                            Reject KYC
                        </Button>
                        <Button
                            onClick={() => setConfirmAction("approve")}
                            disabled={deciding || decisionLocked}
                            title={digioHolding && !manualReview ? "Digio is still holding this case — choose Review manually to decide by hand" : undefined}
                        >
                            Approve &amp; verify
                        </Button>
                    </div>
                </div>
            </div>

            <Card className="rounded-lg border-border shadow-none">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 sm:grid-cols-3 xl:grid-cols-6">
                    {summary.map(([label, value]) => (
                        <div key={label}>
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
                            <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{value}</dd>
                        </div>
                    ))}
                </dl>
            </Card>

            <div className="grid gap-4 xl:grid-cols-5">
                {/* Document viewer */}
                <Card className="flex flex-col rounded-lg border-border shadow-none xl:col-span-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                            {kycCase.documents.map((doc) => {
                                const review = reviewOf(doc.field);
                                return (
                                    <button
                                        key={doc.id}
                                        type="button"
                                        onClick={() => setActiveDoc(doc.id)}
                                        className={cn(
                                            "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                                            doc.id === currentDoc?.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
                                        )}
                                    >
                                        <FileText className="size-3.5" />
                                        {doc.type}
                                        {review && (
                                            <span
                                                className={cn("size-1.5 rounded-full", review.decision === "APPROVED" ? "bg-success" : "bg-warning")}
                                                aria-label={review.decision === "APPROVED" ? "approved" : "flagged"}
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="size-7" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(50, value - 25))}>
                                <Minus className="size-3.5" />
                            </Button>
                            <span className="w-11 text-center text-xs text-muted-foreground">{zoom}%</span>
                            <Button variant="ghost" size="icon" className="size-7" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(200, value + 25))}>
                                <Plus className="size-3.5" />
                            </Button>
                        </div>
                    </div>
                    <div className="flex flex-1 items-center justify-center overflow-hidden bg-muted/40 p-6">
                        <div
                            className="flex aspect-[3/2] w-full max-w-xl items-center justify-center overflow-hidden rounded-md border bg-card shadow-sm transition-transform"
                            style={{ transform: `scale(${zoom / 100})` }}
                        >
                            {currentDoc ? (
                                <PrivateFile
                                    key={currentDoc.field}
                                    src={currentDoc.url}
                                    alt={currentDoc.type}
                                    className="max-h-full max-w-full object-contain"
                                    frameClassName="size-full"
                                />
                            ) : (
                                <div className="text-center">
                                    <FileText className="mx-auto size-8 text-muted-foreground/50" strokeWidth={1.5} />
                                    <p className="mt-2 text-sm font-medium text-foreground">No documents on file</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {kycCase.imagesPurgedAt ? "The images were purged after Digio verified this publisher." : "Nothing was uploaded for this case."}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                    {currentDoc && (
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">{currentDoc.type}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                    {currentDoc.fileName} · uploaded {currentDoc.uploadedAt}
                                    {reviewOf(currentDoc.field)?.note ? ` · “${reviewOf(currentDoc.field)!.note}”` : ""}
                                </p>
                            </div>
                            <DocumentDecisionControls
                                document={{ field: currentDoc.field, label: currentDoc.type, url: currentDoc.url }}
                                review={reviewOf(currentDoc.field)}
                                disabled={decided}
                                onDecide={decideDocument}
                            />
                        </div>
                    )}
                </Card>

                {/* Checks + notes */}
                <div className="space-y-4 xl:col-span-2">
                    <EscalationCard escalation={kycCase.escalation} />

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Verification checks</h3>
                        {kycCase.checks.length === 0 ? (
                            <p className="mt-3 text-sm text-muted-foreground">Nothing typed on this case — no PAN, no GSTIN, no Digio session.</p>
                        ) : (
                            <ul className="mt-3 divide-y">
                                {kycCase.checks.map((check) => (
                                    <li key={check.label} className="flex items-center gap-3 py-2.5">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-foreground">{check.label}</p>
                                            <p className="truncate text-xs text-muted-foreground">{check.detail}</p>
                                        </div>
                                        <StatusBadge status={{ label: checkLabel[check.result], tone: checkTone[check.result] }} />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reviewer notes</h3>
                        {kycCase.reviewNote && (
                            <p className="mt-2 rounded-md bg-muted/60 px-3 py-2 text-sm text-foreground" data-testid="review-note">
                                Last note on the record: “{kycCase.reviewNote}”
                            </p>
                        )}
                        <Textarea
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="Add a note for the audit trail…"
                            className="mt-3 min-h-24 resize-none"
                            maxLength={500}
                            disabled={decided}
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                            Kept on the record with the decision. A note is required when rejecting.
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 h-8"
                            disabled={decided || kycCase.documents.length === 0}
                            onClick={() => {
                                setReuploadKey((value) => value + 1);
                                setReuploadOpen(true);
                            }}
                        >
                            Request re-upload
                            {flagged.length > 0 ? ` (${flagged.length} flagged)` : ""}
                        </Button>
                    </Card>

                    {/* The liveness video, and why a manual-path VERIFIED was refused when it was. */}
                    <LivenessCard
                        liveness={kycCase.liveness}
                        method={kycCase.method}
                        userId={kycCase.userId}
                        refusal={livenessRefusal}
                        party={kycCase.applicant}
                    />

                    {/* The Digio session, the provider's state, and the desk's way to ask Digio again or decide by hand. */}
                    <DigioCard
                        party={kycCase.applicant}
                        digio={kycCase.digio}
                        verified={kycCase.kycStatus === "VERIFIED"}
                        imagesPurgedAt={kycCase.imagesPurgedAt}
                        onRestart={() => kycService.restartDigio(kycCase.publisherId)}
                        onReviewManually={() => setManualReview(true)}
                        manualReview={manualReview || kycCase.method !== "DIGIO"}
                        onChanged={onChanged}
                    />

                    <DecisionHistory
                        record={{
                            status: kycCase.kycStatus,
                            reviewedAt: kycCase.reviewedAt,
                            reviewedById: kycCase.reviewedById,
                            reviewedByName: kycCase.reviewedBy?.name ?? null,
                            reviewNote: kycCase.reviewNote,
                            rejectionReason: kycCase.rejectionReason,
                        }}
                        reviews={kycCase.documentReviews}
                        labelOf={kycFieldLabel}
                    />

                    {/* D6: who has had access — the owner's own record, beside the documents. */}
                    <AccessRecord publisherId={kycCase.publisherId} />
                </div>
            </div>

            <ReuploadDialog
                key={reuploadKey}
                open={reuploadOpen}
                onOpenChange={setReuploadOpen}
                party={kycCase.applicant}
                documents={reviewable}
                reviews={kycCase.documentReviews}
                onRequest={requestReupload}
            />

            <ConfirmDialog
                open={confirmAction !== null}
                onOpenChange={(open) => !open && setConfirmAction(null)}
                title={confirmAction === "approve" ? "Approve and verify?" : "Reject this application?"}
                description={
                    confirmAction === "approve"
                        ? `${kycCase.applicant} will be marked verified and payouts will unlock immediately.`
                        : `${kycCase.applicant} will be notified with your reviewer note. They can resubmit corrected documents.`
                }
                confirmLabel={confirmAction === "approve" ? "Approve & verify" : "Reject KYC"}
                destructive={confirmAction === "reject"}
                busy={deciding}
                onConfirm={() => {
                    if (confirmAction === "reject" && note.trim().length === 0) {
                        toast.error("Add a reviewer note before rejecting.");
                        setConfirmAction(null);
                        return;
                    }
                    const action = confirmAction!;
                    setConfirmAction(null);
                    void finalize(action);
                }}
            />
        </div>
    );
}
