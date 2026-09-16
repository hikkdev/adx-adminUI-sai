"use client";

import * as React from "react";
import { Landmark, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate } from "@/lib/format";
import {
    PAYOUT_METHOD_STATUS_META,
    VERIFIED_VIA_LABEL,
    describeMethod,
    financeService,
    type NewPayoutMethodInput,
    type PayoutMethod,
} from "@/services/finance";

interface AgentPayoutsTabProps {
    /** Null when the finance API is off. */
    methods: PayoutMethod[] | null;
    userId: string;
    agentName: string;
    onChanged: () => void;
}

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * Where the agent's money goes (D5).
 *
 * Agents never add their own bank account: ops records the cancelled cheque
 * at the desk — `POST /finance/payout-methods` with the agent's user id — and
 * the row waits for verification like any other. Verifying and rejecting are
 * the same calls the finance section's queue makes; this is the same record
 * seen from the agent's side.
 */
export function AgentPayoutsTab({ methods, userId, agentName, onChanged }: AgentPayoutsTabProps) {
    const [adding, setAdding] = React.useState(false);
    const [decision, setDecision] = React.useState<{ method: PayoutMethod; action: "verify" | "reject" } | null>(null);
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    if (methods === null) {
        return (
            <Card className="rounded-lg border-border p-5 shadow-none">
                <p className="text-sm text-muted-foreground">
                    Payout methods are read from the finance API, and the console is not connected to it.
                    Turn the API on to record where this agent is paid.
                </p>
            </Card>
        );
    }

    const decide = async () => {
        if (!decision) return;
        if (decision.action === "reject" && reason.trim().length === 0) {
            toast.error("Say why — the agent reads the reason.");
            return;
        }
        setBusy(true);
        try {
            if (decision.action === "verify") {
                await financeService.verifyPayoutMethod(decision.method.id, { via: "MANUAL" });
                toast.success("Payout method verified", { description: describeMethod(decision.method) });
            } else {
                await financeService.rejectPayoutMethod(decision.method.id, reason.trim());
                toast.success("Payout method rejected", { description: reason.trim() });
            }
            setDecision(null);
            setReason("");
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The decision did not reach ADX.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                    Recorded at the desk on the agent&apos;s behalf, then proved before anything is paid out.
                </p>
                <Button variant="outline" className="bg-card" onClick={() => setAdding(true)}>
                    <Plus className="mr-1.5 size-4" />
                    Add bank account
                </Button>
            </div>

            {methods.length === 0 ? (
                <Card className="rounded-lg border-border p-8 text-center shadow-none">
                    <Landmark className="mx-auto size-8 text-muted-foreground/50" strokeWidth={1.5} />
                    <p className="mt-2 text-sm font-medium text-foreground">No payout method on file</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Nothing can be paid to {agentName} until one is recorded and verified.
                    </p>
                </Card>
            ) : (
                <ul className="space-y-3">
                    {methods.map((method) => (
                        <li key={method.id}>
                            <Card className="flex flex-wrap items-center gap-4 rounded-lg border-border p-4 shadow-none">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-medium text-foreground">{describeMethod(method)}</p>
                                        <StatusBadge status={PAYOUT_METHOD_STATUS_META[method.status]} />
                                        {method.isDefault && <StatusBadge status={{ label: "Default", tone: "info" }} />}
                                    </div>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {[
                                            method.accountHolder,
                                            method.ifscCode,
                                            `added ${formatDate(method.createdAt)}`,
                                            method.verifiedVia ? `verified ${VERIFIED_VIA_LABEL[method.verifiedVia]}` : null,
                                        ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </p>
                                    {method.rejectionReason && (
                                        <p className="mt-1 text-xs text-danger">{method.rejectionReason}</p>
                                    )}
                                </div>
                                {method.status === "PENDING_VERIFICATION" && (
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 text-danger hover:text-danger"
                                            onClick={() => setDecision({ method, action: "reject" })}
                                        >
                                            Reject
                                        </Button>
                                        <Button size="sm" className="h-8" onClick={() => setDecision({ method, action: "verify" })}>
                                            Verify
                                        </Button>
                                    </div>
                                )}
                            </Card>
                        </li>
                    ))}
                </ul>
            )}

            <AddPayoutMethodDialog
                open={adding}
                onOpenChange={setAdding}
                userId={userId}
                agentName={agentName}
                onAdded={onChanged}
            />

            <ConfirmDialog
                open={decision !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDecision(null);
                        setReason("");
                    }
                }}
                title={decision?.action === "verify" ? "Verify this payout method?" : "Reject this payout method?"}
                description={
                    decision?.action === "verify"
                        ? `${describeMethod(decision.method)} will be recorded as verified by hand, and withdrawals to it will be allowed.`
                        : `${agentName} will see your reason. Ops can record a fresh method afterwards.`
                }
                confirmLabel={decision?.action === "verify" ? "Verify" : "Reject"}
                destructive={decision?.action === "reject"}
                busy={busy}
                onConfirm={() => void decide()}
            >
                {decision?.action === "reject" && (
                    <Textarea
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Reason — the cheque image was unreadable, the name did not match…"
                        className="min-h-20 resize-none"
                    />
                )}
            </ConfirmDialog>
        </div>
    );
}

interface AddPayoutMethodDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userId: string;
    agentName: string;
    onAdded: () => void;
}

const EMPTY: NewPayoutMethodInput = { type: "BANK", accountHolder: "", bankName: "", accountNumber: "", ifscCode: "", upiVpa: "" };

/**
 * Exported for the print-partner page (Lot B, B4b), which records a shop's
 * cancelled cheque against its sign-in-disabled account through the very
 * same route — `agentName` is simply whose name goes in the copy.
 */
export function AddPayoutMethodDialog({ open, onOpenChange, userId, agentName, onAdded }: AddPayoutMethodDialogProps) {
    const [draft, setDraft] = React.useState<NewPayoutMethodInput>(EMPTY);
    const [saving, setSaving] = React.useState(false);
    const set = <K extends keyof NewPayoutMethodInput>(key: K, value: NewPayoutMethodInput[K]) =>
        setDraft((current) => ({ ...current, [key]: value }));

    const ifscInvalid = draft.type === "BANK" && Boolean(draft.ifscCode) && !IFSC.test(draft.ifscCode ?? "");
    const complete =
        draft.type === "BANK"
            ? Boolean(draft.accountHolder?.trim() && draft.bankName?.trim() && (draft.accountNumber?.length ?? 0) >= 8 && IFSC.test(draft.ifscCode ?? ""))
            : Boolean(draft.upiVpa?.trim());

    const save = async () => {
        setSaving(true);
        try {
            const body: NewPayoutMethodInput =
                draft.type === "BANK"
                    ? {
                          type: "BANK",
                          accountHolder: draft.accountHolder?.trim(),
                          bankName: draft.bankName?.trim(),
                          accountNumber: draft.accountNumber?.trim(),
                          ifscCode: draft.ifscCode?.trim().toUpperCase(),
                      }
                    : { type: "UPI", upiVpa: draft.upiVpa?.trim() };
            await financeService.addPayoutMethodFor(userId, body);
            toast.success("Payout method recorded", { description: "It waits for verification before any payout." });
            setDraft(EMPTY);
            onOpenChange(false);
            onAdded();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The method did not reach ADX.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Add a payout method</DialogTitle>
                    <DialogDescription>
                        As shown on {agentName}&apos;s cancelled cheque or passbook. Recorded on their behalf; verified
                        before anything is paid.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <RadioGroup
                        value={draft.type}
                        onValueChange={(value) => set("type", value as NewPayoutMethodInput["type"])}
                        className="flex gap-4"
                    >
                        <label className="flex items-center gap-2 text-sm">
                            <RadioGroupItem value="BANK" id="method-bank" />
                            Bank account
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <RadioGroupItem value="UPI" id="method-upi" />
                            UPI
                        </label>
                    </RadioGroup>

                    {draft.type === "BANK" ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5 sm:col-span-2">
                                <Label htmlFor="method-holder">Account holder</Label>
                                <Input
                                    id="method-holder"
                                    value={draft.accountHolder ?? ""}
                                    onChange={(event) => set("accountHolder", event.target.value)}
                                    placeholder="As printed on the cheque"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="method-bank-name">Bank</Label>
                                <Input id="method-bank-name" value={draft.bankName ?? ""} onChange={(event) => set("bankName", event.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="method-ifsc">IFSC</Label>
                                <Input
                                    id="method-ifsc"
                                    value={draft.ifscCode ?? ""}
                                    onChange={(event) => set("ifscCode", event.target.value.toUpperCase())}
                                    placeholder="SBIN0001234"
                                    maxLength={11}
                                    className="font-mono uppercase"
                                    aria-invalid={ifscInvalid || undefined}
                                />
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                                <Label htmlFor="method-number">Account number</Label>
                                <Input
                                    id="method-number"
                                    value={draft.accountNumber ?? ""}
                                    onChange={(event) => set("accountNumber", event.target.value.replace(/\D/g, ""))}
                                    inputMode="numeric"
                                    className="font-mono"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <Label htmlFor="method-vpa">UPI ID</Label>
                            <Input
                                id="method-vpa"
                                value={draft.upiVpa ?? ""}
                                onChange={(event) => set("upiVpa", event.target.value)}
                                placeholder="name@bank"
                            />
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={() => void save()} disabled={saving || !complete}>
                        Record method
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
