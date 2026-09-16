"use client";

import * as React from "react";
import { Download, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { FilterChips } from "@/components/adx/filter-chips";
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatMoney, fromPaise, isZeroMoney, sumMoney, toPaise } from "@/lib/format";
import {
    BANK_LINE_STATUS_META,
    describeBankAccount,
    financeService,
    shortId,
    type BankAccount,
    type BankLineMatchStatus,
    type BankStatementLine,
    type ListPage,
    type ReconciliationMatch,
    type ReconciliationSummary,
    type StatementImport,
    type StatementProfile,
} from "@/services/finance";
import { ImportStatementDialog } from "./import-statement-dialog";
import { ResolveLineDialog } from "./resolve-line-dialog";

export type ReconChip = "all" | BankLineMatchStatus;

export interface ReconFilters {
    /** null: not chosen, the default account applies. "": every account. */
    bankAccountId: string | null;
    status: ReconChip;
    /** Lot G (Q125): one import's lines, or "" for every import of the account. What Export files when set. */
    importId: string;
    /** `date` input values, yyyy-mm-dd, over the value date. */
    from: string;
    to: string;
    page: number;
}

interface ReconciliationViewProps {
    accounts: BankAccount[];
    profiles: StatementProfile[];
    /** The account actually in view once the default has been applied; "" for every account. */
    accountId: string;
    lines: ListPage<BankStatementLine>;
    summary: ReconciliationSummary;
    /** Lot G (Q125): the account's imports, newest first. */
    imports: StatementImport[];
    filters: ReconFilters;
    onFiltersChange: (next: ReconFilters) => void;
    onChanged: () => void;
}

/** What one ADX record explains a line: the record's kind, its handle and the amount it was for. */
export function describeMatch(line: BankStatementLine): { kind: string; handle: string; amount: string } | null {
    const match = line.match;
    if (!match) return null;
    const recordAmount = fromPaise(toPaise(line.amount) - toPaise(match.difference));
    if (match.withdrawalId) return { kind: "Payout", handle: `Withdrawal ${shortId(match.withdrawalId)}`, amount: recordAmount };
    if (match.topUpId) return { kind: "Top-up", handle: `Top-up ${shortId(match.topUpId)}`, amount: recordAmount };
    if (match.paymentId) return { kind: "Collection", handle: `Payment ${shortId(match.paymentId)}`, amount: recordAmount };
    if (match.ledgerTransactionId) {
        return { kind: "Ledger transaction", handle: `Transaction ${shortId(match.ledgerTransactionId)}`, amount: recordAmount };
    }
    return null;
}

const matchedBy = (match: ReconciliationMatch) => (match.kind === "AUTO" ? "auto-matched" : "matched by hand");

/**
 * The DR 10 reconciliation desk, on the real API — Lot B (Q85).
 *
 * The frame is kept: the bank-versus-ledger grid, the four tiles above it,
 * the chip row, a Resolve on every line that needs one. What changed is
 * where the rows come from. A row is a `BankStatementLine` imported from a
 * CSV, its ledger half is the one ADX record the match names, and the
 * status is the backend's `matchStatus` — DIFFERS included, which the
 * seeded grid drew but nothing computed.
 *
 * "Confirm matches" is dropped under Q125 (G13-C names the decision): a
 * match confirms itself the moment a person names the record, and the
 * auto-matcher confirms its own — there is no second step and no route for
 * one, so the frame's button would be a control nothing enforces.
 * Beside the two things the module does — import a statement, auto-match
 * what it can — Lot G (package CG4, Q125) brought the frame's Export back:
 * with an import chosen it files `GET /finance/reconciliation/imports/:id/
 * export.csv`, every line of that statement; otherwise `/lines/export.csv`
 * under the filters in force, no page, 50,000 lines at most. Either way
 * the match state, the record that explains each line and who resolved it.
 */
export function ReconciliationView({
    accounts,
    profiles,
    accountId,
    lines,
    summary,
    imports,
    filters,
    onFiltersChange,
    onChanged,
}: ReconciliationViewProps) {
    const [importing, setImporting] = React.useState(false);
    const [exporting, setExporting] = React.useState(false);
    const [resolving, setResolving] = React.useState<BankStatementLine | null>(null);
    const [unmatching, setUnmatching] = React.useState<BankStatementLine | null>(null);
    const [busy, setBusy] = React.useState<"auto" | "unmatch" | null>(null);

    const account = accounts.find((row) => row.id === accountId) ?? null;
    const counts = lines.counts;
    const needsAttention = summary.UNMATCHED.count + summary.DIFFERS.count;
    const unreconciled = sumMoney([summary.UNMATCHED.sum, summary.DIFFERS.sum]);
    const explained = summary.MATCHED.count + summary.IGNORED.count;
    const matchRate = summary.total.count > 0 ? Math.round((summary.MATCHED.count / summary.total.count) * 100) : null;
    const pages = Math.max(1, Math.ceil(lines.total / lines.pageSize));

    const set = (patch: Partial<ReconFilters>) => onFiltersChange({ ...filters, ...patch, page: patch.page ?? 1 });

    async function autoMatch() {
        setBusy("auto");
        try {
            const outcome = await financeService.reconciliation.autoMatch({
                bankAccountId: accountId || undefined,
                ...(filters.from ? { from: new Date(`${filters.from}T00:00:00.000`).toISOString() } : {}),
                ...(filters.to ? { to: new Date(`${filters.to}T23:59:59.999`).toISOString() } : {}),
            });
            const waiting = outcome.awaitingMarkPaid.length;
            toast.success(`${outcome.matched} of ${outcome.scanned} lines explained`, {
                description: [
                    outcome.differs ? `${outcome.differs} matched with a different amount` : null,
                    outcome.unmatched ? `${outcome.unmatched} left alone — no single safe candidate` : null,
                    waiting
                        ? `${waiting} ${waiting === 1 ? "is" : "are"} a paid withdrawal finance has not marked paid yet: ${outcome.awaitingMarkPaid
                              .map((row) => row.reference)
                              .join(", ")}`
                        : null,
                ]
                    .filter(Boolean)
                    .join(". "),
            });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "The auto-match could not run.");
        } finally {
            setBusy(null);
        }
    }

    /* Q125: one import's lines when one is chosen, else the desk's filters as they stand. */
    async function exportCsv() {
        setExporting(true);
        try {
            const { filename, bytes } = filters.importId
                ? await financeService.reconciliation.exportImport(filters.importId)
                : await financeService.reconciliation.exportLines({
                      bankAccountId: accountId || undefined,
                      status: filters.status === "all" ? undefined : [filters.status],
                      from: filters.from ? new Date(`${filters.from}T00:00:00.000`).toISOString() : undefined,
                      to: filters.to ? new Date(`${filters.to}T23:59:59.999`).toISOString() : undefined,
                  });
            toast.success(`Saved ${filename}`, {
                description: `${Math.max(1, Math.round(bytes / 1024))} KB · ${
                    filters.importId ? "every line of the chosen import" : "every line the filters match, 50,000 at most"
                }. The audit trail records the export.`,
            });
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "The export failed.");
        } finally {
            setExporting(false);
        }
    }

    async function unmatch() {
        if (!unmatching) return;
        setBusy("unmatch");
        try {
            await financeService.reconciliation.unmatch(unmatching.id);
            toast.success("Line unmatched", {
                description:
                    unmatching.match?.topUpId && isZeroMoney(unmatching.match.difference)
                        ? "The suspense settlement it posted has been reversed, not edited."
                        : "Back to unmatched; the record it named is free to explain another line.",
            });
            setUnmatching(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not unmatch that line.");
        } finally {
            setBusy(null);
        }
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title="Reconciliation"
                subtitle={
                    account
                        ? `Bank statement versus platform ledger, ${describeBankAccount(account)} · ${account.label}`
                        : accounts.length === 0
                          ? "Bank statement versus platform ledger. No ADX bank account is on file yet — add one under Settings before importing a statement."
                          : "Bank statement versus platform ledger, every account"
                }
                actions={
                    <>
                        <Button
                            variant="outline"
                            className="bg-card"
                            disabled={exporting || (filters.importId ? false : lines.total === 0)}
                            onClick={() => void exportCsv()}
                            title={filters.importId ? "Every line of the chosen import" : "Every line the filters match"}
                        >
                            <Download className="mr-1.5 size-4" />
                            {exporting ? "Exporting…" : "Export"}
                        </Button>
                        <Button
                            variant="outline"
                            className="bg-card"
                            disabled={accounts.length === 0}
                            onClick={() => setImporting(true)}
                        >
                            <Upload className="mr-1.5 size-4" />
                            Import statement
                        </Button>
                        <Button disabled={busy !== null || summary.UNMATCHED.count === 0} onClick={autoMatch}>
                            <Sparkles className="mr-1.5 size-4" />
                            {busy === "auto" ? "Matching…" : `Auto-match (${summary.UNMATCHED.count})`}
                        </Button>
                    </>
                }
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                    stat={{
                        id: "bank",
                        label: "Bank entries",
                        value: String(summary.total.count),
                        hint: `${formatMoney(summary.total.sum)} across the statement${filters.from || filters.to ? " in this period" : ""}`,
                    }}
                />
                <KpiCard
                    stat={{
                        id: "matched",
                        label: "Matched",
                        value: String(summary.MATCHED.count),
                        delta: matchRate === null ? undefined : `${matchRate}%`,
                        deltaTone: matchRate === null ? "neutral" : matchRate >= 80 ? "positive" : "neutral",
                        hint: matchRate === null ? "nothing imported yet" : `match rate · ${explained} explained`,
                    }}
                />
                <KpiCard
                    stat={{
                        id: "open",
                        label: "Needs attention",
                        value: String(needsAttention),
                        deltaTone: needsAttention ? "negative" : "neutral",
                        hint: `${summary.UNMATCHED.count} unmatched, ${summary.DIFFERS.count} ${summary.DIFFERS.count === 1 ? "differs" : "differ"}`,
                    }}
                />
                <KpiCard
                    stat={{
                        id: "value",
                        label: "Unreconciled value",
                        value: formatMoney(unreconciled),
                        hint: "across open items",
                    }}
                />
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <FilterChips<ReconChip>
                    value={filters.status}
                    onChange={(status) => set({ status })}
                    chips={[
                        { value: "all", label: "All", count: Object.values(counts).reduce((total, n) => total + n, 0) },
                        { value: "MATCHED", label: "Matched", count: counts.MATCHED ?? 0 },
                        { value: "UNMATCHED", label: "Unmatched", count: counts.UNMATCHED ?? 0 },
                        { value: "DIFFERS", label: "Amount differs", count: counts.DIFFERS ?? 0 },
                        { value: "IGNORED", label: "Ignored", count: counts.IGNORED ?? 0 },
                    ]}
                />
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Select
                        value={accountId || "ALL"}
                        onValueChange={(value) => set({ bankAccountId: value === "ALL" ? "" : value })}
                    >
                        <SelectTrigger aria-label="Bank account" className="h-8 w-56 bg-card">
                            <SelectValue placeholder="Bank account" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Every account</SelectItem>
                            {accounts.map((row) => (
                                <SelectItem key={row.id} value={row.id}>
                                    {row.label} · {describeBankAccount(row)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={filters.importId || "ALL"} onValueChange={(value) => set({ importId: value === "ALL" ? "" : value })}>
                        <SelectTrigger aria-label="Statement import" className="h-8 w-56 bg-card">
                            <SelectValue placeholder="Import" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Every import</SelectItem>
                            {imports.map((row) => (
                                <SelectItem key={row.id} value={row.id}>
                                    {row.fileName} · {formatDate(row.createdAt)} · {row.lineCount} {row.lineCount === 1 ? "line" : "lines"}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input
                        type="date"
                        aria-label="Value date from"
                        className="h-8 w-36 bg-card"
                        value={filters.from}
                        onChange={(event) => set({ from: event.target.value })}
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                        type="date"
                        aria-label="Value date to"
                        className="h-8 w-36 bg-card"
                        value={filters.to}
                        onChange={(event) => set({ to: event.target.value })}
                    />
                </div>
            </div>

            <Card className="overflow-hidden rounded-lg border-border shadow-none">
                <div className="grid grid-cols-[1fr_1fr_190px] border-b bg-muted/50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <div className="border-r px-5 py-2.5">Bank statement</div>
                    <div className="border-r px-5 py-2.5">Platform ledger</div>
                    <div className="px-5 py-2.5">Status</div>
                </div>
                {lines.items.length === 0 && (
                    <p className="px-5 py-12 text-center text-sm text-muted-foreground">
                        {summary.total.count === 0
                            ? "No statement has been imported for this account. Import one to start."
                            : "No line in this state."}
                    </p>
                )}
                {lines.items.map((line) => {
                    const record = describeMatch(line);
                    const differs = line.matchStatus === "DIFFERS";
                    return (
                        <div
                            key={line.id}
                            className="grid grid-cols-[1fr_1fr_190px] items-center border-b text-sm last:border-0"
                        >
                            <div className="border-r px-5 py-3.5">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="truncate font-medium text-foreground" title={line.description}>
                                            {line.description}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDate(line.valueDate)} · {line.direction === "DEBIT" ? "Debit" : "Credit"}
                                            {line.utr ? ` · UTR ${line.utr}` : ""}
                                        </p>
                                    </div>
                                    <span className="shrink-0 font-medium tabular-nums">
                                        {line.direction === "DEBIT" ? "−" : "+"}
                                        {formatMoney(line.amount)}
                                    </span>
                                </div>
                            </div>
                            <div className="border-r px-5 py-3.5">
                                {record && line.match ? (
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="min-w-0">
                                            <p className="font-medium text-foreground">{record.handle}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {record.kind} · {matchedBy(line.match)}
                                                {line.match.note ? ` · ${line.match.note}` : ""}
                                            </p>
                                        </div>
                                        <span className={cn("shrink-0 font-medium tabular-nums", differs && "text-warning")}>
                                            {formatMoney(record.amount)}
                                        </span>
                                    </div>
                                ) : line.matchStatus === "IGNORED" ? (
                                    <p className="text-xs text-muted-foreground/60">
                                        Set aside{line.match?.note ? ` — ${line.match.note}` : ""}
                                    </p>
                                ) : (
                                    <p className="text-xs text-muted-foreground/60">No ledger entry</p>
                                )}
                            </div>
                            <div className="flex items-center justify-between gap-2 px-5 py-3.5">
                                <StatusBadge status={BANK_LINE_STATUS_META[line.matchStatus]} />
                                {line.matchStatus === "UNMATCHED" ? (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => setResolving(line)}
                                    >
                                        Resolve
                                    </Button>
                                ) : (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => setUnmatching(line)}
                                    >
                                        Unmatch
                                    </Button>
                                )}
                            </div>
                        </div>
                    );
                })}
                {pages > 1 && (
                    <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
                        <span className="text-muted-foreground">
                            Page {lines.page} of {pages} · {lines.total} lines
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={lines.page <= 1}
                                onClick={() => onFiltersChange({ ...filters, page: filters.page - 1 })}
                            >
                                Previous
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={lines.page >= pages}
                                onClick={() => onFiltersChange({ ...filters, page: filters.page + 1 })}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                )}
            </Card>

            <ImportStatementDialog
                open={importing}
                onOpenChange={setImporting}
                accounts={accounts}
                profiles={profiles}
                defaultAccountId={accountId}
                onImported={onChanged}
            />

            <ResolveLineDialog
                line={resolving}
                onOpenChange={(open) => !open && setResolving(null)}
                onResolved={onChanged}
            />

            <ConfirmDialog
                open={unmatching !== null}
                onOpenChange={(next) => !next && setUnmatching(null)}
                title="Unmatch this line?"
                description={
                    unmatching?.matchStatus === "IGNORED"
                        ? "The line goes back to unmatched and the auto-matcher will look at it again."
                        : "The record it names is freed to explain another line. A top-up match that settled suspense is reversed with a mirrored posting, never edited."
                }
                confirmLabel="Unmatch"
                busy={busy === "unmatch"}
                onConfirm={unmatch}
            />
        </div>
    );
}
