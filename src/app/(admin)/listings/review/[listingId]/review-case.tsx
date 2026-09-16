"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { DetailShell } from "@/components/adx/detail-shell";
import { EmptyState } from "@/components/adx/empty-state";
import { MiniMap } from "@/components/adx/mini-map";
import { FieldList, SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import {
    ageLabel,
    approvalBlockers,
    CATEGORY_LABEL,
    CONTENT_STANCE_META,
    DOCUMENT_KIND_LABEL,
    DOCUMENT_STATUS_META,
    documentsLabel,
    GATE_META,
    gateSentence,
    listingReviewService,
    PRICING_UNIT_LABEL,
    sizeLabel,
    type ReviewCase,
    type ReviewDocument,
    type ReviewQueueRow,
    type SendBackOutcome,
} from "@/services/listing-review";

interface Props {
    theCase: ReviewCase;
    /** The rest of the desk, so a reviewer can move to the next case from here. */
    queue: ReviewQueueRow[];
    /** Refetch after a document verdict; approve and send-back leave the page. */
    onChanged: () => void;
}

/**
 * One listing on the desk.
 *
 * DR 10 draws no frame for this route — the queue is drawn, the case is not —
 * so it follows the console's own detail idiom. Everything the publisher
 * filed is here to read, and the desk has exactly the three verbs the API
 * gives it: verify or reject a document, approve the listing, or send it back
 * with a reason the publisher is shown verbatim.
 *
 * Approve is disabled, not merely refused, when the rate-card gate would
 * answer 409 — a button that fails on click teaches a reviewer to distrust
 * the button. Paperwork left unchecked is shown but does not disable
 * anything: the desk decides, the screen informs.
 */
export function ReviewCaseView({ theCase, queue, onChanged }: Props) {
    const router = useRouter();
    const now = useNow();
    const blockers = approvalBlockers(theCase);
    const canApprove = blockers.hard.length === 0;

    const [approving, setApproving] = React.useState(false);
    const [sendingBack, setSendingBack] = React.useState(false);

    async function approve() {
        if (!canApprove || approving) return;
        setApproving(true);
        try {
            await listingReviewService.approve(theCase.id);
            toast.success(`${theCase.title} is live`, {
                description: theCase.displayId ?? undefined,
            });
            router.push("/listings/review");
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not publish the listing.");
        } finally {
            setApproving(false);
        }
    }

    const place = [theCase.city, theCase.address].filter(Boolean).join(" · ");
    const subtitle = [
        theCase.displayId,
        [CATEGORY_LABEL[theCase.category], theCase.subType].filter(Boolean).join(" / "),
        theCase.city,
    ]
        .filter(Boolean)
        .join(" · ");

    const others = queue.filter((row) => row.id !== theCase.id);

    return (
        <>
            <DetailShell
                backHref="/listings/review"
                backLabel="Listing review"
                title={theCase.title}
                subtitle={subtitle}
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" className="bg-card" onClick={() => setSendingBack(true)}>
                            Send back
                        </Button>
                        <Button onClick={approve} disabled={!canApprove || approving}>
                            {approving ? "Publishing…" : "Approve and publish"}
                        </Button>
                    </div>
                }
                kpis={[
                    {
                        id: "asking",
                        label: "Asking rate",
                        value: theCase.asking.ratePerDay
                            ? `${formatMoney(theCase.asking.ratePerDay)} a day`
                            : "Not priced",
                        hint: theCase.asking.basePrice
                            ? `Entered as ${formatMoney(theCase.asking.basePrice)} ${PRICING_UNIT_LABEL[theCase.asking.pricingUnit]}`
                            : undefined,
                    },
                    {
                        id: "gate",
                        label: "Rate-card gate",
                        value: GATE_META[theCase.gate.state].label,
                        hint: theCase.rateGrade ? `Grade ${theCase.rateGrade}` : undefined,
                    },
                    {
                        id: "documents",
                        label: "Documents",
                        value: documentsLabel(theCase.documentSummary),
                        hint: `${theCase.photoCount} ${theCase.photoCount === 1 ? "photo" : "photos"}`,
                    },
                    {
                        id: "waiting",
                        label: "Waiting",
                        value: now ? ageLabel(theCase.submittedAt, now) : "—",
                        hint: theCase.submittedAt ? `Submitted ${formatDateTime(theCase.submittedAt)}` : undefined,
                    },
                ]}
                tabs={[
                    {
                        value: "case",
                        label: "The case",
                        content: (
                            <div className="space-y-4">
                                {theCase.priorReason ? (
                                    <div className="rounded-md border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
                                        <p className="font-medium">This spot has been back before.</p>
                                        <p className="mt-1">It was last sent back for: “{theCase.priorReason}”</p>
                                    </div>
                                ) : null}

                                <div className="grid gap-4 lg:grid-cols-2">
                                    <Card className="rounded-lg border-border p-5 shadow-none">
                                        <div className="flex items-start justify-between gap-4">
                                            <h3 className="text-base font-semibold text-foreground">Price and the gate</h3>
                                            <StatusBadge status={GATE_META[theCase.gate.state]} />
                                        </div>
                                        <p className="mt-3 text-sm text-muted-foreground">{gateSentence(theCase.gate)}</p>
                                        {blockers.hard.length > 0 || blockers.soft.length > 0 ? (
                                            <ul className="mt-4 space-y-1.5 text-sm">
                                                {blockers.hard.map((line) => (
                                                    <li key={line} className="text-destructive">
                                                        {line}
                                                    </li>
                                                ))}
                                                {blockers.soft.map((line) => (
                                                    <li key={line} className="text-muted-foreground">
                                                        {line}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="mt-4 text-sm text-muted-foreground">
                                                Nothing stands between this listing and the marketplace.
                                            </p>
                                        )}
                                    </Card>

                                    <Card className="rounded-lg border-border p-5 shadow-none">
                                        <h3 className="text-base font-semibold text-foreground">Who filed it</h3>
                                        <FieldList
                                            className="mt-4"
                                            items={[
                                                [
                                                    "Publisher",
                                                    theCase.publisher ? (
                                                        <Link
                                                            href={`/publishers/${theCase.publisher.id}`}
                                                            className="underline-offset-4 hover:underline"
                                                        >
                                                            {theCase.publisher.name}
                                                        </Link>
                                                    ) : (
                                                        "—"
                                                    ),
                                                ],
                                                ["Publisher ID", theCase.publisher?.displayId ?? "—"],
                                                ["Publisher mobile", theCase.publisherMobile ?? "—"],
                                                [
                                                    "Listed by",
                                                    theCase.agent
                                                        ? [theCase.agent.name, theCase.agent.displayId].filter(Boolean).join(" · ") || "An agent"
                                                        : "The publisher themselves",
                                                ],
                                                ["Created", formatDate(theCase.createdAt)],
                                            ]}
                                        />
                                    </Card>

                                    <Card className="rounded-lg border-border p-5 shadow-none">
                                        <h3 className="text-base font-semibold text-foreground">The spot</h3>
                                        <FieldList
                                            className="mt-4"
                                            items={[
                                                ["Where", place || "—"],
                                                ["Placement", theCase.placement ?? "—"],
                                                ["Size", sizeLabel(theCase) ?? "Not measured"],
                                                [
                                                    "Coordinates",
                                                    theCase.latitude !== null && theCase.longitude !== null
                                                        ? `${theCase.latitude.toFixed(5)}, ${theCase.longitude.toFixed(5)}`
                                                        : "Not geocoded",
                                                ],
                                                ["Illumination", theCase.illumination ?? "—"],
                                                ["Facing", theCase.facing ?? "—"],
                                                ["Elevation", theCase.elevation ?? "—"],
                                                ["Visibility", theCase.visibility ?? "—"],
                                                ["Traffic grade", theCase.trafficGrade ?? "—"],
                                                [
                                                    "Footfall",
                                                    theCase.estimatedDailyFootfall !== null
                                                        ? `${theCase.estimatedDailyFootfall.toLocaleString("en-IN")} a day (publisher's estimate)`
                                                        : "Not stated",
                                                ],
                                            ]}
                                        />
                                        {/* AD-C: the coordinates on a map, beside the text. */}
                                        {theCase.latitude !== null && theCase.longitude !== null && (
                                            <MiniMap className="mt-4" latitude={theCase.latitude} longitude={theCase.longitude} title={theCase.title} />
                                        )}
                                    </Card>

                                    <Card className="rounded-lg border-border p-5 shadow-none">
                                        <h3 className="text-base font-semibold text-foreground">Classification and availability</h3>
                                        <FieldList
                                            className="mt-4"
                                            items={[
                                                ["Venue type", theCase.vocabulary.venueType ?? "—"],
                                                ["Media type", theCase.vocabulary.mediaType ?? "—"],
                                                ["Size class", theCase.vocabulary.sizeClass ?? "—"],
                                                ["Material", theCase.vocabulary.material ?? "—"],
                                                [
                                                    "Available",
                                                    theCase.availableNow
                                                        ? "Now"
                                                        : theCase.availableFrom
                                                          ? `From ${formatDate(theCase.availableFrom)}`
                                                          : "Not stated",
                                                ],
                                                [
                                                    "Hours",
                                                    theCase.availableHoursFrom && theCase.availableHoursTo
                                                        ? `${theCase.availableHoursFrom} – ${theCase.availableHoursTo}`
                                                        : "All day",
                                                ],
                                                [
                                                    "Minimum booking",
                                                    theCase.minBookingDays !== null ? `${theCase.minBookingDays} days` : "—",
                                                ],
                                                ["Peak period", theCase.peakPeriodNote ?? "—"],
                                                [
                                                    "Rate card",
                                                    theCase.rateCardUrl ? (
                                                        <a
                                                            href={theCase.rateCardUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="underline-offset-4 hover:underline"
                                                        >
                                                            Open
                                                        </a>
                                                    ) : (
                                                        "None uploaded"
                                                    ),
                                                ],
                                            ]}
                                        />
                                    </Card>

                                    <Card className="rounded-lg border-border p-5 shadow-none lg:col-span-2">
                                        <h3 className="text-base font-semibold text-foreground">In the publisher's words</h3>
                                        <dl className="mt-4 grid gap-4 text-sm md:grid-cols-3">
                                            <div>
                                                <dt className="text-muted-foreground">Description</dt>
                                                <dd className="mt-1 text-foreground">{theCase.description ?? "—"}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-muted-foreground">Who sees it</dt>
                                                <dd className="mt-1 text-foreground">{theCase.targetAudience ?? "—"}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-muted-foreground">Why this spot</dt>
                                                <dd className="mt-1 text-foreground">{theCase.uniqueSellingPoint ?? "—"}</dd>
                                            </div>
                                        </dl>
                                        {theCase.footfallNote ? (
                                            <p className="mt-4 text-sm text-muted-foreground">{theCase.footfallNote}</p>
                                        ) : null}
                                    </Card>

                                    <Card className="rounded-lg border-border p-5 shadow-none lg:col-span-2">
                                        <h3 className="text-base font-semibold text-foreground">Content rules</h3>
                                        {theCase.contentRules.length === 0 ? (
                                            <p className="mt-3 text-sm text-muted-foreground">
                                                The publisher set no content rules, so every category is allowed.
                                            </p>
                                        ) : (
                                            <ul className="mt-3 divide-y divide-border text-sm">
                                                {theCase.contentRules.map((rule) => (
                                                    <li
                                                        key={rule.category.id}
                                                        className="flex items-center justify-between gap-4 py-2"
                                                    >
                                                        <span className="text-foreground">{rule.category.name}</span>
                                                        <StatusBadge status={CONTENT_STANCE_META[rule.stance]} />
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </Card>
                                </div>
                            </div>
                        ),
                    },
                    {
                        value: "photos",
                        label: `Photos (${theCase.photos.length})`,
                        content:
                            theCase.photos.length === 0 ? (
                                <EmptyState
                                    icon={Camera}
                                    title="No photographs"
                                    description="The publisher filed this spot without a photograph. An advertiser will not book what they cannot see — worth sending back for."
                                />
                            ) : (
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {theCase.photos.map((photo) => (
                                        <figure
                                            key={photo.id}
                                            className="overflow-hidden rounded-lg border border-border bg-card"
                                        >
                                            <a href={photo.url} target="_blank" rel="noreferrer">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={photo.url}
                                                    alt={`${theCase.title} — ${photo.type.toLowerCase()}`}
                                                    className="aspect-[4/3] w-full object-cover"
                                                />
                                            </a>
                                            <figcaption className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
                                                <span className="capitalize">{photo.type.toLowerCase().replace(/_/g, " ")}</span>
                                                <span>{formatDate(photo.createdAt)}</span>
                                            </figcaption>
                                        </figure>
                                    ))}
                                </div>
                            ),
                    },
                    {
                        value: "documents",
                        label: `Documents (${theCase.documents.length})`,
                        content:
                            theCase.documents.length === 0 ? (
                                <EmptyState
                                    icon={FileText}
                                    title="No documents"
                                    description="Nothing has been uploaded for this spot. The listing can still be approved; the desk decides whether paperwork is required for this kind of space."
                                />
                            ) : (
                                <DocumentsTable
                                    documents={theCase.documents}
                                    onChanged={onChanged}
                                />
                            ),
                    },
                    {
                        value: "queue",
                        label: `Rest of the desk (${others.length})`,
                        content: (
                            <SimpleTable<ReviewQueueRow>
                                rows={others}
                                rowKey={(row) => row.id}
                                emptyMessage="Nothing else is waiting."
                                columns={[
                                    {
                                        key: "listing",
                                        label: "Listing",
                                        render: (row) => (
                                            <Link
                                                href={`/listings/review/${row.id}`}
                                                className="font-medium text-foreground underline-offset-4 hover:underline"
                                            >
                                                {row.title}
                                            </Link>
                                        ),
                                    },
                                    {
                                        key: "publisher",
                                        label: "Publisher",
                                        render: (row) => (
                                            <span className="text-muted-foreground">{row.publisher?.name ?? "—"}</span>
                                        ),
                                    },
                                    {
                                        key: "gate",
                                        label: "Gate",
                                        render: (row) => <StatusBadge status={GATE_META[row.gate.state]} />,
                                    },
                                    {
                                        key: "waiting",
                                        label: "Waiting",
                                        render: (row) => (now ? ageLabel(row.submittedAt, now) : "—"),
                                    },
                                ]}
                            />
                        ),
                    },
                ]}
            />

            <SendBackDialog
                open={sendingBack}
                onOpenChange={setSendingBack}
                listingId={theCase.id}
                title={theCase.title}
            />
        </>
    );
}

/* ── Documents ────────────────────────────────────────────────────────── */

function DocumentsTable({ documents, onChanged }: { documents: ReviewDocument[]; onChanged: () => void }) {
    const [rejecting, setRejecting] = React.useState<ReviewDocument | null>(null);
    const [busyId, setBusyId] = React.useState<string | null>(null);

    async function verify(document: ReviewDocument) {
        setBusyId(document.id);
        try {
            await listingReviewService.reviewDocument(document.id, true);
            toast.success(`${DOCUMENT_KIND_LABEL[document.kind]} verified`);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not record the verdict.");
        } finally {
            setBusyId(null);
        }
    }

    return (
        <>
            <SimpleTable<ReviewDocument>
                rows={documents}
                rowKey={(document) => document.id}
                columns={[
                    {
                        key: "kind",
                        label: "Document",
                        render: (document) => (
                            <a
                                href={document.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-foreground underline-offset-4 hover:underline"
                            >
                                {DOCUMENT_KIND_LABEL[document.kind]}
                            </a>
                        ),
                    },
                    {
                        key: "status",
                        label: "Status",
                        render: (document) => (
                            <div>
                                <StatusBadge status={DOCUMENT_STATUS_META[document.status]} />
                                {document.rejectionReason ? (
                                    <p className="mt-1 text-xs text-muted-foreground">{document.rejectionReason}</p>
                                ) : null}
                            </div>
                        ),
                    },
                    {
                        key: "submitted",
                        label: "Submitted",
                        render: (document) => formatDate(document.submittedAt),
                    },
                    {
                        key: "reviewed",
                        label: "Reviewed",
                        render: (document) => (document.reviewedAt ? formatDate(document.reviewedAt) : "—"),
                    },
                    {
                        key: "actions",
                        label: "",
                        className: "text-right",
                        render: (document) =>
                            document.status === "PENDING" ? (
                                <div className="flex justify-end gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={busyId === document.id}
                                        onClick={() => setRejecting(document)}
                                    >
                                        Reject
                                    </Button>
                                    <Button size="sm" disabled={busyId === document.id} onClick={() => verify(document)}>
                                        Verify
                                    </Button>
                                </div>
                            ) : null,
                    },
                ]}
            />
            <RejectDocumentDialog
                document={rejecting}
                onOpenChange={(open) => !open && setRejecting(null)}
                onDone={() => {
                    setRejecting(null);
                    onChanged();
                }}
            />
        </>
    );
}

function RejectDocumentDialog({
    document,
    onOpenChange,
    onDone,
}: {
    document: ReviewDocument | null;
    onOpenChange: (open: boolean) => void;
    onDone: () => void;
}) {
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const ready = reason.trim().length >= 5;

    /* The reason belongs to one document: it is cleared as the dialog closes,
       rather than by an effect watching the prop. */
    const close = (open: boolean) => {
        if (!open) setReason("");
        onOpenChange(open);
    };

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!document || !ready || busy) return;
        setBusy(true);
        try {
            await listingReviewService.reviewDocument(document.id, false, reason.trim());
            toast.success(`${DOCUMENT_KIND_LABEL[document.kind]} rejected`, {
                description: "The publisher is shown your reason and can upload a replacement.",
            });
            onDone();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not record the verdict.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={document !== null} onOpenChange={close}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={submit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Reject {document ? DOCUMENT_KIND_LABEL[document.kind].toLowerCase() : "document"}</DialogTitle>
                        <DialogDescription>
                            Say what is wrong with it. The publisher reads this and uploads a replacement.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-1.5">
                        <Label htmlFor="document-reason">Reason</Label>
                        <Textarea
                            id="document-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="Image unreadable — the right-hand edge is cut off."
                            rows={3}
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="destructive" disabled={!ready || busy}>
                            {busy ? "Recording…" : "Reject document"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

/* ── Send back ────────────────────────────────────────────────────────── */

const OUTCOMES: { value: SendBackOutcome; label: string; description: string }[] = [
    {
        value: "CHANGES_REQUESTED",
        label: "Send back for changes",
        description: "Returns to the publisher as a draft they can fix and resubmit.",
    },
    {
        value: "REJECTED",
        label: "Reject outright",
        description: "The end of the road for this spot. The reason stays as the record of why.",
    },
];

function SendBackDialog({
    open,
    onOpenChange,
    listingId,
    title,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    listingId: string;
    title: string;
}) {
    const router = useRouter();
    const [outcome, setOutcome] = React.useState<SendBackOutcome>("CHANGES_REQUESTED");
    const [reason, setReason] = React.useState("");
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    // Five characters is the server's floor below which nothing is a sentence.
    const ready = reason.trim().length >= 5;

    function handleOpenChange(next: boolean) {
        if (!next) {
            setOutcome("CHANGES_REQUESTED");
            setReason("");
            setError(null);
        }
        onOpenChange(next);
    }

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        try {
            const result = await listingReviewService.sendBack(listingId, { reason: reason.trim(), outcome });
            toast.success(
                result.status === "REJECTED" ? `${title} rejected` : `${title} sent back to the publisher`,
                { description: reason.trim() }
            );
            handleOpenChange(false);
            router.push("/listings/review");
        } catch (cause) {
            setError(cause instanceof ApiError ? cause.message : "Could not send the listing back.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <form onSubmit={submit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Send {title} back</DialogTitle>
                        <DialogDescription>
                            The publisher is shown your reason word for word. “No” with nothing after it is a
                            support ticket, not a correction.
                        </DialogDescription>
                    </DialogHeader>

                    <RadioGroup
                        value={outcome}
                        onValueChange={(value) => setOutcome(value as SendBackOutcome)}
                        className="grid gap-2"
                    >
                        {OUTCOMES.map((option) => (
                            <label
                                key={option.value}
                                htmlFor={`outcome-${option.value}`}
                                className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-left"
                            >
                                <RadioGroupItem id={`outcome-${option.value}`} value={option.value} className="mt-0.5" />
                                <span>
                                    <span className="block text-sm font-medium text-foreground">{option.label}</span>
                                    <span className="block text-xs text-muted-foreground">{option.description}</span>
                                </span>
                            </label>
                        ))}
                    </RadioGroup>

                    <div className="grid gap-1.5">
                        <Label htmlFor="send-back-reason">What the publisher has to fix</Label>
                        <Textarea
                            id="send-back-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="Photos are blurry — retake in daylight, showing the whole frame."
                            rows={4}
                        />
                        {error ? <p className="text-sm text-destructive">{error}</p> : null}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant={outcome === "REJECTED" ? "destructive" : "default"}
                            disabled={!ready || busy}
                        >
                            {busy ? "Sending…" : outcome === "REJECTED" ? "Reject listing" : "Send back"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
