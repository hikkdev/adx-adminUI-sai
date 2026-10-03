"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";
import { campaignService, designQuoteProblem, type DesignQuote } from "@/services/campaigns";

/**
 * DQ-1: the desk names its price for designing the artwork.
 *
 * One dialog for the design-requests desk and the campaign page: the
 * amount in rupees (up to two decimals) and an optional note, sent as
 * `POST /campaigns/:id/design-quote`. The advertiser is told and answers
 * from the app; an accepted quote becomes a fee on the booking, a declined
 * or unanswered one may be quoted again — which is what "Re-quote" is.
 */
export function DesignQuoteDialog({
    campaign,
    standing,
    onOpenChange,
    onQuoted,
}: {
    /** The campaign to quote, or null while the dialog is closed. */
    campaign: { id: string; name: string; reference: string } | null;
    /** The quote as it stands, prefilled so a re-quote starts from the last figure. */
    standing?: DesignQuote | null;
    onOpenChange: (open: boolean) => void;
    onQuoted: () => void;
}) {
    return (
        <Dialog open={campaign !== null} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                {campaign && (
                    <>
                        <DialogHeader>
                            <DialogTitle>{standing ? "Quote the design again" : "Quote the design"}</DialogTitle>
                            <DialogDescription>
                                {campaign.name} · {campaign.reference}. The advertiser is told and accepts or declines from the app; accepted, the fee
                                (plus GST) goes on the booking.
                            </DialogDescription>
                        </DialogHeader>
                        {/* Mounted with the content so the fields start from the standing quote on every open. */}
                        <QuoteForm campaign={campaign} standing={standing ?? null} onClose={() => onOpenChange(false)} onQuoted={onQuoted} />
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

function QuoteForm({
    campaign,
    standing,
    onClose,
    onQuoted,
}: {
    campaign: { id: string; name: string; reference: string };
    standing: DesignQuote | null;
    onClose: () => void;
    onQuoted: () => void;
}) {
    const [amount, setAmount] = React.useState(standing?.amount ?? "");
    const [note, setNote] = React.useState(standing?.note ?? "");
    const [busy, setBusy] = React.useState(false);
    const problem = designQuoteProblem({ amount, note });

    const submit = async () => {
        if (problem || busy) return;
        setBusy(true);
        try {
            await campaignService.quoteDesign(campaign.id, { amount, note });
            toast.success(`${formatMoney(amount.trim())} quoted on ${campaign.reference}`, {
                description: "The advertiser has been told; the fee goes on the booking once they accept.",
            });
            onClose();
            onQuoted();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The quote was refused.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <div className="space-y-3">
                <div className="space-y-1.5">
                    <Label htmlFor="design-quote-amount">Design fee (₹, before GST)</Label>
                    <Input
                        id="design-quote-amount"
                        inputMode="decimal"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        placeholder="5000"
                        data-testid="design-quote-amount"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="design-quote-note">Note for the advertiser (optional)</Label>
                    <Textarea
                        id="design-quote-note"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="What the fee covers — two rounds of changes, print-ready files…"
                        className="min-h-20 resize-none"
                        maxLength={500}
                        data-testid="design-quote-note"
                    />
                </div>
                {problem && amount.trim() && (
                    <p className="text-xs text-danger" role="alert">
                        {problem}
                    </p>
                )}
                {standing?.status === "DECLINED" && (
                    <p className="text-xs text-muted-foreground">The advertiser declined {formatMoney(standing.amount)}; this quote replaces it.</p>
                )}
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button onClick={submit} disabled={busy || problem !== null} data-testid="design-quote-send">
                    {busy ? "Sending…" : standing ? "Send the new quote" : "Send the quote"}
                </Button>
            </DialogFooter>
        </>
    );
}
