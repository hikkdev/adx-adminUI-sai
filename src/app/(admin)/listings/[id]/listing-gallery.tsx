"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, ImageOff, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrivateFile } from "@/components/adx/private-file";
import { SectionCard } from "@/components/adx/section-card";
import { formatDate, formatDateTime } from "@/lib/format";
import { photoTypeLabel, type ListingPhotoRecord } from "@/services/listing-record";

/**
 * A listing's photographs (3 Oct 2026): the strip under the page's heading,
 * the gallery on the Overview, and one lightbox both open.
 *
 * The record read sends them cover first (the front one, else the first
 * filed), each with what the upload register kept — when the camera took
 * it, and where, only when the GPS stamp was on. Every picture is drawn
 * through `PrivateFile`, which passes a public URL straight through and
 * fetches a private one with the token, so a photograph filed private
 * still opens.
 */

/** The caption under a photograph: its angle, the day it was filed, and the camera's stamp when there is one. */
export function photoCaption(photo: ListingPhotoRecord): string {
    const parts = [photoTypeLabel(photo.type), `filed ${formatDate(photo.createdAt)}`];
    if (photo.takenAt) parts.push(`taken ${formatDateTime(photo.takenAt)}`);
    return parts.join(" · ");
}

export function gpsText(gps: NonNullable<ListingPhotoRecord["gps"]>): string {
    return `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}${gps.accuracyM !== null && gps.accuracyM !== undefined ? ` (±${Math.round(gps.accuracyM)} m)` : ""}`;
}

/** The lightbox: one photograph large, the stamp under it, and the way to the next. */
export function PhotoLightbox({
    photos,
    index,
    title,
    onIndexChange,
    onClose,
}: {
    photos: ListingPhotoRecord[];
    index: number | null;
    title: string;
    onIndexChange: (index: number) => void;
    onClose: () => void;
}) {
    const photo = index === null ? null : photos[index];
    const step = (by: number) => {
        if (index === null || photos.length === 0) return;
        onIndexChange((index + by + photos.length) % photos.length);
    };
    return (
        <Dialog open={photo !== null && photo !== undefined} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                className="max-w-4xl"
                onKeyDown={(event) => {
                    if (event.key === "ArrowRight") step(1);
                    if (event.key === "ArrowLeft") step(-1);
                }}
            >
                {photo ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>
                                {photoTypeLabel(photo.type)} · {(index ?? 0) + 1} of {photos.length}
                            </DialogTitle>
                            <DialogDescription>{title}</DialogDescription>
                        </DialogHeader>
                        <div className="relative overflow-hidden rounded-md bg-muted">
                            <PrivateFile
                                src={photo.url}
                                alt={`${title} — ${photoTypeLabel(photo.type)}`}
                                kind="image"
                                className="max-h-[70vh] w-full object-contain"
                                frameClassName="h-72 w-full"
                            />
                            {photos.length > 1 ? (
                                <>
                                    <Button type="button" variant="outline" size="icon" className="absolute left-2 top-1/2 -translate-y-1/2 bg-card/90" onClick={() => step(-1)} aria-label="Previous photograph">
                                        <ChevronLeft className="size-4" />
                                    </Button>
                                    <Button type="button" variant="outline" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 bg-card/90" onClick={() => step(1)} aria-label="Next photograph">
                                        <ChevronRight className="size-4" />
                                    </Button>
                                </>
                            ) : null}
                        </div>
                        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2" data-testid="lightbox-stamp">
                            <div className="flex justify-between gap-3">
                                <dt className="text-muted-foreground">Filed</dt>
                                <dd className="font-medium">{formatDateTime(photo.createdAt)}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="text-muted-foreground">Taken</dt>
                                <dd className="font-medium">{photo.takenAt ? formatDateTime(photo.takenAt) : "Not stamped"}</dd>
                            </div>
                            <div className="flex justify-between gap-3 sm:col-span-2">
                                <dt className="text-muted-foreground">GPS stamp</dt>
                                <dd className="font-medium tabular-nums">{photo.gps ? gpsText(photo.gps) : "Not stamped — the camera’s GPS was off or it came from the gallery"}</dd>
                            </div>
                        </dl>
                    </>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

/** The strip under the heading: the cover large, the next few beside it, the rest counted. */
export function CoverStrip({ photos, title, onOpen }: { photos: ListingPhotoRecord[]; title: string; onOpen: (index: number) => void }) {
    if (photos.length === 0) {
        return (
            <div className="flex h-28 items-center justify-center gap-2 rounded-lg border border-dashed bg-card text-sm text-muted-foreground" data-testid="cover-strip-empty">
                <ImageOff className="size-4" aria-hidden />
                No photographs filed for this spot yet.
            </div>
        );
    }
    const shown = photos.slice(0, 5);
    const more = photos.length - shown.length;
    return (
        <div className="grid h-40 grid-cols-4 gap-2 sm:h-48 sm:grid-cols-6" data-testid="cover-strip">
            {shown.map((photo, index) => (
                <button
                    key={photo.id}
                    type="button"
                    onClick={() => onOpen(index)}
                    className={
                        index === 0
                            ? "relative col-span-2 row-span-1 overflow-hidden rounded-lg border bg-muted sm:col-span-2"
                            : "relative hidden overflow-hidden rounded-lg border bg-muted sm:block"
                    }
                    aria-label={`Open the ${photoTypeLabel(photo.type).toLowerCase()} photograph`}
                >
                    <PrivateFile src={photo.url} alt={`${title} — ${photoTypeLabel(photo.type)}`} kind="image" className="h-full w-full object-cover" frameClassName="h-full w-full" />
                    {index === 0 ? <span className="absolute left-2 top-2 rounded bg-card/90 px-1.5 py-0.5 text-[11px] font-medium">Cover</span> : null}
                    {index === shown.length - 1 && more > 0 ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-medium text-white">+{more} more</span>
                    ) : null}
                </button>
            ))}
            {/* On a phone the strip is the cover and a count, so it never scrolls sideways. */}
            {photos.length > 1 ? (
                <button type="button" onClick={() => onOpen(1)} className="col-span-2 flex items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground sm:hidden">
                    {photos.length - 1} more photograph{photos.length - 1 === 1 ? "" : "s"}
                </button>
            ) : null}
        </div>
    );
}

/** The Overview's gallery: every photograph, grouped by angle, each with its stamp. */
export function PhotoGallery({ photos, title, onOpen, className }: { photos: ListingPhotoRecord[]; title: string; onOpen: (index: number) => void; className?: string }) {
    return (
        <SectionCard
            title="Photographs"
            description={photos.length ? `${photos.length} filed — the cover first. Click one to enlarge it.` : "None filed yet."}
            className={className}
        >
            {photos.length === 0 ? (
                <p className="text-sm text-muted-foreground">An advertiser will not book what they cannot see; the publisher can add photographs from their listing.</p>
            ) : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="photo-gallery">
                    {photos.map((photo, index) => (
                        <li key={photo.id}>
                            <figure className="overflow-hidden rounded-lg border bg-card">
                                <button type="button" className="block w-full" onClick={() => onOpen(index)} aria-label={`Enlarge the ${photoTypeLabel(photo.type).toLowerCase()} photograph`}>
                                    <PrivateFile
                                        src={photo.url}
                                        alt={`${title} — ${photoTypeLabel(photo.type)}`}
                                        kind="image"
                                        className="aspect-[4/3] w-full object-cover"
                                        frameClassName="aspect-[4/3] w-full"
                                        loading="lazy"
                                    />
                                </button>
                                <figcaption className="space-y-0.5 px-3 py-2 text-xs text-muted-foreground">
                                    <p>
                                        <span className="font-medium text-foreground">{index === 0 ? "Cover · " : ""}</span>
                                        {photoCaption(photo)}
                                    </p>
                                    <p className="flex items-center gap-1">
                                        <MapPin className="size-3" aria-hidden />
                                        {photo.gps ? gpsText(photo.gps) : "No GPS stamp"}
                                    </p>
                                </figcaption>
                            </figure>
                        </li>
                    ))}
                </ul>
            )}
        </SectionCard>
    );
}
