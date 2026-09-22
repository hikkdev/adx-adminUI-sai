"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Download, RefreshCw, Search, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { FilterChips } from "@/components/adx/filter-chips";
import { openPrivateFile, privateFileUrl } from "@/components/adx/private-file";
import { SectionCard } from "@/components/adx/section-card";
import { SimpleTable, type SimpleColumn } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate } from "@/lib/format";
import {
    KIND_META,
    SIGNABLE_KINDS_FOR,
    SIGNING_PARTIES,
    SIGNING_PARTY_LABEL,
    SIGNING_STATUS_META,
    agreementService,
    signingOpen,
    signingPartyHref,
    type AgreementKind,
    type SigningParty,
    type SigningRequest,
    type SigningStatus,
} from "@/services/agreements";

export type StatusFilter = "OPEN" | SigningStatus | "ALL";

interface SignaturesViewProps {
    rows: SigningRequest[];
    status: StatusFilter;
    onStatus: (value: StatusFilter) => void;
    party: SigningParty | "ALL";
    onParty: (value: SigningParty | "ALL") => void;
    q: string;
    onQuery: (value: string) => void;
    /** The URL named one party: the list is theirs. */
    scoped: { partyType: SigningParty; partyId: string } | null;
    onChanged: () => void;
}

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
    { value: "OPEN", label: "Awaiting" },
    { value: "COMPLETED", label: "Signed" },
    { value: "EXPIRED", label: "Expired" },
    { value: "CANCELLED", label: "Voided" },
    { value: "FAILED", label: "Declined" },
    { value: "ALL", label: "All" },
];

/** The signer's word on each party, in one line: "Rahul Menon · signed 22 Sep · ADX · awaiting". */
function signersLine(request: SigningRequest): string {
    return request.signers
        .map((signer) => `${signer.role === "ADX" ? "ADX" : signer.name} · ${signer.status === "signed" ? `signed ${signer.signedAt ? formatDate(signer.signedAt) : ""}`.trim() : signer.status}`)
        .join(" — ");
}

/**
 * DS-1: the Signatures desk. Each row is one e-signature request: the
 * document and its version, who signs, where it stands, when it runs out,
 * and the acts — refresh (ask Digio now), remind, void, and the three files
 * through the private-file viewer. "Send for signature" opens a request by
 * hand for any party, whatever the policy would ask.
 */
export function SignaturesView({ rows, status, onStatus, party, onParty, q, onQuery, scoped, onChanged }: SignaturesViewProps) {
    const [draft, setDraft] = React.useState(q);
    const [busyId, setBusyId] = React.useState<string | null>(null);
    const [voiding, setVoiding] = React.useState<SigningRequest | null>(null);
    const [voidReason, setVoidReason] = React.useState("");
    const [sending, setSending] = React.useState(false);

    async function act(request: SigningRequest, what: "refresh" | "remind" | "mock") {
        setBusyId(request.id);
        try {
            if (what === "refresh") {
                const next = await agreementService.refreshSigning(request.id);
                toast.success(next.status === request.status ? "Nothing new from Digio" : `Now ${SIGNING_STATUS_META[next.status].label.toLowerCase()}`);
            } else if (what === "remind") {
                await agreementService.remindSigning(request.id);
                toast.success("Reminder sent", { description: `${request.signer.name} has the link again by email, SMS and push.` });
            } else {
                await agreementService.mockSign(request.id);
                toast.success("Signed (mock)", { description: "The development rail signed it; the files and the acceptance are recorded as if Digio had." });
            }
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not update the request.");
        } finally {
            setBusyId(null);
        }
    }

    async function confirmVoid() {
        if (!voiding) return;
        setBusyId(voiding.id);
        try {
            await agreementService.voidSigning(voiding.id, voidReason.trim());
            toast.success("Request voided", { description: "The link is dead at Digio; send a fresh one when the document is right." });
            setVoiding(null);
            setVoidReason("");
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not void the request.");
        } finally {
            setBusyId(null);
        }
    }

    const file = (id: string | null, label: string) =>
        id ? (
            <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                onClick={() => {
                    void openPrivateFile(privateFileUrl(id)).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not open the file."));
                }}
            >
                <Download className="size-3" /> {label}
            </button>
        ) : null;

    const columns: SimpleColumn<SigningRequest>[] = [
        {
            key: "document",
            label: "Document",
            render: (row) => (
                <div>
                    <div className="font-medium">{row.title}</div>
                    <div className="text-xs text-muted-foreground">
                        {KIND_META[row.kind]?.label ?? row.kind} · v{row.templateVersion}
                        {row.mock ? " · mock rail" : ""}
                        {row.countersign ? " · ADX countersigns" : ""}
                        {row.stamp ? ` · e-stamp ${row.stamp.state} ₹${row.stamp.amount}` : ""}
                    </div>
                </div>
            ),
        },
        {
            key: "party",
            label: "Signer",
            render: (row) => {
                const href = signingPartyHref(row);
                return (
                    <div>
                        <div className="font-medium">
                            {href ? (
                                <Link href={href} className="hover:underline">
                                    {row.signer.name}
                                </Link>
                            ) : (
                                row.signer.name
                            )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {SIGNING_PARTY_LABEL[row.partyType]} · {row.signer.identifier} · {row.signMethod.toLowerCase()}
                        </div>
                    </div>
                );
            },
        },
        {
            key: "status",
            label: "Status",
            render: (row) => (
                <div className="space-y-1">
                    <StatusBadge status={SIGNING_STATUS_META[row.status]} />
                    <div className="text-xs text-muted-foreground">{signersLine(row)}</div>
                    {row.cancelReason ? <div className="text-xs text-muted-foreground">Voided: {row.cancelReason}</div> : null}
                </div>
            ),
        },
        {
            key: "when",
            label: "Requested · expires",
            className: "whitespace-nowrap",
            render: (row) => (
                <div className="text-xs tabular-nums">
                    <div>{formatDate(row.requestedAt)}</div>
                    <div className="text-muted-foreground">{row.completedAt ? `signed ${formatDate(row.completedAt)}` : `until ${formatDate(row.expiresAt)}`}</div>
                    {row.lastReminderAt ? <div className="text-muted-foreground">reminded {formatDate(row.lastReminderAt)}</div> : null}
                </div>
            ),
        },
        {
            key: "files",
            label: "Files",
            render: (row) => (
                <div className="flex flex-col gap-0.5">
                    {file(row.files.document, "Document")}
                    {file(row.files.signed, "Signed copy")}
                    {file(row.files.certificate, "Audit certificate")}
                </div>
            ),
        },
        {
            key: "actions",
            label: "",
            className: "text-right",
            render: (row) => (
                <div className="flex justify-end gap-1">
                    {signingOpen(row) && (
                        <>
                            <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => void act(row, "refresh")} title="Ask Digio now">
                                <RefreshCw className="size-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => void act(row, "remind")}>
                                Remind
                            </Button>
                            {row.mock && (
                                <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => void act(row, "mock")}>
                                    Sign (mock)
                                </Button>
                            )}
                            <Button size="sm" variant="ghost" className="text-danger hover:text-danger" disabled={busyId === row.id} onClick={() => setVoiding(row)}>
                                Void
                            </Button>
                        </>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-4">
            <SectionCard
                title="Signatures"
                description="Every document sent for e-signature through Digio — who signs, where it stands, the signed copy and the audit certificate. The policy behind what is sent is Settings › E-signing."
                actions={
                    <Button size="sm" onClick={() => setSending(true)}>
                        <Send className="mr-1.5 size-3.5" /> Send for signature
                    </Button>
                }
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <FilterChips<StatusFilter> chips={STATUS_CHIPS} value={status} onChange={onStatus} />
                    <div className="flex items-center gap-2">
                        <Select value={party} onValueChange={(value) => onParty(value as SigningParty | "ALL")}>
                            <SelectTrigger className="h-9 w-[170px]" aria-label="Who signs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Every party</SelectItem>
                                {SIGNING_PARTIES.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {SIGNING_PARTY_LABEL[value]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <form
                            className="relative"
                            onSubmit={(event) => {
                                event.preventDefault();
                                onQuery(draft);
                            }}
                        >
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Name, email or mobile" className="h-9 w-56 pl-8" aria-label="Search signers" />
                            {q ? (
                                <button
                                    type="button"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                                    aria-label="Clear search"
                                    onClick={() => {
                                        setDraft("");
                                        onQuery("");
                                    }}
                                >
                                    <X className="size-3.5" />
                                </button>
                            ) : null}
                        </form>
                    </div>
                </div>
                {scoped ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                        Showing one {SIGNING_PARTY_LABEL[scoped.partyType].toLowerCase()}’s requests.{" "}
                        <Link href="/agreements/signatures" className="text-primary hover:underline">
                            Show everyone
                        </Link>
                    </p>
                ) : null}
            </SectionCard>

            <SimpleTable columns={columns} rows={rows} rowKey={(row) => row.id} emptyMessage={status === "OPEN" ? "Nothing is waiting for a signature." : "No requests match."} />

            <ConfirmDialog
                open={voiding !== null}
                onOpenChange={(open) => {
                    if (!open) setVoiding(null);
                }}
                title="Void this request?"
                description={voiding ? `${voiding.signer.name} will not be able to sign the ${voiding.title.toLowerCase()} from this link. Send a fresh one when the document is right.` : ""}
                confirmLabel="Void"
                destructive
                busy={busyId !== null}
                disabled={voidReason.trim().length < 3}
                onConfirm={() => void confirmVoid()}
            >
                <div className="space-y-1.5">
                    <Label htmlFor="void-reason">Why</Label>
                    <Textarea id="void-reason" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} rows={2} placeholder="Wrong grade on the letter; re-sending after the fix" />
                </div>
            </ConfirmDialog>

            <SendDialog open={sending} onOpenChange={setSending} onSent={onChanged} />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Send for signature                                                  */
/* ------------------------------------------------------------------ */

function SendDialog({ open, onOpenChange, onSent }: { open: boolean; onOpenChange: (open: boolean) => void; onSent: () => void }) {
    const [party, setPartyState] = React.useState<SigningParty>("PRINT_PARTNER");
    const [kind, setKind] = React.useState<AgreementKind>("PRINT_PARTNER_SERVICE");
    const [partyId, setPartyId] = React.useState("");
    const [campaignId, setCampaignId] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const kinds = SIGNABLE_KINDS_FOR[party];
    // A party change moves the document to the first that party signs, in the same event.
    const setParty = (next: SigningParty) => {
        setPartyState(next);
        setKind(SIGNABLE_KINDS_FOR[next][0]!);
    };

    async function send() {
        setBusy(true);
        try {
            const result = await agreementService.openSigning({ kind, partyType: party, partyId: partyId.trim(), ...(kind === "INSERTION_ORDER" ? { campaignId: campaignId.trim() } : {}) });
            toast.success(result.created ? "Sent for signature" : "A request is already open", {
                description: result.created ? `${result.signer.name} has the link by ${result.signer.identifier}.` : `${result.signer.name}'s request from ${formatDate(result.requestedAt)} stands.`,
            });
            onOpenChange(false);
            setPartyId("");
            setCampaignId("");
            onSent();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not send the document.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Send a document for signature</DialogTitle>
                    <DialogDescription>
                        Opens a Digio request for one party by hand — whatever Settings › E-signing would ask. The live version of the document is rendered with the party’s details and the link goes to them by email or SMS.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Who signs</Label>
                            <Select value={party} onValueChange={(value) => setParty(value as SigningParty)}>
                                <SelectTrigger aria-label="Who signs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SIGNING_PARTIES.map((value) => (
                                        <SelectItem key={value} value={value}>
                                            {SIGNING_PARTY_LABEL[value]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Document</Label>
                            <Select value={kind} onValueChange={(value) => setKind(value as AgreementKind)}>
                                <SelectTrigger aria-label="Document">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {kinds.map((value) => (
                                        <SelectItem key={value} value={value}>
                                            {KIND_META[value].label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="send-party-id">{SIGNING_PARTY_LABEL[party]} record id</Label>
                        <Input id="send-party-id" value={partyId} onChange={(event) => setPartyId(event.target.value)} placeholder="The row’s id, from its page" />
                    </div>
                    {kind === "INSERTION_ORDER" ? (
                        <div className="space-y-1.5">
                            <Label htmlFor="send-campaign-id">Campaign id</Label>
                            <Input id="send-campaign-id" value={campaignId} onChange={(event) => setCampaignId(event.target.value)} placeholder="The campaign the order is for" />
                        </div>
                    ) : null}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => void send()} disabled={busy || !partyId.trim() || (kind === "INSERTION_ORDER" && !campaignId.trim())}>
                        {busy ? "Sending…" : "Send"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
