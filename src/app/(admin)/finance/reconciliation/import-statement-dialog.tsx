"use client";

import * as React from "react";
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
import { FormatGuidePanel } from "@/components/adx/party-import/format-guide-panel";
import { ApiError } from "@/lib/api-client";
import {
    describeBankAccount,
    financeService,
    type BankAccount,
    type StatementProfile,
} from "@/services/finance";

interface ImportStatementDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    accounts: BankAccount[];
    profiles: StatementProfile[];
    /** The account in view, preselected. */
    defaultAccountId: string;
    onImported: () => void;
}

/** `csvUploadMiddleware`'s ceiling. */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Import a bank statement — `POST /finance/reconciliation/imports`, multipart.
 *
 * The account is which of ADX's accounts the statement is for; the profile
 * is how that bank names its columns, and "default" is `Date, Description,
 * Ref No./UTR, Debit, Credit, Balance` in `dd/MM/yyyy`. The period is not
 * sent: the backend reads it off the earliest and latest value dates it
 * finds, which is the honest period of a file rather than the one somebody
 * typed. What the dialog says back is what landed, what was already there,
 * and which rows it could not read — the good rows still land.
 */
export function ImportStatementDialog({
    open,
    onOpenChange,
    accounts,
    profiles,
    defaultAccountId,
    onImported,
}: ImportStatementDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                {/* Mounted only while open, so the form is fresh each time. */}
                <ImportForm
                    accounts={accounts}
                    profiles={profiles}
                    defaultAccountId={defaultAccountId}
                    onClose={() => onOpenChange(false)}
                    onImported={onImported}
                />
            </DialogContent>
        </Dialog>
    );
}

function ImportForm({
    accounts,
    profiles,
    defaultAccountId,
    onClose,
    onImported,
}: Omit<ImportStatementDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
    const active = accounts.filter((account) => account.isActive);
    const [bankAccountId, setBankAccountId] = React.useState(
        active.some((account) => account.id === defaultAccountId) ? defaultAccountId : (active[0]?.id ?? "")
    );
    const [profileId, setProfileId] = React.useState<string>("");
    const [file, setFile] = React.useState<File | null>(null);
    const [busy, setBusy] = React.useState(false);

    const profile = profiles.find((row) => row.id === profileId) ?? null;

    async function submit() {
        if (!file || !bankAccountId) return;
        if (file.size > MAX_BYTES) {
            toast.error("A statement is at most 5 MB.");
            return;
        }
        setBusy(true);
        try {
            const outcome = await financeService.reconciliation.importStatement({
                file,
                bankAccountId,
                ...(profileId ? { profileId } : {}),
            });
            const problems = outcome.problems.length;
            toast.success(`${outcome.created} ${outcome.created === 1 ? "line" : "lines"} imported`, {
                description: [
                    outcome.duplicates ? `${outcome.duplicates} already on file and skipped` : null,
                    problems
                        ? `${problems} ${problems === 1 ? "row" : "rows"} could not be read: ${outcome.problems
                              .slice(0, 3)
                              .map((row) => `#${row.row} ${row.problem}`)
                              .join("; ")}${problems > 3 ? "…" : ""}`
                        : null,
                    outcome.import.periodStart && outcome.import.periodEnd
                        ? `Period ${outcome.import.periodStart.slice(0, 10)} to ${outcome.import.periodEnd.slice(0, 10)}.`
                        : null,
                ]
                    .filter(Boolean)
                    .join(". "),
            });
            onImported();
            onClose();
        } catch (cause) {
            if (cause instanceof ApiError) {
                const problems = (cause.details as { problems?: { row: number; problem: string }[] } | undefined)
                    ?.problems;
                toast.error(cause.message, {
                    description: problems?.map((row) => `#${row.row} ${row.problem}`).join("; "),
                });
            } else {
                toast.error("Could not import that statement.");
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <DialogHeader>
                <DialogTitle>Import a bank statement</DialogTitle>
                <DialogDescription>
                    A CSV export from the bank. The same line imported twice lands once, so re-importing an
                    overlapping period is safe.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
                <div className="space-y-1.5">
                    <Label htmlFor="import-account">Bank account</Label>
                    <Select value={bankAccountId} onValueChange={setBankAccountId}>
                        <SelectTrigger id="import-account">
                            <SelectValue placeholder="Which of ADX's accounts" />
                        </SelectTrigger>
                        <SelectContent>
                            {active.map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                    {account.label} · {describeBankAccount(account)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="import-profile">Column profile</Label>
                    <Select value={profileId || "DEFAULT"} onValueChange={(value) => setProfileId(value === "DEFAULT" ? "" : value)}>
                        <SelectTrigger id="import-profile">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="DEFAULT">Default — Date, Description, Ref No./UTR, Debit, Credit, Balance</SelectItem>
                            {profiles.map((row) => (
                                <SelectItem key={row.id} value={row.id}>
                                    {row.name} · {row.bankName}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                        {profile
                            ? `${profile.columns.date}, ${profile.columns.description}${
                                  profile.columns.utr ? `, ${profile.columns.utr}` : ""
                              }, ${[profile.columns.debit, profile.columns.credit, profile.columns.amount]
                                  .filter(Boolean)
                                  .join(", ")} · ${profile.dateFormat ?? "dd/MM/yyyy"}`
                            : "Dates as dd/MM/yyyy. Columns are matched by name, case-insensitively; an address block above the header is skipped."}
                    </p>
                </div>
                {/* Package U: the default headings the reader takes, folded; a profile above renames them. */}
                <FormatGuidePanel kind="finance-reconciliation" collapsible />
                <div className="space-y-1.5">
                    <Label htmlFor="import-file">Statement (CSV)</Label>
                    <Input
                        id="import-file"
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                    <p className="text-xs text-muted-foreground">
                        Up to 5 MB. The period is read from the value dates in the file.
                    </p>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button onClick={submit} disabled={busy || !file || !bankAccountId}>
                    {busy ? "Importing…" : "Import"}
                </Button>
            </DialogFooter>
        </>
    );
}
