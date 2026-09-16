"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Landmark, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";

import { FilterChips, type FilterChip } from "@/components/adx/filter-chips";
import { advertiserService, type WalletTopUp } from "@/services/advertisers";
import { formatDate, formatDateTime, formatINR, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RaiseRefundDialog, RecordTopUpDialog } from "./wallet-dialogs";
import {
    BRAND_SECTOR_META,
    WALLET_ENTRY_META,
    type Brand,
    type BrandStatusFilter,
    type WalletEntry,
    type WalletSnapshot,
} from "@/types";

type Data = { wallet: WalletSnapshot; entries: WalletEntry[]; topUps: WalletTopUp[] };

interface AdvertiserMoneyProps {
    advertiserId: string;
    advertiserName: string;
    /** The advertiser's account, for its payout methods on a cash refund. */
    userId: string | null;
}

/**
 * Wallet and brands for one advertiser.
 *
 * A client island inside an otherwise server-rendered detail page: the API
 * client keeps its token in localStorage, so anything reading real data has to
 * do it from the browser.
 *
 * Lot B put the two desk actions here: recording a transfer that arrived
 * outside ADX (`POST …/wallet/top-up`, structured, against suspense) and
 * raising a refund on the advertiser's behalf (`POST …/wallet/refund-requests`,
 * frozen at once, decided at the refund desk).
 */
export function AdvertiserMoney({ advertiserId, advertiserName, userId }: AdvertiserMoneyProps) {
    const live = isLive("advertisers");
    const [recording, setRecording] = React.useState(false);
    const [refunding, setRefunding] = React.useState(false);
    const resource = useApiResource<Data>(`advertisers:money:${advertiserId}`, async () => {
        const [wallet, entries, topUps] = await Promise.all([
            advertiserService.wallet(advertiserId),
            advertiserService.statement(advertiserId),
            advertiserService.topUps(advertiserId),
        ]);
        return { wallet, entries, topUps };
    });

    return (
        <ResourceBoundary resource={resource}>
            {({ wallet, entries, topUps }) => (
                <div className="space-y-4">
                    {live && (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button variant="outline" className="bg-card" onClick={() => setRefunding(true)}>
                                <Undo2 className="mr-1.5 size-4" />
                                Raise refund
                            </Button>
                            <Button onClick={() => setRecording(true)}>
                                <Landmark className="mr-1.5 size-4" />
                                Record bank transfer
                            </Button>
                        </div>
                    )}
                    <WalletCard wallet={wallet} />
                    {live && <TopUps topUps={topUps} />}
                    <RecordTopUpDialog
                        open={recording}
                        onOpenChange={setRecording}
                        advertiserId={advertiserId}
                        advertiserName={advertiserName}
                        onRecorded={resource.reload}
                    />
                    <RaiseRefundDialog
                        open={refunding}
                        onOpenChange={setRefunding}
                        advertiserId={advertiserId}
                        advertiserName={advertiserName}
                        userId={userId}
                        onRaised={resource.reload}
                    />
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Statement entries={entries} />
                        {/* Its own resource, because the Archived chip is a
                            `?status=` on the brands read alone and should not
                            refetch the wallet. */}
                        <Brands advertiserId={advertiserId} />
                    </div>
                </div>
            )}
        </ResourceBoundary>
    );
}

function WalletCard({ wallet }: { wallet: WalletSnapshot }) {
    const figures = [
        { label: "Spendable", value: wallet.spendable, hint: "balance + goodwill − holds" },
        { label: "Settled balance", value: wallet.balance, hint: "withdrawable" },
        { label: "Goodwill", value: wallet.goodwill, hint: "bookings only" },
        { label: "Held", value: wallet.held, hint: "confirmed campaigns" },
    ];

    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground">Wallet</h3>
                <span className="text-xs text-muted-foreground">
                    Confirmation holds; campaign start debits.
                </span>
            </div>

            <div className="mt-4 grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
                {figures.map((figure, index) => (
                    <div key={figure.label} className="bg-card p-4">
                        <p className="text-xs text-muted-foreground">{figure.label}</p>
                        <p
                            className={cn(
                                "mt-1 tabular-nums",
                                index === 0
                                    ? "text-xl font-semibold text-foreground"
                                    : "text-base font-medium text-foreground"
                            )}
                        >
                            {formatINR(Number(figure.value))}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{figure.hint}</p>
                    </div>
                ))}
            </div>

            {Number(wallet.goodwill) > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                    Goodwill is spent before settled balance, and cannot be withdrawn.
                </p>
            )}
        </Card>
    );
}

const TOP_UP_METHOD_LABEL: Record<WalletTopUp["method"], string> = {
    BANK_TRANSFER: "Bank transfer",
    CHEQUE: "Cheque",
    GATEWAY: "Gateway",
};

/**
 * `GET /advertisers/:id/wallet/top-ups` — every transfer, cheque and gateway
 * settlement recorded against the wallet, and whether a bank line has
 * explained it yet. A transfer still in suspense is a real credit the books
 * cannot yet prove, which is why the column is drawn rather than implied.
 */
function TopUps({ topUps }: { topUps: WalletTopUp[] }) {
    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground">Top-ups</h3>
                <span className="text-xs text-muted-foreground">
                    Credited against suspense until reconciliation matches the bank line.
                </span>
            </div>
            {topUps.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No top-up recorded on this wallet.</p>
            ) : (
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-y bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-3 py-2">Received</th>
                                <th className="px-3 py-2">Method</th>
                                <th className="px-3 py-2">Reference</th>
                                <th className="px-3 py-2 text-right">Amount</th>
                                <th className="px-3 py-2">Reconciled</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topUps.map((topUp) => (
                                <tr key={topUp.id} className="border-b last:border-0">
                                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                                        {formatDate(topUp.receivedAt)}
                                    </td>
                                    <td className="px-3 py-2.5 text-foreground">{TOP_UP_METHOD_LABEL[topUp.method] ?? topUp.method}</td>
                                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                                        {topUp.utr ?? topUp.paymentId ?? "—"}
                                        {topUp.note && (
                                            <span className="ml-2 font-sans text-xs text-muted-foreground">{topUp.note}</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-medium tabular-nums text-foreground">
                                        {formatMoney(topUp.amount)}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                                        {topUp.reconciledAt ? (
                                            <span className="text-success">{formatDate(topUp.reconciledAt)}</span>
                                        ) : (
                                            <span className="text-warning">In suspense</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

function Statement({ entries }: { entries: WalletEntry[] }) {
    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <h3 className="text-base font-semibold text-foreground">Statement</h3>
            {entries.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                    Nothing has moved through this wallet yet.
                </p>
            ) : (
                <ul className="mt-4 divide-y divide-border">
                    {entries.map((entry) => {
                        const credit = !entry.amount.startsWith("-");
                        return (
                            <li key={entry.id} className="flex items-start justify-between gap-4 py-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-[10px]">
                                            {WALLET_ENTRY_META[entry.type].label}
                                        </Badge>
                                        {entry.isGoodwill && (
                                            <span className="text-[10px] text-info">goodwill</span>
                                        )}
                                    </div>
                                    {/* The money trail and the campaign history
                                        are the same story, and a debit that
                                        names a campaign opens it. It could not
                                        while /campaigns rendered fixtures —
                                        the id would have opened a stranger's
                                        campaign or nothing at all. The screen
                                        reads the API now, so the link is real. */}
                                    {entry.campaignId ? (
                                        <Link
                                            href={`/campaigns/${entry.campaignId}`}
                                            className="mt-1 block truncate text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                                        >
                                            {entry.note ?? "Campaign"}
                                        </Link>
                                    ) : (
                                        <p className="mt-1 truncate text-xs text-muted-foreground">
                                            {entry.note ?? entry.reference ?? "—"}
                                        </p>
                                    )}
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                        {formatDateTime(entry.createdAt)}
                                    </p>
                                </div>
                                <div className="shrink-0 text-right">
                                    <p
                                        className={cn(
                                            "text-sm font-medium tabular-nums",
                                            credit ? "text-success" : "text-foreground"
                                        )}
                                    >
                                        {credit ? "+" : "−"}
                                        {formatINR(Math.abs(Number(entry.amount)))}
                                    </p>
                                    <p className="text-[11px] tabular-nums text-muted-foreground">
                                        {formatINR(Number(entry.balanceAfter))}
                                    </p>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}

const BRAND_CHIPS: FilterChip<BrandStatusFilter | "ALL">[] = [
    { value: "ACTIVE", label: "Active" },
    { value: "ARCHIVED", label: "Archived" },
    { value: "ALL", label: "All" },
];

/**
 * The brand cards — `GET /advertisers/:id/brands`, which since DR 05/06
 * answers with each brand's campaign counts, its lifetime spend and whether
 * it is archived, and takes `?status=ARCHIVED` for the ones that are.
 *
 * The card fields are printed only when the wire sent them: the seeded
 * brands the offline page draws carry the row and nothing else, and a
 * count the console made up would be a figure.
 */
export function Brands({ advertiserId }: { advertiserId: string }) {
    const [status, setStatus] = React.useState<BrandStatusFilter | "ALL">("ACTIVE");
    const resource = useApiResource<Brand[]>(`advertisers:brands:${advertiserId}:${status}`, () =>
        advertiserService.brands(advertiserId, status === "ALL" ? undefined : status),
    );

    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground">Brands</h3>
                <span className="text-xs text-muted-foreground">{resource.data?.length ?? ""}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
                Campaigns and creatives belong to a brand; the wallet and agreement belong to the
                account.
            </p>
            <FilterChips chips={BRAND_CHIPS} value={status} onChange={setStatus} className="mt-3" />

            <ResourceBoundary resource={resource}>
                {(brands) =>
                    brands.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            {status === "ARCHIVED" ? "No archived brands." : "No brands on this account yet."}
                        </p>
                    ) : (
                        <ul className="mt-4 divide-y divide-border">
                            {brands.map((brand) => (
                                <BrandRow key={brand.id} brand={brand} />
                            ))}
                        </ul>
                    )
                }
            </ResourceBoundary>
        </Card>
    );
}

/** "2 live · 1 scheduled · 5 in all", from the card's counts; null when the wire sent none. */
export function campaignsLine(counts: Brand["campaigns"]): string | null {
    if (!counts) return null;
    if (counts.total === 0) return "No campaigns yet";
    return [
        counts.live ? `${counts.live} live` : null,
        counts.scheduled ? `${counts.scheduled} scheduled` : null,
        `${counts.total} in all`,
    ]
        .filter(Boolean)
        .join(" · ");
}

function BrandRow({ brand }: { brand: Brand }) {
    const sector = BRAND_SECTOR_META[brand.sector];
    // `archived` is the card's word; `isActive` is the row's. Either says it.
    const archived = brand.archived ?? !brand.isActive;
    const campaigns = campaignsLine(brand.campaigns);
    return (
        <li className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <p className={cn("truncate text-sm font-medium", archived ? "text-muted-foreground" : "text-foreground")}>
                        {brand.name}
                    </p>
                    {archived && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Archived
                        </Badge>
                    )}
                </div>
                <p className="text-xs text-muted-foreground">
                    {[sector.label, brand.industry, brand.subCategory].filter(Boolean).join(" · ")}
                </p>
                {campaigns && <p className="mt-0.5 text-xs text-muted-foreground">{campaigns}</p>}
            </div>
            <div className="shrink-0 text-right">
                {brand.lifetimeSpend !== undefined && (
                    <>
                        <p className="text-sm font-medium tabular-nums text-foreground">{formatMoney(brand.lifetimeSpend)}</p>
                        <p className="text-[11px] text-muted-foreground">lifetime spend</p>
                    </>
                )}
                {sector.restricted && (
                    <span
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-warning"
                        title="Campaigns for this sector route through the category rules for a block or legal approval"
                    >
                        <AlertTriangle className="size-3" aria-hidden />
                        Restricted
                    </span>
                )}
            </div>
        </li>
    );
}
