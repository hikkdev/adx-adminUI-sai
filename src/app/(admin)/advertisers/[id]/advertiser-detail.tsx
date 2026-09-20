"use client";

import * as React from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AccountClosure, CloseAccountButton } from "@/components/adx/account-closure";
import { ActivityTimeline } from "@/components/adx/activity-timeline";
import { DetailShell } from "@/components/adx/detail-shell";
import { FieldList, SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { VerifiedTick } from "@/components/adx/verified-tick";
import { isLive } from "@/lib/api-config";
import { formatDate, formatINR, formatMoney, formatNumber } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { ADVERTISER_DESK_FACTS, advertiserDeskTiles, advertiserKycService } from "@/services/advertiser-kyc";
import { recordedLine, requestLine, requestOf } from "@/services/kyc";
import { KYC_STATE_META, shapeKycSummary } from "@/services/kyc-state";
import { KycRowActions } from "@/app/(admin)/kyc/_shared/kyc-row-actions";
import { RecordAtDeskDialog } from "@/app/(admin)/kyc/_shared/record-at-desk-dialog";
import { lastActivityAt, type AdvertiserSummary } from "@/services/advertisers";
import { relativeTime } from "@/services/notifications";
import { EditIndustryDialog } from "../industry-picker";
import { type OrdersPage } from "@/services/orders";
import {
    CAMPAIGN_STATUS_TONE,
    campaignStatusLabel,
    flightLabel,
    type CampaignRow,
} from "@/services/campaigns";
import { ScanForSignalsButton } from "@/components/adx/scan-for-signals";
import { SuspensionActions } from "@/components/adx/suspend-dialog";
import { SuspensionCard } from "@/components/adx/suspension-card";
import { countRunningCampaigns, type SuspensionView } from "@/services/suspension";
import {
    INVOICE_KIND_META,
    INVOICE_STATUS_META,
    type InvoiceRow,
} from "@/services/invoices";
import { AdvertiserMoney } from "./advertiser-money";
import { EditAdvertiserDrawer } from "./edit-advertiser-drawer";
import { ADVERTISER_STATUS_META, ADVERTISER_TYPE_LABELS, onboardingLine, type Advertiser, type AdvertiserKycCase } from "@/types";

interface AdvertiserDetailProps {
    advertiser: Advertiser;
    campaigns: CampaignRow[];
    /** Lot B: this account's documents from `GET /finance/invoices?advertiserId=`. */
    invoices: InvoiceRow[];
    /** Lot A: the case and its history. Null when the API is off or the read failed. */
    suspension: SuspensionView | null;
    /** `GET /advertisers/:id/summary` — the tile row's lifetime spend. Null when it could not be read. */
    summary: AdvertiserSummary | null;
    /** E7-2: `GET /orders?advertiserId=`, newest first, with the total. Null when it could not be read. */
    bookings: OrdersPage | null;
    /** Lot N: the account's KYC row — the desk's ask, who recorded it — or null when there is none yet or it could not be read. */
    kycCase?: AdvertiserKycCase | null;
    /** Re-read after a suspension changes the account or its case. */
    onChanged: () => void;
}

/**
 * DR 10's advertiser page (`5102:28539`): the four tiles — Total spend,
 * Active campaigns, Bookings, Account status — over the summary, the
 * campaigns read and the orders facet; the Contact card and the Recent
 * bookings card beside it; "View campaign queue" opening the worklist cut
 * to this account.
 *
 * Lot G (package CG3): the Account status tile's hint is the frame's
 * "Last activity 12 min ago", read off the summary feed's newest `at` —
 * the action log, field visits, campaigns gone live and packages paid,
 * merged — and printed relative to the clock; a suspension still takes
 * the line over, because a stopped section is the thing to know. The
 * Contact card's Industry row (Q119) prints the row's `industry` with an
 * Edit control over the picklist `GET /advertisers/industries` serves.
 */
export function AdvertiserDetail({
    advertiser,
    campaigns,
    invoices,
    suspension,
    summary,
    bookings,
    kycCase = null,
    onChanged,
}: AdvertiserDetailProps) {
    /* The case read is the fresher of the two; the row's own columns stand in
       while it could not be read, so the buttons still know what is in force. */
    const scopes = suspension?.scopes ?? advertiser.suspensionScopes ?? [];
    const now = useNow();
    const lastActivity = lastActivityAt(summary);
    const [editingIndustry, setEditingIndustry] = React.useState(false);
    /* N3-B / N3-C: the record belongs to the PROFILE. The party read's own
       `kyc.state` is the queue row's word; the queue row (`kycCase`), when
       it could be read, is fresher for the desk's stamps. Every door — the
       one-click Digio request, the manual ask, Record at the desk — goes
       over the profile id (the server resolves the row id, then the
       profile, then the user), so a console-created advertiser with no app
       account has the same doors; the request dialog says the Digio link
       goes to the profile's contact and no ADX notice is sent. */
    const kycSummary = advertiser.kyc ?? shapeKycSummary(null, advertiser.kycStatus);
    const kycState = kycCase?.state ?? kycSummary.state;
    const kycDeskLive = isLive("kyc");
    const accountUserId = advertiser.userId ?? null;
    const kycRequest = kycCase?.request ?? requestOf({ requestedAt: kycSummary.requestedAt, requestedChannel: kycSummary.requestedChannel, submittedAt: kycSummary.submittedAt });
    const kycHasCase = (kycCase?.kycId ?? kycSummary.kycId) !== null && kycState !== "AWAITING_DOCUMENTS" && kycState !== "REQUESTED";
    const [recording, setRecording] = React.useState(false);
    const [recordingKey, setRecordingKey] = React.useState(0);
    return (
        /* Lot A: the closure state of the account behind the profile — the
           banner above the header, the button in it, one read. Null `userId`
           (nobody has registered against the profile yet) offers nothing. */
        <AccountClosure userId={advertiser.userId} name={advertiser.name} closed={advertiser.user ?? null}>
        {(closure) => (
        <DetailShell
            backHref="/advertisers/directory"
            backLabel="Advertisers"
            title={advertiser.name}
            titleAdornment={<VerifiedTick kycStatus={advertiser.kycStatus} size={18} />}
            actions={
                <>
                    {/* QR-15: the desk edits everything the app collects, on the same form it onboards with. */}
                    <EditAdvertiserDrawer advertiser={advertiser} onChanged={onChanged} />
                    <Button variant="outline" className="bg-card" asChild>
                        <Link href={`/campaigns?advertiserId=${encodeURIComponent(advertiser.id)}`}>
                            View campaign queue
                        </Link>
                    </Button>
                    <SuspensionActions
                        partyType="ADVERTISER"
                        partyId={advertiser.id}
                        partyName={advertiser.name}
                        current={scopes}
                        /* The page already has the campaigns, so the dialog can
                           say how many STOP_OPEN_WORK would cancel. */
                        runningCampaigns={countRunningCampaigns(campaigns)}
                        onDone={onChanged}
                    />
                    {/* Lot G (Q138): the fraud signals over this advertiser, on the fraud desk. */}
                    <ScanForSignalsButton subjectType="ADVERTISER" subjectId={advertiser.id} />
                    <CloseAccountButton slot={closure} />
                </>
            }
            subtitle={[
                advertiser.displayId,
                advertiser.industry,
                ADVERTISER_TYPE_LABELS[advertiser.type],
                advertiser.city,
                `Joined ${formatDate(advertiser.joinedAt)}`,
            ]
                .filter(Boolean)
                .join(" · ")}
            kpis={[
                {
                    id: "spend",
                    label: "Total spend",
                    // The summary's committed budget across campaigns; "—" when the read failed, never zero.
                    value: summary ? formatMoney(summary.metrics.spend) : "—",
                    hint: summary
                        ? `lifetime · ${formatNumber(summary.metrics.campaigns)} ${summary.metrics.campaigns === 1 ? "campaign" : "campaigns"}, ${formatNumber(summary.metrics.spots)} ${summary.metrics.spots === 1 ? "spot" : "spots"}`
                        : "The summary could not be read",
                },
                {
                    id: "campaigns",
                    label: "Active campaigns",
                    value: formatNumber(countRunningCampaigns(campaigns)),
                    hint: `scheduled or live · ${formatNumber(campaigns.length)} in all`,
                },
                {
                    id: "bookings",
                    label: "Bookings",
                    value: bookings ? formatNumber(bookings.total) : "—",
                    hint: bookings ? "current + past" : "Orders could not be read",
                },
                {
                    id: "status",
                    label: "Account status",
                    value: ADVERTISER_STATUS_META[advertiser.status].label,
                    hint: scopes.length
                        ? `Suspended: ${scopes.length} section${scopes.length === 1 ? "" : "s"} stopped`
                        : lastActivity && now !== null
                          ? `Last activity ${relativeTime(lastActivity, new Date(now))}`
                          : summary && !lastActivity
                            ? "No activity on the account yet"
                            : advertiser.activatedAt
                              ? `Activated ${formatDate(advertiser.activatedAt)}`
                              : "KYC and the platform agreement both have to land",
                },
            ]}
            tabs={[
                {
                    value: "overview",
                    label: "Overview",
                    content: (
                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <h3 className="text-base font-semibold text-foreground">Account</h3>
                                <div className="mt-3">
                                    <StatusBadge
                                        status={ADVERTISER_STATUS_META[advertiser.status]}
                                    />
                                </div>
                                <FieldList
                                    className="mt-4"
                                    items={[
                                        ["Mobile", advertiser.contact],
                                        ["Email", advertiser.email ?? "—"],
                                        /* QR-15: the person behind the account — what the Edit details drawer edits. */
                                        [
                                            "Person",
                                            advertiser.person
                                                ? [advertiser.person.firstName, advertiser.person.lastName].filter(Boolean).join(" ") || "—"
                                                : advertiser.userId
                                                  ? "—"
                                                  : "No app account yet",
                                        ],
                                        ["Registered name", advertiser.companyName ?? "—"],
                                        [
                                            "Industry",
                                            <span key="industry" className="inline-flex items-center gap-2">
                                                {advertiser.industry ?? "—"}
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingIndustry(true)}
                                                    aria-label="Edit industry"
                                                    className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                                                >
                                                    <Pencil className="size-3.5" />
                                                </button>
                                            </span>,
                                        ],
                                        ["Entity", ADVERTISER_TYPE_LABELS[advertiser.type]],
                                        [
                                            "KYC",
                                            <span key="kyc" className="inline-flex flex-wrap items-center justify-end gap-1.5 text-right">
                                                <StatusBadge status={KYC_STATE_META[kycState]} />
                                                {kycCase?.recorded && kycCase.recorded.via !== "SELF" ? <span className="text-xs text-muted-foreground">{recordedLine(kycCase.recorded)}</span> : null}
                                            </span>,
                                        ],
                                        ["GSTIN", advertiser.gstin ?? "—"],
                                        ["Billing address", advertiser.billingAddress ?? "—"],
                                        [
                                            "Location",
                                            [advertiser.city, advertiser.state]
                                                .filter(Boolean)
                                                .join(", ") || "—",
                                        ],
                                        ["Joined", formatDate(advertiser.joinedAt)],
                                        /* QR-14/15: the door the account came through, and who opened it. */
                                        ["Onboarded", onboardingLine(advertiser.onboarding)],
                                        [
                                            "Activated",
                                            advertiser.activatedAt
                                                ? formatDate(advertiser.activatedAt)
                                                : "Not yet",
                                        ],
                                    ]}
                                />
                                {kycRequest && (
                                    <p className="mt-4 text-sm text-muted-foreground" data-testid="request-line">
                                        {requestLine(kycRequest)}
                                        {kycRequest.open ? " — nothing has come back yet." : ""}
                                    </p>
                                )}
                                {kycDeskLive && (
                                    <div className="mt-4" data-testid="kyc-desk-doors">
                                        <KycRowActions
                                            state={kycState}
                                            party={advertiser.companyName ?? advertiser.name}
                                            hasAccount={accountUserId !== null}
                                            contact={advertiser.contact || advertiser.email}
                                            request={kycRequest}
                                            caseHref={kycHasCase ? `/kyc/advertisers?state=${kycState.toLowerCase()}` : null}
                                            onDigio={() => advertiserKycService.requestDigio(advertiser.id)}
                                            onRequest={(channel, note) => advertiserKycService.request(advertiser.id, channel, note)}
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
                                            party={advertiser.companyName ?? advertiser.name}
                                            userId={accountUserId}
                                            purpose="ADVERTISER_KYC"
                                            tiles={advertiserDeskTiles(kycCase?.kycType ?? advertiser.type)}
                                            facts={ADVERTISER_DESK_FACTS}
                                            initial={
                                                kycCase?.kycId
                                                    ? {
                                                          documents: Object.fromEntries(kycCase.documents.filter((item) => item.url).map((item) => [item.field, item.url ?? undefined])),
                                                          panNumber: kycCase.panNumber ?? "",
                                                      }
                                                    : undefined
                                            }
                                            liveness={kycCase?.liveness ?? null}
                                            needsInfo={kycState === "NEEDS_INFO"}
                                            onSubmit={async (body) => {
                                                // N3-B: the desk records over the PROFILE id; with no record yet the PUT opens one, typed by the profile's entity type.
                                                await advertiserKycService.recordAtDesk(advertiser.id, kycCase?.kycId ? body : { ...body, kycType: advertiser.type });
                                                return { caseHref: "/kyc/advertisers" };
                                            }}
                                            onRecorded={() => {
                                                setRecording(false);
                                                onChanged();
                                            }}
                                        />
                                    </div>
                                )}
                            </Card>

                            <RecentBookingsCard bookings={bookings} />
                            <SuspensionCard view={suspension} className="lg:col-span-2" />
                            <EditIndustryDialog
                                key={`${advertiser.industry ?? ""}:${editingIndustry}`}
                                advertiserId={advertiser.id}
                                advertiserName={advertiser.name}
                                current={advertiser.industry}
                                open={editingIndustry}
                                onOpenChange={setEditingIndustry}
                                onSaved={onChanged}
                            />
                        </div>
                    ),
                },
                {
                    value: "wallet",
                    label: "Wallet & brands",
                    content: (
                        <AdvertiserMoney
                            advertiserId={advertiser.id}
                            advertiserName={advertiser.companyName ?? advertiser.name}
                            userId={advertiser.userId ?? null}
                        />
                    ),
                },
                {
                    value: "campaigns",
                    label: "Campaigns",
                    content: (
                        <SimpleTable<CampaignRow>
                            rows={campaigns}
                            rowKey={(campaign) => campaign.id}
                            emptyMessage="No campaigns submitted yet."
                            columns={[
                                {
                                    key: "name",
                                    label: "Campaign",
                                    render: (campaign) => (
                                        <Link
                                            href={`/campaigns/${campaign.id}`}
                                            className="font-medium text-foreground underline-offset-4 hover:underline"
                                        >
                                            {campaign.name}
                                        </Link>
                                    ),
                                },
                                {
                                    key: "budget",
                                    label: "Budget",
                                    // A draft has no budget yet, which is not zero.
                                    render: (campaign) =>
                                        campaign.budget ? formatINR(Number(campaign.budget)) : "—",
                                },
                                {
                                    key: "spots",
                                    label: "Spots",
                                    render: (campaign) => campaign.spotCount,
                                },
                                {
                                    key: "flight",
                                    label: "Flight",
                                    render: (campaign) => flightLabel(campaign),
                                },
                                {
                                    key: "status",
                                    label: "Status",
                                    render: (campaign) => (
                                        <StatusBadge
                                            status={{
                                                label: campaignStatusLabel(campaign.status),
                                                tone: CAMPAIGN_STATUS_TONE[campaign.status],
                                            }}
                                        />
                                    ),
                                },
                            ]}
                        />
                    ),
                },
                {
                    value: "invoices",
                    label: "Invoices",
                    content: (
                        <SimpleTable<InvoiceRow>
                            rows={invoices}
                            rowKey={(invoice) => invoice.id}
                            emptyMessage="No invoices issued yet. One is issued the moment a campaign's hold is placed or a package sale is paid."
                            columns={[
                                {
                                    key: "number",
                                    label: "Invoice",
                                    render: (invoice) => (
                                        <Link
                                            href={`/finance/invoices/${invoice.id}`}
                                            className="font-medium text-foreground hover:underline"
                                        >
                                            {invoice.number}
                                        </Link>
                                    ),
                                },
                                {
                                    key: "kind",
                                    label: "Kind",
                                    render: (invoice) => (
                                        <StatusBadge status={INVOICE_KIND_META[invoice.kind]} />
                                    ),
                                },
                                {
                                    key: "taxable",
                                    label: "Taxable",
                                    className: "text-right tabular-nums",
                                    render: (invoice) => formatMoney(invoice.taxableValue),
                                },
                                {
                                    key: "gst",
                                    label: "GST",
                                    className: "text-right tabular-nums",
                                    render: (invoice) => formatMoney(invoice.gstTotal),
                                },
                                {
                                    key: "total",
                                    label: "Total",
                                    className: "text-right tabular-nums",
                                    render: (invoice) => (
                                        <span className="font-medium">{formatMoney(invoice.total)}</span>
                                    ),
                                },
                                {
                                    key: "due",
                                    label: "Due",
                                    render: (invoice) => (invoice.dueAt ? formatDate(invoice.dueAt) : "—"),
                                },
                                {
                                    key: "status",
                                    label: "Status",
                                    render: (invoice) => (
                                        <StatusBadge status={INVOICE_STATUS_META[invoice.status]} />
                                    ),
                                },
                            ]}
                        />
                    ),
                },
                {
                    value: "activity",
                    label: "Activity",
                    content: <ActivityTimeline targets={[{ type: "Advertiser", id: advertiser.id }]} noun="this advertiser" />,
                },
            ]}
        />
        )}
        </AccountClosure>
    );
}

/* ------------------------------------------------------------------ */
/* Recent bookings                                                     */
/* ------------------------------------------------------------------ */

/**
 * The frame's Recent bookings card: the newest orders raised from this
 * account's campaigns (E7-2's `?advertiserId=`), the site, the flight and
 * the budget, each opening the order.
 */
function RecentBookingsCard({ bookings }: { bookings: OrdersPage | null }) {
    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground">Recent bookings</h3>
                {bookings && bookings.total > bookings.items.length && (
                    <Link href="/bookings" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                        All {formatNumber(bookings.total)} on the board
                    </Link>
                )}
            </div>
            {!bookings ? (
                <p className="mt-3 text-sm text-muted-foreground">
                    Orders could not be read. Reload to try again.
                </p>
            ) : bookings.items.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                    No orders yet. One is raised for every spot the moment a campaign is paid for.
                </p>
            ) : (
                <ul className="mt-3 divide-y">
                    {bookings.items.map((order) => (
                        <li key={order.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                            <div className="min-w-0">
                                <Link
                                    href={`/orders/${order.id}`}
                                    className="block truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
                                >
                                    {order.listing}
                                </Link>
                                <p className="truncate text-xs text-muted-foreground">
                                    {[
                                        order.campaignName,
                                        order.startDate && order.endDate
                                            ? `${formatDate(order.startDate)} – ${formatDate(order.endDate)}`
                                            : null,
                                        order.status.replace(/_/g, " ").toLowerCase(),
                                    ]
                                        .filter(Boolean)
                                        .join(" · ")}
                                </p>
                            </div>
                            <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                                {order.budget === null ? "—" : formatINR(order.budget)}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}
