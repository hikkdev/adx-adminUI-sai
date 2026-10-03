"use client";

import * as React from "react";
import Link from "next/link";
import { BellRing, FileImage, PencilRuler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { advertiserKycService } from "@/services/advertiser-kyc";
import type { DesignQuote, WaitingFacts } from "@/services/campaigns";
import type { OrderPlacedBy } from "@/types";
import { DesignQuoteDialog } from "../creatives/design-quote-dialog";
import { RequestKycButton } from "../kyc/_shared/request-kyc-dialog";
import { remindAdvertiser, type ActionableCampaign } from "./campaign-actions";

/** What a fix needs to know about the campaign and its advertiser. */
export interface FixTarget {
    campaign: ActionableCampaign;
    advertiser: OrderPlacedBy | null;
    /** Per reason, the fact needed to act — the server's `waitingFacts`. */
    facts?: WaitingFacts;
}

/** The quote as the dialog prefills it, off the queue's fact; null when none was named yet. */
function standingQuote(facts: WaitingFacts | undefined): DesignQuote | null {
    const quote = facts?.DESIGN_QUOTE;
    if (!quote || quote.state !== "QUOTED" || !quote.amount) return null;
    return { amount: quote.amount, status: "QUOTED", note: null, quotedAt: quote.quotedAt, respondedAt: null };
}

/** The artwork the desk can act on now: the first in review, else the first outstanding. */
export function artworkToReview(facts: WaitingFacts | undefined): string | null {
    const creatives = facts?.ARTWORK?.creatives ?? [];
    return (creatives.find((creative) => creative.status === "IN_REVIEW" || creative.status === "UPLOADED") ?? creatives[0])?.id ?? null;
}

/**
 * The one click that moves a held campaign on, per reason — 2 Oct 2026.
 * The same button on the launch queue's row and on the campaign page's
 * Waiting on banner:
 *
 *   KYC              Request KYC         the advertiser KYC request the desks use
 *   ARTWORK          Review artwork      the creative's review page
 *   DESIGN_QUOTE     Send design quote   the design-quote dialog
 *   PAYMENT / fee    Remind advertiser   `POST /campaigns/:id/remind-payment`
 *   anything else    Open campaign
 */
export function WaitingOnFix({ reason, target, onDone, size = "sm" }: { reason: string; target: FixTarget; onDone: () => void; size?: "sm" | "default" }) {
    const [quoting, setQuoting] = React.useState(false);
    const [reminding, setReminding] = React.useState(false);
    const { campaign } = target;
    const height = size === "sm" ? "h-8" : "h-9";

    if (reason === "KYC") {
        const profileId = target.facts?.KYC?.advertiserId ?? target.advertiser?.business?.id ?? null;
        const party = target.advertiser?.business?.name ?? target.advertiser?.name ?? "the advertiser";
        return (
            <RequestKycButton
                verified={target.facts?.KYC?.kycStatus === "VERIFIED"}
                disabledReason={profileId ? null : "No advertiser profile to ask"}
                size={size}
                className={`${height} bg-card`}
                party={party}
                hasAccount={Boolean(target.advertiser?.userId)}
                onRequest={(channel, note, entityType) => advertiserKycService.request(profileId ?? "", channel, note, entityType)}
                onRequested={onDone}
            />
        );
    }

    if (reason === "ARTWORK") {
        const creativeId = artworkToReview(target.facts);
        return (
            <Button variant="outline" size={size} className={`${height} bg-card`} asChild>
                <Link href={creativeId ? `/creatives/${encodeURIComponent(creativeId)}` : "/creatives"}>
                    <FileImage className="mr-1.5 size-3.5" aria-hidden />
                    Review artwork
                </Link>
            </Button>
        );
    }

    if (reason === "DESIGN_QUOTE") {
        return (
            <>
                <Button variant="outline" size={size} className={`${height} bg-card`} onClick={() => setQuoting(true)}>
                    <PencilRuler className="mr-1.5 size-3.5" aria-hidden />
                    Send design quote
                </Button>
                <DesignQuoteDialog
                    campaign={quoting ? { id: campaign.id, name: campaign.name, reference: campaign.reference } : null}
                    standing={standingQuote(target.facts)}
                    onOpenChange={(open) => !open && setQuoting(false)}
                    onQuoted={() => {
                        setQuoting(false);
                        onDone();
                    }}
                />
            </>
        );
    }

    if (reason === "PAYMENT" || reason === "RESERVATION_FEE") {
        return (
            <Button
                variant="outline"
                size={size}
                className={`${height} bg-card`}
                disabled={reminding}
                onClick={async () => {
                    setReminding(true);
                    if (await remindAdvertiser(campaign)) onDone();
                    setReminding(false);
                }}
            >
                <BellRing className="mr-1.5 size-3.5" aria-hidden />
                {reminding ? "Sending…" : "Remind advertiser"}
            </Button>
        );
    }

    return (
        <Button variant="outline" size={size} className={`${height} bg-card`} asChild>
            <Link href={`/campaigns/${campaign.id}`}>Open campaign</Link>
        </Button>
    );
}
