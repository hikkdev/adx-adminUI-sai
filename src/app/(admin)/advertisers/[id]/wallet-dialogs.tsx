"use client";

import * as React from "react";
import Link from "next/link";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FileDropzone } from "@/components/adx/file-dropzone";
import { ApiError } from "@/lib/api-client";
import { compareMoney, formatMoney } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import {
    advertiserService,
    type RefundDestination,
    type RefundReason,
    type TopUpMethod,
} from "@/services/advertisers";
import {
    describeMethod,
    financeReadsApi,
    financeService,
    type BankAccount,
    type PayoutMethod,
} from "@/services/finance";
import { REFUND_DESTINATION_LABEL, REFUND_REASON_LABEL } from "@/services/refunds";
import { uploadService } from "@/services/uploads";

/** An amount as the wire wants it: digits, optionally two decimal places. */
const AMOUNT = /^\d+(\.\d{1,2})?$/;

/** Today, as the `date` input wants it. */
const today = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/* Record bank transfer                                                */
/* ------------------------------------------------------------------ */

interface RecordTopUpDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    advertiserId: string;
    advertiserName: string;
    onRecorded: () => void;
}

/**
 * Money that arrived outside ADX — a transfer with its UTR, a cheque —
 * recorded at the desk (Lot B, Q41/Q118).
 *
 * The wallet is credited against suspense until reconciliation matches the
 * bank line, which is why the ADX account it landed in is asked for: that is
 * the statement it will be matched against. The proof is an upload with
 * purpose TOPUP_PROOF, made first so the top-up carries its file id. The same
 * UTR on the same wallet is one top-up; a second entry answers 409, and the
 * toast says so rather than reporting a credit that did not happen.
 */
export function RecordTopUpDialog({ open, onOpenChange, advertiserId, advertiserName, onRecorded }: RecordTopUpDialogProps) {
    const [amount, setAmount] = React.useState("");
    const [method, setMethod] = React.useState<TopUpMethod>("BANK_TRANSFER");
    const [utr, setUtr] = React.useState("");
    const [receivedAt, setReceivedAt] = React.useState(today());
    const [bankAccountId, setBankAccountId] = React.useState("");
    const [proof, setProof] = React.useState<File | null>(null);
    const [note, setNote] = React.useState("");
    const [saving, setSaving] = React.useState(false);

    const live = financeReadsApi();
    const accounts = useApiResource<BankAccount[]>(`advertisers:top-up:bank-accounts:${live}:${open}`, () =>
        open && live ? financeService.bankAccounts().catch(() => [] as BankAccount[]) : Promise.resolve([])
    );
    const activeAccounts = (accounts.data ?? []).filter((account) => account.isActive);

    const utrRequired = method === "BANK_TRANSFER";
    const complete =
        AMOUNT.test(amount.trim()) &&
        compareMoney(amount.trim(), "0") > 0 &&
        receivedAt !== "" &&
        (!utrRequired || utr.trim().length >= 4) &&
        (utr.trim() === "" || utr.trim().length >= 4);

    function reset() {
        setAmount("");
        setMethod("BANK_TRANSFER");
        setUtr("");
        setReceivedAt(today());
        setBankAccountId("");
        setProof(null);
        setNote("");
    }

    async function save() {
        setSaving(true);
        try {
            const proofFileId = proof ? (await uploadService.upload(proof, "TOPUP_PROOF")).id : undefined;
            const outcome = await advertiserService.topUp(advertiserId, {
                amount: amount.trim(),
                method,
                ...(utr.trim() ? { utr: utr.trim() } : {}),
                receivedAt: new Date(receivedAt).toISOString(),
                ...(bankAccountId ? { bankAccountId } : {}),
                ...(proofFileId ? { proofFileId } : {}),
                ...(note.trim() ? { note: note.trim() } : {}),
            });
            if (outcome.created) {
                toast.success(`${formatMoney(outcome.topUp.amount)} credited`, {
                    description: `${advertiserName}'s wallet now holds ${formatMoney(outcome.wallet.spendable)} spendable. Against suspense until the bank line is matched.`,
                });
            } else {
                toast.info("Already recorded", {
                    description: "This transfer had been recorded before. Nothing was credited twice.",
                });
            }
            reset();
            onOpenChange(false);
            onRecorded();
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 409) {
                toast.error("Already recorded", { description: cause.message });
            } else {
                toast.error(cause instanceof Error ? cause.message : "The top-up did not reach ADX.");
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Record a bank transfer</DialogTitle>
                    <DialogDescription>
                        Money {advertiserName} sent outside ADX. The wallet is credited now and the
                        entry waits in suspense until reconciliation matches the bank line.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <RadioGroup
                        value={method}
                        onValueChange={(value) => setMethod(value as TopUpMethod)}
                        className="flex gap-4"
                    >
                        <label className="flex items-center gap-2 text-sm">
                            <RadioGroupItem value="BANK_TRANSFER" id="topup-bank" />
                            Bank transfer
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <RadioGroupItem value="CHEQUE" id="topup-cheque" />
                            Cheque
                        </label>
                    </RadioGroup>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="topup-amount">Amount</Label>
                            <Input
                                id="topup-amount"
                                inputMode="decimal"
                                value={amount}
                                onChange={(event) => setAmount(event.target.value)}
                                placeholder="25000.00"
                                className="tabular-nums"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="topup-received">Received on</Label>
                            <Input
                                id="topup-received"
                                type="date"
                                value={receivedAt}
                                max={today()}
                                onChange={(event) => setReceivedAt(event.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor="topup-utr">{method === "CHEQUE" ? "Cheque number" : "UTR"}</Label>
                            <Input
                                id="topup-utr"
                                value={utr}
                                onChange={(event) => setUtr(event.target.value)}
                                placeholder={method === "CHEQUE" ? "Optional — the day and amount identify a cheque without one" : "Required — the bank's reference for the transfer"}
                                className="font-mono"
                                maxLength={64}
                            />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor="topup-account">ADX account it landed in</Label>
                            <Select value={bankAccountId || "__none__"} onValueChange={(value) => setBankAccountId(value === "__none__" ? "" : value)}>
                                <SelectTrigger id="topup-account">
                                    <SelectValue placeholder="Not named" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">Not named</SelectItem>
                                    {activeAccounts.map((account) => (
                                        <SelectItem key={account.id} value={account.id}>
                                            {account.label} · {account.bankName} {account.accountNumberMasked ?? ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {!accounts.loading && activeAccounts.length === 0 && (
                                <p className="text-xs text-muted-foreground">
                                    No ADX bank account is on file; one is recorded under{" "}
                                    <Link href="/finance/settings" className="underline underline-offset-4">
                                        finance settings
                                    </Link>
                                    .
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Proof</Label>
                        <FileDropzone
                            accept={[".png", ".jpg", ".jpeg", ".pdf"]}
                            file={proof}
                            onFile={setProof}
                            disabled={saving}
                            hint="The bank slip, the cheque image, or the advertiser's screenshot. Optional."
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="topup-note">Note</Label>
                        <Textarea
                            id="topup-note"
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            rows={2}
                            maxLength={400}
                            placeholder="Goes on the statement line. Optional."
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={() => void save()} disabled={saving || !complete}>
                        {saving ? "Recording…" : "Record top-up"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/* Raise refund                                                        */
/* ------------------------------------------------------------------ */

interface RaiseRefundDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    advertiserId: string;
    advertiserName: string;
    /** The advertiser's account, for its VERIFIED payout methods. Null on a profile with no user. */
    userId: string | null;
    onRaised: () => void;
}

const REASONS: RefundReason[] = ["NO_SUITABLE_ALTERNATIVE", "PUBLISHER_WITHDREW", "ADVERTISER_LEAVING", "OTHER"];
const DESTINATIONS: RefundDestination[] = ["WALLET_CREDIT", "BANK_TRANSFER", "ORIGINAL_METHOD"];

/**
 * Support asking for money back on the advertiser's behalf.
 *
 * The amount is frozen the moment the request is recorded and decided at the
 * refund desk. WALLET_CREDIT is preselected because it needs nothing more;
 * cash out needs the advertiser's recorded consent — the consumer-protection
 * line: ADX may prefer credit, but may not impose it — and a bank transfer
 * needs one of their VERIFIED payout methods to send to.
 */
export function RaiseRefundDialog({ open, onOpenChange, advertiserId, advertiserName, userId, onRaised }: RaiseRefundDialogProps) {
    const [amount, setAmount] = React.useState("");
    const [reason, setReason] = React.useState<RefundReason>("NO_SUITABLE_ALTERNATIVE");
    const [note, setNote] = React.useState("");
    const [destination, setDestination] = React.useState<RefundDestination>("WALLET_CREDIT");
    const [consentNote, setConsentNote] = React.useState("");
    const [payoutMethodId, setPayoutMethodId] = React.useState("");
    const [ticketId, setTicketId] = React.useState("");
    const [saving, setSaving] = React.useState(false);

    const refundable = useApiResource<string>(`advertisers:refundable:${advertiserId}:${open}`, () =>
        open ? advertiserService.refundable(advertiserId) : Promise.resolve("0.00")
    );
    const live = financeReadsApi();
    const methods = useApiResource<PayoutMethod[]>(`advertisers:payout-methods:${userId}:${live}:${open}`, () =>
        open && live && userId ? financeService.payoutMethodsFor(userId).catch(() => [] as PayoutMethod[]) : Promise.resolve([])
    );
    const verified = (methods.data ?? []).filter((method) => method.status === "VERIFIED");

    const cash = destination !== "WALLET_CREDIT";
    const complete =
        AMOUNT.test(amount.trim()) &&
        compareMoney(amount.trim(), "0") > 0 &&
        note.trim().length >= 5 &&
        (!cash || consentNote.trim().length >= 5) &&
        (destination !== "BANK_TRANSFER" || payoutMethodId !== "");

    function reset() {
        setAmount("");
        setReason("NO_SUITABLE_ALTERNATIVE");
        setNote("");
        setDestination("WALLET_CREDIT");
        setConsentNote("");
        setPayoutMethodId("");
        setTicketId("");
    }

    async function save() {
        setSaving(true);
        try {
            await advertiserService.requestRefund(advertiserId, {
                amount: amount.trim(),
                reason,
                note: note.trim(),
                destination,
                ...(cash ? { consentNote: consentNote.trim() } : {}),
                ...(destination === "BANK_TRANSFER" ? { payoutMethodId } : {}),
                ...(ticketId.trim() ? { ticketId: ticketId.trim() } : {}),
            });
            toast.success(`${formatMoney(amount.trim())} frozen for refund`, {
                description: "It waits at the refund desk for a decision by somebody other than you.",
            });
            reset();
            onOpenChange(false);
            onRaised();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The request did not reach ADX.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Raise a refund</DialogTitle>
                    <DialogDescription>
                        On {advertiserName}&apos;s behalf. The amount is frozen now and decided at the{" "}
                        <Link href="/finance/refunds" className="underline underline-offset-4">
                            refund desk
                        </Link>
                        .
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="refund-amount">Amount</Label>
                            <Input
                                id="refund-amount"
                                inputMode="decimal"
                                value={amount}
                                onChange={(event) => setAmount(event.target.value)}
                                placeholder="0.00"
                                className="tabular-nums"
                            />
                            <p className="text-xs text-muted-foreground">
                                {refundable.data !== null
                                    ? `Refundable today: ${formatMoney(refundable.data)} — settled balance less holds, never goodwill.`
                                    : "Working out what is refundable…"}
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="refund-reason">Reason</Label>
                            <Select value={reason} onValueChange={(value) => setReason(value as RefundReason)}>
                                <SelectTrigger id="refund-reason">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {REASONS.map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {REFUND_REASON_LABEL[option]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="refund-note">Why, in your words</Label>
                        <Textarea
                            id="refund-note"
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            rows={2}
                            maxLength={1000}
                            placeholder="Required. A refund with no stated reason is not reviewable six months later."
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="refund-destination">Where the money goes</Label>
                        <Select value={destination} onValueChange={(value) => setDestination(value as RefundDestination)}>
                            <SelectTrigger id="refund-destination">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {DESTINATIONS.map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {REFUND_DESTINATION_LABEL[option]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            {destination === "WALLET_CREDIT"
                                ? "Credit stays in the wallet and is spendable on ADX once approved."
                                : destination === "BANK_TRANSFER"
                                  ? "Cash leaves ADX to a verified account of the advertiser's, once finance makes the transfer."
                                  : "A return to the card or UPI it came from needs the payment gateway, which is not configured yet — the API will refuse this."}
                        </p>
                    </div>

                    {cash && (
                        <div className="space-y-1.5">
                            <Label htmlFor="refund-consent">Advertiser&apos;s consent</Label>
                            <Textarea
                                id="refund-consent"
                                value={consentNote}
                                onChange={(event) => setConsentNote(event.target.value)}
                                rows={2}
                                maxLength={1000}
                                placeholder="How and when the advertiser agreed to a cash refund — the ticket, the call, the email. Required."
                            />
                            <p className="text-xs text-muted-foreground">
                                ADX may prefer credit, but may not impose it. The consent is kept on the request.
                            </p>
                        </div>
                    )}

                    {destination === "BANK_TRANSFER" && (
                        <div className="space-y-1.5">
                            <Label htmlFor="refund-method">Pay to</Label>
                            <Select value={payoutMethodId || "__none__"} onValueChange={(value) => setPayoutMethodId(value === "__none__" ? "" : value)}>
                                <SelectTrigger id="refund-method">
                                    <SelectValue placeholder="A verified payout method" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">Choose a verified method</SelectItem>
                                    {verified.map((method) => (
                                        <SelectItem key={method.id} value={method.id}>
                                            {describeMethod(method)}
                                            {method.isDefault ? " · default" : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {!methods.loading && verified.length === 0 && (
                                <p className="text-xs text-muted-foreground">
                                    {userId
                                        ? "The advertiser has no verified payout method. One is recorded under Payout methods and verified before a transfer can be sent."
                                        : "This profile has no account to hold a payout method."}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="refund-ticket">Support ticket (optional)</Label>
                        <Input
                            id="refund-ticket"
                            value={ticketId}
                            onChange={(event) => setTicketId(event.target.value)}
                            placeholder="The ticket id it came from"
                            className="font-mono"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={() => void save()} disabled={saving || !complete}>
                        {saving ? "Raising…" : "Raise refund"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
