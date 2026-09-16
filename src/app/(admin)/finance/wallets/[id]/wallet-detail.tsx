"use client";

import * as React from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DetailShell } from "@/components/adx/detail-shell";
import { SectionCard } from "@/components/adx/section-card";
import { SimpleTable, FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, formatMoney, isZeroMoney, percentOfMoney } from "@/lib/format";
import {
    ENTRY_TYPE_LABEL,
    SIZE_BAND_LABEL,
    WALLET_KIND_LABEL,
    WITHDRAWAL_STATUS_META,
    describeMethod,
    shortId,
    type WalletDetail as Wallet,
    type WalletEntry,
    type WalletKind,
    type Withdrawal,
} from "@/services/finance";
import type { KpiStat } from "@/types";

interface WalletDetailProps {
    wallet: Wallet;
    entries: WalletEntry[];
}

/**
 * One wallet, and everything that explains its number.
 *
 * The balance on its own is not a useful fact here, because it is not what the
 * party can have. `withdrawable` is `balance − pendingClearance − held −
 * openWithdrawals`, and every one of those four subtractions is a different
 * conversation with a different person — so all five figures are on the page
 * with the arithmetic between them shown rather than implied.
 *
 * The three kinds of wallet behave differently and the screen says so:
 *
 * • A PUBLISHER wallet accrues daily as a campaign runs, and each day's earning
 *   clears seven days later — so a balance is always part cleared and part
 *   pending, and hiding the pending half would make ADX look like it was
 *   sitting on money.
 * • An AGENT wallet fills by incentive, and each incentive is vetted by ops
 *   before it is credited at all.
 * • An ADVERTISER wallet is NOT fundable. Credits and refunds go in; there is
 *   no top-up, and there is no control here that pretends otherwise.
 */

/** Each wallet kind gets the sentence that is true of it, and no other. */
function kindNote(kind: WalletKind): string {
    if (kind === "PUBLISHER") {
        return "Earnings accrue daily while a campaign runs and clear seven days after the day they were earned. Until a day clears it sits in pending and cannot be withdrawn.";
    }
    if (kind === "AGENT") {
        return "Incentives are credited only after ops verifies them. Nothing reaches this balance automatically.";
    }
    if (kind === "PRINT_PARTNER") {
        return "An approved print cost lands here net of TDS under 194C. The shop never signs in: ops records its bank account and raises the withdrawal on its behalf from the partner page.";
    }
    return "This wallet is not fundable. Credits and refunds go in; there is no top-up, so no amount an advertiser pays ADX arrives here directly.";
}

export function WalletDetail({ wallet, entries }: WalletDetailProps) {
    const party = wallet.party;
    const allowance = wallet.allowance;

    const kpis: KpiStat[] = [
        {
            id: "balance",
            label: "Settled balance",
            value: formatMoney(wallet.balance),
            hint: "Credits less debits, cleared and pending together",
        },
        {
            id: "withdrawable",
            label: "Withdrawable now",
            value: formatMoney(wallet.withdrawable),
            hint: wallet.frozenAt ? "Frozen: withdrawals are refused until it is lifted" : "Cleared, unheld, not already asked for",
        },
        {
            id: "pending",
            label: "Pending clearance",
            value: formatMoney(wallet.pendingClearance),
            hint: "Earned and credited, inside its seven-day window",
        },
        {
            id: "goodwill",
            label: "Goodwill",
            value: formatMoney(wallet.goodwill),
            hint: "Spendable on ADX, never payable out",
        },
    ];

    /* The subtraction, laid out. Each line is one of the four reasons the
       balance and the withdrawable figure differ, so nobody has to work out
       which of them is holding a payout up. */
    const breakdown: { label: string; amount: string; note: string; sign: "+" | "−" }[] = [
        {
            label: "Settled balance",
            amount: wallet.balance,
            note: "Everything credited, less everything debited.",
            sign: "+",
        },
        {
            label: "Pending clearance",
            amount: wallet.pendingClearance,
            note: "Earned in the last seven days and still inside its window.",
            sign: "−",
        },
        {
            label: "Held against bookings",
            amount: wallet.held,
            note: "Reserved for a booking that has not settled.",
            sign: "−",
        },
        {
            label: "Open withdrawals",
            amount: wallet.openWithdrawals,
            note: "Already requested and not yet resolved or refused.",
            sign: "−",
        },
    ];

    /* How much of today's cap is gone. Kept in paise and turned into a
       percentage only for the bar's width, which is the one place a rounded
       number is harmless. */
    const capPct = React.useMemo(
        () => (allowance ? percentOfMoney(allowance.usedToday, allowance.dailyCap) : 0),
        [allowance]
    );

    const overview = (
        <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-3">
                <SectionCard
                    className="lg:col-span-2"
                    title="What the balance is made of"
                    description="Withdrawable is the balance less everything that is not yet free to leave."
                >
                    <ul className="space-y-3">
                        {breakdown.map((row) => (
                            <li key={row.label} className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground">
                                        <span className="mr-1.5 text-muted-foreground">{row.sign}</span>
                                        {row.label}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{row.note}</p>
                                </div>
                                <span
                                    className={cn(
                                        "shrink-0 text-sm font-medium tabular-nums",
                                        row.sign === "−" && !isZeroMoney(row.amount)
                                            ? "text-muted-foreground"
                                            : "text-foreground"
                                    )}
                                >
                                    {formatMoney(row.amount)}
                                </span>
                            </li>
                        ))}
                        <li className="flex items-start justify-between gap-4 border-t pt-3">
                            <p className="text-sm font-semibold text-foreground">Withdrawable now</p>
                            <span className="text-sm font-semibold tabular-nums text-foreground">
                                {formatMoney(wallet.withdrawable)}
                            </span>
                        </li>
                    </ul>

                    {party && (
                        <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-muted/60 p-3">
                            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                            <p className="text-xs text-muted-foreground">{kindNote(party.kind)}</p>
                        </div>
                    )}
                </SectionCard>

                <SectionCard title="Party" description="Who this money belongs to.">
                    {party ? (
                        <FieldList
                            items={[
                                ["Name", party.name],
                                ["Kind", WALLET_KIND_LABEL[party.kind]],
                                ["Band", SIZE_BAND_LABEL[party.sizeBand]],
                                ["Tier", party.tier ?? "—"],
                                ["On ADX since", formatDate(party.onboardedAt)],
                                [
                                    "Tenure",
                                    allowance ? `${allowance.monthsOnPlatform} months` : "—",
                                ],
                                ["Wallet", shortId(wallet.walletId, "WLT-")],
                                [
                                    "Last activity",
                                    wallet.lastActivityAt ? formatDate(wallet.lastActivityAt) : "Never used",
                                ],
                            ]}
                        />
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            This wallet is not attached to a publisher, agent or advertiser. No ladder
                            applies to it and no allowance can be worked out.
                        </p>
                    )}
                </SectionCard>
            </div>

            <SectionCard
                title="Withdrawal allowance"
                description="The daily cap is tiered by band and by how long the party has been on ADX. This is the rung they are on."
            >
                {allowance ? (
                    <div className="space-y-4">
                        <div>
                            <div className="flex items-baseline justify-between gap-4">
                                <p className="text-sm text-muted-foreground">Used today</p>
                                <p className="text-sm font-medium tabular-nums text-foreground">
                                    {formatMoney(allowance.usedToday)} of {formatMoney(allowance.dailyCap)}
                                </p>
                            </div>
                            <Progress value={capPct} className="mt-2 h-2" />
                            <p className="mt-1.5 text-xs text-muted-foreground">
                                {formatMoney(allowance.remainingToday)} left today. The most this party may
                                ask for right now is {formatMoney(allowance.maximum)} — cleared funds capped
                                by what is left of the day.
                            </p>
                        </div>

                        <FieldList
                            items={[
                                [
                                    "Cap for a " + SIZE_BAND_LABEL[allowance.party.sizeBand].toLowerCase(),
                                    `${formatMoney(allowance.dailyCap)} a day at ${allowance.monthsOnPlatform} months`,
                                ],
                                ["Smallest withdrawal", formatMoney(allowance.minimum)],
                                [
                                    "Next rung",
                                    allowance.nextRung
                                        ? `${formatMoney(allowance.nextRung.cap)} a day from ${allowance.nextRung.months} months`
                                        : "Top of the ladder",
                                ],
                            ]}
                        />

                        <p className="border-t pt-3 text-xs text-muted-foreground">
                            Nothing is auto-approved. Whatever the cap says, a person still vets every
                            request, and ADX pays within 24 hours of approving one. Tax is withheld when
                            income is credited, not at withdrawal, so a withdrawal deducts nothing.
                        </p>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        No allowance could be worked out for this wallet, because it has no party record
                        to read a band and a tenure from.
                    </p>
                )}
            </SectionCard>
        </div>
    );

    const statement = (
        <SimpleTable<WalletEntry>
            rows={entries}
            rowKey={(entry) => entry.id}
            emptyMessage="Nothing has moved through this wallet yet."
            columns={[
                {
                    key: "createdAt",
                    label: "When",
                    render: (entry) => (
                        <span className="whitespace-nowrap text-muted-foreground">
                            {formatDateTime(entry.createdAt)}
                        </span>
                    ),
                },
                {
                    key: "type",
                    label: "Type",
                    render: (entry) => (
                        <span className="font-medium text-foreground">
                            {ENTRY_TYPE_LABEL[entry.type] ?? entry.type}
                            {entry.isGoodwill && (
                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                    goodwill
                                </span>
                            )}
                        </span>
                    ),
                },
                {
                    key: "note",
                    label: "Detail",
                    render: (entry) => (
                        <span className="text-muted-foreground">
                            {entry.note ?? entry.reference ?? "—"}
                        </span>
                    ),
                },
                {
                    key: "amount",
                    label: "Amount",
                    className: "text-right",
                    render: (entry) => (
                        <span
                            className={cn(
                                "tabular-nums font-medium",
                                // Signed the way the backend signs it: positive is money
                                // in, negative is money out. Nothing is re-derived here.
                                entry.amount.trimStart().startsWith("-")
                                    ? "text-danger"
                                    : "text-success"
                            )}
                        >
                            {formatMoney(entry.amount)}
                        </span>
                    ),
                },
                {
                    key: "balanceAfter",
                    label: "Balance after",
                    className: "text-right",
                    render: (entry) => (
                        <span className="tabular-nums text-muted-foreground">
                            {formatMoney(entry.balanceAfter)}
                        </span>
                    ),
                },
            ]}
        />
    );

    const withdrawals = (
        <div className="space-y-4">
            <SimpleTable<Withdrawal>
                rows={wallet.withdrawals}
                rowKey={(row) => row.id}
                emptyMessage="This party has never asked to withdraw."
                columns={[
                    {
                        key: "reference",
                        label: "Reference",
                        render: (row) => (
                            <span className="font-medium text-foreground">{row.reference}</span>
                        ),
                    },
                    {
                        key: "requestedAt",
                        label: "Requested",
                        render: (row) => (
                            <span className="whitespace-nowrap text-muted-foreground">
                                {formatDate(row.requestedAt)}
                            </span>
                        ),
                    },
                    {
                        key: "amount",
                        label: "Amount",
                        render: (row) => (
                            <span className="font-medium tabular-nums">{formatMoney(row.amount)}</span>
                        ),
                    },
                    {
                        key: "method",
                        label: "To",
                        render: (row) => (
                            <span className="text-muted-foreground">{describeMethod(row.method)}</span>
                        ),
                    },
                    {
                        key: "status",
                        label: "Status",
                        render: (row) => <StatusBadge status={WITHDRAWAL_STATUS_META[row.status]} />,
                    },
                    {
                        key: "utr",
                        label: "UTR",
                        render: (row) => (
                            <span className="text-muted-foreground">{row.railReference ?? "—"}</span>
                        ),
                    },
                ]}
            />
            <p className="text-xs text-muted-foreground">
                The twenty most recent. Decide any of them from the{" "}
                <Link href="/finance" className="underline underline-offset-2 hover:text-foreground">
                    withdrawal queue
                </Link>
                .
            </p>
        </div>
    );

    return (
        <DetailShell
            backHref="/finance/wallets"
            backLabel="Wallets"
            title={party?.name ?? shortId(wallet.walletId, "Wallet WLT-")}
            subtitle={
                party
                    ? `${WALLET_KIND_LABEL[party.kind]} · ${SIZE_BAND_LABEL[party.sizeBand]} · ${shortId(
                          wallet.walletId,
                          "WLT-"
                      )}`
                    : "No party is attached to this wallet."
            }
            actions={
                <>
                    {/* Lot A FREEZE_WALLET: debits are refused while this is
                        set. Lifted from the party's own page, not here — the
                        freeze is one scope of a suspension, and the wallet
                        does not decide it. */}
                    {wallet.frozenAt ? (
                        <Card
                            className="rounded-lg border-danger/40 bg-danger-soft px-3 py-2 shadow-none"
                            data-testid="wallet-frozen"
                        >
                            <p className="text-xs font-medium text-danger">
                                Frozen — {wallet.frozenReason ?? "no reason recorded"}
                            </p>
                            <p className="text-[11px] text-danger/80">
                                Since {formatDate(wallet.frozenAt)}. Money lands; nothing leaves.
                            </p>
                        </Card>
                    ) : null}
                    {party?.kind === "ADVERTISER" ? (
                        <Card className="rounded-lg border-warning/40 bg-warning-soft px-3 py-2 shadow-none">
                            <p className="text-xs font-medium text-warning">Not fundable — credits and refunds only</p>
                        </Card>
                    ) : null}
                </>
            }
            kpis={kpis}
            tabs={[
                { value: "overview", label: "Overview", content: overview },
                { value: "statement", label: `Statement (${entries.length})`, content: statement },
                {
                    value: "withdrawals",
                    label: `Withdrawals (${wallet.withdrawals.length})`,
                    content: withdrawals,
                },
            ]}
        />
    );
}
