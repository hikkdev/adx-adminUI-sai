"use client";

import * as React from "react";
import { BadgeCheck, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { EmptyState } from "@/components/adx/empty-state";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { FieldList } from "@/components/adx/simple-table";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatPct } from "@/lib/format";
import {
    PAYOUT_METHOD_STATUS_META,
    RAIL_LABEL,
    VERIFIED_VIA_LABEL,
    describeMethod,
    financeService,
    type PayoutMethod,
    type PayoutVerificationMethod,
    type RailStatus,
} from "@/services/finance";

interface PayoutMethodsViewProps {
    methods: PayoutMethod[];
    rails: RailStatus[];
    onChanged: () => void;
}

/**
 * The verification queue: bank accounts and UPI IDs nobody has proved yet.
 *
 * A party cannot withdraw to a method until it is VERIFIED, so this queue sits
 * directly in front of every first payout. Three ways to prove one, and which
 * are actually available depends on the deployment:
 *
 * • PENNY_DROP — a rupee sent and matched. Only where a rail offers it, and no
 *   configured rail does yet, so the option is shown with that said plainly
 *   rather than offered as though it would work.
 * • NAME_LOOKUP — a VPA resolved to a name.
 * • MANUAL — ops checked the papers. Always available.
 *
 * The name-match percentage is asked for because it is the one number that
 * makes a verification auditable later: "we checked" and "the bank returned a
 * 96% match on the name" are different claims.
 */

/** 90% and over is treated as a match; below it, somebody should look again. */
const STRONG_MATCH = 90;

export function PayoutMethodsView({ methods, rails, onChanged }: PayoutMethodsViewProps) {
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [action, setAction] = React.useState<"verify" | "reject" | null>(null);
    const [via, setVia] = React.useState<PayoutVerificationMethod>("MANUAL");
    const [reference, setReference] = React.useState("");
    const [nameMatch, setNameMatch] = React.useState("");
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const selected = methods.find((method) => method.id === selectedId) ?? methods[0] ?? null;

    /* Penny drop is a capability of a rail, not a choice ops can simply make.
       No configured rail supports it today, so the option is disabled and says
       why — an ops person picking it and getting a 400 learns less. */
    const pennyDropRail = rails.find((rail) => rail.configured && rail.pennyDrop) ?? null;

    function start(next: "verify" | "reject") {
        setVia(pennyDropRail ? "PENNY_DROP" : "MANUAL");
        setReference("");
        setNameMatch("");
        setReason("");
        setAction(next);
    }

    async function confirm() {
        if (!selected || !action) return;
        setBusy(true);
        try {
            if (action === "verify") {
                await financeService.verifyPayoutMethod(selected.id, {
                    via,
                    ...(reference.trim() ? { reference: reference.trim() } : {}),
                    // Sent as a decimal string, the way every other rate on the
                    // wire is. Nothing here turns it into a float.
                    ...(nameMatch.trim() ? { nameMatchPct: nameMatch.trim() } : {}),
                });
                toast.success(`${describeMethod(selected)} verified`, {
                    description: "The party can now request a withdrawal to it.",
                });
            } else {
                await financeService.rejectPayoutMethod(selected.id, reason.trim());
                toast.success(`${describeMethod(selected)} rejected`, {
                    description: "The reason is shown to the party so they can correct it.",
                });
            }
            setAction(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not record that decision.");
        } finally {
            setBusy(false);
        }
    }

    /** A percentage typed as "0"–"100", with at most two decimals. */
    const nameMatchValid =
        nameMatch.trim() === "" ||
        (/^\d{1,3}(\.\d{1,2})?$/.test(nameMatch.trim()) && Number(nameMatch.trim()) <= 100);

    if (methods.length === 0) {
        return (
            <div className="space-y-5">
                <PageHeader
                    title="Payout methods"
                    subtitle="Bank accounts and UPI IDs waiting to be proved before money can be sent to them."
                />
                <Card className="rounded-lg border-border shadow-none">
                    <EmptyState
                        icon={ShieldCheck}
                        title="Nothing waiting"
                        description="Every payout method a party has added has been verified or rejected. New ones land here the moment they are added."
                    />
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title="Payout methods"
                subtitle={`${methods.length} ${methods.length === 1 ? "account" : "accounts"} waiting. A party cannot withdraw to a method until it is verified.`}
            />

            <div className="grid gap-4 xl:grid-cols-3">
                <Card className="overflow-hidden rounded-lg border-border shadow-none">
                    <ul className="divide-y">
                        {methods.map((method) => {
                            const active = method.id === selected?.id;
                            const who = method.accountHolder ?? method.upiVpa ?? "Unnamed account";
                            return (
                                <li key={method.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedId(method.id)}
                                        className={cn(
                                            "w-full px-4 py-3.5 text-left transition-colors",
                                            active ? "bg-primary/[0.04]" : "hover:bg-muted/50"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <InitialsAvatar name={who} size="md" />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-foreground">
                                                    {who}
                                                </p>
                                                <div className="mt-0.5 flex items-center justify-between gap-2">
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {describeMethod(method)} · added{" "}
                                                        {formatDate(method.createdAt)}
                                                    </p>
                                                    <StatusBadge
                                                        status={PAYOUT_METHOD_STATUS_META[method.status]}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </Card>

                {selected && (
                    <div className="space-y-4 xl:col-span-2">
                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <h2 className="text-lg font-semibold text-foreground">
                                        {selected.accountHolder ?? selected.upiVpa ?? "Unnamed account"}
                                    </h2>
                                    <p className="mt-0.5 text-sm text-muted-foreground">
                                        {selected.type === "BANK" ? "Bank account" : "UPI ID"}
                                        {selected.isDefault ? " · the party's default" : ""}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <Button
                                        variant="outline"
                                        className="bg-card text-danger hover:text-danger"
                                        onClick={() => start("reject")}
                                    >
                                        <X className="mr-1.5 size-4" />
                                        Reject
                                    </Button>
                                    <Button onClick={() => start("verify")}>
                                        <BadgeCheck className="mr-1.5 size-4" />
                                        Verify
                                    </Button>
                                </div>
                            </div>

                            <FieldList
                                className="mt-5"
                                items={
                                    selected.type === "BANK"
                                        ? [
                                              ["Account holder", selected.accountHolder ?? "Not given"],
                                              ["Bank", selected.bankName ?? "Not given"],
                                              [
                                                  "Account number",
                                                  // Masked server-side. The full number never
                                                  // leaves the backend, and this screen does not
                                                  // need it to decide anything.
                                                  selected.accountNumberMasked ?? "Not given",
                                              ],
                                              ["IFSC", selected.ifscCode ?? "Not given"],
                                              ["Added", formatDate(selected.createdAt)],
                                          ]
                                        : [
                                              ["UPI ID", selected.upiVpa ?? "Not given"],
                                              ["Account holder", selected.accountHolder ?? "Not given"],
                                              ["Added", formatDate(selected.createdAt)],
                                          ]
                                }
                            />

                            {selected.nameMatchPct !== null && (
                                <p className="mt-4 border-t pt-3 text-sm text-muted-foreground">
                                    A previous check returned a {formatPct(selected.nameMatchPct)} name match
                                    {selected.verifiedVia
                                        ? ` via ${VERIFIED_VIA_LABEL[selected.verifiedVia].toLowerCase()}`
                                        : ""}
                                    .
                                </p>
                            )}
                            {selected.rejectionReason && (
                                <p className="mt-4 border-t pt-3 text-sm text-danger">
                                    Previously rejected: {selected.rejectionReason}
                                </p>
                            )}
                        </Card>

                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                How this can be proved
                            </h3>
                            <ul className="mt-3 space-y-3 text-sm">
                                <li>
                                    <p className="font-medium text-foreground">Penny drop</p>
                                    <p className="text-xs text-muted-foreground">
                                        {pennyDropRail
                                            ? `${RAIL_LABEL[pennyDropRail.name]} can send a rupee and match the name it comes back with.`
                                            : "No configured rail offers it yet. Every registered vendor reports no penny-drop support, so this cannot be run from here today."}
                                    </p>
                                </li>
                                <li>
                                    <p className="font-medium text-foreground">Name lookup</p>
                                    <p className="text-xs text-muted-foreground">
                                        Resolve the VPA to a name and record the match percentage.
                                    </p>
                                </li>
                                <li>
                                    <p className="font-medium text-foreground">Manual check</p>
                                    <p className="text-xs text-muted-foreground">
                                        Ops read the papers. Always available, and the only option until a
                                        rail is chosen. Record what you checked against as the reference.
                                    </p>
                                </li>
                            </ul>
                        </Card>
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={action !== null}
                onOpenChange={(next) => !next && setAction(null)}
                title={
                    action === "verify" ? "Verify this payout method?" : "Reject this payout method?"
                }
                description={
                    action === "verify"
                        ? "Once verified, the party can request a withdrawal to this account. Every withdrawal is still vetted separately — this only says the account is theirs."
                        : "The party is told why and can correct it or add another account. Nothing else about their wallet changes."
                }
                confirmLabel={action === "verify" ? "Verify account" : "Reject account"}
                destructive={action === "reject"}
                busy={busy}
                disabled={
                    action === "reject" ? !reason.trim() : !nameMatchValid
                }
                onConfirm={confirm}
            >
                {action === "verify" ? (
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="verify-via">Proved by</Label>
                            <Select
                                value={via}
                                onValueChange={(next) => setVia(next as PayoutVerificationMethod)}
                            >
                                <SelectTrigger id="verify-via">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="PENNY_DROP" disabled={!pennyDropRail}>
                                        Penny drop{pennyDropRail ? "" : " — no rail supports it"}
                                    </SelectItem>
                                    <SelectItem value="NAME_LOOKUP">Name lookup</SelectItem>
                                    <SelectItem value="MANUAL">Manual check</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="verify-reference">Reference (optional)</Label>
                            <Input
                                id="verify-reference"
                                value={reference}
                                onChange={(event) => setReference(event.target.value)}
                                placeholder={
                                    via === "MANUAL"
                                        ? "e.g. cancelled cheque seen, ticket ADX-4412"
                                        : "The transaction or lookup id the check returned"
                                }
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="verify-name-match">Name match % (optional)</Label>
                            <Input
                                id="verify-name-match"
                                inputMode="decimal"
                                value={nameMatch}
                                onChange={(event) => setNameMatch(event.target.value)}
                                placeholder="e.g. 96.50"
                                aria-invalid={!nameMatchValid}
                            />
                            <p
                                className={cn(
                                    "text-xs",
                                    nameMatchValid ? "text-muted-foreground" : "text-danger"
                                )}
                            >
                                {nameMatchValid
                                    ? `How closely the account name matched the KYC name. ${STRONG_MATCH}% and over reads as a match on the withdrawal queue.`
                                    : "A percentage between 0 and 100, with at most two decimals."}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        <Label htmlFor="reject-method-reason">Reason</Label>
                        <Textarea
                            id="reject-method-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            rows={3}
                            placeholder="What is wrong with the account, in words the party can act on."
                        />
                        <p className="text-xs text-muted-foreground">Required, and shown to the party.</p>
                    </div>
                )}
            </ConfirmDialog>
        </div>
    );
}
