"use client";

import * as React from "react";
import { ExternalLink, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";
import type { AdBookingRow, AdSlot, PromotionMedia } from "@/services/promotions";

/** The artwork's box: the slot's spec size, scaled down to fit `maxWidth`. */
export function artworkBox(size: { width: number; height: number } | null | undefined, maxWidth = 320): { width: number; height: number } {
    if (!size || !size.width || !size.height) return { width: maxWidth, height: Math.round(maxWidth * 0.75) };
    const scale = Math.min(1, maxWidth / size.width);
    return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
}

/**
 * The buyer's artwork drawn in the slot's own shape, with the "Ad" label
 * every paid placement carries, so the desk sees it as a viewer would.
 */
export function ArtworkPreview({ media, size, headline, ctaLabel, maxWidth = 320 }: { media: PromotionMedia | null | undefined; size: { width: number; height: number } | null | undefined; headline?: string | null; ctaLabel?: string | null; maxWidth?: number }) {
    const box = artworkBox(size, maxWidth);
    return (
        <div className="inline-block space-y-1.5">
            <div className="relative overflow-hidden rounded-md border bg-muted" style={{ width: box.width, height: box.height }}>
                {media?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- the buyer's stored artwork
                    <img src={media.url} alt={media.altText ?? ""} className="size-full object-cover" />
                ) : (
                    <span className="flex size-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                        <ImageOff className="size-5" aria-hidden />
                        No artwork uploaded
                    </span>
                )}
                <span className="absolute left-1.5 top-1.5 rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-background">Ad</span>
            </div>
            {(headline || ctaLabel) && (
                <div className="flex items-center justify-between gap-2" style={{ width: box.width }}>
                    {headline && <p className="truncate text-sm font-medium text-foreground">{headline}</p>}
                    {ctaLabel && <span className="shrink-0 rounded-md bg-foreground px-2 py-0.5 text-[11px] text-background">{ctaLabel}</span>}
                </div>
            )}
        </div>
    );
}

/** The slot's artwork size — off the slot's spec detail, else the media's own size. */
export function slotSize(slot: Pick<AdSlot, "specDetail"> | undefined, media: PromotionMedia | null | undefined): { width: number; height: number } | null {
    if (slot?.specDetail) return { width: slot.specDetail.width, height: slot.specDetail.height };
    if (media?.width && media.height) return { width: media.width, height: media.height };
    return null;
}

export function TargetLink({ url }: { url: string | null }) {
    if (!url) return <span className="text-muted-foreground">—</span>;
    return (
        <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 truncate text-sm text-info hover:underline">
            <span className="truncate">{url}</span>
            <ExternalLink className="size-3 shrink-0" aria-hidden />
        </a>
    );
}

/** City names off the row when it carries them, else how many it is limited to. */
export function citiesLabel(row: Pick<AdBookingRow, "cityIds" | "cities">): string {
    if (row.cities?.length) return row.cities.map((city) => city.name).join(", ");
    if (row.cityIds.length === 0) return "Everywhere";
    return `${row.cityIds.length} ${row.cityIds.length === 1 ? "city" : "cities"}`;
}

/** The reason box shared by Reject and Cancel: at least three characters, as the server asks. */
export function ReasonDialog({
    open,
    title,
    description,
    confirmLabel,
    busy,
    extra,
    onOpenChange,
    onConfirm,
}: {
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    busy: boolean;
    extra?: React.ReactNode;
    onOpenChange: (open: boolean) => void;
    onConfirm: (reason: string) => void;
}) {
    return (
        <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
            {/* The body mounts with the dialog, so every opening starts with an empty reason. */}
            <DialogContent className="sm:max-w-md">{open && <ReasonBody title={title} description={description} confirmLabel={confirmLabel} busy={busy} extra={extra} onOpenChange={onOpenChange} onConfirm={onConfirm} />}</DialogContent>
        </Dialog>
    );
}

function ReasonBody({
    title,
    description,
    confirmLabel,
    busy,
    extra,
    onOpenChange,
    onConfirm,
}: {
    title: string;
    description: string;
    confirmLabel: string;
    busy: boolean;
    extra?: React.ReactNode;
    onOpenChange: (open: boolean) => void;
    onConfirm: (reason: string) => void;
}) {
    const [reason, setReason] = React.useState("");
    const ok = reason.trim().length >= 3;
    return (
        <>
            <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
                <Label htmlFor="reason">Reason — the buyer reads it</Label>
                <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} autoFocus />
            </div>
            {extra}
            <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                    Back
                </Button>
                <Button variant="destructive" onClick={() => onConfirm(reason.trim())} disabled={!ok || busy} data-testid="reason-confirm">
                    {busy ? "Working…" : confirmLabel}
                </Button>
            </DialogFooter>
        </>
    );
}

export const moneyOrDash = (value: string | null | undefined): string => (value ? formatMoney(value) : "—");
