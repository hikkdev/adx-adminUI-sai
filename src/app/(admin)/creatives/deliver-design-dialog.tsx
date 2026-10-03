"use client";

import * as React from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { imageSize } from "@/lib/image-size";
import { DESIGN_STYLE_LABEL, briefOfRequest, fileSizeLabel, moderationService, type DesignRequestRow } from "@/services/moderation";
import { uploadService } from "@/services/uploads";

/**
 * CR-1: delivering an ADX design against a request.
 *
 * The request is a campaign on the ADX Design Agency path with no design
 * standing. Delivery is the same admin upload the campaign page already had —
 * `POST /campaigns/:id/creatives` with `designedByAdx` — which lands the
 * artwork at AWAITING_ADVERTISER for the advertiser to accept, and only then
 * does it enter ops review. It is delivered for the whole campaign: one
 * artwork that every spot on it prints. The brief is shown here because a
 * designer should not have to open the campaign to find out what to make,
 * and the spots are listed because the formats are what the design is for.
 */
export function DeliverDesignDialog({
    open,
    onOpenChange,
    request,
    onDelivered,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    request: DesignRequestRow;
    onDelivered: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Deliver the design</DialogTitle>
                    <DialogDescription>
                        For {request.campaign.name} · {request.campaign.advertiser.companyName ?? request.campaign.advertiser.name}. The advertiser
                        accepts it before ops review.
                    </DialogDescription>
                </DialogHeader>
                {/* Mounted with the content so the file picker starts empty on every open. */}
                <DeliverForm request={request} onClose={() => onOpenChange(false)} onDelivered={onDelivered} />
            </DialogContent>
        </Dialog>
    );
}

function DeliverForm({ request, onClose, onDelivered }: { request: DesignRequestRow; onClose: () => void; onDelivered: () => void }) {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [file, setFile] = React.useState<File | null>(null);
    const [busy, setBusy] = React.useState(false);
    const brief = briefOfRequest(request);

    async function deliver() {
        if (!file) return;
        setBusy(true);
        try {
            const dims = await imageSize(file);
            const stored = await uploadService.upload(file, "CAMPAIGN_CREATIVE");
            await moderationService.uploadDesigned(request.campaign.id, {
                fileUrl: stored.url,
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type || undefined,
                ...(dims ? { widthPx: dims.width, heightPx: dims.height } : {}),
            });
            toast.success("Design sent to the advertiser", {
                description: "It waits for their acceptance, then enters ops review.",
            });
            onClose();
            onDelivered();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The upload was refused.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <div className="space-y-4">
                {brief ? (
                    <dl className="grid gap-2 rounded-md border border-border bg-muted/30 p-4 text-sm" data-testid="deliver-brief">
                        <div>
                            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Objective</dt>
                            <dd className="mt-0.5 text-foreground">{brief.objective}</dd>
                        </div>
                        <div>
                            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Key message</dt>
                            <dd className="mt-0.5 text-foreground">{brief.keyMessage}</dd>
                        </div>
                        <div>
                            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Style</dt>
                            <dd className="mt-0.5 text-foreground">{DESIGN_STYLE_LABEL[brief.style]}</dd>
                        </div>
                    </dl>
                ) : (
                    <p className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        The advertiser chose ADX Design Agency but left no brief. Open the campaign for what it is selling.
                    </p>
                )}

                <div className="text-sm" data-testid="deliver-target">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {request.spots.length === 0
                            ? "No spots yet"
                            : `Prints on ${request.spots.length} spot${request.spots.length === 1 ? "" : "s"}`}
                    </p>
                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                        {request.spots.slice(0, 6).map((spot) => (
                            <li key={spot.id}>
                                {spot.listing.title}
                                {spot.listing.city ? `, ${spot.listing.city}` : ""}
                                {spot.listing.widthFt && spot.listing.heightFt ? ` — ${spot.listing.widthFt} × ${spot.listing.heightFt} ft` : ""}
                            </li>
                        ))}
                        {request.spots.length > 6 && <li>and {request.spots.length - 6} more</li>}
                    </ul>
                </div>

                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    data-testid="deliver-file"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" variant="outline" className="bg-card" disabled={busy} onClick={() => inputRef.current?.click()}>
                        <Upload className="mr-1.5 size-4" />
                        {file ? "Choose another file" : "Choose the artwork"}
                    </Button>
                    {file && (
                        <span className="min-w-0 truncate text-sm text-muted-foreground" data-testid="deliver-chosen">
                            {file.name} · {fileSizeLabel(file.size)}
                        </span>
                    )}
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button onClick={() => void deliver()} disabled={busy || !file} data-testid="deliver-send">
                    {busy ? "Sending…" : "Send to the advertiser"}
                </Button>
            </DialogFooter>
        </>
    );
}
