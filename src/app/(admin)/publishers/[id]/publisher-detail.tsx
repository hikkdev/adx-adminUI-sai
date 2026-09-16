"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronLeft, MoreHorizontal, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountClosure } from "@/components/adx/account-closure";
import { ActivityTimeline } from "@/components/adx/activity-timeline";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { KpiCard } from "@/components/adx/kpi-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { ScanForSignalsButton } from "@/components/adx/scan-for-signals";
import { SuspensionActions } from "@/components/adx/suspend-dialog";
import { SuspensionCard } from "@/components/adx/suspension-card";
import { PUBLISHER_READS, ViewAs } from "@/components/adx/view-as-panel";
import { isLive } from "@/lib/api-config";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { WITHDRAWAL_STATUS_META, describeMethod, type Withdrawal } from "@/services/finance";
import { kycService, PUBLISHER_DESK_FACTS, PUBLISHER_KYC_FIELDS, recordedLine, requestLine, requestOf } from "@/services/kyc";
import { KYC_STATE_META } from "@/services/kyc-state";
import { LISTING_STATUS_TONE, listingStatusLabel, type AdminListing } from "@/services/listings";
import { PUBLISHER_TYPE_LABEL, feedKindLabel, subscriptionLine, type PublisherSummary } from "@/services/publishers";
import { KycRowActions } from "@/app/(admin)/kyc/_shared/kyc-row-actions";
import { RecordAtDeskDialog } from "@/app/(admin)/kyc/_shared/record-at-desk-dialog";
import type { SuspensionView } from "@/services/suspension";
import { PublisherActivityLog } from "./publisher-activity-log";
import { SubscriptionCard, type PublisherSubscriptionFacts } from "./subscription-card";
import { kycStatusMeta, type KpiStat, type KycCase, type Publisher } from "@/types";

interface PublisherDetailProps {
    publisher: Publisher;
    /** `GET /publishers/:id/listings`, as rows of the listings desk. */
    sites: AdminListing[];
    kycCase?: KycCase;
    /** The finance queue's rows for this publisher; null when finance is off or the read failed. */
    withdrawals: Withdrawal[] | null;
    /** Lot A: the case and its history. Null when the API is off or the read failed. */
    suspension: SuspensionView | null;
    /** Lot J-C: the plan the bookings carry and the last orders. Null when finance is off or a read failed. */
    subscription: PublisherSubscriptionFacts | null;
    /** P-C: `GET /publishers/:id/summary` — the money tiles, the agent's name and the feed. Null when it could not be read. */
    summary: PublisherSummary | null;
    /** Re-read after a suspension or a subscription changes the publisher or their case. */
    onChanged: () => void;
}

const checkTone = { pass: "success", fail: "danger", manual: "warning" } as const;

export function PublisherDetail({
    publisher,
    sites,
    kycCase,
    withdrawals,
    suspension,
    subscription,
    summary,
    onChanged,
}: PublisherDetailProps) {
    const router = useRouter();
    /* The case read is the fresher of the two; the row's own columns stand in
       while it could not be read, so the buttons still know what is in force. */
    const scopes = suspension?.scopes ?? publisher.suspensionScopes ?? [];
    const kyc = kycStatusMeta(publisher.kycStatus);
    /* N3-C: the party read's own `kyc.state` — the queue row's word — and the
       actions that state allows: the one-click Digio request, the manual
       ask, Record at the desk, Open the case. The case read, when it could
       be read, is fresher for the desk's stamps. */
    const kycState = kycCase?.state ?? publisher.kyc.state;
    const kycDeskLive = isLive("kyc");
    const [recording, setRecording] = React.useState(false);
    const [recordingKey, setRecordingKey] = React.useState(0);
    const kycRequest = kycCase?.request ?? requestOf({ requestedAt: publisher.kyc.requestedAt, requestedChannel: publisher.kyc.requestedChannel, submittedAt: publisher.kyc.submittedAt });
    /* `PublisherType` labelled; a value the picklist grows reads as itself. */
    const typeLabel = publisher.type ? ((PUBLISHER_TYPE_LABEL as Partial<Record<string, string>>)[publisher.type] ?? publisher.type) : "-";
    const agent = summary?.publisher.agent ?? null;
    const metrics = summary?.metrics ?? null;
    const unread = "The summary could not be read";
    const tierLine = subscriptionLine(metrics?.subscription, formatDate);
    /* The Identity card. A business names a contact person; an individual is
       their own. What the row does not hold reads "-", not a fixture's value. */
    const identity: [string, React.ReactNode][] = [
        ["Owner", publisher.contactName ?? publisher.name],
        ["Email", publisher.email ?? publisher.contactEmail ?? "-"],
        ["Phone", publisher.mobile],
        ["PAN", publisher.pan ?? "-"],
        ["GSTIN", publisher.gstin ?? "-"],
        ["Business type", typeLabel],
        [
            "Onboarded by",
            /* P-C: the summary joins the agent — their name is the link, the
               display id beside it. Without the summary the row's `agentId`
               still opens the profile, unnamed rather than misnamed. */
            agent ? (
                <span className="inline-flex items-center gap-2">
                    <Link href={`/agents/${agent.id}`} className="underline-offset-4 hover:underline">
                        {agent.name}
                    </Link>
                    {agent.displayId && (
                        <span className="font-mono text-xs font-normal text-muted-foreground">{agent.displayId}</span>
                    )}
                </span>
            ) : publisher.agentId ? (
                <Link href={`/agents/${publisher.agentId}`} className="underline-offset-4 hover:underline">
                    Agent · open profile
                </Link>
            ) : (
                "Self-signup"
            ),
        ],
    ];
    /* P-C: the money is the summary's — net accruals this Indian calendar
       month and over the account's life, the payouts marked PAID, the wallet
       — printed as the decimal strings the API sends. "—" when the summary
       could not be read, never a zero beside real records (the rule the
       roster migration set); the "+12.1%" delta that sat here was typed in. */
    const kpis: KpiStat[] = [
        {
            id: "earnings",
            label: "Earnings this month",
            value: metrics ? formatMoney(metrics.earningsThisMonth) : "—",
            hint: metrics ? "net of commission, this calendar month" : unread,
        },
        {
            id: "earnings-lifetime",
            label: "Lifetime earnings",
            value: metrics ? formatMoney(metrics.earningsLifetime) : "—",
            hint: metrics ? (metrics.ratingAvg ? `net · rated ${metrics.ratingAvg} / 5` : "net · no reviews yet") : unread,
        },
        {
            id: "payouts",
            label: "Payouts released",
            value: metrics ? formatMoney(metrics.payoutsReleased.lifetime) : "—",
            hint: metrics ? `${formatMoney(metrics.payoutsReleased.thisMonth)} this month` : unread,
        },
        {
            id: "wallet",
            label: "Wallet balance",
            value: metrics ? formatMoney(metrics.walletBalance) : "—",
            hint: metrics ? `${formatMoney(metrics.withdrawable)} withdrawable` : unread,
        },
        {
            id: "bookings",
            label: "Bookings this month",
            value: metrics ? formatNumber(metrics.bookingsThisMonth) : "—",
            hint: metrics ? `${formatNumber(metrics.bookingsLifetime)} lifetime` : unread,
        },
        { id: "sites", label: "Listed sites", value: String(publisher.sites) },
        {
            id: "live",
            label: "Live sites",
            value: String(sites.filter((site) => site.status === "ACTIVE").length),
            hint: "of the sites on this page",
        },
        {
            id: "kyc",
            label: "KYC status",
            value: kyc.label,
            hint: publisher.pan ? `PAN ${publisher.pan}` : "PAN not on file yet",
        },
    ];

    /* The same cells the listings desk draws, minus its publisher column. */
    const siteColumns = React.useMemo<ColumnDef<AdminListing>[]>(
        () => [
            {
                id: "site",
                accessorKey: "title",
                header: ({ column }) => <SortableHeader column={column}>Site</SortableHeader>,
                cell: ({ row }) => (
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={row.original.title} size="sm" />
                        <div>
                            <p className="font-medium text-foreground">{row.original.title}</p>
                            <p className="text-xs text-muted-foreground">
                                {[row.original.city, row.original.size].filter(Boolean).join(" · ") ||
                                    row.original.address}
                            </p>
                        </div>
                    </div>
                ),
            },
            {
                id: "type",
                accessorKey: "category",
                header: "Type",
                cell: ({ row }) => (
                    <span className="text-muted-foreground">{row.original.subType ?? row.original.category}</span>
                ),
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <StatusBadge
                        status={{
                            label: listingStatusLabel(row.original.status),
                            tone: LISTING_STATUS_TONE[row.original.status] ?? "neutral",
                        }}
                    />
                ),
            },
            {
                id: "rate",
                // Sorting needs a number; the printed figure never goes through one.
                accessorFn: (listing) => Number(listing.ratePerDay ?? 0),
                header: ({ column }) => <SortableHeader column={column}>Rate / day</SortableHeader>,
                cell: ({ row }) => (
                    <span className="font-medium">
                        {/* Priced per day, as the API holds it; the "monthly rate"
                            that sat here was a fixture's. No rate is unpriced, not zero. */}
                        {row.original.ratePerDay ? formatMoney(row.original.ratePerDay) : "—"}
                    </span>
                ),
            },
        ],
        []
    );

    return (
        /* Lot A: the closure state of the account behind the profile — the
           banner above the header and the item in the menu share one read. A
           null `userId` (the owner has not signed in yet) offers nothing. */
        <AccountClosure userId={publisher.userId} name={publisher.name} closed={publisher.user ?? null} onChanged={onChanged}>
        {(closure) => (
        <div className="space-y-5">
            <div>
                <Link
                    href="/publishers/directory"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Publishers
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                            {publisher.name}
                        </h1>
                        {publisher.displayId && (
                            <p className="mt-1 font-mono text-xs tracking-wide text-muted-foreground">
                                {publisher.displayId}
                            </p>
                        )}
                        <p className="mt-1 text-sm text-muted-foreground">
                            {publisher.sites} sites, KYC {kyc.label.toLowerCase()}
                            {publisher.city ? ` · ${publisher.city}` : ""}
                        </p>
                        {/* P-C: the plan the bookings carry, off the summary's running subscription. */}
                        {tierLine && (
                            <p className="mt-0.5 text-sm text-muted-foreground" data-testid="subscription-line">
                                {tierLine}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Package U: the publisher's listings or rate card, imported
                            on their behalf — the kit opens with this publisher set. */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="bg-card">
                                    <Upload className="mr-1.5 size-4" aria-hidden />
                                    Import
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => router.push(`/listings/import?kind=listings&publisherId=${encodeURIComponent(publisher.id)}`)}>
                                    Listings
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => router.push(`/listings/import?kind=rate-card&publisherId=${encodeURIComponent(publisher.id)}`)}>
                                    Rate card
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {/* "Email statement" and "Send login link" are gone: no
                            route sends either, and a toast over nothing taught
                            ops something false. The audited session is the
                            real thing now — Lot A's read-only view-as. */}
                        <ViewAs userId={publisher.userId ?? null} partyName={publisher.name} reads={PUBLISHER_READS}>
                            {({ start }) => (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="icon" className="size-9 bg-card">
                                            <MoreHorizontal className="size-4" />
                                            <span className="sr-only">More actions</span>
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem disabled={!start} onSelect={() => start?.()}>
                                            View as {publisher.name} (read-only)
                                        </DropdownMenuItem>
                                        {!publisher.userId && (
                                            <p className="px-2 pb-1.5 text-xs text-muted-foreground">
                                                No sign-in account yet — nothing to view as.
                                            </p>
                                        )}
                                        {closure.requestClose && (
                                            <>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    className="text-danger focus:text-danger"
                                                    onSelect={closure.requestClose}
                                                >
                                                    Close account
                                                </DropdownMenuItem>
                                            </>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </ViewAs>
                        {/* Lot A: the "Suspend account" item that used to toast
                            here is now the real thing — sections, a reason, and
                            a case with a history. */}
                        <SuspensionActions
                            partyType="PUBLISHER"
                            partyId={publisher.id}
                            partyName={publisher.name}
                            current={scopes}
                            /* E6: the read counts the non-terminal orders across the
                               publisher's listings, so the dialog can say what
                               STOP_OPEN_WORK cancels rather than "the work in flight". */
                            runningOrders={publisher.openOrders ?? null}
                            onDone={onChanged}
                        />
                        {/* Lot G (Q138): the thirteen fraud signals over this
                            publisher, drawn on the fraud desk with the case it
                            can open. */}
                        <ScanForSignalsButton subjectType="PUBLISHER" subjectId={publisher.id} />
                    </div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {kpis.map((stat) => (
                    <KpiCard key={stat.id} stat={stat} />
                ))}
            </div>

            <SuspensionCard view={suspension} />

            {/* Lot J-C: the plan whose rate the bookings carry, with the
                desk's Grant and End for this publisher. */}
            <SubscriptionCard publisher={{ id: publisher.id, name: publisher.name }} facts={subscription} onChanged={onChanged} />

            <Tabs defaultValue="sites">
                <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
                    {[
                        { value: "sites", label: "Sites" },
                        { value: "kyc", label: "KYC & documents" },
                        { value: "payouts", label: "Payouts" },
                        { value: "activity", label: "Activity" },
                    ].map((tab) => (
                        <TabsTrigger
                            key={tab.value}
                            value={tab.value}
                            className="rounded-none border-b-2 border-transparent px-0 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                        >
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value="sites" className="mt-5">
                    <DataTable
                        columns={siteColumns}
                        data={sites}
                        searchPlaceholder="Search sites, format, location"
                        initialPageSize={10}
                    />
                </TabsContent>

                <TabsContent value="kyc" className="mt-5">
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <h3 className="text-base font-semibold text-foreground">Identity</h3>
                            <dl className="mt-4 space-y-3 text-sm">
                                {identity.map(([label, value]) => (
                                    <div key={label} className="flex items-center justify-between gap-4">
                                        <dt className="text-muted-foreground">{label}</dt>
                                        <dd className="font-medium text-foreground">{value}</dd>
                                    </div>
                                ))}
                            </dl>
                        </Card>
                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-base font-semibold text-foreground">
                                    Verification checks
                                </h3>
                                <StatusBadge status={KYC_STATE_META[kycState]} />
                            </div>
                            {kycRequest && (
                                <p className="mt-3 text-sm text-muted-foreground" data-testid="request-line">
                                    {requestLine(kycRequest)}
                                    {kycRequest.open ? " — nothing has come back yet." : ""}
                                </p>
                            )}
                            {kycCase?.recorded && kycCase.recorded.via !== "SELF" && (
                                <p className="mt-1 text-xs text-muted-foreground">Recorded by: {recordedLine(kycCase.recorded)}</p>
                            )}
                            {kycDeskLive && (
                                <div className="mt-3" data-testid="kyc-desk-doors">
                                    <KycRowActions
                                        state={kycState}
                                        party={publisher.name}
                                        hasAccount={publisher.userId !== null}
                                        contact={publisher.mobile}
                                        request={kycRequest}
                                        caseHref={kycCase || publisher.kyc.kycId ? `/kyc/${publisher.id}` : null}
                                        onDigio={() => kycService.requestDigio(publisher.id)}
                                        onRequest={(channel, note) => kycService.request(publisher.id, channel, note)}
                                        onRecord={() => {
                                            setRecordingKey((value) => value + 1);
                                            setRecording(true);
                                        }}
                                        onChanged={onChanged}
                                    />
                                    <RecordAtDeskDialog
                                        key={recordingKey}
                                        open={recording}
                                        onOpenChange={setRecording}
                                        party={publisher.name}
                                        userId={publisher.userId}
                                        purpose="KYC"
                                        tiles={PUBLISHER_KYC_FIELDS}
                                        facts={PUBLISHER_DESK_FACTS}
                                        initial={kycCase ? { documents: Object.fromEntries(kycCase.documents.map((doc) => [doc.field, doc.url])) } : undefined}
                                        liveness={kycCase?.liveness ?? null}
                                        needsInfo={kycState === "NEEDS_INFO"}
                                        onSubmit={async (body) => {
                                            await kycService.recordAtDesk(publisher.id, body);
                                            return { caseHref: `/kyc/${publisher.id}` };
                                        }}
                                        onRecorded={(href) => {
                                            setRecording(false);
                                            onChanged();
                                            router.push(href);
                                        }}
                                    />
                                </div>
                            )}
                            {kycCase ? (
                                <ul className="mt-4 space-y-3">
                                    {kycCase.checks.map((check) => (
                                        <li
                                            key={check.label}
                                            className="flex items-center justify-between gap-4 text-sm"
                                        >
                                            <div>
                                                <p className="font-medium text-foreground">{check.label}</p>
                                                <p className="text-xs text-muted-foreground">{check.detail}</p>
                                            </div>
                                            <StatusBadge
                                                status={{
                                                    label:
                                                        check.result === "pass"
                                                            ? "Pass"
                                                            : check.result === "fail"
                                                              ? "Fail"
                                                              : "Manual",
                                                    tone: checkTone[check.result],
                                                }}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="mt-4 text-sm text-muted-foreground">
                                    KYC {kyc.label.toLowerCase()}, no
                                    open review case for this publisher.
                                </p>
                            )}
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="payouts" className="mt-5">
                    {/* E6: the finance queue asked `?publisherId=` — the profile
                        behind the wallet, so a namesake publisher is not on it. */}
                    <Card className="rounded-lg border-border shadow-none">
                        {withdrawals === null ? (
                            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                                Withdrawals are read from the finance API, and it could not be read just now.
                            </p>
                        ) : withdrawals.length ? (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                        <th className="px-4 py-2.5">Reference</th>
                                        <th className="px-4 py-2.5">Requested</th>
                                        <th className="px-4 py-2.5">Amount</th>
                                        <th className="px-4 py-2.5">Destination</th>
                                        <th className="px-4 py-2.5">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {withdrawals.map((withdrawal) => (
                                        <tr key={withdrawal.id} className="border-b last:border-0">
                                            <td className="px-4 py-3">
                                                <Link
                                                    href={`/finance/wallets/${withdrawal.walletId}`}
                                                    className="font-mono text-xs text-foreground underline-offset-4 hover:underline"
                                                >
                                                    {withdrawal.reference}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">
                                                {formatDateTime(withdrawal.requestedAt)}
                                            </td>
                                            <td className="px-4 py-3 font-medium tabular-nums">
                                                {formatMoney(withdrawal.netAmount)}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">
                                                {describeMethod(withdrawal.method)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <StatusBadge status={WITHDRAWAL_STATUS_META[withdrawal.status]} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                                No withdrawal requests from this publisher yet.
                            </p>
                        )}
                    </Card>
                </TabsContent>

                <TabsContent value="activity" className="mt-5 space-y-4">
                    {/* R-C: the action log written by hand — Check-in, Follow-up,
                        Called, Messaged, Note — over POST …/activity; the feed
                        below reads the same rows back as ACTIVITY. */}
                    <PublisherActivityLog
                        publisherId={publisher.id}
                        hasAgent={Boolean(agent ?? publisher.agentId)}
                        onLogged={onChanged}
                    />
                    {/* P-C: the summary's feed — the action log, field visits,
                        listings gone live, bookings authorised and payouts
                        released, merged newest first, thirty at most — above
                        the audit log of what the console did to the row. */}
                    <Card className="rounded-lg border-border p-5 shadow-none" data-testid="publisher-feed">
                        <h3 className="text-base font-semibold text-foreground">Recent activity</h3>
                        {summary === null ? (
                            <p className="mt-3 text-sm text-muted-foreground">
                                The feed is read from the publisher summary, and it could not be read just now.
                            </p>
                        ) : summary.activity.length === 0 ? (
                            <p className="mt-3 text-sm text-muted-foreground">No activity on the account yet.</p>
                        ) : (
                            <ol className="mt-3 divide-y divide-border">
                                {summary.activity.map((event, index) => (
                                    <li key={`${event.kind}-${event.at}-${index}`} className="flex items-start justify-between gap-4 py-2.5 text-sm">
                                        <div className="min-w-0">
                                            <p className="font-medium text-foreground">{event.title}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {feedKindLabel(event.kind)}
                                                {event.detail ? ` · ${event.detail}` : ""}
                                            </p>
                                        </div>
                                        <time dateTime={event.at} className="shrink-0 text-xs text-muted-foreground">
                                            {formatDateTime(event.at)}
                                        </time>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </Card>
                    <ActivityTimeline targets={[{ type: "Publisher", id: publisher.id }]} noun="this publisher" />
                </TabsContent>
            </Tabs>
        </div>
        )}
        </AccountClosure>
    );
}
