"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Camera, ExternalLink, MapPin, QrCode } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { useApiResource } from "@/lib/use-api-resource";
import { supplyService, verificationStatusMeta } from "@/services/supply";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MiniMap } from "@/components/adx/mini-map";
import { StatusBadge } from "@/components/adx/status-badge";
import { EmptyState } from "@/components/adx/empty-state";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { formatDateTime } from "@/lib/format";
import {
    VERIFICATION_TYPE_META,
    type ListingVerification,
    type ListingVerificationPhoto,
    type VerificationQueueRow,
} from "@/types";

/**
 * Every photograph a site verification filed, and the decision on it.
 *
 * A visit files a named shot per milestone requirement — "The mirror decal",
 * "Decal from an angle", "Contact details legible" — and the console rendered
 * none of them. Shot one was mirrored onto `photoUrl` and that was the whole of
 * what a reviewer could see, while the agent app told the agent "ADX checks them
 * and the spot goes live from there". Approving on a quarter of the evidence is
 * not a review, so the shots are shown in the order the agent was walked through
 * them, each under the requirement it answers.
 *
 * The decision buttons call the review endpoint that was already here and had no
 * caller anywhere in the console.
 */

interface Props {
    row: VerificationQueueRow | null;
    onOpenChange: (open: boolean) => void;
    /** Refetches the queue after a decision changes what it should show. */
    onReviewed?: () => void;
}

/**
 * Photographs come from the backend's own upload store, whose host is set at
 * runtime by NEXT_PUBLIC_API_BASE_URL. `next/image` needs its hosts listed in
 * next.config at build time, which cannot be done for a value the deployment
 * chooses, so this is a plain img on purpose.
 */
const Shot = ({ photo, index }: { photo: ListingVerificationPhoto; index: number }) => (
    <figure className="overflow-hidden rounded-md border border-border">
        <a
            href={photo.url}
            target="_blank"
            rel="noreferrer"
            className="block bg-muted"
            title="Open the full-size photograph"
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={photo.url}
                alt={photo.label ?? `Verification photograph ${index + 1}`}
                className="aspect-[4/3] w-full object-cover"
            />
        </a>
        <figcaption className="flex items-start justify-between gap-2 px-3 py-2">
            <span className="text-xs font-medium text-foreground">
                {photo.label ?? "Unnamed shot"}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {index + 1}
            </span>
        </figcaption>
    </figure>
);

function VerificationCard({
    verification,
    onDecided,
}: {
    verification: ListingVerification;
    onDecided: () => void;
}) {
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState<"approve" | "reject" | null>(null);
    const decided = verification.status !== "SUBMITTED";

    const decide = async (approve: boolean) => {
        if (!approve && reason.trim() === "") {
            toast.error("Say why it was rejected — the publisher is shown this.");
            return;
        }
        setBusy(approve ? "approve" : "reject");
        try {
            await supplyService.reviewVerification(
                verification.id,
                approve,
                approve ? undefined : reason.trim()
            );
            toast.success(approve ? "Verification approved." : "Verification rejected.");
            onDecided();
        } catch (cause) {
            toast.error(
                cause instanceof ApiError ? cause.message : "Could not record that decision."
            );
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <StatusBadge status={VERIFICATION_TYPE_META[verification.type]} />
                    {/* The wire says ACCEPTED for an approved review; the meta in services/ knows that word. */}
                    <StatusBadge status={verificationStatusMeta(verification.status)} />
                </div>
                <span className="text-xs text-muted-foreground">
                    {formatDateTime(verification.capturedAt)}
                </span>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                    <Camera className="size-3.5 shrink-0" aria-hidden />
                    <dt className="sr-only">Photographs</dt>
                    <dd>
                        {verification.photos.length}{" "}
                        {verification.photos.length === 1 ? "photograph" : "photographs"}
                    </dd>
                </div>
                <div className="flex items-center gap-1.5">
                    <QrCode className="size-3.5 shrink-0" aria-hidden />
                    <dt className="sr-only">Code scan</dt>
                    <dd>{verification.qrScanned ? "Code scanned on site" : "No code scan"}</dd>
                </div>
                <div className="col-span-2 flex items-center gap-1.5">
                    <MapPin className="size-3.5 shrink-0" aria-hidden />
                    <dt className="sr-only">Where it was filed</dt>
                    <dd>
                        {verification.latitude.toFixed(5)}, {verification.longitude.toFixed(5)}
                        {verification.distanceMeters === null
                            ? " · distance not recorded"
                            : ` · ${Math.round(verification.distanceMeters)} m from the spot`}
                    </dd>
                </div>
            </dl>

            {/* AD-C: where the submission was filed from, on a map. */}
            <MiniMap className="mt-3" latitude={verification.latitude} longitude={verification.longitude} title="Where it was filed" tone="warning" />

            {verification.photos.length === 0 ? (
                <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    This submission recorded no photographs.
                </p>
            ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {verification.photos.map((photo, index) => (
                        <Shot key={photo.id} photo={photo} index={index} />
                    ))}
                </div>
            )}

            {decided ? (
                <p className="mt-4 text-xs text-muted-foreground">
                    {verification.status === "REJECTED" && verification.rejectionReason
                        ? `Rejected — ${verification.rejectionReason}`
                        : `Reviewed ${
                              verification.reviewedAt
                                  ? formatDateTime(verification.reviewedAt)
                                  : "already"
                          }.`}
                </p>
            ) : (
                <div className="mt-4 space-y-2">
                    <Textarea
                        rows={2}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Why it was rejected — shown to the publisher"
                        className="text-sm"
                    />
                    <div className="flex justify-end gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            className="text-danger hover:text-danger"
                            disabled={busy !== null}
                            onClick={() => decide(false)}
                        >
                            {busy === "reject" ? "Rejecting…" : "Reject"}
                        </Button>
                        <Button size="sm" disabled={busy !== null} onClick={() => decide(true)}>
                            {busy === "approve" ? "Approving…" : "Approve"}
                        </Button>
                    </div>
                </div>
            )}
        </section>
    );
}

/**
 * The list for one listing, mounted keyed by listing id.
 *
 * Keyed so a second row opens a fresh fetch rather than showing the previous
 * spot's photographs while the new ones load — on a review screen the wrong
 * photograph under the right title is worse than a spinner.
 */
function VerificationList({ listingId, onReviewed }: { listingId: string; onReviewed?: () => void }) {
    const resource = useApiResource<ListingVerification[]>(
        `supply:verifications:${listingId}`,
        () => supplyService.verifications(listingId)
    );

    return (
        <ResourceBoundary resource={resource}>
            {(rows) =>
                rows.length === 0 ? (
                    <EmptyState
                        icon={Camera}
                        title="Nothing filed yet"
                        description="No agent visit or publisher re-verification has been submitted for this spot."
                    />
                ) : (
                    <div className="space-y-4">
                        {rows.map((verification) => (
                            <VerificationCard
                                key={verification.id}
                                verification={verification}
                                onDecided={() => {
                                    resource.reload();
                                    onReviewed?.();
                                }}
                            />
                        ))}
                    </div>
                )
            }
        </ResourceBoundary>
    );
}

export function VerificationReview({ row, onOpenChange, onReviewed }: Props) {
    return (
        <Sheet open={row !== null} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
                <SheetHeader className="space-y-1 border-b px-5 py-4 text-left">
                    <SheetTitle className="text-base">{row?.title ?? "Verification"}</SheetTitle>
                    <p className="text-xs text-muted-foreground">
                        {row?.publisherName ?? "Unclaimed"} · every photograph filed against this
                        spot, newest visit first
                    </p>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                    {row ? (
                        <VerificationList
                            key={row.listingId}
                            listingId={row.listingId}
                            onReviewed={onReviewed}
                        />
                    ) : null}
                </div>

                {row ? (
                    <div className="border-t px-5 py-3">
                        <Button variant="outline" size="sm" asChild>
                            <Link href={`/listings/${row.listingId}`}>
                                Open the listing
                                <ExternalLink className="ml-1.5 size-3.5" aria-hidden />
                            </Link>
                        </Button>
                    </div>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}
