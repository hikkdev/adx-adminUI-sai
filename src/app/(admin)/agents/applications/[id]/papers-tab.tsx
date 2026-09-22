"use client";

import * as React from "react";
import { ExternalLink, FileCheck2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/adx/status-badge";
import { openPrivateFile } from "@/components/adx/private-file";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/format";
import { uploadService } from "@/services/uploads";
import {
    DOCUMENT_STATUS_META,
    EXPIRING_KINDS,
    NUMBERED_KINDS,
    agentApplicationService,
    type AgentDocumentDecision,
    type AgentDocumentKind,
    type ApplicationDocument,
    type ApplicationView,
} from "@/services/agent-applications";

interface PapersTabProps {
    view: ApplicationView;
    /** Nothing more may be filed or reviewed: the application is closed. */
    closed: boolean;
    onView: (next: ApplicationView) => void;
}

const ACCEPT = ".jpg,.jpeg,.png,.pdf";

/**
 * The papers, one row each, required first. The desk files a paper for
 * the applicant (the upload is theirs — purpose KYC, owner the applicant —
 * so they can open it from the app), and reviews each one: approve, flag
 * with what is wrong, or ask for it again. A number and an expiry are asked
 * for on the papers that carry them, the same as the app asks.
 */
export function PapersTab({ view, closed, onView }: PapersTabProps) {
    const required = view.documents.filter((d) => d.required);
    const optional = view.documents.filter((d) => !d.required);
    return (
        <div className="space-y-4">
            <Card className="rounded-lg border-border p-5 shadow-none">
                <h3 className="text-base font-semibold text-foreground">Required papers</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                    Every one must be filed and approved before activation. Identity papers count as verified once all are approved, or when the desk vouches for the originals at activation.
                </p>
                <ul className="mt-3 divide-y divide-border">
                    {required.map((doc) => (
                        <PaperRow key={doc.kind} doc={doc} agentId={view.agent.id} ownerUserId={view.agent.userId} closed={closed} onView={onView} />
                    ))}
                </ul>
            </Card>
            {optional.length > 0 && (
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-base font-semibold text-foreground">Optional papers</h3>
                    <ul className="mt-3 divide-y divide-border">
                        {optional.map((doc) => (
                            <PaperRow key={doc.kind} doc={doc} agentId={view.agent.id} ownerUserId={view.agent.userId} closed={closed} onView={onView} />
                        ))}
                    </ul>
                </Card>
            )}
        </div>
    );
}

/** Which decisions a paper in this state can take — never the one it already has. */
function reviewsFor(doc: ApplicationDocument): AgentDocumentDecision[] {
    if (doc.status === "MISSING") return [];
    return (["APPROVED", "FLAGGED", "REUPLOAD_REQUESTED"] as AgentDocumentDecision[]).filter((d) => d !== doc.status);
}

const REVIEW_LABEL: Record<AgentDocumentDecision, string> = { APPROVED: "Approve", FLAGGED: "Flag", REUPLOAD_REQUESTED: "Ask again" };

function PaperRow({ doc, agentId, ownerUserId, closed, onView }: { doc: ApplicationDocument; agentId: string; ownerUserId: string; closed: boolean; onView: (next: ApplicationView) => void }) {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = React.useState(false);
    const [opening, setOpening] = React.useState(false);
    const [busy, setBusy] = React.useState<AgentDocumentDecision | null>(null);
    /** The uploaded file waiting for its number/expiry before it is filed. */
    const [pending, setPending] = React.useState<string | null>(null);
    const [review, setReview] = React.useState<AgentDocumentDecision | null>(null);
    const asksNumber = NUMBERED_KINDS.includes(doc.kind);
    const asksExpiry = EXPIRING_KINDS.includes(doc.kind);

    const file = async (url: string, number?: string, expiresAt?: string) => {
        try {
            onView(await agentApplicationService.fileDocument(agentId, doc.kind, { url, number, expiresAt }));
            toast.success(`${doc.label} filed`, { description: "It waits for review below." });
            setPending(null);
        } catch (cause) {
            if (cause instanceof ApiError && cause.code === "DOCUMENT_HELD_ELSEWHERE") {
                toast.error("That number is on another agent's record", { description: cause.message });
            } else {
                toast.error(cause instanceof Error ? cause.message : `${doc.label} could not be filed.`);
            }
        }
    };

    const pick = async (picked: File) => {
        setUploading(true);
        try {
            const uploaded = await uploadService.upload(picked, "KYC", { ownerUserId });
            if (asksNumber || asksExpiry) setPending(uploaded.url);
            else await file(uploaded.url);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : `${doc.label} did not upload.`);
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const open = async () => {
        if (!doc.url) return;
        setOpening(true);
        try {
            await openPrivateFile(doc.url);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : `${doc.label} could not be opened.`);
        } finally {
            setOpening(false);
        }
    };

    const decide = async (decision: AgentDocumentDecision, note?: string) => {
        setBusy(decision);
        try {
            onView(await agentApplicationService.reviewDocument(agentId, doc.kind, { decision, note }));
            toast.success(`${doc.label}: ${DOCUMENT_STATUS_META[decision].label.toLowerCase()}`);
            setReview(null);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The review did not reach ADX.");
        } finally {
            setBusy(null);
        }
    };

    const facts = [
        doc.numberMasked ? `No. ${doc.numberMasked}` : null,
        doc.expiresAt ? `Expires ${formatDate(doc.expiresAt)}` : null,
        doc.uploadedVia ? `Via ${doc.uploadedVia === "DESK" ? "the desk" : "the app"}` : null,
        doc.updatedAt ? formatDateTime(doc.updatedAt) : null,
    ].filter(Boolean);
    // AG-4: what Cashfree's RC lookup said, when the desk ran it.
    const rc = doc.verification?.payload as { ownerName?: string | null; nameMatch?: number | null; status?: string | null; insuranceValidUntil?: string | null; fitnessValidUntil?: string | null; vehicleClass?: string | null } | null | undefined;
    const [checking, setChecking] = React.useState(false);
    const checkRc = async () => {
        setChecking(true);
        try {
            const next = await agentApplicationService.verifyVehicleRc(agentId);
            onView(next);
            toast.success("RC checked with Cashfree", { description: next.verification.nameMatch === null ? "No owner name came back." : `Owner name matches ${next.verification.nameMatch}%.` });
        } catch (cause) {
            if (cause instanceof ApiError && cause.code === "VERIFICATION_UNAVAILABLE") toast.error("Could not check the RC", { description: `${cause.message} — check it by hand and approve.` });
            else toast.error(cause instanceof Error ? cause.message : "The RC check did not run.");
        } finally {
            setChecking(false);
        }
    };

    return (
        <li className="flex flex-wrap items-center gap-3 py-3" data-testid={`paper-${doc.kind}`}>
            {doc.url ? <FileCheck2 className="size-4 shrink-0 text-success" aria-hidden /> : <Upload className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />}
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{doc.label}</p>
                    <StatusBadge status={DOCUMENT_STATUS_META[doc.status]} />
                </div>
                <p className="truncate text-xs text-muted-foreground">
                    {doc.url ? (
                        <button type="button" onClick={() => void open()} disabled={opening} className="inline-flex items-center gap-1 hover:text-foreground disabled:opacity-60">
                            {opening ? "Opening…" : "Open the file"}
                            <ExternalLink className="size-3" aria-hidden />
                        </button>
                    ) : (
                        "Not filed"
                    )}
                    {facts.length > 0 ? ` · ${facts.join(" · ")}` : ""}
                </p>
                {doc.reviewNote && (doc.status === "FLAGGED" || doc.status === "REUPLOAD_REQUESTED") && (
                    <p className="mt-1 text-xs text-danger">{doc.reviewNote}</p>
                )}
                {doc.status === "EXPIRED" && <p className="mt-1 text-xs text-danger">Expired — a renewed one is needed.</p>}
                {doc.verification && (
                    <p className="mt-1 text-xs text-muted-foreground" data-testid={`paper-${doc.kind}-verification`}>
                        {doc.verification.via === "CASHFREE_VRS" ? "RC checked with Cashfree" : doc.verification.via === "CASHFREE_BANK" ? "Bank checked with Cashfree" : "Checked by hand"}
                        {doc.verification.at ? ` ${formatDateTime(doc.verification.at)}` : ""}
                        {rc?.ownerName ? ` · owner ${rc.ownerName}` : ""}
                        {typeof rc?.nameMatch === "number" ? ` · name match ${rc.nameMatch}%` : ""}
                        {rc?.status ? ` · ${rc.status}` : ""}
                        {rc?.vehicleClass ? ` · ${rc.vehicleClass}` : ""}
                        {rc?.insuranceValidUntil ? ` · insurance to ${rc.insuranceValidUntil}` : ""}
                        {rc?.fitnessValidUntil ? ` · fitness to ${rc.fitnessValidUntil}` : ""}
                    </p>
                )}
            </div>
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                disabled={closed || uploading}
                aria-label={`Upload ${doc.label}`}
                onChange={(event) => {
                    const picked = event.target.files?.[0];
                    if (picked) void pick(picked);
                }}
            />
            <div className="flex flex-wrap items-center gap-1.5">
                {!closed && doc.kind === "VEHICLE_RC" && doc.url && (
                    <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={checking} onClick={() => void checkRc()} data-testid="paper-VEHICLE_RC-check">
                        {checking ? <Loader2 className="mr-1 size-3 animate-spin" aria-hidden /> : null}
                        {doc.verification ? "Check again" : "Check RC"}
                    </Button>
                )}
                {!closed && (
                    <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={uploading} onClick={() => inputRef.current?.click()}>
                        {uploading ? <Loader2 className="mr-1 size-3 animate-spin" aria-hidden /> : null}
                        {doc.url ? "Replace" : "Upload"}
                    </Button>
                )}
                {!closed &&
                    reviewsFor(doc).map((decision) => (
                        <Button
                            key={decision}
                            type="button"
                            size="sm"
                            variant={decision === "APPROVED" ? "default" : "outline"}
                            className="h-7 px-2 text-xs"
                            disabled={busy !== null}
                            onClick={() => (decision === "APPROVED" ? void decide("APPROVED") : setReview(decision))}
                        >
                            {busy === decision ? <Loader2 className="mr-1 size-3 animate-spin" aria-hidden /> : null}
                            {REVIEW_LABEL[decision]}
                        </Button>
                    ))}
            </div>

            <FileDetailsDialog
                label={doc.label}
                url={pending}
                asksNumber={asksNumber}
                asksExpiry={asksExpiry}
                onCancel={() => setPending(null)}
                onFile={(number, expiresAt) => file(pending!, number, expiresAt)}
            />
            <ReviewNoteDialog decision={review} label={doc.label} busy={busy !== null} onCancel={() => setReview(null)} onConfirm={(note) => void decide(review!, note)} />
        </li>
    );
}

/** The number and the expiry a paper carries, asked for once the file is up. */
function FileDetailsDialog({ label, url, asksNumber, asksExpiry, onCancel, onFile }: { label: string; url: string | null; asksNumber: boolean; asksExpiry: boolean; onCancel: () => void; onFile: (number?: string, expiresAt?: string) => Promise<void> }) {
    return (
        <Dialog open={url !== null} onOpenChange={(open) => (!open ? onCancel() : undefined)}>
            <DialogContent className="sm:max-w-md">
                {/* The form mounts with the content, so every opening starts blank. */}
                {url !== null && <FileDetailsForm label={label} asksNumber={asksNumber} asksExpiry={asksExpiry} onCancel={onCancel} onFile={onFile} />}
            </DialogContent>
        </Dialog>
    );
}

function FileDetailsForm({ label, asksNumber, asksExpiry, onCancel, onFile }: { label: string; asksNumber: boolean; asksExpiry: boolean; onCancel: () => void; onFile: (number?: string, expiresAt?: string) => Promise<void> }) {
    const [number, setNumber] = React.useState("");
    const [expiresAt, setExpiresAt] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const ready = (!asksNumber || number.trim().length >= 4) && (!asksExpiry || /^\d{4}-\d{2}-\d{2}$/.test(expiresAt));
    return (
        <>
                <DialogHeader>
                    <DialogTitle>{label}</DialogTitle>
                    <DialogDescription>The file is up. Type what is printed on it so the record can be checked against the paper.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                    {asksNumber && (
                        <div className="grid gap-1.5">
                            <Label htmlFor="paper-number">Number on the paper</Label>
                            <Input id="paper-number" value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} autoComplete="off" placeholder="As printed" />
                        </div>
                    )}
                    {asksExpiry && (
                        <div className="grid gap-1.5">
                            <Label htmlFor="paper-expiry">Valid until</Label>
                            <Input id="paper-expiry" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" className="bg-card" onClick={onCancel} disabled={busy}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={!ready || busy}
                        onClick={() => {
                            setBusy(true);
                            void onFile(asksNumber ? number.trim() : undefined, asksExpiry ? expiresAt : undefined).finally(() => setBusy(false));
                        }}
                    >
                        {busy ? "Filing…" : "File it"}
                    </Button>
                </DialogFooter>
        </>
    );
}

/** A flag or a re-upload request needs a note — the applicant reads it in the app. */
function ReviewNoteDialog({ decision, label, busy, onCancel, onConfirm }: { decision: AgentDocumentDecision | null; label: string; busy: boolean; onCancel: () => void; onConfirm: (note: string) => void }) {
    return (
        <Dialog open={decision !== null} onOpenChange={(open) => (!open ? onCancel() : undefined)}>
            <DialogContent className="sm:max-w-md">
                {decision !== null && <ReviewNoteForm decision={decision} label={label} busy={busy} onCancel={onCancel} onConfirm={onConfirm} />}
            </DialogContent>
        </Dialog>
    );
}

function ReviewNoteForm({ decision, label, busy, onCancel, onConfirm }: { decision: AgentDocumentDecision; label: string; busy: boolean; onCancel: () => void; onConfirm: (note: string) => void }) {
    const [note, setNote] = React.useState("");
    const asking = decision === "REUPLOAD_REQUESTED";
    return (
        <>
                <DialogHeader>
                    <DialogTitle>{asking ? `Ask for ${label} again` : `Flag ${label}`}</DialogTitle>
                    <DialogDescription>
                        {asking ? "The applicant sees this under the paper and uploads a fresh one." : "The application cannot be submitted or activated while a paper is flagged. The applicant reads the note."}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-1.5">
                    <Label htmlFor="review-note">What is wrong</Label>
                    <Textarea id="review-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={asking ? "The photo is blurred; the number is not readable." : "The name does not match the PAN."} />
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" className="bg-card" onClick={onCancel} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="button" variant={asking ? "default" : "destructive"} disabled={note.trim().length < 3 || busy} onClick={() => onConfirm(note.trim())}>
                        {busy ? "Saving…" : asking ? "Ask again" : "Flag it"}
                    </Button>
                </DialogFooter>
        </>
    );
}
