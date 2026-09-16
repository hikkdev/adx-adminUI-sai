"use client";

import * as React from "react";
import Link from "next/link";
import { Ban, Banknote, Check, Search, X } from "lucide-react";
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
import { FilterChips } from "@/components/adx/filter-chips";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { FieldList } from "@/components/adx/simple-table";
import { ApiError } from "@/lib/api-client";
import { compareMoney, formatDate, formatMoney, formatPct, isZeroMoney } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { useNow } from "@/lib/use-now";
import {
    PARTY_KIND_LABEL,
    PAYOUT_PARTY_KINDS,
    RAIL_LABEL,
    SIZE_BAND_LABEL,
    WALLET_KIND_LABEL,
    WITHDRAWAL_STATUS_META,
    beneficiaryOf,
    describeMethod,
    financeService,
    type PayoutPartyKind,
    type PayoutRailName,
    type RailStatus,
    type WalletDetail,
    type Withdrawal,
    type WithdrawalStatus,
    type WithdrawalSummary,
} from "@/services/finance";
import type { StatusMeta } from "@/types";

/** The four server-side facets. Empty strings mean "not set"; the loader turns them into the query. */
export interface QueueFilters {
    q: string;
    partyKind: PayoutPartyKind | "";
    /** `date` input values, yyyy-mm-dd. */
    from: string;
    to: string;
}

interface WithdrawalsViewProps {
    withdrawals: Withdrawal[];
    rails: RailStatus[];
    summary: WithdrawalSummary;
    batchReferences: Record<string, string>;
    filters: QueueFilters;
    onFiltersChange: (next: QueueFilters) => void;
    onChanged: () => void;
}

/**
 * The DR 10 withdrawal queue, on the real API.
 *
 * The frame is unchanged — requests down the left, the case on the right, the
 * decision at the top of it — and everything in it now comes from
 * `/finance/withdrawals` and `/finance/wallets/:id`. Three things the frame
 * drew as fixtures had to become true rather than invented:
 *
 * • The **risk checks** are not a score somebody made up. They are the same
 *   guardrails `requestWithdrawal` enforces, re-run here against the request as
 *   it stands, so an approver sees the arithmetic the platform saw.
 * • The **context figures** are the wallet's own snapshot and allowance —
 *   cleared, pending, held, the daily cap and the rung above it.
 * • The **history** is that wallet's last twenty withdrawals, not a sample.
 *
 * And two rules the client settled are stated on the screen rather than
 * implied: nothing is auto-approved at any amount, and a withdrawal deducts no
 * tax because TDS was already withheld when the income was credited.
 *
 * Lot B (Q140) changed what approval means, and the copy says so: approving
 * **reserves** the amount in the wallet and moves nothing; a payout batch's
 * release is what debits it, and mark-paid is what closes it. A row carries
 * the batch that claimed it, the header carries how many transfers the rail
 * has held for more than a day, and the queue can be searched and narrowed
 * by party kind and by when it was asked for.
 */

/** The four decisions an admin can take, and what each one needs typed first. */
type Action = "approve" | "reject" | "mark-paid" | "fail";

type Filter = "open" | "paid" | "closed" | "all";

const FILTERS: Record<Filter, WithdrawalStatus[] | null> = {
    open: ["REQUESTED", "APPROVED", "PROCESSING"],
    paid: ["PAID"],
    closed: ["REJECTED", "FAILED", "CANCELLED"],
    all: null,
};

type CheckResult = "pass" | "fail" | "manual";

const CHECK_META: Record<CheckResult, StatusMeta> = {
    pass: { label: "Pass", tone: "success" },
    fail: { label: "Fail", tone: "danger" },
    manual: { label: "Review", tone: "warning" },
};

const CHECK_DOT: Record<CheckResult, string> = {
    pass: "bg-success",
    fail: "bg-danger",
    manual: "bg-warning",
};

/** How long ago, in the coarse units a queue actually reads in. */
function ago(iso: string, now: number): string {
    if (!now) return "";
    const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}

/**
 * Which buttons a request in this state offers, and in which order.
 *
 * An APPROVED line is reserved, not debited, so it is *rejected* rather than
 * failed — there is nothing to reverse. It can still be paid by hand (the
 * debit happens first). Only a PROCESSING line, already with the rail, can
 * bounce.
 */
function actionsFor(status: WithdrawalStatus): Action[] {
    if (status === "REQUESTED") return ["reject", "approve"];
    if (status === "APPROVED") return ["reject", "mark-paid"];
    if (status === "PROCESSING") return ["fail", "mark-paid"];
    return [];
}

export function WithdrawalsView({
    withdrawals,
    rails,
    summary,
    batchReferences,
    filters,
    onFiltersChange,
    onChanged,
}: WithdrawalsViewProps) {
    // Null until hydration; ages wait for the clock rather than guessing.
    const now = useNow() ?? 0;
    const [filter, setFilter] = React.useState<Filter>("open");
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [action, setAction] = React.useState<Action | null>(null);
    const [note, setNote] = React.useState("");
    const [rail, setRail] = React.useState<PayoutRailName | "">("");
    const [busy, setBusy] = React.useState(false);

    const counts = React.useMemo(
        () =>
            (Object.keys(FILTERS) as Filter[]).reduce<Record<Filter, number>>(
                (acc, key) => {
                    const statuses = FILTERS[key];
                    acc[key] = statuses
                        ? withdrawals.filter((row) => statuses.includes(row.status)).length
                        : withdrawals.length;
                    return acc;
                },
                { open: 0, paid: 0, closed: 0, all: 0 }
            ),
        [withdrawals]
    );

    const visible = React.useMemo(() => {
        const statuses = FILTERS[filter];
        const rows = statuses ? withdrawals.filter((row) => statuses.includes(row.status)) : withdrawals;
        // Oldest first while a queue is open — the person who has waited longest
        // is the one to reach next. Newest first once decided, because a settled
        // list is read as a record rather than worked through.
        const oldestFirst = filter === "open";
        return [...rows].sort((a, b) => {
            const delta = new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime();
            return oldestFirst ? delta : -delta;
        });
    }, [withdrawals, filter]);

    /* Kept inside the current filter on purpose: selecting a row, switching to
       another queue and still seeing the old row on the right reads as a bug. */
    const selected = visible.find((row) => row.id === selectedId) ?? visible[0] ?? null;

    /* The party behind the request. The queue endpoint joins the wallet id and
       nothing else, so the context, the allowance and the history come from the
       wallet — one extra request, and only for the row being looked at. */
    const walletResource = useApiResource<WalletDetail | null>(
        `finance:wallet:${selected?.walletId ?? "none"}`,
        () => (selected ? financeService.wallet(selected.walletId) : Promise.resolve(null))
    );
    const wallet = walletResource.data ?? null;

    const awaiting = counts.open;
    const stale = summary.processingOver24h;
    const filtering = Boolean(filters.q.trim() || filters.partyKind || filters.from || filters.to);

    /* The rail the approve dialog offers. Unconfigured vendors are listed and
       disabled rather than hidden, because "Razorpay X needs credentials" is a
       more useful thing to learn here than an absence. */
    const configuredRails = rails.filter((row) => row.configured);

    function open(next: Action) {
        setNote("");
        setRail("");
        setAction(next);
    }

    const needsText = action === "reject" || action === "fail" || action === "mark-paid";

    async function confirm() {
        if (!selected || !action) return;
        const text = note.trim();
        if (needsText && !text) return;

        setBusy(true);
        try {
            if (action === "approve") {
                await financeService.approveWithdrawal(selected.id, {
                    ...(text ? { note: text } : {}),
                    ...(rail ? { rail: rail as PayoutRailName } : {}),
                });
                toast.success(`${selected.reference} approved`, {
                    description: `${formatMoney(selected.netAmount)} reserved in the wallet. A payout batch releases it; nothing has moved yet.`,
                });
            } else if (action === "reject") {
                await financeService.rejectWithdrawal(selected.id, text);
                toast.success(`${selected.reference} rejected`, {
                    description: "Nothing left the wallet; the amount is available again.",
                });
            } else if (action === "mark-paid") {
                await financeService.markWithdrawalPaid(selected.id, text);
                toast.success(`${selected.reference} marked paid`, {
                    description: `UTR ${text} recorded against the transfer.`,
                });
            } else {
                await financeService.failWithdrawal(selected.id, text);
                toast.success(`${selected.reference} marked failed`, {
                    description: "The money has been returned to the wallet.",
                });
            }
            setAction(null);
            setNote("");
            onChanged();
            walletResource.reload();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not record that decision.");
        } finally {
            setBusy(false);
        }
    }

    /**
     * The guardrails, re-run.
     *
     * Every one of these is a rule the backend enforces on the way in, checked
     * again here against the request as it stands now — a cap that was clear
     * yesterday may not be clear today. Where the platform has not been told
     * something (a name match nobody ran), the check says "review" rather than
     * inventing a pass.
     */
    const checks: { label: string; detail: string; result: CheckResult }[] = React.useMemo(() => {
        if (!selected) return [];
        const method = selected.method;
        const allowance = wallet?.allowance ?? null;

        const rows: { label: string; detail: string; result: CheckResult }[] = [
            {
                label: "Payout method verified",
                detail:
                    method.status === "VERIFIED"
                        ? `${describeMethod(method)}, proved ${
                              method.verifiedVia ? method.verifiedVia.toLowerCase().replace("_", " ") : "manually"
                          }`
                        : method.status === "REJECTED"
                          ? method.rejectionReason ?? "This account was rejected."
                          : "Still in the verification queue.",
                result:
                    method.status === "VERIFIED"
                        ? "pass"
                        : method.status === "REJECTED"
                          ? "fail"
                          : "manual",
            },
            {
                label: "Name on the account",
                detail:
                    method.nameMatchPct === null
                        ? "No name match has been run against this account."
                        : `${formatPct(method.nameMatchPct)} match with the KYC name.`,
                result:
                    method.nameMatchPct === null
                        ? "manual"
                        : // 90% and over reads as a match; below it, look again.
                          compareMoney(method.nameMatchPct, "90") >= 0
                          ? "pass"
                          : "manual",
            },
        ];

        if (allowance) {
            rows.push(
                {
                    label: "Cleared funds cover it",
                    detail: `${formatMoney(allowance.withdrawable)} has cleared; ${formatMoney(
                        allowance.pendingClearance
                    )} is still inside its seven-day window.`,
                    result: compareMoney(selected.amount, allowance.withdrawable) <= 0 ? "pass" : "fail",
                },
                {
                    label: "Within today's cap",
                    detail: `${formatMoney(allowance.remainingToday)} left of a ${formatMoney(
                        allowance.dailyCap
                    )} daily cap; ${formatMoney(allowance.usedToday)} used today.`,
                    result: compareMoney(selected.amount, allowance.remainingToday) <= 0 ? "pass" : "fail",
                },
                {
                    label: "Above the floor",
                    detail: `The smallest withdrawal ADX accepts is ${formatMoney(allowance.minimum)}.`,
                    result: compareMoney(selected.amount, allowance.minimum) >= 0 ? "pass" : "fail",
                }
            );
        } else if (!walletResource.loading) {
            rows.push({
                label: "Wallet limits",
                detail: "This wallet has no party record, so no ladder applies to it.",
                result: "manual",
            });
        }

        return rows;
    }, [selected, wallet, walletResource.loading]);

    const failing = checks.filter((check) => check.result === "fail").length;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Withdrawal approvals"
                subtitle={`${awaiting} ${awaiting === 1 ? "request" : "requests"} open${
                    filtering ? " in this view" : ""
                }. Nothing is auto-approved — a person vets every one, whatever the amount. Approval reserves; a batch's release pays.`}
                actions={
                    stale > 0 ? (
                        <StatusBadge
                            status={{
                                label: `${stale} with the rail for over 24h`,
                                tone: "warning",
                            }}
                        />
                    ) : undefined
                }
            />

            {/* E6: the queue's three sums off `GET /finance/withdrawals/summary`,
                the whole queue's rather than this view's. */}
            <div className="grid gap-4 sm:grid-cols-3">
                <KpiCard
                    stat={{
                        id: "reserved",
                        label: "Reserved in wallets",
                        value: formatMoney(summary.reservedTotal),
                        hint: "Gross of requested and approved",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "processing",
                        label: "With the rail",
                        value: formatMoney(summary.processingTotal),
                        hint: stale > 0 ? `${stale} held over 24h` : "Net, in transit",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "paid",
                        label: "Paid this month",
                        value: formatMoney(summary.paidThisMonth),
                        hint: "Net, IST calendar month",
                    }}
                />
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <FilterChips<Filter>
                    value={filter}
                    onChange={setFilter}
                    chips={[
                        { value: "open", label: "Open", count: counts.open },
                        { value: "paid", label: "Paid", count: counts.paid },
                        { value: "closed", label: "Closed", count: counts.closed },
                        { value: "all", label: "All", count: counts.all },
                    ]}
                />
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            aria-label="Search the queue"
                            className="h-8 w-56 bg-card pl-8"
                            placeholder="Reference, UTR or name"
                            value={filters.q}
                            onChange={(event) => onFiltersChange({ ...filters, q: event.target.value })}
                        />
                    </div>
                    <Select
                        value={filters.partyKind || "ANY"}
                        onValueChange={(value) =>
                            onFiltersChange({ ...filters, partyKind: value === "ANY" ? "" : (value as PayoutPartyKind) })
                        }
                    >
                        <SelectTrigger aria-label="Party kind" className="h-8 w-40 bg-card">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ANY">Every party</SelectItem>
                            {PAYOUT_PARTY_KINDS.map((kind) => (
                                <SelectItem key={kind} value={kind}>
                                    {PARTY_KIND_LABEL[kind]}s
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input
                        type="date"
                        aria-label="Requested from"
                        className="h-8 w-36 bg-card"
                        value={filters.from}
                        onChange={(event) => onFiltersChange({ ...filters, from: event.target.value })}
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                        type="date"
                        aria-label="Requested to"
                        className="h-8 w-36 bg-card"
                        value={filters.to}
                        onChange={(event) => onFiltersChange({ ...filters, to: event.target.value })}
                    />
                    {filtering && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => onFiltersChange({ q: "", partyKind: "", from: "", to: "" })}
                        >
                            Clear
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                {/* Master list */}
                <Card className="overflow-hidden rounded-lg border-border shadow-none">
                    {visible.length === 0 ? (
                        <p className="px-5 py-16 text-center text-sm text-muted-foreground">
                            Nothing in this queue.
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {visible.map((withdrawal) => {
                                const active = withdrawal.id === selected?.id;
                                const who = beneficiaryOf(withdrawal);
                                return (
                                    <li key={withdrawal.id}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedId(withdrawal.id)}
                                            className={cn(
                                                "w-full px-4 py-3.5 text-left transition-colors",
                                                active ? "bg-primary/[0.04]" : "hover:bg-muted/50"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <InitialsAvatar name={who} size="md" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="truncate text-sm font-medium text-foreground">
                                                            {who}
                                                        </p>
                                                        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                                                            {formatMoney(withdrawal.amount)}
                                                        </span>
                                                    </div>
                                                    <div className="mt-0.5 flex items-center justify-between gap-2">
                                                        <p className="truncate text-xs text-muted-foreground">
                                                            {withdrawal.reference} · {PARTY_KIND_LABEL[withdrawal.partyKind]} ·{" "}
                                                            {ago(withdrawal.requestedAt, now)}
                                                            {withdrawal.batchId
                                                                ? ` · ${batchReferences[withdrawal.batchId] ?? "batched"}`
                                                                : ""}
                                                        </p>
                                                        <StatusBadge
                                                            status={WITHDRAWAL_STATUS_META[withdrawal.status]}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Card>

                {/* Detail pane */}
                {selected && (
                    <div className="space-y-4 xl:col-span-2">
                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <h2 className="text-lg font-semibold text-foreground">
                                        {wallet?.party?.name ?? beneficiaryOf(selected)}
                                    </h2>
                                    <p className="mt-0.5 text-sm text-muted-foreground">
                                        {wallet?.party
                                            ? [
                                                  WALLET_KIND_LABEL[wallet.party.kind],
                                                  SIZE_BAND_LABEL[wallet.party.sizeBand],
                                                  wallet.allowance
                                                      ? `${wallet.allowance.monthsOnPlatform} months on ADX`
                                                      : null,
                                              ]
                                                  .filter(Boolean)
                                                  .join(" · ")
                                            : selected.reference}
                                    </p>
                                    <p className="mt-3 text-metric tabular-nums text-foreground">
                                        {formatMoney(selected.amount)}
                                    </p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        to {describeMethod(selected.method)}
                                        {selected.method.accountHolder
                                            ? ` · ${selected.method.accountHolder}`
                                            : ""}
                                    </p>
                                    {/* The rule, stated rather than implied. The columns to
                                        withhold at payout exist and are zero on purpose. */}
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        {isZeroMoney(selected.taxWithheld)
                                            ? "No tax is deducted here — TDS was withheld when the income was credited, so the net equals the gross."
                                            : `${formatMoney(selected.taxWithheld)} withheld at payout; ${formatMoney(selected.netAmount)} net.`}
                                    </p>
                                </div>

                                <div className="flex shrink-0 flex-col items-end gap-2">
                                    <StatusBadge status={WITHDRAWAL_STATUS_META[selected.status]} />
                                    <div className="flex items-center gap-2">
                                        {actionsFor(selected.status).map((next) =>
                                            next === "reject" ? (
                                                <Button
                                                    key={next}
                                                    variant="outline"
                                                    className="bg-card text-danger hover:text-danger"
                                                    onClick={() => open("reject")}
                                                >
                                                    <X className="mr-1.5 size-4" />
                                                    Reject
                                                </Button>
                                            ) : next === "approve" ? (
                                                <Button key={next} onClick={() => open("approve")}>
                                                    <Check className="mr-1.5 size-4" />
                                                    Approve payout
                                                </Button>
                                            ) : next === "fail" ? (
                                                <Button
                                                    key={next}
                                                    variant="outline"
                                                    className="bg-card text-danger hover:text-danger"
                                                    onClick={() => open("fail")}
                                                >
                                                    <Ban className="mr-1.5 size-4" />
                                                    Mark failed
                                                </Button>
                                            ) : (
                                                <Button key={next} onClick={() => open("mark-paid")}>
                                                    <Banknote className="mr-1.5 size-4" />
                                                    Mark paid
                                                </Button>
                                            )
                                        )}
                                    </div>
                                    {selected.status === "APPROVED" && (
                                        <p className="max-w-[16rem] text-right text-xs text-muted-foreground">
                                            Reserved in the wallet{selected.rail ? ` for ${RAIL_LABEL[selected.rail]}` : ""}
                                            {selected.reservedAt ? ` since ${formatDate(selected.reservedAt)}` : ""}.{" "}
                                            {selected.batchId
                                                ? "Its batch releases it."
                                                : "Pick it into a payout batch, or record a UTR to pay it by hand."}
                                        </p>
                                    )}
                                    {selected.batchId && (
                                        <p className="text-right text-xs text-muted-foreground">
                                            Batch{" "}
                                            <Link
                                                href={`/finance/payouts/batch/${selected.batchId}`}
                                                className="font-medium text-primary underline-offset-4 hover:underline"
                                            >
                                                {batchReferences[selected.batchId] ?? "open"}
                                            </Link>
                                        </p>
                                    )}
                                    {selected.railReference && (
                                        <p className="text-right text-xs text-muted-foreground">
                                            UTR {selected.railReference}
                                        </p>
                                    )}
                                    {selected.failureReason && (
                                        <p className="max-w-[16rem] text-right text-xs text-danger">
                                            {selected.failureReason}
                                        </p>
                                    )}
                                    {selected.decisionNote && (
                                        <p className="max-w-[16rem] text-right text-xs text-muted-foreground">
                                            {selected.decisionNote}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </Card>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Risk assessment
                                </h3>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {failing > 0
                                        ? `${failing} of ADX's own guardrails would refuse this request today.`
                                        : "The guardrails the platform enforces, re-run against this request."}
                                </p>
                                <ul className="mt-3 space-y-3">
                                    {checks.map((check) => (
                                        <li key={check.label} className="flex items-start gap-3">
                                            <span
                                                className={cn(
                                                    "mt-1 size-2 shrink-0 rounded-full",
                                                    CHECK_DOT[check.result]
                                                )}
                                            />
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-foreground">
                                                    {check.label}
                                                </p>
                                                <p className="text-xs text-muted-foreground">{check.detail}</p>
                                            </div>
                                            <StatusBadge
                                                className="ml-auto"
                                                status={CHECK_META[check.result]}
                                            />
                                        </li>
                                    ))}
                                    {checks.length === 0 && (
                                        <li className="text-sm text-muted-foreground">
                                            Loading the wallet behind this request…
                                        </li>
                                    )}
                                </ul>
                            </Card>

                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {wallet?.party
                                        ? `${WALLET_KIND_LABEL[wallet.party.kind]} context`
                                        : "Wallet context"}
                                </h3>
                                {walletResource.error ? (
                                    <p className="mt-3 text-sm text-muted-foreground">
                                        {walletResource.error}
                                    </p>
                                ) : wallet ? (
                                    <>
                                        <FieldList
                                            className="mt-3"
                                            items={[
                                                ["Wallet balance", formatMoney(wallet.balance)],
                                                ["Cleared and withdrawable", formatMoney(wallet.withdrawable)],
                                                ["Pending clearance", formatMoney(wallet.pendingClearance)],
                                                ["Held against bookings", formatMoney(wallet.held)],
                                                ["Open withdrawals", formatMoney(wallet.openWithdrawals)],
                                                [
                                                    "Daily cap",
                                                    wallet.allowance
                                                        ? formatMoney(wallet.allowance.dailyCap)
                                                        : "No ladder applies",
                                                ],
                                                [
                                                    "Left today",
                                                    wallet.allowance
                                                        ? formatMoney(wallet.allowance.remainingToday)
                                                        : "—",
                                                ],
                                                [
                                                    "On ADX",
                                                    wallet.allowance
                                                        ? `${wallet.allowance.monthsOnPlatform} months`
                                                        : "—",
                                                ],
                                            ]}
                                        />
                                        {wallet.allowance?.nextRung && (
                                            <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                                                At {wallet.allowance.nextRung.months} months on the platform this
                                                cap rises to {formatMoney(wallet.allowance.nextRung.cap)} a day.
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
                                )}
                            </Card>
                        </div>

                        <Card className="overflow-hidden rounded-lg border-border shadow-none">
                            <h3 className="px-5 pb-3 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Withdrawal history
                            </h3>
                            {wallet && wallet.withdrawals.length > 1 ? (
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-y bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                            <th className="px-5 py-2">Requested</th>
                                            <th className="px-5 py-2">Reference</th>
                                            <th className="px-5 py-2">Amount</th>
                                            <th className="px-5 py-2">Method</th>
                                            <th className="px-5 py-2">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {wallet.withdrawals
                                            .filter((row) => row.id !== selected.id)
                                            .map((row) => (
                                                <tr key={row.id} className="border-b last:border-0">
                                                    <td className="px-5 py-2.5 text-muted-foreground">
                                                        {formatDate(row.requestedAt)}
                                                    </td>
                                                    <td className="px-5 py-2.5 text-muted-foreground">
                                                        {row.reference}
                                                    </td>
                                                    <td className="px-5 py-2.5 font-medium tabular-nums">
                                                        {formatMoney(row.amount)}
                                                    </td>
                                                    <td className="px-5 py-2.5 text-muted-foreground">
                                                        {describeMethod(row.method)}
                                                    </td>
                                                    <td className="px-5 py-2.5">
                                                        <StatusBadge
                                                            status={WITHDRAWAL_STATUS_META[row.status]}
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            ) : (
                                <p className="px-5 pb-5 text-sm text-muted-foreground">
                                    {wallet
                                        ? "First withdrawal from this wallet."
                                        : "Loading this wallet's history…"}
                                </p>
                            )}
                        </Card>
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={action !== null}
                onOpenChange={(next) => !next && setAction(null)}
                title={
                    action === "approve"
                        ? "Approve this payout?"
                        : action === "reject"
                          ? "Reject this withdrawal?"
                          : action === "mark-paid"
                            ? "Record the transfer?"
                            : "Mark this transfer failed?"
                }
                description={
                    action === "approve"
                        ? `${formatMoney(selected?.netAmount)} to ${
                              selected ? describeMethod(selected.method) : "the payout method"
                          }. Approving reserves the amount in the wallet — it stays in the balance and cannot be spent or withdrawn again — and moves nothing. A payout batch's release is what debits it and pays.`
                        : action === "reject"
                          ? "The request is refused and the amount becomes available in the wallet again. The reason is shown to the party."
                          : action === "mark-paid"
                            ? "Only for a transfer that has actually been made. A reserved line is debited first; the payable is then discharged against cash, which is the pair a bank statement line reconciles to."
                            : "Use this when the rail refused or the transfer bounced. The money returns to the wallet."
                }
                confirmLabel={
                    action === "approve"
                        ? "Approve payout"
                        : action === "reject"
                          ? "Reject withdrawal"
                          : action === "mark-paid"
                            ? "Record payment"
                            : "Mark failed"
                }
                destructive={action === "reject" || action === "fail"}
                busy={busy}
                disabled={needsText && !note.trim()}
                onConfirm={confirm}
            >
                <div className="space-y-3">
                    {action === "approve" && (
                        <div className="space-y-1.5">
                            <Label htmlFor="withdrawal-rail">Rail</Label>
                            <Select
                                value={rail}
                                onValueChange={(next) => setRail(next as PayoutRailName)}
                            >
                                <SelectTrigger id="withdrawal-rail">
                                    <SelectValue placeholder="Let the backend choose" />
                                </SelectTrigger>
                                <SelectContent>
                                    {rails.map((row) => (
                                        <SelectItem
                                            key={row.name}
                                            value={row.name}
                                            disabled={!row.configured}
                                        >
                                            {RAIL_LABEL[row.name]}
                                            {row.configured ? "" : " — not configured"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                {configuredRails.length <= 1
                                    ? "Only the manual rail is configured, so finance makes the transfer and records the UTR."
                                    : "Leave this unset to use the first configured vendor, falling back to manual."}
                            </p>
                        </div>
                    )}

                    {action === "mark-paid" ? (
                        <div className="space-y-1.5">
                            <Label htmlFor="withdrawal-utr">UTR / rail reference</Label>
                            <Input
                                id="withdrawal-utr"
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                placeholder="e.g. SBIN325104871234"
                            />
                            <p className="text-xs text-muted-foreground">
                                Required. It is the only proof that this money actually moved.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <Label htmlFor="withdrawal-note">
                                {action === "approve" ? "Note (optional)" : "Reason"}
                            </Label>
                            <Textarea
                                id="withdrawal-note"
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                rows={3}
                                placeholder={
                                    action === "approve"
                                        ? "Anything the next person should know."
                                        : "Shown to the party, and kept on the record."
                                }
                            />
                        </div>
                    )}
                </div>
            </ConfirmDialog>
        </div>
    );
}
