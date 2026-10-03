"use client";

import * as React from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FilterChips } from "@/components/adx/filter-chips";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import {
    PROMOTION_STATUSES,
    PROMOTION_STATUS_META,
    buyerLabel,
    pctLabel,
    promotionsReadApi,
    promotionsService,
    runLabel,
    type AdBookingRow,
    type AdSlot,
    type PromotionPage,
    type PromotionStatus,
} from "@/services/promotions";
import { AdsFrame } from "../ads-frame";
import { ArtworkPreview, TargetLink, citiesLabel, moneyOrDash, slotSize } from "../ad-parts";
import { StatsCharts } from "../stats-charts";
import { AdGallery, DisplayAdsViewToggle, type DisplayAdsView } from "./ad-gallery";

const ALL = "ALL";
const ANY = "__any__";

/**
 * Every display ad: the status chips carry the list contract's counts, the
 * slot and the search are `?`s the server cuts. Seen as a list (the
 * default) or, 28 Sep 2026, as a gallery of each ad's artwork — the
 * pictures advertisers upload live here with their ads, not in Content ›
 * Media library.
 */
export function DisplayAds() {
    const live = promotionsReadApi();
    const [view, setView] = React.useState<DisplayAdsView>("list");
    const [status, setStatus] = React.useState<PromotionStatus | typeof ALL>(ALL);
    const [slotKey, setSlotKey] = React.useState("");
    const [q, setQ] = React.useState("");
    const search = useDebounced(q.trim(), 300);
    const [openId, setOpenId] = React.useState<string | null>(null);

    const slots = useApiResource<AdSlot[]>(`promotions:slots:${live}`, () => (live ? promotionsService.slots() : Promise.resolve([])));
    const page = useApiResource<PromotionPage<AdBookingRow>>(`promotions:ads:${live}:${status}:${slotKey}:${search}`, () =>
        live
            ? promotionsService.ads({ status: status === ALL ? undefined : status, slotKey: slotKey || undefined, q: search || undefined, pageSize: 100 })
            : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 100, counts: {} }),
    );

    const counts = page.data?.counts ?? {};
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

    return (
        <AdsFrame subtitle="Every display ad bought in an ad slot, in every state.">
            <div className="space-y-3">
                <FilterChips
                    value={status}
                    onChange={setStatus}
                    chips={[{ value: ALL, label: "All", count: total }, ...PROMOTION_STATUSES.map((value) => ({ value, label: PROMOTION_STATUS_META[value].label, count: counts[value] ?? 0 }))]}
                />
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full max-w-xs">
                        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, ADB id or buyer" className="h-9 bg-card pl-8" aria-label="Search ads" />
                    </div>
                    <Select value={slotKey || ANY} onValueChange={(value) => setSlotKey(value === ANY ? "" : value)}>
                        <SelectTrigger className="h-9 w-56 bg-card" aria-label="Slot">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ANY}>Every slot</SelectItem>
                            {(slots.data ?? []).map((slot) => (
                                <SelectItem key={slot.key} value={slot.key}>
                                    {slot.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {page.loading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}
                    <div className="ml-auto">
                        <DisplayAdsViewToggle value={view} onChange={setView} />
                    </div>
                </div>
                {page.error ? (
                    <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{page.error}</p>
                ) : view === "gallery" ? (
                    <AdGallery rows={page.data?.items ?? []} loading={page.loading} onOpen={setOpenId} />
                ) : (
                    <SimpleTable<AdBookingRow>
                        rows={page.data?.items ?? []}
                        rowKey={(row) => row.id}
                        emptyMessage={page.loading ? "Loading…" : "No ads match."}
                        columns={[
                            {
                                key: "ad",
                                label: "Ad",
                                render: (row) => (
                                    <button type="button" onClick={() => setOpenId(row.id)} className="text-left" data-testid={`ad-open-${row.id}`}>
                                        <span className="block text-sm font-medium text-foreground hover:underline">{row.title}</span>
                                        <span className="block font-mono text-[11px] text-muted-foreground">{row.displayId ?? row.id}</span>
                                    </button>
                                ),
                            },
                            { key: "buyer", label: "Buyer", render: (row) => <span className="text-sm">{buyerLabel(row)}</span> },
                            { key: "slot", label: "Slot", render: (row) => <span className="text-sm">{row.slot?.label ?? "—"}</span> },
                            { key: "run", label: "Runs", render: (row) => <span className="text-xs text-muted-foreground">{runLabel(row)}</span> },
                            { key: "status", label: "Status", render: (row) => <StatusBadge status={PROMOTION_STATUS_META[row.status] ?? { label: row.status, tone: "neutral" }} /> },
                            { key: "total", label: "Total", className: "text-right", render: (row) => <span className="tabular-nums text-sm">{formatMoney(row.total)}</span> },
                        ]}
                    />
                )}
                {page.data && page.data.total > page.data.items.length && (
                    <p className="text-xs text-muted-foreground">
                        Showing {page.data.items.length} of {page.data.total} — narrow the search to reach the rest.
                    </p>
                )}
            </div>
            <AdDetailSheet id={openId} row={page.data?.items.find((item) => item.id === openId) ?? null} slots={slots.data ?? []} onOpenChange={(open) => !open && setOpenId(null)} />
        </AdsFrame>
    );
}

/** One ad in full: its artwork in the slot's shape, the money, the review, and its views and taps by day. */
function AdDetailSheet({ id, row, slots, onOpenChange }: { id: string | null; row: AdBookingRow | null; slots: AdSlot[]; onOpenChange: (open: boolean) => void }) {
    const resource = useApiResource<AdBookingRow | null>(`promotions:ad:${id}`, () => (id ? promotionsService.ad(id) : Promise.resolve(null)));
    /* The one-ad read carries the numbers; the desk's row carries the buyer and slot it joined. */
    const ad = resource.data ? { ...resource.data, advertiser: resource.data.advertiser ?? row?.advertiser, slot: resource.data.slot ?? row?.slot } : null;
    const slot = ad ? slots.find((item) => item.key === ad.slot?.key) : undefined;
    return (
        <Sheet open={id !== null} onOpenChange={onOpenChange}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
                <SheetHeader>
                    <SheetTitle>{ad?.title ?? "Ad"}</SheetTitle>
                    <SheetDescription>{ad ? `${ad.displayId ?? ad.id} · ${slot?.label ?? ad.slot?.label ?? ""}` : "Loading…"}</SheetDescription>
                </SheetHeader>
                {resource.loading && !ad ? (
                    <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
                    </p>
                ) : resource.error ? (
                    <p className="mt-6 text-sm text-danger">{resource.error}</p>
                ) : ad ? (
                    <div className="mt-5 space-y-5" data-testid="ad-detail">
                        <div className="flex items-center gap-2">
                            <StatusBadge status={PROMOTION_STATUS_META[ad.status] ?? { label: ad.status, tone: "neutral" }} />
                            {ad.reviewNote && <span className="text-xs text-muted-foreground">“{ad.reviewNote}”</span>}
                        </div>
                        <ArtworkPreview media={ad.media} size={slotSize(slot, ad.media)} headline={ad.headline} ctaLabel={ad.ctaLabel} maxWidth={400} />
                        <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[120px_1fr]">
                            <dt className="text-muted-foreground">Buyer</dt>
                            <dd>{buyerLabel(ad)}</dd>
                            <dt className="text-muted-foreground">Runs</dt>
                            <dd>{runLabel(ad)}</dd>
                            <dt className="text-muted-foreground">Cities</dt>
                            <dd>{citiesLabel(ad)}</dd>
                            <dt className="text-muted-foreground">Opens</dt>
                            <dd className="min-w-0">
                                <TargetLink url={ad.targetUrl} />
                            </dd>
                            <dt className="text-muted-foreground">Price</dt>
                            <dd>
                                {formatMoney(ad.ratePerDay)} a day × {ad.days} = {formatMoney(ad.subtotal)} + GST {formatMoney(ad.gstAmount)} = <span className="font-medium">{formatMoney(ad.total)}</span>
                            </dd>
                            <dt className="text-muted-foreground">Paid</dt>
                            <dd>{ad.paidAt ? formatDateTime(ad.paidAt) : "—"}</dd>
                            {ad.reviewedAt && (
                                <>
                                    <dt className="text-muted-foreground">Reviewed</dt>
                                    <dd>{formatDateTime(ad.reviewedAt)}</dd>
                                </>
                            )}
                            {ad.refundedAt && (
                                <>
                                    <dt className="text-muted-foreground">Refunded</dt>
                                    <dd>
                                        {formatDateTime(ad.refundedAt)} · {moneyOrDash(ad.total)}
                                    </dd>
                                </>
                            )}
                            {ad.cancelledAt && (
                                <>
                                    <dt className="text-muted-foreground">Cancelled</dt>
                                    <dd>
                                        {formatDateTime(ad.cancelledAt)}
                                        {ad.cancelReason ? ` — ${ad.cancelReason}` : ""}
                                    </dd>
                                </>
                            )}
                        </dl>
                        {ad.stats ? (
                            <div className="space-y-3 border-t pt-4">
                                <div className="grid grid-cols-3 gap-3">
                                    <Figure label="Views" value={formatNumber(ad.stats.impressions)} />
                                    <Figure label="Taps" value={formatNumber(ad.stats.clicks)} />
                                    <Figure label="Tap rate" value={pctLabel(ad.stats.ctr, ad.stats.impressions)} />
                                </div>
                                <StatsCharts stats={ad.stats} />
                            </div>
                        ) : (
                            <p className="border-t pt-4 text-sm text-muted-foreground">No numbers for this ad yet.</p>
                        )}
                    </div>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

function Figure({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md border p-3">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{value}</p>
        </div>
    );
}
