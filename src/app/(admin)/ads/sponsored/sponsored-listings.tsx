"use client";

import * as React from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FilterChips } from "@/components/adx/filter-chips";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import {
    BOOST_PLACEMENTS,
    BOOST_PLACEMENT_LABEL,
    PROMOTION_STATUSES,
    PROMOTION_STATUS_META,
    beforeStart,
    boostListingLabel,
    promotionsReadApi,
    promotionsService,
    runLabel,
    type BoostPlacement,
    type BoostRow,
    type PromotionPage,
    type PromotionStatus,
} from "@/services/promotions";
import { AdsFrame } from "../ads-frame";
import { ReasonDialog } from "../ad-parts";

const ALL = "ALL";
const ANY = "__any__";
const CANCELLABLE: readonly PromotionStatus[] = ["PENDING_PAYMENT", "SCHEDULED", "LIVE"];

/**
 * Sponsored listings: a publisher paid to have their own listing shown
 * first. No artwork to review — the listing is already approved — so the
 * desk's one act here is cancelling, with or without a refund.
 */
export function SponsoredListings() {
    const live = promotionsReadApi();
    const { can } = useAuth();
    const mayCancel = can("growth.edit");
    const [status, setStatus] = React.useState<PromotionStatus | typeof ALL>(ALL);
    const [placement, setPlacement] = React.useState<BoostPlacement | "">("");
    const [q, setQ] = React.useState("");
    const search = useDebounced(q.trim(), 300);
    const [cancelling, setCancelling] = React.useState<BoostRow | null>(null);
    const [refund, setRefund] = React.useState(true);
    const [busy, setBusy] = React.useState(false);

    const page = useApiResource<PromotionPage<BoostRow>>(`promotions:boosts:${live}:${status}:${placement}:${search}`, () =>
        live
            ? promotionsService.boosts({ status: status === ALL ? undefined : status, placement: placement || undefined, q: search || undefined, pageSize: 100 })
            : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 100, counts: {} }),
    );
    const counts = page.data?.counts ?? {};
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

    async function cancel(row: BoostRow, reason: string) {
        setBusy(true);
        try {
            await promotionsService.cancelBoost(row.id, reason, refund);
            toast.success(`${row.displayId ?? "Sponsored listing"} cancelled`, { description: refund ? `${formatMoney(row.total)} goes back to the publisher.` : "No refund." });
            setCancelling(null);
            page.reload();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not go through.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <AdsFrame subtitle="Listings their owners pay to show first — labelled “Sponsored” wherever they appear.">
            <div className="space-y-3">
                <FilterChips
                    value={status}
                    onChange={setStatus}
                    chips={[{ value: ALL, label: "All", count: total }, ...PROMOTION_STATUSES.filter((value) => value !== "PENDING_REVIEW").map((value) => ({ value, label: PROMOTION_STATUS_META[value].label, count: counts[value] ?? 0 }))]}
                />
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full max-w-xs">
                        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search listing, BST id or publisher" className="h-9 bg-card pl-8" aria-label="Search sponsored listings" />
                    </div>
                    <Select value={placement || ANY} onValueChange={(value) => setPlacement(value === ANY ? "" : (value as BoostPlacement))}>
                        <SelectTrigger className="h-9 w-48 bg-card" aria-label="Placement">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ANY}>Every placement</SelectItem>
                            {BOOST_PLACEMENTS.map((value) => (
                                <SelectItem key={value} value={value}>
                                    {BOOST_PLACEMENT_LABEL[value]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {page.loading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}
                </div>
                {page.error ? (
                    <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{page.error}</p>
                ) : (
                    <SimpleTable<BoostRow>
                        rows={page.data?.items ?? []}
                        rowKey={(row) => row.id}
                        emptyMessage={page.loading ? "Loading…" : "No sponsored listings match."}
                        columns={[
                            {
                                key: "listing",
                                label: "Listing",
                                render: (row) => (
                                    <span>
                                        <span className="block text-sm font-medium text-foreground">{boostListingLabel(row)}</span>
                                        <span className="block font-mono text-[11px] text-muted-foreground">{row.displayId ?? row.id}</span>
                                    </span>
                                ),
                            },
                            { key: "publisher", label: "Publisher", render: (row) => <span className="text-sm">{row.publisher?.name ?? row.publisher?.displayId ?? row.publisherId}</span> },
                            { key: "where", label: "Placement", render: (row) => <span className="text-sm">{row.placements.map((value) => BOOST_PLACEMENT_LABEL[value] ?? value).join(", ")}</span> },
                            { key: "scope", label: "City · category", render: (row) => <span className="text-xs text-muted-foreground">{[row.city, row.category].filter(Boolean).join(" · ")}</span> },
                            { key: "run", label: "Runs", render: (row) => <span className="text-xs text-muted-foreground">{runLabel(row)}</span> },
                            { key: "status", label: "Status", render: (row) => <StatusBadge status={PROMOTION_STATUS_META[row.status] ?? { label: row.status, tone: "neutral" }} /> },
                            { key: "total", label: "Total", className: "text-right", render: (row) => <span className="tabular-nums text-sm">{formatMoney(row.total)}</span> },
                            {
                                key: "act",
                                label: "",
                                className: "text-right",
                                render: (row) =>
                                    mayCancel && CANCELLABLE.includes(row.status) ? (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 bg-card text-danger hover:text-danger"
                                            onClick={() => {
                                                setRefund(row.status !== "PENDING_PAYMENT" && beforeStart(row));
                                                setCancelling(row);
                                            }}
                                        >
                                            Cancel
                                        </Button>
                                    ) : null,
                            },
                        ]}
                    />
                )}
            </div>
            <ReasonDialog
                open={cancelling !== null}
                title={`Cancel ${cancelling?.displayId ?? "this sponsored listing"}?`}
                description={cancelling ? `It stops showing first at once. ${cancelling.status === "PENDING_PAYMENT" ? "Nothing was paid yet." : `It was paid ${formatMoney(cancelling.total)}.`}` : ""}
                confirmLabel={refund ? "Cancel and refund" : "Cancel without refund"}
                busy={busy}
                extra={
                    cancelling && cancelling.status !== "PENDING_PAYMENT" ? (
                        <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                            <span>
                                <span className="block font-medium text-foreground">Refund {formatMoney(cancelling.total)} in full</span>
                                <span className="block text-xs text-muted-foreground">{beforeStart(cancelling) ? "It has not started yet." : "It has already run some days."}</span>
                            </span>
                            <Switch checked={refund} onCheckedChange={setRefund} aria-label="Refund" />
                        </label>
                    ) : null
                }
                onOpenChange={(open) => !open && setCancelling(null)}
                onConfirm={(reason) => cancelling && void cancel(cancelling, reason)}
            />
        </AdsFrame>
    );
}
