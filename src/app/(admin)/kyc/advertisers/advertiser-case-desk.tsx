"use client";

import * as React from "react";
import { Eye, EyeOff, FileText, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { PrivateFile } from "@/components/adx/private-file";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { StatusBadge } from "@/components/adx/status-badge";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { cn } from "@/lib/utils";
import { ADVERTISER_DESK_FACTS, advertiserDeskTiles, advertiserKycFieldLabel, advertiserKycService } from "@/services/advertiser-kyc";
import { escalationChip, flaggedFields, isLivenessRequired, recordedLine, requestLine, type DocumentDecision } from "@/services/kyc";
import { ADVERTISER_KYC_REQUIREMENTS, ADVERTISER_KYC_STATUS_META, ADVERTISER_KYC_TYPE_META, type AdvertiserKycCase } from "@/types";
import { DecisionHistory } from "../_shared/decision-history";
import { DigioCard } from "../_shared/digio-card";
import { DocumentDecisionControls } from "../_shared/document-review";
import { EscalateButton, EscalationCard } from "../_shared/escalation";
import { LivenessCard } from "../_shared/liveness-card";
import { RecordAtDeskButton } from "../_shared/record-at-desk-dialog";
import { RequestKycButton } from "../_shared/request-kyc-dialog";
import { ReuploadDialog } from "../_shared/reupload-dialog";

interface AdvertiserCaseDeskProps {
    /** The queue row, for the header while the case read is in flight. */
    row: AdvertiserKycCase;
    /** Re-reads the queue after a write. */
    onChanged: () => void;
}

/**
 * The advertiser twin of the publisher workbench — Lot D.
 *
 * The case is read on its own (`GET /advertiser-kyc/:id`) because the list
 * does not carry the per-tile decisions or the liveness video. Everything
 * the publisher desk does happens here on the same shared cards: a decision
 * per document, a re-upload ask for the flagged ones, who is working the
 * case, the Digio session with the provider's state, the liveness video and
 * the LIVENESS_REQUIRED refusal explained, the history of what was decided.
 *
 * Lot G (Q127/142): "Escalate" is `POST /advertiser-kyc/:id/escalate
 * { reason }`; the header carries the Escalated pill with its source and
 * who it went to, and the card shows when, from where, to whom and why —
 * G11-1: both people named by the case read itself.
 *
 * Lot N: while the record is not verified the header carries the desk's
 * two doors — Request KYC (`POST /advertiser-kyc/:id/request`) and Record
 * at the desk (`PUT /advertiser-kyc/:id`) — and says when the KYC was
 * requested, by whom and over which channel; the facts strip names who
 * recorded the documents.
 */
export function AdvertiserCaseDesk({ row, onChanged }: AdvertiserCaseDeskProps) {
    const resource = useApiResource<AdvertiserKycCase | null>(`advertiser-kyc:case:${row.id}`, () => advertiserKycService.get(row.id));
    const reload = () => {
        resource.reload();
        onChanged();
    };

    return (
        <ResourceBoundary resource={resource} empty={<Card className="rounded-lg border-border p-10 text-center shadow-none">This case no longer exists.</Card>}>
            {(kycCase) => (kycCase ? <Desk kycCase={kycCase} onChanged={reload} /> : <Card className="rounded-lg border-border p-10 text-center shadow-none">This case no longer exists.</Card>)}
        </ResourceBoundary>
    );
}

function Desk({ kycCase, onChanged }: { kycCase: AdvertiserKycCase; onChanged: () => void }) {
    const { user } = useAuth();
    const escalatedChip = escalationChip(kycCase.escalation);
    const [note, setNote] = React.useState("");
    const [deciding, setDeciding] = React.useState(false);
    const [assigning, setAssigning] = React.useState(false);
    const [confirmAction, setConfirmAction] = React.useState<"verify" | "reject" | null>(null);
    const [reuploadOpen, setReuploadOpen] = React.useState(false);
    const [reuploadKey, setReuploadKey] = React.useState(0);
    const [previewField, setPreviewField] = React.useState<string | null>(null);
    const [manualReview, setManualReview] = React.useState(kycCase.method !== "DIGIO");
    const [livenessRefusal, setLivenessRefusal] = React.useState<string | null>(null);

    const required = ADVERTISER_KYC_REQUIREMENTS[kycCase.kycType];
    const documents = [
        ...required.map((requirement) => kycCase.documents.find((item) => item.field === requirement.field) ?? { ...requirement, fileName: null, uploadedAt: null, url: null }),
        /* The DR 08 captures beyond the type's list — the back of the ID, the selfie. */
        ...kycCase.documents.filter((item) => !required.some((requirement) => requirement.field === item.field)),
    ];
    const missing = required.filter((requirement) => !kycCase.documents.find((item) => item.field === requirement.field && item.fileName));
    const reviewOf = (field: string) => kycCase.documentReviews.find((review) => review.field === field);
    const flagged = flaggedFields(kycCase.documentReviews);
    const decided = kycCase.status === "VERIFIED" || kycCase.status === "REJECTED";
    const verified = kycCase.status === "VERIFIED";
    const digioHolding = kycCase.method === "DIGIO" && kycCase.status !== "VERIFIED" && (kycCase.digio?.status ?? "pending") === "pending";
    const decisionLocked = decided || (digioHolding && !manualReview);
    const assignedToMe = user !== null && kycCase.assignedToId === user.id;
    /* E7-3: the age chip — hours waiting while PENDING, against the SLA the read named. */
    const ageChip =
        kycCase.ageHours === null
            ? null
            : kycCase.slaBreached
              ? { label: `Waiting ${Math.floor(kycCase.ageHours)}h · past SLA`, tone: "danger" as const }
              : { label: `Waiting ${Math.floor(kycCase.ageHours)}h · ${kycCase.slaHoursLeft}h left`, tone: kycCase.slaHoursLeft <= 6 ? ("warning" as const) : ("neutral" as const) };

    const decide = async (status: "VERIFIED" | "REJECTED") => {
        setDeciding(true);
        setLivenessRefusal(null);
        try {
            await advertiserKycService.review(kycCase.id, status, note.trim() || undefined);
            toast.success(status === "VERIFIED" ? "Advertiser verified" : "Submission rejected", { description: kycCase.advertiser });
            setNote("");
            onChanged();
        } catch (cause) {
            if (isLivenessRequired(cause)) {
                setLivenessRefusal(cause.message);
                toast.error("Verification refused: the liveness video is missing.", { description: cause.message });
            } else {
                toast.error(cause instanceof Error ? cause.message : "The decision did not reach ADX.");
            }
        } finally {
            setDeciding(false);
        }
    };

    const decideDocument = async (field: string, decision: DocumentDecision, text?: string) => {
        await advertiserKycService.reviewDocument(kycCase.id, field, decision, text);
        onChanged();
    };

    const requestReupload = async (fields: string[], text: string) => {
        await advertiserKycService.requestReupload(kycCase.id, fields, text);
        onChanged();
    };

    const assignToMe = async (clear: boolean) => {
        setAssigning(true);
        try {
            await advertiserKycService.assign(kycCase.id, clear ? null : "me");
            toast.success(clear ? "Case unassigned" : "Case assigned to you", { description: "A filter, not ownership — any admin may still decide it." });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The assignment did not reach ADX.");
        } finally {
            setAssigning(false);
        }
    };

    return (
        <Card className="rounded-lg border-border shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-foreground">{kycCase.advertiser}</h2>
                        <StatusBadge status={ADVERTISER_KYC_STATUS_META[kycCase.status]} />
                        {kycCase.request?.open && <StatusBadge status={{ label: "Requested · awaiting the advertiser", tone: "info" }} />}
                        {escalatedChip && <StatusBadge status={escalatedChip} />}
                        {ageChip && <StatusBadge status={ageChip} />}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {kycCase.contact} · {kycCase.email}
                    </p>
                    {kycCase.request && (
                        <p className="mt-1 text-sm text-muted-foreground" data-testid="request-line">
                            {requestLine(kycCase.request)}
                        </p>
                    )}
                    {kycCase.status === "NEEDS_INFO" && flagged.length > 0 && (
                        <p className="mt-1 text-sm text-muted-foreground" data-testid="needs-info-flagged">
                            Waiting on a re-upload of {flagged.map((item) => advertiserKycFieldLabel(item.field)).join(", ")}.
                        </p>
                    )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {!verified && (
                        <>
                            <RequestKycButton
                                party={kycCase.advertiser}
                                hasAccount
                                verified={verified}
                                onRequest={(channel, text) => advertiserKycService.request(kycCase.id, channel, text)}
                                onRequested={onChanged}
                            />
                            <RecordAtDeskButton
                                party={kycCase.advertiser}
                                userId={kycCase.advertiserId}
                                purpose="ADVERTISER_KYC"
                                tiles={advertiserDeskTiles(kycCase.kycType)}
                                facts={ADVERTISER_DESK_FACTS}
                                initial={{
                                    documents: Object.fromEntries(kycCase.documents.filter((item) => item.url).map((item) => [item.field, item.url ?? undefined])),
                                    panNumber: kycCase.panNumber ?? "",
                                }}
                                liveness={kycCase.liveness}
                                needsInfo={kycCase.status === "NEEDS_INFO"}
                                verified={verified}
                                label="Record at the desk"
                                onSubmit={async (body) => {
                                    await advertiserKycService.recordAtDesk(kycCase.id, body);
                                    return { caseHref: "/kyc/advertisers" };
                                }}
                                onRecorded={() => onChanged()}
                            />
                        </>
                    )}
                    <Button variant="outline" className="bg-card" disabled={assigning || decided} onClick={() => void assignToMe(assignedToMe)}>
                        <UserCheck className="mr-1.5 size-4" aria-hidden />
                        {assignedToMe ? "Unassign me" : "Assign to me"}
                    </Button>
                    <EscalateButton
                        party={kycCase.advertiser}
                        escalation={kycCase.escalation}
                        decided={decided}
                        onEscalate={async (reason) => {
                            await advertiserKycService.escalate(kycCase.id, reason);
                            onChanged();
                        }}
                    />
                    {!decided && (
                        <>
                            <Button
                                variant="outline"
                                className="bg-card"
                                disabled={deciding || decisionLocked}
                                onClick={() => setConfirmAction("reject")}
                                title={digioHolding && !manualReview ? "Digio is still holding this case — choose Review manually to decide by hand" : undefined}
                            >
                                Reject
                            </Button>
                            <Button
                                onClick={() => setConfirmAction("verify")}
                                disabled={missing.length > 0 || deciding || decisionLocked}
                                title={digioHolding && !manualReview ? "Digio is still holding this case — choose Review manually to decide by hand" : undefined}
                            >
                                Verify advertiser
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 border-b px-5 py-4 sm:grid-cols-4">
                {[
                    ["Type", ADVERTISER_KYC_TYPE_META[kycCase.kycType]],
                    ["Method", kycCase.method === "DIGIO" ? "Digio" : "Documents"],
                    ["PAN", kycCase.panNumber ?? "Not typed"],
                    ["Submitted", formatDateTime(kycCase.submittedAt)],
                    ["Recorded by", recordedLine(kycCase.recorded) ?? "—"],
                    ["Working it", kycCase.assignedToId ? (assignedToMe ? "You" : kycCase.assignedTo?.name?.trim() || kycCase.assignedToId) : "Nobody yet"],
                ].map(([label, value]) => (
                    <div key={label}>
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
                    </div>
                ))}
            </dl>

            {kycCase.escalation && (
                <div className="border-b px-5 py-4">
                    <EscalationCard escalation={kycCase.escalation} />
                </div>
            )}

            <div className="border-b px-5 py-4">
                <h3 className="text-sm font-semibold text-foreground">
                    Documents for {ADVERTISER_KYC_TYPE_META[kycCase.kycType].toLowerCase()} advertisers
                </h3>
                <ul className="mt-3 divide-y rounded-lg border">
                    {documents.map((document) => {
                        const present = Boolean(document.url);
                        const review = reviewOf(document.field);
                        const previewing = previewField === document.field;
                        return (
                            <li key={document.field} className="px-4 py-3">
                                <div className="flex flex-wrap items-center gap-3">
                                    <FileText className={cn("size-4 shrink-0", present ? "text-muted-foreground" : "text-danger")} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-foreground">{document.label}</p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {present ? document.fileName : "Not uploaded"}
                                            {review?.note ? ` · “${review.note}”` : ""}
                                        </p>
                                    </div>
                                    {present ? (
                                        <>
                                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPreviewField(previewing ? null : document.field)}>
                                                {previewing ? <EyeOff className="mr-1 size-3" aria-hidden /> : <Eye className="mr-1 size-3" aria-hidden />}
                                                {previewing ? "Hide" : "View"}
                                            </Button>
                                            <DocumentDecisionControls
                                                document={{ field: document.field, label: document.label, url: document.url }}
                                                review={review}
                                                disabled={decided}
                                                onDecide={decideDocument}
                                            />
                                        </>
                                    ) : (
                                        <StatusBadge status={{ label: "Missing", tone: "danger" }} />
                                    )}
                                </div>
                                {previewing && document.url && (
                                    <div className="mt-3 flex justify-center rounded-md border bg-muted/40 p-3">
                                        <PrivateFile src={document.url} alt={document.label} className="max-h-96 max-w-full rounded object-contain" frameClassName="h-40 w-full rounded" />
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
                {kycCase.documents.length === 0 && kycCase.imagesPurgedAt && (
                    <p className="mt-2 text-xs text-muted-foreground">The images were purged after Digio verified this advertiser.</p>
                )}
            </div>

            <div className="grid gap-4 border-b px-5 py-4 lg:grid-cols-2">
                <div>
                    <Label htmlFor="review-note">Reviewer note</Label>
                    {kycCase.reviewNote && (
                        <p className="mt-1.5 rounded-md bg-muted/60 px-3 py-2 text-sm text-foreground" data-testid="review-note">
                            Last note on the record: “{kycCase.reviewNote}”
                        </p>
                    )}
                    <Textarea
                        id="review-note"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        rows={3}
                        className="mt-1.5"
                        maxLength={500}
                        placeholder="Kept on the record with the decision; required when rejecting"
                        disabled={decided}
                    />
                    {missing.length > 0 && !decided && (
                        <p className="mt-2 text-xs text-danger">
                            {missing.length} required document{missing.length === 1 ? "" : "s"} missing, so this cannot be verified yet
                        </p>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 h-8"
                        disabled={decided}
                        onClick={() => {
                            setReuploadKey((value) => value + 1);
                            setReuploadOpen(true);
                        }}
                    >
                        Request re-upload{flagged.length > 0 ? ` (${flagged.length} flagged)` : ""}
                    </Button>
                    {decided && (
                        <p className="mt-3 text-xs text-muted-foreground">
                            Decided {kycCase.reviewedAt ? formatDateTime(kycCase.reviewedAt) : "—"}
                            {kycCase.reviewedById ? ` by ${kycCase.reviewedBy?.name?.trim() || kycCase.reviewedById}` : ""}
                            {kycCase.rejectionReason ? ` — ${kycCase.rejectionReason}` : ""}
                        </p>
                    )}
                </div>
                <div className="space-y-4">
                    <LivenessCard liveness={kycCase.liveness} method={kycCase.method} userId={kycCase.advertiserId} refusal={livenessRefusal} party={kycCase.advertiser} />
                    <DigioCard
                        party={kycCase.advertiser}
                        digio={kycCase.digio}
                        verified={kycCase.status === "VERIFIED"}
                        imagesPurgedAt={kycCase.imagesPurgedAt}
                        onRestart={() => advertiserKycService.restartDigio(kycCase.id)}
                        onReviewManually={() => setManualReview(true)}
                        manualReview={manualReview || kycCase.method !== "DIGIO"}
                        onChanged={onChanged}
                    />
                </div>
            </div>

            <div className="px-5 py-4">
                <DecisionHistory
                    record={{
                        status: kycCase.status,
                        reviewedAt: kycCase.reviewedAt,
                        reviewedById: kycCase.reviewedById,
                        reviewedByName: kycCase.reviewedBy?.name ?? null,
                        reviewNote: kycCase.reviewNote,
                        rejectionReason: kycCase.rejectionReason,
                    }}
                    reviews={kycCase.documentReviews}
                    labelOf={advertiserKycFieldLabel}
                />
            </div>

            <ReuploadDialog
                key={reuploadKey}
                open={reuploadOpen}
                onOpenChange={setReuploadOpen}
                party={kycCase.advertiser}
                documents={documents.map((document) => ({ field: document.field, label: document.label, url: document.url }))}
                reviews={kycCase.documentReviews}
                onRequest={requestReupload}
            />

            <ConfirmDialog
                open={confirmAction !== null}
                onOpenChange={(open) => !open && setConfirmAction(null)}
                title={confirmAction === "verify" ? "Verify this advertiser?" : "Reject this submission?"}
                description={
                    confirmAction === "verify"
                        ? `${kycCase.advertiser} will be marked verified and can book campaigns at once.`
                        : `${kycCase.advertiser} will be told with your note. They can resubmit corrected documents.`
                }
                confirmLabel={confirmAction === "verify" ? "Verify advertiser" : "Reject"}
                destructive={confirmAction === "reject"}
                busy={deciding}
                onConfirm={() => {
                    if (confirmAction === "reject" && note.trim().length === 0) {
                        toast.error("Add a reason before rejecting.");
                        setConfirmAction(null);
                        return;
                    }
                    const action = confirmAction!;
                    setConfirmAction(null);
                    void decide(action === "verify" ? "VERIFIED" : "REJECTED");
                }}
            />
        </Card>
    );
}
