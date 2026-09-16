"use client";

import * as React from "react";
import { ClipboardList, Loader2, UserCheck, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import { isAlreadyVerified, personLabel, type KycDeskBody } from "@/services/kyc";
import { uploadService, type UploadPurpose } from "@/services/uploads";
import { userKycService } from "@/services/user-kyc";
import type { KycLiveness } from "@/types";
import { DocumentSlot } from "../agents/[agentId]/document-slot";

export const GOV_ID_TYPES = [
    { value: "AADHAAR", label: "Aadhaar" },
    { value: "PASSPORT", label: "Passport" },
    { value: "DRIVING_LICENCE", label: "Driving licence" },
] as const;

export const ADDRESS_PROOF_TYPES = [
    { value: "UTILITY_BILL", label: "Utility bill" },
    { value: "RENT_AGREEMENT", label: "Rent agreement" },
    { value: "BANK_STATEMENT", label: "Bank statement" },
] as const;

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export interface DeskTile {
    field: string;
    label: string;
}

/** The typed facts a party's record takes beside its tiles. */
export interface DeskFacts {
    panNumber?: boolean;
    govIdType?: boolean;
    addressProofType?: boolean;
}

export interface DeskFormState {
    documents: Record<string, string | undefined>;
    panNumber: string;
    govIdType: string;
    addressProofType: string;
}

/**
 * The body `PUT …` takes: every tile that holds a URL, and each typed fact
 * that is filled — nothing else, so the columns not sent keep what they
 * hold (a NEEDS_INFO resubmission of just the flagged tiles). Pure, so the
 * test can pin it. Throws on a PAN that is not one.
 */
export function deskBody(form: DeskFormState, facts: DeskFacts): KycDeskBody {
    const body: KycDeskBody = {};
    for (const [field, url] of Object.entries(form.documents)) if (url) body[field] = url;
    if (facts.panNumber && form.panNumber.trim()) {
        const pan = form.panNumber.trim().toUpperCase();
        if (!PAN_PATTERN.test(pan)) throw new Error("The PAN must be five letters, four digits and a letter — ABCDE1234F.");
        body.panNumber = pan;
    }
    if (facts.govIdType && form.govIdType) body.govIdType = form.govIdType;
    if (facts.addressProofType && form.addressProofType) body.addressProofType = form.addressProofType;
    return body;
}

/** Whether the form has anything to record at all — the server refuses an empty body. */
export const deskBodyEmpty = (body: KycDeskBody): boolean => Object.keys(body).length === 0;

interface RecordAtDeskDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Who is recorded — for the copy. */
    party: string;
    /** The party's own user id — the files are uploaded as theirs, and presence is attested against it. Null when they have never signed in. */
    userId: string | null;
    /** The private purpose the tiles go up under: KYC, ADVERTISER_KYC or PRINT_PARTNER_KYC. */
    purpose: UploadPurpose;
    tiles: DeskTile[];
    facts: DeskFacts;
    /** What the record already holds, so a resubmission starts from it. */
    initial?: Partial<DeskFormState>;
    /** The liveness state as the case read carries it, so the presence section says what is already in. */
    liveness?: KycLiveness | null;
    /** A NEEDS_INFO record — the desk sends only the flagged tiles, and one at least. */
    needsInfo?: boolean;
    /** `PUT …` for this party; answers where the workbench for the new case is. */
    onSubmit: (body: KycDeskBody) => Promise<{ caseHref: string }>;
    /** Opens the workbench on the new case. */
    onRecorded: (caseHref: string) => void;
}

/**
 * "Record KYC at the desk" — Lot N.
 *
 * The party is in front of the admin with their papers. Each tile is a
 * file that goes up the moment it is picked, under the party's KYC purpose
 * and in the party's name (`ownerUserId`), so the server lets the desk hand
 * it in as theirs. The typed facts sit beside the tiles. Then presence:
 * decision 131 wants proof the person behind the documents is real, and at
 * the desk that is either the admin's attestation (how the person was met,
 * kept on the row and in the audit) or the short video the desk recorded,
 * uploaded under USER_KYC and handed in by its file id. Submit is the
 * party's `PUT …` — `recordedVia DESK` — and the workbench opens on the
 * new case.
 */
export function RecordAtDeskDialog({
    open,
    onOpenChange,
    party,
    userId,
    purpose,
    tiles,
    facts,
    initial,
    liveness = null,
    needsInfo = false,
    onSubmit,
    onRecorded,
}: RecordAtDeskDialogProps) {
    const [form, setForm] = React.useState<DeskFormState>({
        documents: initial?.documents ?? {},
        panNumber: initial?.panNumber ?? "",
        govIdType: initial?.govIdType ?? "",
        addressProofType: initial?.addressProofType ?? "",
    });
    const [saving, setSaving] = React.useState(false);
    const [presence, setPresence] = React.useState<PresenceState>(presenceOf(liveness));
    const [attestNote, setAttestNote] = React.useState("");
    const [attesting, setAttesting] = React.useState(false);
    const [uploadingVideo, setUploadingVideo] = React.useState(false);
    const videoRef = React.useRef<HTMLInputElement>(null);

    const setDocument = (field: string, url: string | undefined) => setForm((current) => ({ ...current, documents: { ...current.documents, [field]: url } }));

    const attest = async () => {
        if (!userId) return;
        setAttesting(true);
        try {
            const result = await userKycService.attestPresence(userId, attestNote);
            setPresence({ kind: "attested", note: attestNote.trim(), at: result.kyc.attestedAt ?? new Date().toISOString(), by: null });
            toast.success(`${party}'s presence attested`, { description: "Kept on the record with your name; a manual-path verification may now go through." });
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The attestation did not reach ADX.");
        } finally {
            setAttesting(false);
        }
    };

    const uploadVideo = async (file: File) => {
        if (!userId) return;
        setUploadingVideo(true);
        try {
            const uploaded = await uploadService.upload(file, "USER_KYC", { ownerUserId: userId });
            await userKycService.recordLivenessAtDesk(userId, uploaded.id);
            setPresence({ kind: "video", at: new Date().toISOString() });
            toast.success("Liveness video recorded", { description: `${file.name} is on ${party}'s record as recorded at the desk.` });
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The video did not upload.");
        } finally {
            setUploadingVideo(false);
            if (videoRef.current) videoRef.current.value = "";
        }
    };

    const submit = async () => {
        let body: KycDeskBody;
        try {
            body = deskBody(form, facts);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Check the form.");
            return;
        }
        if (deskBodyEmpty(body)) {
            toast.error("Nothing to record", { description: "Upload at least one document or type a fact." });
            return;
        }
        if (needsInfo && !Object.keys(body).some((key) => key in form.documents && form.documents[key])) {
            toast.error("Attach at least one of the flagged documents", { description: "A NEEDS_INFO record takes documents, not just facts." });
            return;
        }
        /* Decision 131: a party with an account is recorded with their presence proved — the attestation or the video — so the case can be verified when it lands. */
        if (userId && !presenceProved(presence)) {
            toast.error("Prove presence first", { description: "Attest that you met the person, or upload the liveness video — a manual-path record cannot be verified without one." });
            return;
        }
        setSaving(true);
        try {
            const { caseHref } = await onSubmit(body);
            toast.success(`${party}'s KYC recorded at the desk`, { description: "The case is in the queue as PENDING with your name as the recorder." });
            onOpenChange(false);
            onRecorded(caseHref);
        } catch (cause) {
            if (isAlreadyVerified(cause)) {
                toast.error(`${party} is already verified`, { description: "Nothing is recorded over a verified record." });
            } else {
                toast.error(cause instanceof Error ? cause.message : "The record did not reach ADX.");
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Record {party}&apos;s KYC at the desk</DialogTitle>
                    <DialogDescription>
                        Each file goes up as {party}&apos;s the moment it is picked. Submit puts the case in the queue as PENDING, recorded by you.
                        {needsInfo ? " The record is waiting on a re-upload: send the flagged tiles, and only what changed." : ""}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                    <section>
                        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <ClipboardList className="size-3.5" aria-hidden />
                            Documents
                        </h3>
                        <div className="mt-1 divide-y rounded-md border px-3">
                            {tiles.map((tile) => (
                                <DocumentSlot
                                    key={tile.field}
                                    label={tile.label}
                                    url={form.documents[tile.field]}
                                    onChange={(url) => setDocument(tile.field, url)}
                                    disabled={saving}
                                    purpose={purpose}
                                    ownerUserId={userId}
                                />
                            ))}
                        </div>
                    </section>

                    {(facts.panNumber || facts.govIdType || facts.addressProofType) && (
                        <section className="grid gap-4 sm:grid-cols-3">
                            {facts.panNumber && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="desk-pan">PAN</Label>
                                    <Input
                                        id="desk-pan"
                                        value={form.panNumber}
                                        onChange={(event) => setForm((current) => ({ ...current, panNumber: event.target.value.toUpperCase() }))}
                                        placeholder="ABCDE1234F"
                                        maxLength={10}
                                        className="font-mono uppercase"
                                        disabled={saving}
                                    />
                                </div>
                            )}
                            {facts.govIdType && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="desk-gov-id-type">Government ID</Label>
                                    <Select value={form.govIdType} onValueChange={(value) => setForm((current) => ({ ...current, govIdType: value }))} disabled={saving}>
                                        <SelectTrigger id="desk-gov-id-type">
                                            <SelectValue placeholder="Which ID" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {GOV_ID_TYPES.map((type) => (
                                                <SelectItem key={type.value} value={type.value}>
                                                    {type.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                            {facts.addressProofType && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="desk-address-proof-type">Address proof</Label>
                                    <Select
                                        value={form.addressProofType}
                                        onValueChange={(value) => setForm((current) => ({ ...current, addressProofType: value }))}
                                        disabled={saving}
                                    >
                                        <SelectTrigger id="desk-address-proof-type">
                                            <SelectValue placeholder="Which proof" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {ADDRESS_PROOF_TYPES.map((type) => (
                                                <SelectItem key={type.value} value={type.value}>
                                                    {type.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </section>
                    )}

                    <section className="rounded-md border p-4" data-testid="presence-section">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Presence</h3>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    A manual-path record cannot be verified until the person behind it is proved real. At the desk that is your word, or a short video.
                                </p>
                            </div>
                            <StatusBadge status={presenceMeta(presence)} />
                        </div>

                        {presence.kind === "attested" && (
                            <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-xs text-foreground" data-testid="presence-attested">
                                Attested {formatDateTime(presence.at)}
                                {presence.by ? ` by ${presence.by}` : ""}: “{presence.note}”
                            </p>
                        )}
                        {presence.kind === "video" && (
                            <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-xs text-foreground">Liveness video on the record, recorded {formatDateTime(presence.at)}.</p>
                        )}

                        {!userId ? (
                            <p className="mt-3 text-xs text-muted-foreground">
                                {party} has not signed in yet, so there is no account to attest against. The documents can still be recorded; presence follows once they sign in.
                            </p>
                        ) : (
                            <div className="mt-3 grid gap-4 md:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="desk-attest-note">Attest presence</Label>
                                    <Textarea
                                        id="desk-attest-note"
                                        value={attestNote}
                                        onChange={(event) => setAttestNote(event.target.value)}
                                        rows={2}
                                        maxLength={500}
                                        placeholder="How the person was met — “in person at the Pune desk, 14 Sep”, “video call, Aadhaar shown to camera”."
                                        disabled={attesting || saving}
                                    />
                                    <Button type="button" variant="outline" size="sm" className="h-8" disabled={attesting || saving || attestNote.trim().length < 3} onClick={() => void attest()}>
                                        <UserCheck className="mr-1.5 size-3.5" aria-hidden />
                                        {attesting ? "Attesting…" : presence.kind === "attested" ? "Attest again" : "Attest presence"}
                                    </Button>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="desk-liveness-video">Or the liveness video recorded at the desk</Label>
                                    <p className="text-xs text-muted-foreground">A short clip of the person, uploaded as theirs under USER_KYC and handed in by its file id.</p>
                                    <input
                                        ref={videoRef}
                                        id="desk-liveness-video"
                                        type="file"
                                        accept="video/*"
                                        className="sr-only"
                                        disabled={uploadingVideo || saving}
                                        onChange={(event) => {
                                            const picked = event.target.files?.[0];
                                            if (picked) void uploadVideo(picked);
                                        }}
                                    />
                                    <Button type="button" variant="outline" size="sm" className="h-8" disabled={uploadingVideo || saving} onClick={() => videoRef.current?.click()}>
                                        {uploadingVideo ? <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden /> : <Video className="mr-1.5 size-3.5" aria-hidden />}
                                        {uploadingVideo ? "Uploading…" : "Upload the video"}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </section>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={() => void submit()} disabled={saving}>
                        {saving ? "Recording…" : "Record and open the case"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export type PresenceState =
    | { kind: "none" }
    | { kind: "video"; at: string }
    | { kind: "attested"; note: string; at: string; by: string | null }
    | { kind: "rejected"; reason: string | null };

function presenceOf(liveness: KycLiveness | null): PresenceState {
    if (!liveness) return { kind: "none" };
    if (liveness.status === "REJECTED") return { kind: "rejected", reason: liveness.rejectionReason };
    if (liveness.attestedAt) return { kind: "attested", note: liveness.attestationNote ?? "", at: liveness.attestedAt, by: personLabel(liveness.attestedById ? { id: liveness.attestedById, name: null } : null) };
    if (liveness.submittedAt) return { kind: "video", at: liveness.submittedAt };
    return { kind: "none" };
}

/** Whether the row carries presence proof the liveness gate accepts — the attestation or a video not rejected. */
export const presenceProved = (presence: PresenceState): boolean => presence.kind === "attested" || presence.kind === "video";

function presenceMeta(presence: PresenceState) {
    switch (presence.kind) {
        case "attested":
            return { label: "Attested at the desk", tone: "success" as const };
        case "video":
            return { label: "Video recorded", tone: "success" as const };
        case "rejected":
            return { label: "Video rejected", tone: "danger" as const };
        default:
            return { label: "Not proved yet", tone: "warning" as const };
    }
}

interface RecordAtDeskButtonProps extends Omit<RecordAtDeskDialogProps, "open" | "onOpenChange"> {
    /** A verified record is not recorded over; the button says so. */
    verified: boolean;
    disabledReason?: string | null;
    size?: "sm" | "default";
    className?: string;
    label?: string;
}

/** The button and its dialog together — on the party pages, the workbench headers and the queues' empty states. */
export function RecordAtDeskButton({ verified, disabledReason, size = "default", className, label = "Record KYC at the desk", ...dialog }: RecordAtDeskButtonProps) {
    const [open, setOpen] = React.useState(false);
    const [key, setKey] = React.useState(0);
    const reason = verified ? "Already verified — nothing is recorded over it" : (disabledReason ?? null);
    return (
        <>
            <Button
                variant="outline"
                size={size}
                className={className ?? "bg-card"}
                disabled={reason !== null}
                title={reason ?? undefined}
                onClick={() => {
                    setKey((value) => value + 1);
                    setOpen(true);
                }}
            >
                <ClipboardList className="mr-1.5 size-4" aria-hidden />
                {label}
            </Button>
            <RecordAtDeskDialog key={key} open={open} onOpenChange={setOpen} {...dialog} />
        </>
    );
}
