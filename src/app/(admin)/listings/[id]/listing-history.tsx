"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PrivateFile } from "@/components/adx/private-file";
import { SectionCard } from "@/components/adx/section-card";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import {
    plainLabel,
    type ListingBoostRecord,
    type ListingClaimRecord,
    type ListingComplianceCaseRecord,
    type ListingDisputeRecord,
    type ListingEarningsHoldRecord,
    type ListingPriceApprovalRecord,
    type ListingPriceLockRecord,
    type ListingPricingFactorRecord,
    type ListingRecord,
    type ListingVerificationRecord,
} from "@/services/listing-record";
import type { StatusMeta } from "@/types";
import { byLine } from "./listing-sections";

/**
 * The rows that hang off a listing (3 Oct 2026): the site checks, the
 * claims, the compliance cases, the held earnings and the disputes on the
 * Checks tab; the price approvals, locks and factor decisions under the
 * Pricing tab. Each is the latest few beside how many there are, with the
 * way to its own desk — this page reads them, the desks decide them.
 */

const words = (value: string): string => plainLabel(value.toLowerCase());

const tone = (status: string): StatusMeta["tone"] =>
    /ACCEPTED|APPROVED|VERIFIED|RESOLVED|RELEASED|CLOSED|LIVE/.test(status)
        ? "success"
        : /REJECTED|FORFEITED|ESCALATED/.test(status)
          ? "danger"
          : /WITHDRAWN|CANCELLED|ENDED/.test(status)
            ? "neutral"
            : "warning";

const pill = (status: string) => <StatusBadge status={{ label: words(status), tone: tone(status) }} />;

/** The section's title with its count, and "latest N" when the page shows fewer than there are. */
function counted(title: string, shown: number, total: number): string {
    return total > shown ? `${title} · latest ${shown} of ${formatNumber(total)}` : `${title} · ${formatNumber(total)}`;
}

function DeskLink({ href, label }: { href: string; label: string }) {
    return (
        <Button variant="outline" size="sm" className="bg-card" asChild>
            <Link href={href}>{label}</Link>
        </Button>
    );
}

export function ChecksTab({ record }: { record: ListingRecord }) {
    const { counts } = record;
    return (
        <div className="space-y-4">
            <SectionCard
                title={counted("Site verifications", record.verifications.length, counts.verifications)}
                description="Each visit or re-check: the photograph, how far from the pin it was taken, and whether the site QR was scanned."
                actions={<DeskLink href="/listings/verification" label="Verification desk" />}
                contentClassName="p-0"
            >
                <SimpleTable<ListingVerificationRecord>
                    rows={record.verifications}
                    rowKey={(row) => row.id}
                    emptyMessage="Nobody has verified this spot on site yet."
                    className="rounded-none border-0"
                    columns={[
                        {
                            key: "photo",
                            label: "Photograph",
                            render: (row) => (
                                <PrivateFile src={row.photoUrl} alt="Verification photograph" kind="image" className="h-12 w-16 rounded object-cover" frameClassName="h-12 w-16 rounded" />
                            ),
                        },
                        { key: "type", label: "Kind", render: (row) => (row.type === "AGENT_INITIAL" ? "Agent’s first visit" : "Publisher’s re-check") },
                        { key: "status", label: "Status", render: (row) => pill(row.status) },
                        {
                            key: "where",
                            label: "Distance · QR",
                            render: (row) => `${row.distanceMeters === null ? "Distance not worked out" : `${Math.round(row.distanceMeters)} m from the pin`} · ${row.qrScanned ? "QR scanned" : "QR not scanned"}`,
                        },
                        { key: "captured", label: "Taken", render: (row) => byLine(row.capturedAt, row.submittedBy) },
                        {
                            key: "reviewed",
                            label: "Reviewed",
                            render: (row) => (row.reviewedAt ? `${byLine(row.reviewedAt, row.reviewedBy)}${row.rejectionReason ? ` — ${row.rejectionReason}` : ""}` : "Not yet"),
                        },
                    ]}
                />
            </SectionCard>

            <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title={counted("Claims", record.claims.length, counts.claims)} actions={<DeskLink href="/listings/claims" label="Claims desk" />} contentClassName="p-0">
                    <SimpleTable<ListingClaimRecord>
                        rows={record.claims}
                        rowKey={(row) => row.id}
                        emptyMessage="Nobody has claimed this spot."
                        className="rounded-none border-0"
                        columns={[
                            { key: "who", label: "Claimant", render: (row) => (row.claimant ? <Link className="text-primary hover:underline" href={`/publishers/${row.claimant.id}`}>{row.claimant.name}</Link> : "—") },
                            { key: "status", label: "Status", render: (row) => pill(row.status) },
                            { key: "when", label: "Made", render: (row) => formatDate(row.createdAt) },
                        ]}
                    />
                </SectionCard>
                <SectionCard
                    title={counted("Compliance cases", record.complianceCases.length, counts.complianceCases)}
                    actions={<DeskLink href="/listings/verification" label="Verification desk" />}
                    contentClassName="p-0"
                >
                    <SimpleTable<ListingComplianceCaseRecord>
                        rows={record.complianceCases}
                        rowKey={(row) => row.id}
                        emptyMessage="No compliance case has been opened."
                        className="rounded-none border-0"
                        columns={[
                            { key: "reason", label: "Why", render: (row) => words(row.reason) },
                            { key: "status", label: "Status", render: (row) => pill(row.status) },
                            { key: "due", label: "Due", render: (row) => (row.resolvedAt ? `Resolved ${formatDate(row.resolvedAt)}` : formatDate(row.dueAt)) },
                            { key: "who", label: "With", render: (row) => row.assignedTo?.name ?? "Unassigned" },
                        ]}
                    />
                </SectionCard>
                <SectionCard title={counted("Earnings holds", record.earningsHolds.length, counts.earningsHolds)} contentClassName="p-0">
                    <SimpleTable<ListingEarningsHoldRecord>
                        rows={record.earningsHolds}
                        rowKey={(row) => row.id}
                        emptyMessage="No earnings are held against this spot."
                        className="rounded-none border-0"
                        columns={[
                            { key: "amount", label: "Amount", render: (row) => formatMoney(String(row.amount)) },
                            { key: "status", label: "Status", render: (row) => pill(row.status) },
                            { key: "from", label: "Held from", render: (row) => formatDate(row.heldFrom) },
                            { key: "until", label: "Converts", render: (row) => formatDate(row.convertsAt) },
                        ]}
                    />
                </SectionCard>
                <SectionCard title={counted("Disputes", record.disputes.length, counts.disputes)} actions={<DeskLink href="/disputes" label="Disputes desk" />} contentClassName="p-0">
                    <SimpleTable<ListingDisputeRecord>
                        rows={record.disputes}
                        rowKey={(row) => row.id}
                        emptyMessage="No dispute names this spot."
                        className="rounded-none border-0"
                        columns={[
                            { key: "id", label: "Dispute", render: (row) => <span className="font-medium">{row.displayId}</span> },
                            { key: "reason", label: "About", render: (row) => words(row.reason) },
                            { key: "status", label: "Status", render: (row) => pill(row.status) },
                            { key: "when", label: "Raised", render: (row) => formatDate(row.createdAt) },
                        ]}
                    />
                </SectionCard>
            </div>
        </div>
    );
}

/** Under the Pricing tab: what was asked of the floor, who held a price, and who decided each factor. */
export function PriceHistory({ record }: { record: ListingRecord }) {
    const { counts } = record;
    return (
        <div className="space-y-4">
            <SectionCard
                title={counted("Price approvals", record.priceApprovals.length, counts.priceApprovals)}
                description="Each time a rate under the rate card’s floor was put to the desk."
                actions={<DeskLink href="/pricing/approvals" label="Approvals desk" />}
                contentClassName="p-0"
            >
                <SimpleTable<ListingPriceApprovalRecord>
                    rows={record.priceApprovals}
                    rowKey={(row) => row.id}
                    emptyMessage="No price has needed approving."
                    className="rounded-none border-0"
                    columns={[
                        { key: "asked", label: "Asked", render: (row) => `${formatMoney(row.requestedRatePerDay)} / day` },
                        { key: "floor", label: "Card · floor", render: (row) => `${formatMoney(row.cardRatePerDay)} · ${formatMoney(row.floorRatePerDay)}` },
                        { key: "status", label: "Status", render: (row) => pill(row.status) },
                        { key: "by", label: "Asked by", render: (row) => byLine(row.createdAt, row.requestedBy) },
                        { key: "decided", label: "Decided", render: (row) => (row.decidedAt ? `${byLine(row.decidedAt, row.decidedBy)}${row.decisionNote ? ` — ${row.decisionNote}` : ""}` : "Waiting") },
                    ]}
                />
            </SectionCard>
            <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title={counted("Factor decisions", record.pricingFactors.length, record.pricingFactors.length)} contentClassName="p-0">
                    <SimpleTable<ListingPricingFactorRecord>
                        rows={record.pricingFactors}
                        rowKey={(row) => row.id}
                        emptyMessage="No pricing factor touches this spot."
                        className="rounded-none border-0"
                        columns={[
                            { key: "factor", label: "Factor", render: (row) => row.factor.name },
                            { key: "state", label: "State", render: (row) => (row.applied ? "Applied" : row.suggested ? "Suggested" : "Not applied") },
                            { key: "rate", label: "Applied rate", render: (row) => (row.appliedRatePerDay ? formatMoney(row.appliedRatePerDay) : "—") },
                            { key: "who", label: "Decided", render: (row) => byLine(row.decidedAt, row.decidedBy) },
                        ]}
                    />
                </SectionCard>
                <SectionCard title={counted("Price locks", record.priceLocks.length, counts.priceLocks)} contentClassName="p-0">
                    <SimpleTable<ListingPriceLockRecord>
                        rows={record.priceLocks}
                        rowKey={(row) => row.id}
                        emptyMessage="No advertiser has held a price here."
                        className="rounded-none border-0"
                        columns={[
                            { key: "who", label: "Advertiser", render: (row) => row.advertiser?.companyName ?? row.advertiser?.name ?? "—" },
                            { key: "rate", label: "Held at", render: (row) => `${formatMoney(row.ratePerDay)} / day` },
                            { key: "until", label: "Until", render: (row) => (row.consumedAt ? `Used ${formatDate(row.consumedAt)}` : formatDate(row.expiresAt)) },
                        ]}
                    />
                </SectionCard>
            </div>
            <SectionCard
                title={counted("Sponsored placements", record.boosts.length, counts.boosts)}
                description="Placements bought to lift this spot in search and among similar spots."
                actions={<DeskLink href="/ads/sponsored" label="Sponsored desk" />}
                contentClassName="p-0"
            >
                <SimpleTable<ListingBoostRecord>
                    rows={record.boosts}
                    rowKey={(row) => row.id}
                    emptyMessage="No placement has been bought for this spot."
                    className="rounded-none border-0"
                    columns={[
                        { key: "id", label: "Placement", render: (row) => <span className="font-medium">{row.displayId ?? "—"}</span> },
                        { key: "where", label: "Where", render: (row) => row.placements.map(words).join(", ") || "—" },
                        { key: "when", label: "Runs", render: (row) => `${formatDate(row.startDate)} – ${formatDate(row.endDate)} · ${formatNumber(row.days)} days` },
                        { key: "total", label: "Paid", render: (row) => (row.paidAt ? formatMoney(row.total) : `${formatMoney(row.total)} unpaid`) },
                        { key: "status", label: "Status", render: (row) => pill(row.status) },
                    ]}
                />
            </SectionCard>
        </div>
    );
}
