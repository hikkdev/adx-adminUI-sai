"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LEAD_LOST_REASONS, LOST_REASON_META, leadsService, type Lead, type LeadLostReason } from "@/services/leads";

/**
 * LH2 (D11): closing a lead as lost — with a reason. PRICE and TIMING
 * come back to the pool after sixty days; WRONG_CONTACT goes back to
 * sourcing; OTHER needs a note. Nothing is deleted.
 */
export function LostDialog({ lead, onOpenChange, onLost }: { lead: Pick<Lead, "id" | "businessName"> | null; onOpenChange: (open: boolean) => void; onLost: () => void }) {
    const [reason, setReason] = React.useState<LeadLostReason>("NOT_INTERESTED");
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const needsNote = reason === "OTHER" && !note.trim();

    async function submit() {
        if (!lead || needsNote || busy) return;
        setBusy(true);
        try {
            await leadsService.moveStage(lead.id, { stage: "LOST", reason, ...(note.trim() ? { lostNote: note.trim() } : {}) });
            toast.success(reason === "WRONG_CONTACT" ? `${lead.businessName} sent back to sourcing` : `${lead.businessName} closed as lost`, { description: LOST_REASON_META[reason].hint });
            onOpenChange(false);
            setNote("");
            onLost();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not reach ADX.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={lead !== null} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md" data-testid="lead-lost-dialog">
                <DialogHeader>
                    <DialogTitle>Close {lead?.businessName ?? "this lead"} as lost?</DialogTitle>
                    <DialogDescription>Nothing is deleted. The reason decides whether it comes back: price and timing losses return to the pool after sixty days; a wrong contact goes back to sourcing.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label>Reason</Label>
                        <Select value={reason} onValueChange={(value) => setReason(value as LeadLostReason)}>
                            <SelectTrigger aria-label="Reason">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {LEAD_LOST_REASONS.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {LOST_REASON_META[value].label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{LOST_REASON_META[reason].hint}</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="lead-lost-note">Note{reason === "OTHER" ? "" : " (optional)"}</Label>
                        <Textarea id="lead-lost-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={500} placeholder={reason === "OTHER" ? "Say why" : "Anything the next agent should know"} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Keep it
                    </Button>
                    <Button variant="destructive" onClick={() => void submit()} disabled={busy || needsNote} data-testid="lead-lost-confirm">
                        {busy ? "Closing…" : reason === "WRONG_CONTACT" ? "Send back to sourcing" : "Close as lost"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
