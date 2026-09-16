"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Eye, EyeOff, FileText, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { PrivateFile } from "@/components/adx/private-file";
import { StatusBadge } from "@/components/adx/status-badge";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { escalationChip, flaggedFields, isLivenessRequired, recordedLine, requestLine, type DocumentDecision } from "@/services/kyc";
import { PARTNER_DESK_FACTS, printPartnerKycFieldLabel, printPartnerKycService, PRINT_PARTNER_KYC_FIELDS, type PrintPartnerKycCase } from "@/services/print-partner-kyc";
import { KYC_STATUS_META } from "@/types";
import { DecisionHistory } from "../../_shared/decision-history";
import { DigioCard } from "../../_shared/digio-card";
import { DocumentDecisionControls } from "../../_shared/document-review";
import { EscalateButton, EscalationCard } from "../../_shared/escalation";
import { LivenessCard } from "../../_shared/liveness-card";
import { RecordAtDeskButton } from "../../_shared/record-at-desk-dialog";
import { RequestKycButton } from "../../_shared/request-kyc-dialog";
import { ReuploadDialog } from "../../_shared/reupload-dialog";

interface PrintPartnerWorkbenchProps {
    kycCase: PrintPartnerKycCase;
    /** Re-reads the case after a write, so every card draws what the server holds. */
    onChanged: () => void;
}

/**
 * The print partner's workbench — Lot N, the advertiser desk tile for tile
 * on the partner's ten columns: a decision per document, a re-upload ask
 * for the flagged ones, who is working the case, the Digio session with
 * the provider's state, the liveness video or the desk's attestation and
 * the LIVENESS_REQUIRED refusal explained, the history of what was
 * decided. The header carries the desk's two doors while the record is not
 * verified: Request KYC (`POST /print-partner-kyc/:id/request`) and Record
 * at the desk (`PUT /print-partner-kyc/:id`), and says when the KYC was
 * requested and by whom.
 */
export function PrintPartnerWorkbench({ kycCase, onChanged }: PrintPartnerWorkbenchProps) {
    const router = useRouter();
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

    const reviewOf = (field: string) => kycCase.documentReviews.find((review) => review.field === field);
    const flagged = flaggedFields(kycCase.documentReviews);
    const decided = kycCase.status === "VERIFIED" || kycCase.status === "REJECTED";
    const verified = kycCase.status === "VERIFIED";
    const digioHolding = kycCase.method === "DIGIO" && kycCase.status !== "VERIFIED" && (kycCase.digio?.status ?? "pending") === "pending";
    const decisionLocked = decided || (digioHolding && !manualReview);
    const assignedToMe = user !== null && kycCase.assignedToId === user.id;
    const uploaded = kycCase.documents.filter((item) => item.url);
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
            await printPartnerKycService.review(kycCase.id, status, note.trim() || undefined);
            toast.success(status === "VERIFIED" ? `${kycCase.partnerName} verified` : `${kycCase.partnerName} rejected`, {
                description: status === "VERIFIED" ? "The shop can be paid for print jobs." : note.trim() ? `Note recorded: “${note.trim()}”` : undefined,
            });
            setNote("");
            onChanged();
        } catch (cause) {
            if (isLivenessRequired(cause)) {
                setLivenessRefusal(cause.message);
                toast.error("Verification refused: presence is not proved.", { description: cause.message });
            } else {
                toast.error(cause instanceof Error ? cause.message : "The decision did not reach ADX.");
            }
        } finally {
            setDeciding(false);
        }
    };

    const decideDocument = async (field: string, decision: DocumentDecision, text?: string) => {
        await printPartnerKycService.reviewDocument(kycCase.id, field, decision, text);
        onChanged();
    };

    const requestReupload = async (fields: string[], text: string) => {
        await printPartnerKycService.requestReupload(kycCase.id, fields, text);
        onChanged();
    };

    const assignToMe = async (clear: boolean) => {
        setAssigning(true);
        try {
            await printPartnerKycService.assign(kycCase.id, clear ? null : "me");
            toast.success(clear ? "Case unassigned" : "Case assigned to you", { description: "A filter, not ownership — any admin may still decide it." });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The assignment did not reach ADX.");
        } finally {
            setAssigning(false);
        }
    };

    const summary: [string, string][] = [
        ["Partner", [kycCase.displayId, kycCase.city].filter(Boolean).join(" · ") || "—"],
        ["Mobile", kycCase.mobile],
        ["PAN", kycCase.panNumber ?? "Not typed"],
        ["Method", kycCase.method === "DIGIO" ? "Digio" : "Documents"],
        ["Submitted", kycCase.submittedAt ? formatDateTime(kycCase.submittedAt) : "Nothing yet"],
        ["Recorded by", recordedLine(kycCase.recorded) ?? "—"],
        ["Working it", kycCase.assignedToId ? (assignedToMe ? "You" : kycCase.assignedTo?.name?.trim() || kycCase.assignedToId) : "Nobody yet"],
    ];

    const reviewable = kycCase.documents.map((document) => ({ field: document.field, label: document.label, url: document.url }));
    const initialDocuments = Object.fromEntries(kycCase.documents.filter((item) => item.url).map((item) => [item.field, item.url ?? undefined]));

    return (
        <div className="space-y-5">
            <div>
                <Link href="/kyc/print-partners" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <ChevronLeft className="size-4" />
                    Print partner KYC
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary">KYC review · print partner</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{kycCase.partnerName}</h1>
                            <StatusBadge status={KYC_STATUS_META[kycCase.status]} />
                            {kycCase.request?.open && <StatusBadge status={{ label: "Requested · awaiting the partner", tone: "info" }} />}
                            {escalatedChip && <StatusBadge status={escalatedChip} />}
                            {ageChip && <StatusBadge status={ageChip} />}
                        </div>
                        {kycCase.request && (
                            <p className="mt-1 text-sm text-muted-foreground" data-testid="request-line">
                                {requestLine(kycCase.request)}
                            </p>
                        )}
                        {kycCase.status === "NEEDS_INFO" && flagged.length > 0 && (
                            <p className="mt-1 text-sm text-muted-foreground" data-testid="needs-info-flagged">
                                Waiting on a re-upload of {flagged.map((item) => printPartnerKycFieldLabel(item.field)).join(", ")}.
                            </p>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/print-partners/${kycCase.partnerId}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
                            Open the partner
                        </Link>
                        {!verified && (
                            <>
                                <RequestKycButton
                                    party={kycCase.partnerName}
                                    hasAccount
                                    verified={verified}
                                    onRequest={async (channel, text) => {
                                        const result = await printPartnerKycService.request(kycCase.id, channel, text);
                                        return { digio: result.digio, notified: true };
                                    }}
                                    onRequested={onChanged}
                                />
                                <RecordAtDeskButton
                                    party={kycCase.partnerName}
                                    userId={kycCase.userId}
                                    purpose="PRINT_PARTNER_KYC"
                                    tiles={PRINT_PARTNER_KYC_FIELDS}
                                    facts={PARTNER_DESK_FACTS}
                                    initial={{ documents: initialDocuments, panNumber: kycCase.panNumber ?? "", govIdType: kycCase.govIdType ?? "" }}
                                    liveness={kycCase.liveness}
                                    needsInfo={kycCase.status === "NEEDS_INFO"}
                                    verified={verified}
                                    label="Record at the desk"
                                    onSubmit={async (body) => {
                                        const recorded = await printPartnerKycService.recordAtDesk(kycCase.id, body);
                                        return { caseHref: `/kyc/print-partners/${recorded.id}` };
                                    }}
                                    onRecorded={(href) => {
                                        onChanged();
                                        router.push(href);
                                    }}
                                />
                            </>
                        )}
                        <Button variant="outline" className="bg-card" disabled={assigning || decided} onClick={() => void assignToMe(assignedToMe)}>
                            <UserCheck className="mr-1.5 size-4" aria-hidden />
                            {assignedToMe ? "Unassign me" : "Assign to me"}
                        </Button>
                        <EscalateButton
                            party={kycCase.partnerName}
                            escalation={kycCase.escalation}
                            decided={decided}
                            onEscalate={async (reason) => {
                                await printPartnerKycService.escalate(kycCase.id, reason);
                                onChanged();
                            }}
                        />
                        {!decided && (
                            <>
                                <Button
                                    variant="outline"
                                    className="bg-card text-danger hover:text-danger"
                                    disabled={deciding || decisionLocked}
                                    onClick={() => setConfirmAction("reject")}
                                    title={digioHolding && !manualReview ? "Digio is still holding this case — choose Review manually to decide by hand" : undefined}
                                >
                                    Reject
                                </Button>
                                <Button
                                    onClick={() => setConfirmAction("verify")}
                                    disabled={deciding || decisionLocked || uploaded.length === 0}
                                    title={
                                        digioHolding && !manualReview
                                            ? "Digio is still holding this case — choose Review manually to decide by hand"
                                            : uploaded.length === 0
                                              ? "Nothing has been uploaded yet"
                                              : undefined
                                    }
                                >
                                    Verify partner
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <Card className="rounded-lg border-border shadow-none">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 sm:grid-cols-3 xl:grid-cols-7">
                    {summary.map(([label, value]) => (
                        <div key={label}>
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
                            <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{value}</dd>
                        </div>
                    ))}
                </dl>
            </Card>

            <div className="grid gap-4 xl:grid-cols-5">
                <Card className="rounded-lg border-border shadow-none xl:col-span-3">
                    <div className="border-b px-5 py-4">
                        <h3 className="text-sm font-semibold text-foreground">Documents</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {uploaded.length} of {PRINT_PARTNER_KYC_FIELDS.length} on file
                            {kycCase.imagesPurgedAt ? " · the images were purged after Digio verified this partner" : ""}
                        </p>
                    </div>
                    <ul className="divide-y">
                        {kycCase.documents.map((document) => {
                            const present = Boolean(document.url);
                            const review = reviewOf(document.field);
                            const previewing = previewField === document.field;
                            return (
                                <li key={document.field} className="px-5 py-3">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <FileText className={cn("size-4 shrink-0", present ? "text-muted-foreground" : "text-muted-foreground/40")} />
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
                                            <StatusBadge status={{ label: "Not on file", tone: "neutral" }} />
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
                </Card>

                <div className="space-y-4 xl:col-span-2">
                    <EscalationCard escalation={kycCase.escalation} />

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <Label htmlFor="review-note" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Reviewer note
                        </Label>
                        {kycCase.reviewNote && (
                            <p className="mt-2 rounded-md bg-muted/60 px-3 py-2 text-sm text-foreground" data-testid="review-note">
                                Last note on the record: “{kycCase.reviewNote}”
                            </p>
                        )}
                        <Textarea
                            id="review-note"
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            rows={3}
                            className="mt-3"
                            maxLength={500}
                            placeholder="Kept on the record with the decision; required when rejecting"
                            disabled={decided}
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 h-8"
                            disabled={decided || uploaded.length === 0}
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
                    </Card>

                    <LivenessCard liveness={kycCase.liveness} method={kycCase.method} userId={kycCase.userId} refusal={livenessRefusal} party={kycCase.partnerName} />

                    <DigioCard
                        party={kycCase.partnerName}
                        digio={kycCase.digio}
                        verified={verified}
                        imagesPurgedAt={kycCase.imagesPurgedAt}
                        onRestart={() => printPartnerKycService.restartDigio(kycCase.id)}
                        onReviewManually={() => setManualReview(true)}
                        manualReview={manualReview || kycCase.method !== "DIGIO"}
                        onChanged={onChanged}
                    />

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
                        labelOf={printPartnerKycFieldLabel}
                    />
                </div>
            </div>

            <ReuploadDialog
                key={reuploadKey}
                open={reuploadOpen}
                onOpenChange={setReuploadOpen}
                party={kycCase.partnerName}
                documents={reviewable}
                reviews={kycCase.documentReviews}
                onRequest={requestReupload}
            />

            <ConfirmDialog
                open={confirmAction !== null}
                onOpenChange={(open) => !open && setConfirmAction(null)}
                title={confirmAction === "verify" ? "Verify this print partner?" : "Reject this submission?"}
                description={
                    confirmAction === "verify"
                        ? `${kycCase.partnerName} will be marked verified; the shop can be paid for print jobs and, where the setting asks for it, activated.`
                        : `${kycCase.partnerName} will be told with your note. They can resubmit corrected documents.`
                }
                confirmLabel={confirmAction === "verify" ? "Verify partner" : "Reject"}
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
        </div>
    );
}
