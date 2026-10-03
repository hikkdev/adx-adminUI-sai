"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { EyeOff, ExternalLink, Loader2, Megaphone, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { BulkActions, type BulkAction } from "@/components/adx/bulk-actions";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DataTable } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ROSTER_MENU_LABEL, RosterRowMenu, type RosterMenuEntry } from "@/components/adx/party-roster-columns";
import { RosterSearch, StatusSelect, type StatusSelectOption } from "@/components/adx/party-roster-filter-bar";
import { PlacedByCell, placedByView } from "@/components/adx/placed-by";
import { ServerPager } from "@/components/adx/server-pager";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { failureMessage } from "@/lib/bulk";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import {
    LANDING_PAGE_STATUS_META,
    landingAdvertiser,
    landingPageService,
    landingTitle,
    previewUrl,
    unpublishReason,
    type LandingPageRow,
    type LandingPageStatus,
    type LandingPagesPage,
} from "@/services/landing-pages";
import { LandingPreview } from "./landing-preview";

/** The one line under the title — 2 Oct 2026, the owner: "Landing pages section, we don't even know how they work". */
export const LANDING_EXPLAINER =
    "Each campaign can have one landing page at adx.in/p/…. People reach it by scanning the campaign's QR code; the advertiser drafts it with AI from the brief and publishes it. Unpublish anything that breaks the rules.";

const STATUS_OPTIONS: StatusSelectOption[] = [
    { value: "PUBLISHED", label: "Published", description: "Live at /p/… — what a scan opens now." },
    { value: "DRAFT", label: "Draft", description: "Not live: being written, or taken down." },
    { value: "ALL", label: "Everyone", description: "Every page, published or not." },
];

/** A count cell: the figure, or a dash when the read does not carry it. */
const countCell = (value: number | null | undefined) => (value === null || value === undefined ? "—" : formatNumber(value));

/** What a failure is called in the summary. */
const pageLabel = (row: LandingPageRow): string => `${landingTitle(row)} (/p/${row.slug})`;

interface LandingPagesViewProps {
    page: LandingPagesPage;
    status: LandingPageStatus | "ALL";
    onStatusChange: (status: LandingPageStatus | "ALL") => void;
    searchText: string;
    onSearchText: (text: string) => void;
    pageNumber: number;
    pageSize: number;
    onPage: (page: number) => void;
    refreshing: boolean;
    onChanged: () => void;
}

/**
 * The Landing pages tab — 2 Oct 2026. The shared table (checkboxes,
 * Columns, the server's pager) over `GET /campaigns/landing-pages`, the
 * Status select with its counts and the search by campaign, advertiser or
 * slug; each row previews in a side drawer, opens the live page or its
 * campaign, and can be unpublished with a reason. "Unpublish selected…"
 * sends one reason for all; the ones that fail stay ticked.
 */
export function LandingPagesView({ page, status, onStatusChange, searchText, onSearchText, pageNumber, pageSize, onPage, refreshing, onChanged }: LandingPagesViewProps) {
    const router = useRouter();
    const [previewing, setPreviewing] = React.useState<LandingPageRow | null>(null);
    const [unpublishing, setUnpublishing] = React.useState<LandingPageRow | null>(null);

    const columns = React.useMemo<ColumnDef<LandingPageRow>[]>(
        () => [
            {
                id: "page",
                accessorFn: (row) => `${landingTitle(row)} ${row.slug}`,
                header: "Page",
                cell: ({ row }) => (
                    <div className="min-w-0 max-w-[260px]">
                        <p className="truncate font-medium text-foreground" title={landingTitle(row.original)}>
                            {landingTitle(row.original)}
                        </p>
                        {row.original.status === "PUBLISHED" ? (
                            <a
                                href={previewUrl(row.original.slug)}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                className="font-mono text-[11px] text-primary underline-offset-4 hover:underline"
                            >
                                /p/{row.original.slug}
                            </a>
                        ) : (
                            <p className="font-mono text-[11px] text-muted-foreground">/p/{row.original.slug}</p>
                        )}
                    </div>
                ),
            },
            {
                id: "campaign",
                accessorFn: (row) => row.campaign?.name ?? row.campaignId,
                header: "Campaign",
                cell: ({ row }) => (
                    <Link
                        href={`/campaigns/${row.original.campaignId}`}
                        onClick={(event) => event.stopPropagation()}
                        className="block max-w-[200px] truncate text-primary underline-offset-4 hover:underline"
                        title={row.original.campaign?.name ?? undefined}
                    >
                        {row.original.campaign?.name ?? row.original.campaignId}
                    </Link>
                ),
            },
            {
                id: "advertiser",
                accessorFn: (row) => placedByView(landingAdvertiser(row))?.title ?? "",
                header: "Advertiser",
                cell: ({ row }) => <PlacedByCell placedBy={landingAdvertiser(row.original)} testId="landing-advertiser" />,
            },
            {
                id: "status",
                accessorKey: "status",
                header: "Status",
                cell: ({ row }) => <StatusBadge status={LANDING_PAGE_STATUS_META[row.original.status]} />,
            },
            {
                id: "ai-drafted",
                accessorFn: (row) => (row.generatedByAi ? 1 : 0),
                header: "AI-drafted",
                cell: ({ row }) =>
                    row.original.generatedByAi ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Sparkles className="size-3.5" aria-hidden />
                            Yes
                        </span>
                    ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                    ),
            },
            {
                id: "published",
                accessorFn: (row) => row.publishedAt ?? "",
                header: "Published on",
                cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{row.original.publishedAt ? formatDate(row.original.publishedAt) : "—"}</span>,
            },
            {
                id: "views",
                accessorFn: (row) => row.views ?? -1,
                header: "Views",
                cell: ({ row }) => <span className="tabular-nums">{countCell(row.original.views)}</span>,
            },
            {
                id: "cta-clicks",
                accessorFn: (row) => row.ctaClicks ?? -1,
                header: "CTA clicks",
                cell: ({ row }) => <span className="tabular-nums">{countCell(row.original.ctaClicks)}</span>,
            },
            {
                id: "enquiries",
                accessorFn: (row) => row.enquiries ?? -1,
                header: "Enquiries",
                cell: ({ row }) => <span className="tabular-nums">{countCell(row.original.enquiries)}</span>,
            },
            {
                id: "actions",
                enableHiding: false,
                size: 48,
                cell: ({ row }) => {
                    const item = row.original;
                    const entries: RosterMenuEntry[] = [
                        { kind: "label", label: ROSTER_MENU_LABEL },
                        { kind: "item", label: "Preview", onSelect: () => setPreviewing(item) },
                        ...(item.status === "PUBLISHED"
                            ? ([{ kind: "item", label: "Open page", onSelect: () => window.open(previewUrl(item.slug), "_blank", "noopener") }] as RosterMenuEntry[])
                            : []),
                        { kind: "item", label: "Open campaign", onSelect: () => router.push(`/campaigns/${item.campaignId}`) },
                        ...(item.status === "PUBLISHED"
                            ? ([{ kind: "separator" }, { kind: "item", label: "Unpublish…", destructive: true, onSelect: () => setUnpublishing(item) }] as RosterMenuEntry[])
                            : []),
                    ];
                    return <RosterRowMenu entries={entries} />;
                },
            },
        ],
        [router],
    );

    const published = page.counts.PUBLISHED ?? 0;
    const drafts = page.counts.DRAFT ?? 0;
    const counts: Record<string, number> = { PUBLISHED: published, DRAFT: drafts, ALL: published + drafts };

    return (
        <div className="space-y-5">
            <PageHeader title="Landing pages" subtitle={LANDING_EXPLAINER} />
            <DataTable
                columns={columns}
                data={page.items}
                showPagination={false}
                getRowId={(row) => row.id}
                onRowClick={(row) => setPreviewing(row)}
                toolbar={
                    <div className="flex flex-1 flex-wrap items-center gap-2" data-testid="landing-filters">
                        <RosterSearch value={searchText} onChange={onSearchText} placeholder="Search campaign, advertiser or /p/ address" />
                        <StatusSelect options={STATUS_OPTIONS} value={status} counts={counts} onChange={(value) => onStatusChange(value as LandingPageStatus | "ALL")} />
                        {refreshing && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />}
                    </div>
                }
                bulkActions={(selected, _clear, keep) => (
                    <LandingBulkBar
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
                        title={searchText.trim() ? "No landing pages match" : "No landing pages here"}
                        description={
                            searchText.trim()
                                ? "Clear the search or pick another status."
                                : "A page appears once an advertiser drafts one from their campaign brief; it goes live when they publish it."
                        }
                    />
                }
            />
            <ServerPager total={page.total} pageNumber={pageNumber} pageSize={pageSize} onPageChange={onPage} />

            <PreviewDrawer
                row={previewing}
                onOpenChange={(open) => !open && setPreviewing(null)}
                onUnpublish={(row) => {
                    setPreviewing(null);
                    setUnpublishing(row);
                }}
            />
            <UnpublishDialog row={unpublishing} onOpenChange={(open) => !open && setUnpublishing(null)} onDone={onChanged} />
        </div>
    );
}

/** The reason box both unpublishes share — the advertiser reads it. */
function ReasonField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
    return (
        <div className="grid gap-1.5">
            <Label htmlFor={id}>Reason — what the advertiser reads</Label>
            <Textarea id={id} rows={3} value={value} maxLength={500} onChange={(event) => onChange(event.target.value)} placeholder="The offer block promises a discount the brief does not authorise." />
        </div>
    );
}

const UNPUBLISH_EFFECT =
    "Back to draft: /p/… stops answering. Codes on the artwork keep counting scans and fall through to the plain thanks page. The campaign's creator is told the reason.";

/** "Unpublish selected…" — one reason for all; a draft is skipped; the failures stay ticked. */
function LandingBulkBar({ rows, onSettled }: { rows: LandingPageRow[]; onSettled: (failed: LandingPageRow[]) => void }) {
    const [reason, setReason] = React.useState("");
    const actions: BulkAction<LandingPageRow>[] = [
        {
            key: "unpublish",
            label: "Unpublish selected…",
            icon: EyeOff,
            skip: (row) => (row.status === "PUBLISHED" ? null : "not published"),
            participle: "unpublished",
            noun: ["page", "pages"],
            phrase: (count) => `Unpublish ${count}`,
            description: UNPUBLISH_EFFECT,
            destructive: true,
            ready: unpublishReason(reason) !== null,
            onOpen: () => setReason(""),
            body: <ReasonField id="bulk-unpublish-reason" value={reason} onChange={setReason} />,
            run: (row) => landingPageService.unpublish(row.campaignId, unpublishReason(reason) ?? ""),
        },
    ];
    return <BulkActions<LandingPageRow> rows={rows} actions={actions} label={pageLabel} onSettled={(outcome) => onSettled(outcome.failed.map((failure) => failure.row))} />;
}

/** Unpublish… on one page — this tab's row menu and drawer, and the campaign page's Landing page card. Addressed by the campaign. */
export function UnpublishDialog({ row, onOpenChange, onDone }: { row: Pick<LandingPageRow, "campaignId"> | null; onOpenChange: (open: boolean) => void; onDone: () => void }) {
    /* The reason belongs to the page it was typed for: another page opens the box empty. */
    const [draft, setDraft] = React.useState<{ for: string | null; text: string }>({ for: null, text: "" });
    const reason = row && draft.for === row.campaignId ? draft.text : "";
    const setReason = (text: string) => setDraft({ for: row?.campaignId ?? null, text });
    const [busy, setBusy] = React.useState(false);
    return (
        <ConfirmDialog
            open={row !== null}
            onOpenChange={onOpenChange}
            title="Unpublish this landing page?"
            description={UNPUBLISH_EFFECT}
            confirmLabel="Unpublish"
            destructive
            busy={busy}
            disabled={unpublishReason(reason) === null}
            onConfirm={async () => {
                const trimmed = unpublishReason(reason);
                if (!row || !trimmed) return;
                setBusy(true);
                try {
                    await landingPageService.unpublish(row.campaignId, trimmed);
                    toast.success("Landing page unpublished", { description: "Back to draft. Scans still count; the campaign's creator has been told why." });
                    onOpenChange(false);
                    onDone();
                } catch (cause) {
                    toast.error("Could not unpublish the page", { description: failureMessage(cause) });
                } finally {
                    setBusy(false);
                }
            }}
        >
            <ReasonField id="unpublish-reason" value={reason} onChange={setReason} />
        </ConfirmDialog>
    );
}

/** Preview — the side drawer: the page as people see it (or its blocks, for a draft), its facts and its numbers. */
function PreviewDrawer({ row, onOpenChange, onUnpublish }: { row: LandingPageRow | null; onOpenChange: (open: boolean) => void; onUnpublish: (row: LandingPageRow) => void }) {
    return (
        <Sheet open={row !== null} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[560px]">
                {row ? (
                    <>
                        <SheetHeader className="space-y-1 border-b px-5 py-4 text-left">
                            <SheetTitle className="text-base">{landingTitle(row)}</SheetTitle>
                            <SheetDescription className="font-mono text-xs">/p/{row.slug}</SheetDescription>
                        </SheetHeader>
                        <div className="space-y-5 px-5 py-5">
                            <div className="flex flex-wrap items-center gap-2">
                                {row.status === "PUBLISHED" && (
                                    <Button variant="outline" size="sm" className="h-8 bg-card" asChild>
                                        <a href={previewUrl(row.slug)} target="_blank" rel="noreferrer">
                                            <ExternalLink className="mr-1.5 size-3.5" />
                                            Open page
                                        </a>
                                    </Button>
                                )}
                                <Button variant="outline" size="sm" className="h-8 bg-card" asChild>
                                    <Link href={`/campaigns/${row.campaignId}`}>Open campaign</Link>
                                </Button>
                                {row.status === "PUBLISHED" && (
                                    <Button variant="outline" size="sm" className="h-8 bg-card text-danger hover:text-danger" onClick={() => onUnpublish(row)}>
                                        Unpublish…
                                    </Button>
                                )}
                            </div>
                            <FieldList
                                items={[
                                    ["Status", LANDING_PAGE_STATUS_META[row.status].label],
                                    ["Campaign", row.campaign ? `${row.campaign.name} · ${row.campaign.reference}` : row.campaignId],
                                    ["Advertiser", placedByView(landingAdvertiser(row))?.title ?? "—"],
                                    ["AI-drafted", row.generatedByAi ? "Yes — from the campaign brief" : "No"],
                                    ["Published", row.publishedAt ? formatDateTime(row.publishedAt) : "Not live"],
                                    ["Version", `v${row.version}`],
                                    ["Views · CTA clicks · Enquiries", [countCell(row.views), countCell(row.ctaClicks), countCell(row.enquiries)].join(" · ")],
                                ]}
                            />
                            <LandingPreview slug={row.slug} status={row.status} blocks={row.blocks} theme={row.theme} title={landingTitle(row)} />
                        </div>
                    </>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}
