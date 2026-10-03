"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
    AlertCircle,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Download,
    Loader2,
    RotateCcw,
    Search,
    TriangleAlert,
    X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DataTable } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatDateTime, formatMoney, formatNumber, isZeroMoney, sumMoney } from "@/lib/format";
import {
    LEDGER_KIND_LABEL,
    WALLET_KIND_LABEL,
    financeService,
    shortId,
    type LedgerFilter,
    type LedgerHealth,
    type LedgerPage,
    type LedgerPageRow,
    type LedgerTransactionKind,
    type WalletRow,
} from "@/services/finance";
import type { StatusMeta } from "@/types";
import { LEDGER_PAGE_SIZES, ledgerFiltersActive, type LedgerFilters } from "./ledger-filters";

interface LedgerViewProps {
    /** The page on screen; null until the first read answers. */
    page: LedgerPage | null;
    health: LedgerHealth | null;
    /** A read is in flight — the first, or a refetch under the rows on screen. */
    loading: boolean;
    error: string | null;
    onRetry: () => void;
    wallets: WalletRow[];
    filters: LedgerFilters;
    /** The filters as they were last sent — what Export files. */
    query: LedgerFilter;
    onFiltersChange: (patch: Partial<LedgerFilters>) => void;
    onClear: () => void;
    pageSize: number;
    onPageSizeChange: (size: number) => void;
    /** 0-based: how many pages back from the newest. */
    pageIndex: number;
    canPrevious: boolean;
    canNext: boolean;
    onPrevious: () => void;
    onNext: () => void;
    onChanged: () => void;
}

/**
 * The books.
 *
 * Every movement of money on ADX is a transaction whose legs sum to zero: a
 * wallet account is signed from the party's point of view, `platform:payables`
 * is its mirror. That invariant is the only reason anyone can trust a balance,
 * so a row opens onto its legs rather than summarising them — a screen that
 * shows only the amount cannot be used to find out why the amount is wrong.
 *
 * Nothing here deletes. A posting that should not have been made is corrected
 * by a REVERSAL, which is a fresh transaction mirroring the original, and the
 * backend refuses to reverse a reversal or to reverse anything twice. That is
 * why "Reverse" asks for a reason and produces a new row rather than removing
 * one.
 */

const KIND_TONE: Record<string, StatusMeta["tone"]> = {
    REVERSAL: "danger",
    PAYOUT: "info",
    PUBLISHER_EARNING: "success",
    AGENT_INCENTIVE: "success",
    PENALTY: "warning",
    EXPIRY: "warning",
    ADJUSTMENT: "warning",
};

const LEDGER_KINDS = Object.keys(LEDGER_KIND_LABEL) as LedgerTransactionKind[];

const transactions = (count: number) => `${formatNumber(count)} ${count === 1 ? "transaction" : "transactions"}`;

/**
 * The health check, told straight.
 *
 * Green only when the backend says `healthy`. When it does not, the two failure
 * modes are named separately because they mean different things: an unbalanced
 * transaction is a bug in whatever posted it, and wallet drift is a balance
 * that no longer matches the legs behind it. Both name the row so somebody can
 * go and look.
 */
function HealthPanel({ health }: { health: LedgerHealth }) {
    if (health.healthy) {
        return (
            <Card className="rounded-lg border-success/40 bg-success-soft p-4 shadow-none">
                <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    <div>
                        <p className="text-sm font-medium text-foreground">The books balance</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Every transaction&rsquo;s legs sum to zero, and every wallet balance agrees
                            with its ledger account.
                        </p>
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <Card className="rounded-lg border-danger/40 bg-danger-soft p-4 shadow-none">
            <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                <div className="min-w-0 space-y-3">
                    <div>
                        <p className="text-sm font-medium text-foreground">The books do not balance</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Until this is cleared, no balance on any finance screen can be relied on.
                        </p>
                    </div>

                    {health.unbalanced.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {health.unbalanced.length} unbalanced{" "}
                                {health.unbalanced.length === 1 ? "transaction" : "transactions"}
                            </p>
                            <ul className="mt-1.5 space-y-1">
                                {health.unbalanced.map((row) => (
                                    <li key={row.transactionId} className="text-sm text-foreground">
                                        <span className="font-mono text-xs">{row.transactionId}</span> — legs
                                        sum to{" "}
                                        <span className="font-medium tabular-nums">
                                            {formatMoney(row.total)}
                                        </span>{" "}
                                        instead of zero
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {health.drift.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {health.drift.length}{" "}
                                {health.drift.length === 1 ? "wallet has" : "wallets have"} drifted from
                                the ledger
                            </p>
                            <ul className="mt-1.5 space-y-1">
                                {health.drift.map((row) => (
                                    <li key={row.walletId} className="text-sm text-foreground">
                                        <Link
                                            href={`/finance/wallets/${row.walletId}`}
                                            className="font-medium underline underline-offset-2"
                                        >
                                            {shortId(row.walletId, "WLT-")}
                                        </Link>{" "}
                                        — wallet says{" "}
                                        <span className="tabular-nums">{formatMoney(row.walletTotal)}</span>,
                                        the ledger says{" "}
                                        <span className="tabular-nums">{formatMoney(row.ledgerTotal)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );
}

/**
 * "₹4,82,500.00 debited across 548 transactions" — said once, because by
 * double entry the credits are the same figure. If they ever are not, the
 * line says so in the danger tone rather than quietly picking one side.
 */
export function TotalsLine({ page }: { page: LedgerPage }) {
    const { debit, credit } = page.totals;
    const difference = sumMoney([debit, `-${credit}`]);
    if (!isZeroMoney(difference)) {
        return (
            <p className="flex items-center gap-1.5 text-sm font-medium text-danger" role="alert">
                <TriangleAlert className="size-4 shrink-0" aria-hidden />
                {formatMoney(debit)} debited but {formatMoney(credit)} credited across{" "}
                {transactions(page.total)} — these should be equal, so something here does not balance.
            </p>
        );
    }
    return (
        <p className="text-sm text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{formatMoney(debit)}</span> debited across{" "}
            {transactions(page.total)}
        </p>
    );
}

/** The kinds as a multi-pick — a menu of ticks, so the bar keeps one row height whatever is chosen. */
function KindPicker({ value, onChange }: { value: LedgerTransactionKind[]; onChange: (next: LedgerTransactionKind[]) => void }) {
    const label =
        value.length === 0
            ? "Every kind"
            : value.length === 1
              ? LEDGER_KIND_LABEL[value[0]!]
              : `${value.length} kinds`;
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 w-[170px] justify-between bg-card font-normal" aria-label="Kind">
                    <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>{label}</span>
                    <ChevronDown className="ml-1.5 size-3.5 shrink-0 opacity-60" aria-hidden />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
                {LEDGER_KINDS.map((kind) => (
                    <DropdownMenuCheckboxItem
                        key={kind}
                        checked={value.includes(kind)}
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={(checked) =>
                            onChange(checked ? [...value, kind] : value.filter((candidate) => candidate !== kind))
                        }
                    >
                        {LEDGER_KIND_LABEL[kind]}
                    </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/** A transaction's legs, debit and credit per account, and the way to reverse it. */
function Legs({ transaction, onReverse }: { transaction: LedgerPageRow; onReverse: (row: LedgerPageRow) => void }) {
    /* Displayed rather than trusted: if this is not zero the transaction is one
       of the unbalanced ones in the banner, and the row should say so where
       somebody is actually looking. */
    const legSum = sumMoney(transaction.legs.map((leg) => leg.amount));
    const balanced = isZeroMoney(legSum);
    const isReversal = transaction.kind === "REVERSAL";

    return (
        <div className="space-y-3 rounded-md border bg-card p-3">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                        <th className="px-3 py-2">Account</th>
                        <th className="px-3 py-2">Note</th>
                        <th className="px-3 py-2 text-right">Debit</th>
                        <th className="px-3 py-2 text-right">Credit</th>
                    </tr>
                </thead>
                <tbody>
                    {transaction.legs.map((leg, index) => {
                        const debit = leg.amount.trimStart().startsWith("-");
                        return (
                            <tr key={`${transaction.id}:${leg.accountCode}:${index}`} className="border-b last:border-0">
                                <td className="px-3 py-2">
                                    <p className="font-medium text-foreground">{leg.accountName}</p>
                                    <p className="font-mono text-xs text-muted-foreground">{leg.accountCode}</p>
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">{leg.note ?? "—"}</td>
                                <td className="px-3 py-2 text-right font-medium tabular-nums text-danger">
                                    {debit ? formatMoney(leg.amount.trimStart().slice(1)) : ""}
                                </td>
                                <td className="px-3 py-2 text-right font-medium tabular-nums text-success">
                                    {debit ? "" : formatMoney(leg.amount)}
                                </td>
                            </tr>
                        );
                    })}
                    {!balanced && (
                        <tr className="bg-danger-soft">
                            <td className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-danger" colSpan={2}>
                                Legs sum to
                            </td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-danger" colSpan={2}>
                                {formatMoney(legSum)}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                    {isReversal
                        ? `Reverses ${transaction.reversesReference ?? "an earlier transaction"}. A reversal cannot itself be reversed — post a fresh correcting entry instead.`
                        : transaction.reversedBy
                          ? `Already reversed by ${transaction.reversedBy.reference}. A transaction can only be reversed once.`
                          : "Reversing posts a mirrored transaction. The original stays on the record."}
                </p>
                {!isReversal && !transaction.reversedBy && (
                    <Button
                        size="sm"
                        variant="outline"
                        className="bg-card text-danger hover:text-danger"
                        onClick={() => onReverse(transaction)}
                    >
                        <RotateCcw className="mr-1.5 size-4" />
                        Reverse
                    </Button>
                )}
            </div>
        </div>
    );
}

export function LedgerView({
    page,
    health,
    loading,
    error,
    onRetry,
    wallets,
    filters,
    query,
    onFiltersChange,
    onClear,
    pageSize,
    onPageSizeChange,
    pageIndex,
    canPrevious,
    canNext,
    onPrevious,
    onNext,
    onChanged,
}: LedgerViewProps) {
    const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
    const [reversing, setReversing] = React.useState<LedgerPageRow | null>(null);
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [exporting, setExporting] = React.useState(false);

    async function confirmReverse() {
        if (!reversing || !reason.trim()) return;
        setBusy(true);
        try {
            const created = await financeService.reverseTransaction(reversing.id, reason.trim());
            toast.success(`${reversing.reference} reversed`, {
                description: `Posted as ${created.reference}. The original stays on the record.`,
            });
            setReversing(null);
            setReason("");
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not reverse that transaction.");
        } finally {
            setBusy(false);
        }
    }

    async function exportCsv() {
        setExporting(true);
        try {
            const { filename, bytes } = await financeService.exportLedger(query);
            toast.success(`Saved ${filename}`, {
                description: `${Math.max(1, Math.round(bytes / 1024))} KB · one line per leg for every transaction the filters match. The audit trail records the export.`,
            });
        } catch (cause) {
            // A 422 carries the server's sentence: too many lines for one file, and how to narrow it.
            toast.error(cause instanceof ApiError ? cause.message : "The export failed. Try again in a moment.");
        } finally {
            setExporting(false);
        }
    }

    const toggle = React.useCallback((row: LedgerPageRow) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(row.id)) next.delete(row.id);
            else next.add(row.id);
            return next;
        });
    }, []);

    const walletItems = React.useMemo(
        () => [
            { label: "Every wallet", value: "", description: "The whole book" },
            ...wallets.map((wallet) => ({
                label: wallet.owner,
                value: wallet.id,
                description: `${WALLET_KIND_LABEL[wallet.kind]} · ${wallet.displayId ?? shortId(wallet.id, "WLT-")}`,
                group: WALLET_KIND_LABEL[wallet.kind],
            })),
        ],
        [wallets]
    );

    const columns = React.useMemo<ColumnDef<LedgerPageRow>[]>(
        () => [
            {
                id: "reference",
                accessorKey: "reference",
                header: "Reference",
                enableHiding: false,
                cell: ({ row }) => (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-xs font-medium text-foreground">
                        {expanded.has(row.original.id) ? (
                            <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
                        ) : (
                            <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                        )}
                        {row.original.reference}
                    </span>
                ),
            },
            {
                id: "kind",
                accessorKey: "kind",
                header: "Kind",
                cell: ({ row }) => (
                    <StatusBadge
                        status={{
                            label: LEDGER_KIND_LABEL[row.original.kind] ?? row.original.kind,
                            tone: KIND_TONE[row.original.kind] ?? "neutral",
                        }}
                    />
                ),
            },
            {
                id: "date",
                accessorKey: "occurredAt",
                header: "Date",
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.occurredAt)}</span>
                ),
            },
            {
                id: "description",
                accessorKey: "note",
                header: "Description",
                cell: ({ row }) => (
                    <span className="line-clamp-2 max-w-[360px] text-muted-foreground">{row.original.note ?? "—"}</span>
                ),
            },
            {
                id: "amount",
                accessorKey: "debit",
                header: () => <span className="block text-right">Amount</span>,
                cell: ({ row }) => (
                    <span className="block whitespace-nowrap text-right font-medium tabular-nums text-foreground">
                        {formatMoney(row.original.debit)}
                    </span>
                ),
            },
            {
                id: "reversal",
                header: "Reversal",
                cell: ({ row }) => {
                    const legSum = sumMoney(row.original.legs.map((leg) => leg.amount));
                    return (
                        <div className="flex flex-wrap gap-1.5">
                            {row.original.reversedBy && (
                                <StatusBadge status={{ label: `Reversed by ${row.original.reversedBy.reference}`, tone: "warning" }} />
                            )}
                            {row.original.kind === "REVERSAL" && (
                                <StatusBadge
                                    status={{
                                        label: row.original.reversesReference ? `Reverses ${row.original.reversesReference}` : "Reverses an earlier one",
                                        tone: "neutral",
                                    }}
                                />
                            )}
                            {!isZeroMoney(legSum) && (
                                <StatusBadge status={{ label: `Off by ${formatMoney(legSum)}`, tone: "danger" }} />
                            )}
                        </div>
                    );
                },
            },
        ],
        [expanded]
    );

    const total = page?.total ?? 0;
    const shown = page?.rows.length ?? 0;
    const from = shown === 0 ? 0 : pageIndex * pageSize + 1;
    const to = pageIndex * pageSize + shown;
    const filtering = ledgerFiltersActive(filters);

    const toolbar = (
        <>
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                    value={filters.q}
                    onChange={(event) => onFiltersChange({ q: event.target.value })}
                    placeholder="Search reference or description"
                    aria-label="Search"
                    className="h-9 w-[260px] bg-card pl-8"
                />
            </div>
            <Combobox
                id="ledger-wallet"
                items={walletItems}
                value={filters.walletId}
                onValueChange={(walletId) => onFiltersChange({ walletId })}
                placeholder="Every wallet"
                searchPlaceholder="Search parties…"
                emptyText="No wallet matches that."
                className="h-9 w-[200px] bg-card"
            />
            <KindPicker value={filters.kind} onChange={(kind) => onFiltersChange({ kind })} />
            <Input
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(event) => onFiltersChange({ from: event.target.value })}
                aria-label="From date"
                title="From"
                className="h-9 w-[150px] bg-card"
            />
            <Input
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(event) => onFiltersChange({ to: event.target.value })}
                aria-label="To date"
                title="To"
                className="h-9 w-[150px] bg-card"
            />
            <Input
                value={filters.amount}
                inputMode="decimal"
                onChange={(event) => onFiltersChange({ amount: event.target.value })}
                placeholder="Amount ₹"
                aria-label="Amount"
                className="h-9 w-[120px] bg-card"
            />
            {filtering && (
                <Button variant="ghost" size="sm" className="h-9" onClick={onClear}>
                    <X className="mr-1 size-3.5" aria-hidden />
                    Clear
                </Button>
            )}
            {loading && page && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />}
        </>
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="Ledger"
                subtitle="Every movement of money on ADX, recorded on both sides — where it left and where it arrived. Nothing is ever edited or deleted; a mistake is put right with a reversal."
                actions={
                    <Button
                        variant="outline"
                        className="bg-card"
                        disabled={exporting || !page || total === 0}
                        onClick={() => void exportCsv()}
                        title="One line per leg, for every transaction the filters match"
                    >
                        {exporting ? (
                            <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
                        ) : (
                            <Download className="mr-1.5 size-4" aria-hidden />
                        )}
                        {exporting ? "Exporting…" : "Export CSV"}
                    </Button>
                }
            />

            {health && <HealthPanel health={health} />}

            {error && (
                <Card className="rounded-lg border-danger/40 bg-danger-soft p-5 shadow-none">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">Could not load the ledger</p>
                            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                            <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
                                Try again
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {!page && loading ? (
                <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Loading…
                </div>
            ) : (
                <DataTable
                    columns={columns}
                    data={page?.rows ?? []}
                    toolbar={toolbar}
                    showPagination={false}
                    getRowId={(row) => row.id}
                    onRowClick={toggle}
                    isRowExpanded={(row) => expanded.has(row.id)}
                    renderExpanded={(row) => (
                        <Legs
                            transaction={row}
                            onReverse={(transaction) => {
                                setReason("");
                                setReversing(transaction);
                            }}
                        />
                    )}
                    aboveTable={page && page.total > 0 ? <TotalsLine page={page} /> : null}
                    emptyState={
                        <EmptyState
                            icon={RotateCcw}
                            title={filtering ? "No transaction matches" : "Nothing posted"}
                            description={
                                filtering
                                    ? "Clear a filter or widen the dates to see more of the book."
                                    : "The ledger is empty. It fills the first time money moves anywhere on ADX."
                            }
                        />
                    }
                />
            )}

            {page && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        Rows per page
                        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
                            <SelectTrigger className="h-8 w-[76px] bg-card" aria-label="Rows per page">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent side="top">
                                {LEDGER_PAGE_SIZES.map((size) => (
                                    <SelectItem key={size} value={String(size)}>
                                        {size}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">
                            Showing {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <Button variant="outline" size="sm" className="h-8 bg-card" onClick={onPrevious} disabled={!canPrevious}>
                                Previous
                            </Button>
                            <span className="flex h-8 min-w-8 items-center justify-center rounded-md border bg-card px-2 text-sm text-foreground">
                                {pageIndex + 1}
                            </span>
                            <Button variant="outline" size="sm" className="h-8 bg-card" onClick={onNext} disabled={!canNext}>
                                Next
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={reversing !== null}
                onOpenChange={(open) => !open && setReversing(null)}
                title={`Reverse ${reversing?.reference ?? "this transaction"}?`}
                description="A mirrored transaction is posted against the same accounts. The original is untouched — this is how the ledger corrects itself, and it cannot be undone by deleting anything."
                confirmLabel="Post the reversal"
                destructive
                busy={busy}
                disabled={!reason.trim()}
                onConfirm={confirmReverse}
            >
                <div className="space-y-1.5">
                    <Label htmlFor="reversal-reason">Reason</Label>
                    <Textarea
                        id="reversal-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={3}
                        placeholder="Why this posting should not stand. It is written onto the reversal."
                    />
                    <p className="text-xs text-muted-foreground">Required — anyone reading the books later will see it.</p>
                </div>
            </ConfirmDialog>
        </div>
    );
}
