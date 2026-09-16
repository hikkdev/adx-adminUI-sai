"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { financeService, type BankAccount } from "@/services/finance";

/** The schema's shape: eleven characters, four letters, a zero, six alphanumerics. */
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

interface BankAccountsProps {
    accounts: BankAccount[];
    onChanged: () => void;
}

/**
 * ADX's own bank accounts — Lot B (Q85).
 *
 * What a payout batch is drawn on and a bank statement is imported for. The
 * whole account number is typed once, sent once, and never comes back: the
 * backend keeps the last four digits and the audit row sees only the mask.
 * One account is the default and setting another clears it, so the list is
 * a picker rather than a register — the two actions per row are the two
 * things `PUT /finance/bank-accounts` can change on one.
 */
export function BankAccounts({ accounts, onChanged }: BankAccountsProps) {
    const [adding, setAdding] = React.useState(false);
    const [busyId, setBusyId] = React.useState<string | null>(null);
    const [form, setForm] = React.useState({
        label: "",
        bankName: "",
        accountHolder: "",
        accountNumber: "",
        ifsc: "",
        isDefault: accounts.length === 0,
    });

    const sorted = React.useMemo(
        () =>
            [...accounts].sort((a, b) => {
                if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
                if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
                return a.label.localeCompare(b.label);
            }),
        [accounts]
    );

    async function add() {
        const ifsc = form.ifsc.trim().toUpperCase();
        if (form.label.trim().length === 0 || form.bankName.trim().length === 0) {
            toast.error("Give the account a label and name the bank.");
            return;
        }
        if (!IFSC.test(ifsc)) {
            toast.error("An IFSC is eleven characters: four letters, a zero, then six letters or digits.");
            return;
        }
        const number = form.accountNumber.replace(/\s/g, "");
        if (number.length < 6 || number.length > 34) {
            toast.error("An account number is between 6 and 34 characters.");
            return;
        }
        setBusyId("new");
        try {
            const saved = await financeService.createBankAccount({
                label: form.label.trim(),
                bankName: form.bankName.trim(),
                ...(form.accountHolder.trim() ? { accountHolder: form.accountHolder.trim() } : {}),
                accountNumber: number,
                ifsc,
                isDefault: form.isDefault,
            });
            toast.success(`${saved.label} added`, {
                description: `${saved.bankName} ${saved.accountNumberMasked ?? ""}. Only the last four digits were kept.`,
            });
            setForm({ label: "", bankName: "", accountHolder: "", accountNumber: "", ifsc: "", isDefault: false });
            setAdding(false);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not add that account.");
        } finally {
            setBusyId(null);
        }
    }

    /** The PUT wants the whole row back; only the flag named here changes. */
    async function flip(account: BankAccount, patch: { isDefault?: boolean; isActive?: boolean }, done: string) {
        setBusyId(account.id);
        try {
            await financeService.updateBankAccount(account.id, {
                label: account.label,
                bankName: account.bankName,
                ...(account.accountHolder ? { accountHolder: account.accountHolder } : {}),
                ifsc: account.ifsc,
                ...patch,
            });
            toast.success(`${account.label} ${done}`);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not update that account.");
        } finally {
            setBusyId(null);
        }
    }

    return (
        <SectionCard
            title="Bank accounts"
            description="ADX's own accounts: what a payout batch is drawn on and what a statement is imported for. Only the last four digits are ever stored."
            actions={
                <Button size="sm" variant="outline" onClick={() => setAdding((open) => !open)}>
                    <Plus className="mr-1.5 size-4" />
                    {adding ? "Cancel" : "Add an account"}
                </Button>
            }
        >
            <div className="space-y-4">
                {adding && (
                    <Card className="rounded-lg border-border bg-muted/40 p-4 shadow-none">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="bank-label">Label</Label>
                                <Input
                                    id="bank-label"
                                    placeholder="Operating account"
                                    value={form.label}
                                    onChange={(event) => setForm((state) => ({ ...state, label: event.target.value }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="bank-name">Bank</Label>
                                <Input
                                    id="bank-name"
                                    placeholder="HDFC Bank"
                                    value={form.bankName}
                                    onChange={(event) => setForm((state) => ({ ...state, bankName: event.target.value }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="bank-holder">Account holder (optional)</Label>
                                <Input
                                    id="bank-holder"
                                    value={form.accountHolder}
                                    onChange={(event) =>
                                        setForm((state) => ({ ...state, accountHolder: event.target.value }))
                                    }
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="bank-ifsc">IFSC</Label>
                                <Input
                                    id="bank-ifsc"
                                    placeholder="HDFC0001234"
                                    className="uppercase"
                                    value={form.ifsc}
                                    onChange={(event) => setForm((state) => ({ ...state, ifsc: event.target.value }))}
                                />
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                                <Label htmlFor="bank-number">Account number</Label>
                                <Input
                                    id="bank-number"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    value={form.accountNumber}
                                    onChange={(event) =>
                                        setForm((state) => ({ ...state, accountNumber: event.target.value }))
                                    }
                                />
                                <p className="text-xs text-muted-foreground">
                                    Sent once. The backend keeps the last four digits and nothing else.
                                </p>
                            </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <label className="flex items-center gap-2 text-sm">
                                <Checkbox
                                    checked={form.isDefault}
                                    onCheckedChange={(checked) =>
                                        setForm((state) => ({ ...state, isDefault: checked === true }))
                                    }
                                />
                                Make it the default
                            </label>
                            <Button disabled={busyId === "new"} onClick={add}>
                                {busyId === "new" ? "Saving…" : "Save account"}
                            </Button>
                        </div>
                    </Card>
                )}

                {sorted.length === 0 ? (
                    <p className="text-sm text-danger">
                        No account on file. A payout batch cannot name one to be drawn on, and a statement has nothing
                        to be imported for.
                    </p>
                ) : (
                    <ul className="divide-y rounded-lg border">
                        {sorted.map((account) => (
                            <li
                                key={account.id}
                                className={cn(
                                    "flex flex-wrap items-center gap-3 px-4 py-3",
                                    !account.isActive && "text-muted-foreground"
                                )}
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-medium text-foreground">{account.label}</p>
                                        {account.isDefault && (
                                            <StatusBadge status={{ label: "Default", tone: "success" }} />
                                        )}
                                        {!account.isActive && (
                                            <StatusBadge status={{ label: "Inactive", tone: "neutral" }} />
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {account.bankName} {account.accountNumberMasked ?? ""} · {account.ifsc}
                                        {account.accountHolder ? ` · ${account.accountHolder}` : ""}
                                    </p>
                                </div>
                                {!account.isDefault && account.isActive && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={busyId === account.id}
                                        onClick={() => flip(account, { isDefault: true }, "is now the default")}
                                    >
                                        Set default
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className={cn(account.isActive && "text-danger hover:text-danger")}
                                    disabled={busyId === account.id || (account.isDefault && account.isActive)}
                                    title={
                                        account.isDefault && account.isActive
                                            ? "Make another account the default first."
                                            : undefined
                                    }
                                    onClick={() =>
                                        flip(
                                            account,
                                            { isActive: !account.isActive },
                                            account.isActive ? "deactivated" : "reactivated"
                                        )
                                    }
                                >
                                    {account.isActive ? "Deactivate" : "Reactivate"}
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </SectionCard>
    );
}
