"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime, formatMoney } from "@/lib/format";
import { REJECTION_LABEL } from "@/services/agents";
import type { OrderOffer, StatusMeta } from "@/types";

const OFFER_META: Record<OrderOffer["status"], StatusMeta> = {
    PENDING: { label: "Waiting", tone: "warning" },
    ACCEPTED: { label: "Accepted", tone: "success" },
    REJECTED: { label: "Declined", tone: "danger" },
    REASSIGNED: { label: "Reassigned by ops", tone: "neutral" },
};

/** "TOO_FAR" → its sentence; "OTHER: text" → the text; "EXPIRED" → the silence it records. */
export function rejectionLabel(reason: string | null): string | null {
    if (!reason) return null;
    if (reason === "EXPIRED") return "No answer inside the 25-minute window";
    if (reason.startsWith("OTHER:")) return reason.slice("OTHER:".length).trim() || REJECTION_LABEL.OTHER;
    return REJECTION_LABEL[reason] ?? reason;
}

/**
 * Every offer the order has made — who it went to, what they were quoted,
 * and what came back. Read off the detail aggregate (`agentAssignments`),
 * newest first. A REASSIGNED row is ops moving the order on, not a refusal:
 * it counts against nobody's priority.
 */
export function OrderOffersCard({ offers, escalated }: { offers: OrderOffer[]; escalated: boolean }) {
    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground">Offer history</h3>
                {escalated && <StatusBadge status={{ label: "Escalated to ops after three refusals", tone: "danger" }} />}
            </div>
            {offers.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No agent has been offered this order yet.</p>
            ) : (
                <ol className="mt-4 divide-y">
                    {offers.map((offer) => {
                        const why = offer.status === "REJECTED" ? rejectionLabel(offer.rejectionReason) : null;
                        return (
                            <li key={offer.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                                <div className="min-w-0">
                                    <Link
                                        href={`/agents/${offer.agentId}`}
                                        className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                                    >
                                        {offer.agentName}
                                    </Link>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        Offered {formatDateTime(offer.offeredAt)}
                                        {offer.respondedAt ? ` · answered ${formatDateTime(offer.respondedAt)}` : ""}
                                        {offer.quotedFee ? ` · quoted ${formatMoney(offer.quotedFee)}` : ""}
                                    </p>
                                    {why && <p className="mt-0.5 text-xs text-muted-foreground">{why}</p>}
                                </div>
                                <StatusBadge status={OFFER_META[offer.status]} />
                            </li>
                        );
                    })}
                </ol>
            )}
        </Card>
    );
}
