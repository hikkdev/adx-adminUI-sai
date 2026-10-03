"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Download, Loader2, Megaphone, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdvertiserCombobox, type AdvertiserPick } from "@/components/adx/advertiser-combobox";
import { BulkActions } from "@/components/adx/bulk-actions";
import { CityCombobox } from "@/components/adx/city-combobox";
import { DataTable } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ROSTER_MENU_LABEL, RosterRowMenu, type RosterMenuEntry } from "@/components/adx/party-roster-columns";
import { RosterSearch, StatusSelect, type StatusSelectOption } from "@/components/adx/party-roster-filter-bar";
import { PlacedByCell, placedByView } from "@/components/adx/placed-by";
import { ServerPager } from "@/components/adx/server-pager";
import { StatusBadge } from "@/components/adx/status-badge";
import { saveBlob } from "@/lib/api-client";
import { failureMessage, formatCsv } from "@/lib/bulk";
import type { CityFacet } from "@/lib/city-facet";
import { formatMoney, formatNumber } from "@/lib/format";
import { CITY_STAGES } from "@/services/geo";
import { previewUrl } from "@/services/landing-pages";
import {
    CAMPAIGN_EXPORT_CAP,
    CAMPAIGN_GOAL_LABEL,
    CAMPAIGN_STATUSES,
    CAMPAIGN_STATUS_DESCRIPTION,
    CAMPAIGN_STATUS_TONE,
    WAITING_ON_META,
    WAITING_ON_REASONS,
    awaitingPayment,
    campaignService,
    campaignStatusLabel,
    campaignsCsvRows,
    canCancel,
    flightWithDaysLeft,
    performanceLine,
    waitingOnLine,
    type CampaignListQuery,
    type CampaignRow,
    type CampaignsPage,
} from "@/services/campaigns";
import { AuthorizeDialog } from "./authorize-dialog";
import { CancelCampaignDialog, campaignRowLabel, remindAdvertiser, useCampaignBulkActions } from "./campaign-actions";
import type { CampaignsFilters } from "./campaigns-loader";

interface CampaignsTableProps {
    page: CampaignsPage;
    filters: CampaignsFilters;
    searchText: string;
    onSearchText: (text: string) => void;
    city: CityFacet;
    onCity: (city: CityFacet) => void;
    advertiser: AdvertiserPick | null;
    onFilters: (patch: Partial<CampaignsFilters>) => void;
    onClear: () => void;
    /** The read is refetching under the rows on screen. */
    refreshing: boolean;
    /** The filters as the read sends them, for "Export CSV" over the whole filtered set. */
    exportQuery: Omit<CampaignListQuery, "page" | "pageSize">;
    pageSize: number;
    onChanged: () => void;
}

/** The pill under a status: what the campaign waits on, in plain words. */
export function WaitingOnPill({ reasons }: { reasons: readonly string[] }) {
    const line = waitingOnLine(reasons);
    if (!line) return null;
    return (
        <span className="inline-flex max-w-[220px] rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning" data-testid="waiting-on">
            <span className="truncate" title={line}>
                {line}
            </span>
        </span>
    );
}

/** "Live · 12" — the Status select's options, every status with its line and the server's count. */
function statusOptions(): StatusSelectOption[] {
    return [
        { value: "ALL", label: "All statuses", description: "Every campaign, whatever state it is in." },
        ...CAMPAIGN_STATUSES.map((status) => ({ value: status, label: campaignStatusLabel(status), description: CAMPAIGN_STATUS_DESCRIPTION[status] })),
    ];
}

const WAITING_OPTIONS: StatusSelectOption[] = [
    { value: "ANY", label: "Waiting on anything", description: "No filter on what holds a campaign back." },
    ...WAITING_ON_REASONS.map((reason) => ({ value: reason, label: WAITING_ON_META[reason].label, description: WAITING_ON_META[reason].description })),
];

/**
 * The campaigns list — 2 Oct 2026, the owner: "Campaigns section feels too
 * weak here." The shared table (checkboxes, Columns, the server's pager),
 * the shared filter bar's controls in its order — Search · Advertiser ·
 * City · Status · Waiting on · Dates — with Columns on the right, the
 * rosters' row menu, and the shared bulk bar (Remind advertiser, Cancel…,
 * Export CSV). The unexplained "N% committed" bar is gone: Booked / Paid
 * says what was booked and what was paid, in rupees.
 */
export function CampaignsTable({
    page,
    filters,
    searchText,
    onSearchText,
    city,
    onCity,
    advertiser,
    onFilters,
    onClear,
    refreshing,
    exportQuery,
    pageSize,
    onChanged,
}: CampaignsTableProps) {
    const router = useRouter();
    const [cancelTarget, setCancelTarget] = React.useState<CampaignRow | null>(null);
    const [exporting, setExporting] = React.useState(false);
    /**
     * Launching a campaign commits money, so it goes through the real endpoint
     * with the reference typed back and, above the threshold, a second admin
     * (Lot C, Q88). The dialog is the one the campaign page uses.
     */
    const [authorizeTarget, setAuthorizeTarget] = React.useState<CampaignRow | null>(null);

    const columns = React.useMemo<ColumnDef<CampaignRow>[]>(
        () => [
            {
                id: "campaign",
                accessorFn: (campaign) => `${campaign.name} ${campaign.reference}`,
                header: "Campaign",
                cell: ({ row }) => (
                    <div className="min-w-0 max-w-[240px]">
                        <p className="truncate font-medium text-foreground" title={row.original.name}>
                            {row.original.name}
                        </p>
                        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{row.original.reference}</p>
                    </div>
                ),
            },
            {
                id: "advertiser",
                accessorFn: (campaign) => placedByView(campaign.advertiser)?.title ?? "",
                header: "Advertiser",
                /* The orders' Placed by cell — business + ADV-… · person, opening the advertiser. */
                cell: ({ row }) => <PlacedByCell placedBy={row.original.advertiser} testId="campaign-advertiser" />,
            },
            {
                id: "brand",
                accessorFn: (campaign) => campaign.brandName ?? "",
                header: "Brand",
                cell: ({ row }) => <span className="text-muted-foreground">{row.original.brandName ?? "—"}</span>,
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => (
                    <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={{ label: campaignStatusLabel(row.original.status), tone: CAMPAIGN_STATUS_TONE[row.original.status] }} />
                        <WaitingOnPill reasons={row.original.waitingOn} />
                    </div>
                ),
            },
            {
                id: "spots",
                accessorFn: (campaign) => campaign.spotsTotal,
                header: "Spots live",
                cell: ({ row }) =>
                    row.original.spotsLive === null ? (
                        <span className="tabular-nums text-muted-foreground">{formatNumber(row.original.spotsTotal)}</span>
                    ) : (
                        <span className="whitespace-nowrap tabular-nums" data-testid="spots-live">
                            {formatNumber(row.original.spotsLive)} <span className="text-muted-foreground">of {formatNumber(row.original.spotsTotal)}</span>
                        </span>
                    ),
            },
            {
                id: "flight",
                accessorFn: (campaign) => campaign.startDate ?? "",
                header: "Flight",
                cell: ({ row }) => {
                    const { flight, left } = flightWithDaysLeft(row.original);
                    return (
                        <div className="whitespace-nowrap">
                            <p className="text-muted-foreground">{flight}</p>
                            {left ? <p className="text-[11px] font-medium text-foreground">{left}</p> : null}
                        </div>
                    );
                },
            },
            {
                id: "money",
                accessorFn: (campaign) => Number(campaign.committed ?? 0),
                header: "Booked / Paid",
                cell: ({ row }) => (
                    <div className="whitespace-nowrap text-right tabular-nums" data-testid="booked-paid">
                        {/* What the chosen spots come to, then what was actually paid. A draft has neither; that is not zero. */}
                        <p className="font-medium text-foreground">{row.original.committed ? formatMoney(row.original.committed) : "—"}</p>
                        <p className="text-[11px] text-muted-foreground">{row.original.paid ? `${formatMoney(row.original.paid)} paid` : "Not paid"}</p>
                    </div>
                ),
            },
            {
                id: "performance",
                accessorFn: (campaign) => campaign.performance?.scans ?? 0,
                header: "Performance",
                cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{performanceLine(row.original.performance) ?? "—"}</span>,
            },
            {
                id: "actions",
                enableHiding: false,
                enableSorting: false,
                size: 48,
                cell: ({ row }) => {
                    /* The rosters' menu: View · Open landing page · Remind advertiser, then the stopping actions after the separator. */
                    const campaign = row.original;
                    const landing = campaign.landingPage?.status === "PUBLISHED" ? campaign.landingPage : null;
                    const entries: RosterMenuEntry[] = [
                        { kind: "label", label: ROSTER_MENU_LABEL },
                        { kind: "item", label: "View", onSelect: () => router.push(`/campaigns/${campaign.id}`) },
                        ...(landing ? ([{ kind: "item", label: "Open landing page", onSelect: () => window.open(previewUrl(landing.slug), "_blank", "noopener") }] as RosterMenuEntry[]) : []),
                        ...(awaitingPayment(campaign)
                            ? ([
                                  { kind: "item", label: "Remind advertiser", onSelect: () => void remindAdvertiser(campaign) },
                                  /* Only a campaign sent to pay can launch; offering it on anything else is a button that always fails. */
                                  { kind: "item", label: "Authorise and launch", onSelect: () => setAuthorizeTarget(campaign) },
                              ] as RosterMenuEntry[])
                            : []),
                        ...(canCancel(campaign.status)
                            ? ([{ kind: "separator" }, { kind: "item", label: "Cancel…", destructive: true, onSelect: () => setCancelTarget(campaign) }] as RosterMenuEntry[])
                            : []),
                    ];
                    return <RosterRowMenu entries={entries} />;
                },
            },
        ],
        [router],
    );

    const everything = CAMPAIGN_STATUSES.reduce((sum, key) => sum + (page.counts[key] ?? 0), 0);
    const statusCounts: Record<string, number> = { ALL: everything, ...page.counts };
    const awaiting = page.counts.PENDING_PAYMENT ?? 0;
    const narrowed =
        filters.status !== "ALL" ||
        filters.q.trim() !== "" ||
        filters.advertiserId !== null ||
        filters.city !== "" ||
        filters.from !== "" ||
        filters.to !== "" ||
        filters.waitingOn !== null ||
        filters.goal !== null;

    async function exportMatching() {
        if (exporting) return;
        setExporting(true);
        try {
            const rows = await campaignService.listAll(exportQuery);
            saveCsv(rows, "campaigns.csv");
            toast.success(`${formatNumber(rows.length)} ${rows.length === 1 ? "campaign" : "campaigns"} exported`, {
                description: page.total > CAMPAIGN_EXPORT_CAP ? `The first ${formatNumber(CAMPAIGN_EXPORT_CAP)} — narrow the filters for the rest.` : undefined,
            });
        } catch (cause) {
            toast.error("Could not export the campaigns", { description: failureMessage(cause) });
        } finally {
            setExporting(false);
        }
    }

    const toolbar = (
        <div className="flex flex-1 flex-wrap items-center gap-2" data-testid="campaign-filters">
            <RosterSearch value={searchText} onChange={onSearchText} placeholder="Search campaign, reference, advertiser, ADV-/ADX- ID" />
            <AdvertiserCombobox id="campaigns-advertiser" value={advertiser} onChange={(pick) => onFilters({ advertiserId: pick?.id ?? null })} className="w-[200px]" />
            <CityCombobox
                id="campaigns-city"
                value={city.text}
                onChange={(text, picked) => onCity({ text, slug: picked?.slug ?? null })}
                placeholder="Any city"
                aria-label="City"
                stages={CITY_STAGES}
                className="w-[170px]"
            />
            <StatusSelect options={statusOptions()} value={filters.status} counts={statusCounts} onChange={(value) => onFilters({ status: value as CampaignsFilters["status"] })} />
            <StatusSelect options={WAITING_OPTIONS} value={filters.waitingOn ?? "ANY"} onChange={(value) => onFilters({ waitingOn: value === "ANY" ? null : value })} label="Waiting on" />
            {/* The flight overlaps these days; either end may be left open. Same height as every other control on the bar. */}
            <Input type="date" aria-label="Flight from" value={filters.from} max={filters.to || undefined} onChange={(event) => onFilters({ from: event.target.value })} className="h-9 w-[150px] bg-card" />
            <Input type="date" aria-label="Flight to" value={filters.to} min={filters.from || undefined} onChange={(event) => onFilters({ to: event.target.value })} className="h-9 w-[150px] bg-card" />
            {/* The overview's By goal rows open the list on a goal; the bar has no goal control, so the cut is said here and cleared with the rest. */}
            {filters.goal && <StatusBadge status={{ label: `Goal: ${CAMPAIGN_GOAL_LABEL[filters.goal] ?? filters.goal}`, tone: "info" }} />}
            {narrowed && (
                <Button variant="ghost" size="sm" className="h-9" onClick={onClear}>
                    <X className="mr-1 size-3.5" aria-hidden />
                    Clear
                </Button>
            )}
            {refreshing && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />}
            <Button
                variant="outline"
                className="h-9 bg-card"
                onClick={() => void exportMatching()}
                disabled={exporting || page.total === 0}
                title={`Every campaign these filters match, up to ${formatNumber(CAMPAIGN_EXPORT_CAP)}. Tick rows to export only those.`}
                data-testid="export-matching"
            >
                <Download className="mr-1.5 size-4" />
                {exporting ? "Exporting…" : "Export CSV"}
            </Button>
        </div>
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="Campaigns"
                subtitle={`${formatNumber(awaiting)} awaiting payment · ${formatNumber(page.total)} ${page.total === 1 ? "campaign" : "campaigns"}${narrowed ? " match these filters" : ""}`}
                actions={
                    <Button asChild>
                        <Link href="/campaigns/new">
                            <Plus className="mr-1.5 size-4" />
                            New campaign
                        </Link>
                    </Button>
                }
            />
            <DataTable
                columns={columns}
                data={page.items}
                toolbar={toolbar}
                showPagination={false}
                onRowClick={(campaign) => router.push(`/campaigns/${campaign.id}`)}
                /* The shared selection and bulk bar — keyed by id so the failures stay ticked over the reload. */
                getRowId={(campaign) => campaign.id}
                bulkActions={(selected, _clear, keep) => (
                    <CampaignBulkBar
                        rows={selected}
                        onSettled={(failed) => {
                            keep(failed);
                            onChanged();
                        }}
                    />
                )}
                emptyState={
                    <EmptyState
                        icon={Megaphone}
                        title={narrowed ? "No campaigns match" : "No campaigns yet"}
                        description={narrowed ? "Clear a filter to see the rest." : "A campaign is an advertiser's brief and the spots it books. The first one appears here as soon as it is started."}
                    />
                }
            />
            <ServerPager total={page.total} pageNumber={filters.page} pageSize={pageSize} onPageChange={(next) => onFilters({ page: next })} />

            <AuthorizeDialog
                campaign={authorizeTarget ? { id: authorizeTarget.id, name: authorizeTarget.name, reference: authorizeTarget.reference, total: authorizeTarget.committed } : null}
                onOpenChange={(open) => !open && setAuthorizeTarget(null)}
                onDone={() => {
                    setAuthorizeTarget(null);
                    onChanged();
                }}
            />
            <CancelCampaignDialog campaign={cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)} onDone={onChanged} />
        </div>
    );
}

/** The bar's buttons over the ticked rows: Remind advertiser, Cancel…, Export CSV. */
function CampaignBulkBar({ rows, onSettled }: { rows: CampaignRow[]; onSettled: (failed: CampaignRow[]) => void }) {
    const actions = useCampaignBulkActions<CampaignRow>(rows);
    return (
        <>
            <BulkActions<CampaignRow> rows={rows} actions={actions} label={campaignRowLabel} onSettled={(outcome) => onSettled(outcome.failed.map((failure) => failure.row))} />
            <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => saveCsv(rows, "campaigns-selected.csv")} data-testid="bulk-export">
                <Download className="mr-1.5 size-3.5" />
                Export CSV
            </Button>
        </>
    );
}

function saveCsv(rows: readonly CampaignRow[], filename: string): void {
    saveBlob(new Blob([formatCsv(campaignsCsvRows(rows))], { type: "text/csv;charset=utf-8" }), filename);
}
