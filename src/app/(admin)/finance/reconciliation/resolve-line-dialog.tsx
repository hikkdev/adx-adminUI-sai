"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
import { ApiError } from "@/lib/api-client";
import { compareMoney, formatDate, formatMoney, toPaise } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import {
    LEDGER_KIND_LABEL,
    WITHDRAWAL_STATUS_META,
    financeService,
    type BankStatementLine,
    type LedgerTransaction,
    type MatchTarget,
    type Withdrawal,
} from "@/services/finance";

interface ResolveLineDialogProps {
    /** The line being resolved; null closes the dialog. */
    line: BankStatementLine | null;
    onOpenChange: (open: boolean) => void;
    onResolved: () => void;
}

type RecordKind = "withdrawal" | "topUp" | "payment" | "ledgerTransaction";
type Mode = "match" | "ignore";

const KIND_LABEL: Record<RecordKind, string> = {
    withdrawal: "Withdrawal",
    topUp: "Top-up",
    payment: "Gateway payment",
    ledgerTransaction: "Ledger transaction",
};

/** The auto-matcher's window either side of the value date, for the ledger candidates. */
const WINDOW_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A `WDR-2026-000118` in a narration. */
const WDR_IN_TEXT = /WDR-\d{4}-\d{6}/i;

/**
 * Which ledger transactions a line could be — the same rule the auto-matcher
 * applies, minus its refusal to pick between two: the right kind for the
 * direction, one leg equal to the amount, within two days of the value date.
 * The person picks; the matcher would have left it alone.
 */
export function ledgerCandidates(line: BankStatementLine, transactions: LedgerTransaction[]): LedgerTransaction[] {
    const value = new Date(line.valueDate).getTime();
    const from = value - WINDOW_DAYS * DAY_MS;
    const to = value + (WINDOW_DAYS + 1) * DAY_MS;
    const kinds = line.direction === "DEBIT" ? ["PAYOUT", "REFUND"] : ["TOPUP"];
    const amount = toPaise(line.amount);
    return transactions.filter((tx) => {
        if (!kinds.includes(tx.kind)) return false;
        const at = new Date(tx.occurredAt).getTime();
        if (at < from || at > to) return false;
        return tx.legs.some((leg) => {
            const paise = toPaise(leg.amount);
            return paise === amount || paise === -amount;
        });
    });
}

/** The withdrawal reference or UTR a debit line already carries, to search by. */
export function suggestedQuery(line: BankStatementLine): string {
    const reference = line.description.match(WDR_IN_TEXT)?.[0];
    return (reference ?? line.utr ?? "").toUpperCase();
}

/**
 * Resolve one bank line by hand — Lot B (Q85).
 *
 * The auto-matcher never guesses; this is where a person does. A line is
 * matched to exactly one record — a withdrawal found by its reference or
 * UTR, a ledger transaction found by amount and date, or a top-up or
 * gateway payment by its id — or set aside as a bank charge. DIFFERS is
 * still possible from here: the backend compares the amounts and records the
 * difference rather than refusing, so the line reads "amount differs" for
 * somebody to settle.
 */
export function ResolveLineDialog({ line, onOpenChange, onResolved }: ResolveLineDialogProps) {
    return (
        <Dialog open={line !== null} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {line && (
                    <ResolveForm
                        key={line.id}
                        line={line}
                        onClose={() => onOpenChange(false)}
                        onResolved={onResolved}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function ResolveForm({
    line,
    onClose,
    onResolved,
}: {
    line: BankStatementLine;
    onClose: () => void;
    onResolved: () => void;
}) {
    const [mode, setMode] = React.useState<Mode>("match");
    const [kind, setKind] = React.useState<RecordKind>(line.direction === "DEBIT" ? "withdrawal" : "topUp");
    const [query, setQuery] = React.useState(() => suggestedQuery(line));
    const [searched, setSearched] = React.useState<string | null>(null);
    const [recordId, setRecordId] = React.useState("");
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    /* Withdrawals are searched on demand — the queue's `q` covers reference,
       UTR and party name. Ledger candidates are read once and narrowed here. */
    const withdrawals = useApiResource<Withdrawal[]>(
        `recon:withdrawals:${line.id}:${searched ?? ""}`,
        () => (searched ? financeService.withdrawals({ q: searched, limit: 50 }) : Promise.resolve([]))
    );
    const ledger = useApiResource<LedgerTransaction[]>(`recon:ledger:${line.id}:${kind}`, () =>
        kind === "ledgerTransaction" ? financeService.ledger({ limit: 200 }) : Promise.resolve([])
    );
    const candidates = React.useMemo(
        () => (ledger.data ? ledgerCandidates(line, ledger.data) : []),
        [ledger.data, line]
    );

    const target = (): MatchTarget | null => {
        const id = recordId.trim();
        if (!id) return null;
        switch (kind) {
            case "withdrawal":
                return { withdrawalId: id };
            case "topUp":
                return { topUpId: id };
            case "payment":
                return { paymentId: id };
            case "ledgerTransaction":
                return { ledgerTransactionId: id };
        }
    };

    const ready = mode === "ignore" || target() !== null;

    async function submit() {
        setBusy(true);
        try {
            if (mode === "ignore") {
                await financeService.reconciliation.ignore(line.id, note.trim() || undefined);
                toast.success("Line set aside", { description: "Bank charges and interest belong here. Unmatch to bring it back." });
            } else {
                const chosen = target();
                if (!chosen) return;
                const updated = await financeService.reconciliation.match(line.id, chosen, note.trim() || undefined);
                if (updated.matchStatus === "DIFFERS") {
                    toast.warning("Matched, but the amounts differ", {
                        description: `The record is ${formatMoney(updated.match?.difference)} away from the bank line. It reads "amount differs" until somebody settles it.`,
                    });
                } else {
                    toast.success("Line matched", {
                        description:
                            chosen && "topUpId" in chosen
                                ? "A transfer top-up sitting in suspense is settled against cash by this match."
                                : `${KIND_LABEL[kind]} recorded against the line.`,
                    });
                }
            }
            onResolved();
            onClose();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not resolve that line.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <DialogHeader>
                <DialogTitle>Resolve this line</DialogTitle>
                <DialogDescription>
                    {line.direction === "DEBIT" ? "−" : "+"}
                    {formatMoney(line.amount)} on {formatDate(line.valueDate)} · {line.description}
                    {line.utr ? ` · UTR ${line.utr}` : ""}
                </DialogDescription>
            </DialogHeader>

            <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
                {(["match", "ignore"] as Mode[]).map((option) => (
                    <button
                        key={option}
                        type="button"
                        onClick={() => setMode(option)}
                        className={cn(
                            "flex-1 rounded-md px-3 py-1.5 font-medium transition-colors",
                            mode === option ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                        )}
                    >
                        {option === "match" ? "Match a record" : "Ignore"}
                    </button>
                ))}
            </div>

            {mode === "match" ? (
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="resolve-kind">Record</Label>
                        <Select
                            value={kind}
                            onValueChange={(value) => {
                                setKind(value as RecordKind);
                                setRecordId("");
                            }}
                        >
                            <SelectTrigger id="resolve-kind">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(KIND_LABEL) as RecordKind[]).map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {KIND_LABEL[option]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {kind === "withdrawal" && (
                        <div className="space-y-2">
                            <Label htmlFor="resolve-q">Reference, UTR or party name</Label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        id="resolve-q"
                                        className="pl-8"
                                        value={query}
                                        placeholder="WDR-2026-000118"
                                        onChange={(event) => setQuery(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") setSearched(query.trim());
                                        }}
                                    />
                                </div>
                                <Button variant="outline" disabled={!query.trim()} onClick={() => setSearched(query.trim())}>
                                    Find
                                </Button>
                            </div>
                            {searched && (
                                <Candidates
                                    loading={withdrawals.loading}
                                    error={withdrawals.error}
                                    empty="No withdrawal matches that. Only a PAID withdrawal explains a bank line; one still with the rail needs its UTR recorded first."
                                    items={(withdrawals.data ?? []).map((row) => ({
                                        id: row.id,
                                        title: `${row.reference} · ${row.partyName}`,
                                        detail: `${formatMoney(row.netAmount)}${row.railReference ? ` · UTR ${row.railReference}` : ""}${
                                            row.paidAt ? ` · paid ${formatDate(row.paidAt)}` : ""
                                        }`,
                                        badge: WITHDRAWAL_STATUS_META[row.status],
                                        exact: compareMoney(row.netAmount, line.amount) === 0,
                                    }))}
                                    selected={recordId}
                                    onSelect={setRecordId}
                                />
                            )}
                        </div>
                    )}

                    {kind === "ledgerTransaction" && (
                        <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">
                                {line.direction === "DEBIT" ? "Payout and refund" : "Top-up"} transactions with a leg of{" "}
                                {formatMoney(line.amount)} within two days of {formatDate(line.valueDate)}.
                            </p>
                            <Candidates
                                loading={ledger.loading}
                                error={ledger.error}
                                empty="No transaction of that kind and amount is within two days of the value date. Paste an id below if you know it."
                                items={candidates.map((tx) => ({
                                    id: tx.id,
                                    title: `${tx.reference} · ${LEDGER_KIND_LABEL[tx.kind]}`,
                                    detail: `${formatDate(tx.occurredAt)}${tx.note ? ` · ${tx.note}` : ""}`,
                                    exact: true,
                                }))}
                                selected={recordId}
                                onSelect={setRecordId}
                            />
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="resolve-id">
                            {kind === "withdrawal" || kind === "ledgerTransaction"
                                ? "Or the record's id"
                                : `${KIND_LABEL[kind]} id`}
                        </Label>
                        <Input
                            id="resolve-id"
                            value={recordId}
                            onChange={(event) => setRecordId(event.target.value)}
                            placeholder={
                                kind === "topUp"
                                    ? "From the advertiser's wallet tab"
                                    : kind === "payment"
                                      ? "The gateway payment id"
                                      : "cuid"
                            }
                        />
                        {(kind === "topUp" || kind === "payment") && (
                            <p className="text-xs text-muted-foreground">
                                {kind === "topUp"
                                    ? "A transfer or cheque top-up waits in suspense until its bank line is matched; the match settles it against cash when the amounts agree."
                                    : "A gateway payment's cash leg was posted when it landed, so matching it settles nothing — it only explains the line."}
                            </p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="resolve-note">Note (optional)</Label>
                        <Input
                            id="resolve-note"
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="Why this record, if it is not obvious."
                        />
                    </div>
                </div>
            ) : (
                <div className="space-y-1.5">
                    <Label htmlFor="ignore-note">Note (optional)</Label>
                    <Textarea
                        id="ignore-note"
                        rows={3}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Bank charges, interest, a reversal the bank made on its own."
                    />
                    <p className="text-xs text-muted-foreground">
                        An ignored line is explained by nothing on ADX's books and stays out of the unreconciled total.
                    </p>
                </div>
            )}

            <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button onClick={submit} disabled={busy || !ready}>
                    {busy ? "Saving…" : mode === "ignore" ? "Ignore line" : "Match"}
                </Button>
            </DialogFooter>
        </>
    );
}

interface Candidate {
    id: string;
    title: string;
    detail: string;
    badge?: { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" };
    /** The amount agrees with the line's. */
    exact: boolean;
}

function Candidates({
    loading,
    error,
    empty,
    items,
    selected,
    onSelect,
}: {
    loading: boolean;
    error: string | null;
    empty: string;
    items: Candidate[];
    selected: string;
    onSelect: (id: string) => void;
}) {
    if (loading) return <p className="text-xs text-muted-foreground">Looking…</p>;
    if (error) return <p className="text-xs text-danger">{error}</p>;
    if (items.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
    return (
        <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border" role="listbox">
            {items.map((item) => {
                const active = item.id === selected;
                return (
                    <li key={item.id}>
                        <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => onSelect(item.id)}
                            className={cn(
                                "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                                active ? "bg-primary/[0.06]" : "hover:bg-muted/50"
                            )}
                        >
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-medium text-foreground">{item.title}</p>
                                <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                            </div>
                            {!item.exact && <span className="text-xs text-warning">amount differs</span>}
                            {item.badge && <StatusBadge status={item.badge} />}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
