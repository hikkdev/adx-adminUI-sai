"use client";

import { Card } from "@/components/ui/card";
import { PrivateFile, privateFileUrl } from "@/components/adx/private-file";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import { personLabel } from "@/services/kyc";
import type { KycLiveness } from "@/types";

interface LivenessCardProps {
    liveness: KycLiveness | null;
    method: "MANUAL" | "DIGIO";
    /** The party's own account, or null when they have never signed in. */
    userId: string | null;
    /** The 409 `LIVENESS_REQUIRED` message the decision answered, when it did. */
    refusal?: string | null;
    party: string;
}

const STATUS_META = {
    PENDING: { label: "Recorded", tone: "warning" as const },
    VERIFIED: { label: "Verified", tone: "success" as const },
    REJECTED: { label: "Rejected", tone: "danger" as const },
};

/**
 * The liveness video — Lot D (Q131).
 *
 * The manual path needs proof the person behind the documents is present:
 * a short video the phone uploaded as a private USER_KYC file. The desk
 * plays it here through `<PrivateFile>` and, when a VERIFIED decision was
 * refused with `LIVENESS_REQUIRED`, says so in plain words rather than
 * leaving a 409 in a toast. The Digio path is exempt — Digio performed its
 * own — and a rejection needs no video.
 *
 * Lot N: presence may instead be attested at the desk — an admin who met
 * the person says so, and the row carries who, when and the note. The card
 * shows the attestation beside (or instead of) the video; either satisfies
 * the gate.
 */
export function LivenessCard({ liveness, method, userId, refusal, party }: LivenessCardProps) {
    const attested = liveness?.attestedAt ? liveness : null;
    const hasVideo = Boolean(liveness && (liveness.fileId || liveness.submittedAt));
    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="liveness-card">
            <div className="flex items-start justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{attested && !hasVideo ? "Presence" : "Liveness video"}</h3>
                {liveness ? (
                    <StatusBadge status={attested && liveness.status === "VERIFIED" ? { label: "Attested at the desk", tone: "success" } : STATUS_META[liveness.status]} />
                ) : (
                    <StatusBadge status={{ label: method === "DIGIO" ? "Not needed" : "Not recorded", tone: "neutral" }} />
                )}
            </div>

            {attested && (
                <dl className="mt-3 space-y-1.5 rounded-md bg-muted/60 px-3 py-2 text-sm" data-testid="liveness-attestation">
                    <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Attested by</dt>
                        <dd className="text-foreground">{personLabel(attested.attestedById ? { id: attested.attestedById, name: null } : null) ?? "An admin"}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">When</dt>
                        <dd className="text-foreground">{formatDateTime(attested.attestedAt!)}</dd>
                    </div>
                    {attested.attestationNote && (
                        <div>
                            <dt className="text-muted-foreground">How they were met</dt>
                            <dd className="mt-0.5 text-foreground">“{attested.attestationNote}”</dd>
                        </div>
                    )}
                </dl>
            )}

            {refusal && (
                <div className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-foreground" role="alert" data-testid="liveness-refusal">
                    <p className="font-medium">Verification refused: liveness required.</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{refusal}</p>
                </div>
            )}

            {liveness && hasVideo ? (
                <div className="mt-3 space-y-3">
                    <PrivateFile
                        src={liveness.fileId ? privateFileUrl(liveness.fileId) : null}
                        alt={`${party}'s liveness video`}
                        kind="video"
                        className="max-h-64 w-full rounded-md bg-black"
                        frameClassName="min-h-24 rounded-md"
                    />
                    <dl className="space-y-1.5 text-sm">
                        <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Recorded</dt>
                            <dd className="text-foreground">{liveness.submittedAt ? formatDateTime(liveness.submittedAt) : "—"}</dd>
                        </div>
                        {liveness.reviewedAt && (
                            <div className="flex justify-between gap-3">
                                <dt className="text-muted-foreground">Decided</dt>
                                <dd className="text-foreground">{formatDateTime(liveness.reviewedAt)}</dd>
                            </div>
                        )}
                        {liveness.rejectionReason && (
                            <div className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">{liveness.rejectionReason}</div>
                        )}
                        {!liveness.fileId && (
                            <p className="text-xs text-muted-foreground">
                                The video itself was purged thirty days after verification; when it was recorded and what was decided remain.
                            </p>
                        )}
                    </dl>
                </div>
            ) : attested ? (
                <p className="mt-3 text-sm text-muted-foreground">No video was recorded; the attestation stands in for it, and a manual-path verification may go through on it.</p>
            ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                    {method === "DIGIO"
                        ? "Digio performed its own liveness check; no video is needed to verify this case."
                        : userId
                          ? `${party} has not recorded the short video yet. A manual-path case cannot be verified until they do — ask them to open the app, or attest their presence from Record at the desk; a rejection needs no video.`
                          : `${party} has not signed in yet, so there is no account to record a video against. The case can be rejected, or verified once they sign in and record it.`}
                </p>
            )}
        </Card>
    );
}
