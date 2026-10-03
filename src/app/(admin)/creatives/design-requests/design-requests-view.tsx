"use client";

import * as React from "react";
import Link from "next/link";
import { Palette, Paintbrush } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { useAuth } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { canQuoteDesign, designQuoteStatusMeta } from "@/services/campaigns";
import {
    CREATIVE_STATUS_META,
    DESIGN_STYLE_LABEL,
    briefOfRequest,
    requestDueLabel,
    type DesignRequestRow,
} from "@/services/moderation";
import { DeliverDesignDialog } from "../deliver-design-dialog";
import { DesignQuoteDialog } from "../design-quote-dialog";

export type RequestFilter = "ALL" | "OVERDUE" | "SENT_BACK";

/**
 * CR-1: the designs ADX owes.
 *
 * One card per campaign on the ADX Design Agency path with nothing
 * standing: the brief the advertiser wrote, the spots it prints on and their
 * sizes, when the flight starts, and a Deliver button that opens the same
 * upload the campaign page already had. A design the advertiser sent back
 * is here too, with their note, because that is a design ADX owes again.
 */
export function DesignRequestsView({
    rows,
    readAt,
    filter,
    onFilterChange,
    onChanged,
}: {
    rows: DesignRequestRow[];
    /** When the rows were read — the clock every due label runs from. */
    readAt: Date;
    filter: RequestFilter;
    onFilterChange: (filter: RequestFilter) => void;
    onChanged: () => void;
}) {
    const { can } = useAuth();
    const [delivering, setDelivering] = React.useState<DesignRequestRow | null>(null);
    /* DQ-1: the request being quoted; the button needs `content.edit`, as the route does. */
    const [quoting, setQuoting] = React.useState<DesignRequestRow | null>(null);
    const mayQuote = can("content.edit");

    const overdue = rows.filter((row) => requestDueLabel(row, readAt).overdue);
    const sentBack = rows.filter((row) => row.lastDelivery !== null);
    /* The chips cut the rows the read returned. The read is every request there
       is, not a page, so a view filter is exact rather than a filter over a cap. */
    const shown = filter === "OVERDUE" ? overdue : filter === "SENT_BACK" ? sentBack : rows;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Design requests"
                subtitle={
                    rows.length === 0
                        ? "Nothing owed. A request appears here the moment an advertiser chooses ADX Design Agency and submits."
                        : `${rows.length} design${rows.length === 1 ? "" : "s"} owed${overdue.length ? `, ${overdue.length} past the flight start` : ""}.`
                }
            />

            <FilterChips<RequestFilter>
                value={filter}
                onChange={onFilterChange}
                chips={[
                    { value: "ALL", label: "All", count: rows.length },
                    { value: "OVERDUE", label: "Overdue", count: overdue.length },
                    { value: "SENT_BACK", label: "Sent back", count: sentBack.length },
                ]}
            />

            {shown.length === 0 ? (
                <Card className="rounded-lg border-border shadow-none">
                    <EmptyState
                        icon={Palette}
                        title={filter === "ALL" ? "Nothing owed" : "Nothing here"}
                        description={
                            filter === "ALL"
                                ? "Every campaign that asked ADX to design has a design standing. New requests land here when an advertiser chooses ADX Design Agency and submits the campaign."
                                : "No request matches this chip."
                        }
                    />
                </Card>
            ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                    {shown.map((row) => (
                        <RequestCard
                            key={row.campaign.id}
                            row={row}
                            readAt={readAt}
                            onDeliver={() => setDelivering(row)}
                            onQuote={mayQuote && canQuoteDesign(row.campaign, row.campaign.designQuote) ? () => setQuoting(row) : null}
                        />
                    ))}
                </div>
            )}

            <DesignQuoteDialog
                campaign={quoting ? { id: quoting.campaign.id, name: quoting.campaign.name, reference: quoting.campaign.reference } : null}
                standing={quoting?.campaign.designQuote ?? null}
                onOpenChange={(open) => {
                    if (!open) setQuoting(null);
                }}
                onQuoted={() => {
                    setQuoting(null);
                    onChanged();
                }}
            />

            {delivering && (
                <DeliverDesignDialog
                    open={delivering !== null}
                    onOpenChange={(open) => {
                        if (!open) setDelivering(null);
                    }}
                    request={delivering}
                    onDelivered={() => {
                        setDelivering(null);
                        onChanged();
                    }}
                />
            )}
        </div>
    );
}

function RequestCard({
    row,
    readAt,
    onDeliver,
    onQuote,
}: {
    row: DesignRequestRow;
    readAt: Date;
    onDeliver: () => void;
    /** DQ-1: opens the quote dialog; null when the desk may not quote (no permission, paid, or the quote is accepted). */
    onQuote: (() => void) | null;
}) {
    const due = requestDueLabel(row, readAt);
    const brief = briefOfRequest(row);
    const advertiser = row.campaign.advertiser.companyName ?? row.campaign.advertiser.name;
    const quote = row.campaign.designQuote ?? null;

    return (
        <Card className="flex flex-col rounded-lg border-border p-5 shadow-none" data-testid={`request-${row.campaign.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <Link href={`/campaigns/${row.campaign.id}`} className="font-semibold text-foreground hover:underline">
                        {row.campaign.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                        {row.campaign.reference} · {advertiser}
                    </p>
                </div>
                <span className={cn("shrink-0 text-xs font-medium tabular-nums", due.overdue ? "text-danger" : "text-muted-foreground")} data-testid="request-due">
                    {due.label}
                </span>
            </div>

            {/* DQ-1: where the price stands — nothing named yet, quoted, accepted (a fee on the booking) or declined. */}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="request-quote">
                <StatusBadge status={designQuoteStatusMeta(quote)} />
                {quote ? (
                    <span>
                        {formatMoney(quote.amount)} + GST
                        {quote.quotedAt ? ` · quoted ${formatDate(quote.quotedAt)}` : ""}
                        {quote.respondedAt ? ` · answered ${formatDate(quote.respondedAt)}` : ""}
                    </span>
                ) : (
                    <span>No price named yet — the advertiser cannot accept a design fee until there is one.</span>
                )}
                {quote?.note && <span className="basis-full text-foreground">{quote.note}</span>}
            </div>

            {row.lastDelivery && (
                <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm" data-testid="request-sent-back">
                    <div className="flex items-center gap-2">
                        <StatusBadge status={CREATIVE_STATUS_META[row.lastDelivery.status]} />
                        <span className="text-xs text-muted-foreground">
                            {row.lastDelivery.reviewedAt ? formatDate(row.lastDelivery.reviewedAt) : formatDate(row.lastDelivery.createdAt)}
                        </span>
                    </div>
                    {row.lastDelivery.reviewNote && <p className="mt-1.5 text-foreground">{row.lastDelivery.reviewNote}</p>}
                </div>
            )}

            {brief ? (
                <dl className="mt-3 space-y-2 text-sm" data-testid="request-brief">
                    <div>
                        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Objective</dt>
                        <dd className="text-foreground">{brief.objective}</dd>
                    </div>
                    <div>
                        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Key message</dt>
                        <dd className="text-foreground">{brief.keyMessage}</dd>
                    </div>
                    <div>
                        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Style</dt>
                        <dd className="text-foreground">{DESIGN_STYLE_LABEL[brief.style]}</dd>
                    </div>
                </dl>
            ) : (
                <p className="mt-3 text-sm text-muted-foreground">No brief was written. Open the campaign for what it is selling.</p>
            )}

            <div className="mt-3 text-sm">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {row.spots.length === 0 ? "No spots yet" : `${row.spots.length} spot${row.spots.length === 1 ? "" : "s"}`}
                </p>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {row.spots.slice(0, 4).map((spot) => (
                        <li key={spot.id} className="truncate">
                            {spot.listing.title}
                            {spot.listing.city ? `, ${spot.listing.city}` : ""}
                            {spot.listing.widthFt && spot.listing.heightFt ? ` — ${spot.listing.widthFt} × ${spot.listing.heightFt} ft` : ""}
                        </li>
                    ))}
                    {row.spots.length > 4 && <li>and {row.spots.length - 4} more</li>}
                </ul>
            </div>

            <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                <span className="text-xs text-muted-foreground">
                    {row.campaign.startDate ? `Flight from ${formatDate(row.campaign.startDate)}` : "No flight date"}
                </span>
                <div className="flex items-center gap-2">
                    {onQuote && (
                        <Button size="sm" variant="outline" className="bg-card" onClick={onQuote} data-testid="request-quote-button">
                            {quote ? "Re-quote" : "Quote the design"}
                        </Button>
                    )}
                    <Button size="sm" onClick={onDeliver} data-testid="request-deliver">
                        <Paintbrush className="mr-1.5 size-4" />
                        Deliver design
                    </Button>
                </div>
            </div>
        </Card>
    );
}
