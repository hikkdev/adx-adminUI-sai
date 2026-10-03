"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PrivateFile, fetchPrivateBlob } from "@/components/adx/private-file";
import { FieldList, SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime, formatMoney } from "@/lib/format";
import { imageSize } from "@/lib/image-size";
import { useAuth } from "@/lib/auth";
import type { AgreementAcceptance } from "@/services/agreements";
import {
    campaignService,
    designQuoteOf,
    designQuoteStatusMeta,
    fulfilmentLabel,
    reservationStatusMeta,
    trackingCodeImageUrl,
    trackingCodeSvgUrl,
    type CampaignAnalytics,
    type CampaignCreativeRow,
    type CampaignDetail,
    type CampaignRefundSummary,
    type CampaignReservation,
    type CampaignReview,
    type TrackingCode,
} from "@/services/campaigns";
import { CREATIVE_STATUS_META, flagLabel, moderationService, type CreativeStatus } from "@/services/moderation";
import { uploadService } from "@/services/uploads";

const creativeMeta = (status: string) =>
    CREATIVE_STATUS_META[status as CreativeStatus] ?? { label: status.replace(/_/g, " ").toLowerCase(), tone: "neutral" as const };

/* ------------------------------------------------------------------ */
/* Creatives                                                           */
/* ------------------------------------------------------------------ */

/**
 * The campaign's artwork with where each stands in review, and ops' door
 * for ADX-designed artwork (Lot D, Q120): an admin upload lands
 * AWAITING_ADVERTISER, the advertiser tap-accepts, and only then does it
 * enter the review queue like any other upload.
 */
export function CreativesCard({ campaign, onChanged }: { campaign: CampaignDetail; onChanged: () => void }) {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [busy, setBusy] = React.useState(false);
    const creatives = campaign.creatives ?? [];
    const superseded = new Set(creatives.map((row) => row.resubmissionOfId).filter(Boolean));
    const current = creatives.filter((row) => !superseded.has(row.id));
    const canUpload = Boolean(campaign.creativePath) && campaign.status !== "CANCELLED" && campaign.status !== "COMPLETED";

    const upload = async (file: File) => {
        setBusy(true);
        try {
            const dims = await imageSize(file);
            const stored = await uploadService.upload(file, "CAMPAIGN_CREATIVE");
            await moderationService.uploadDesigned(campaign.id, {
                fileUrl: stored.url,
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type || undefined,
                ...(dims ? { widthPx: dims.width, heightPx: dims.height } : {}),
            });
            toast.success("ADX artwork sent to the advertiser", {
                description: "It waits for their acceptance before ops review.",
            });
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The upload was refused.");
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Creatives</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Every artwork goes through ops before it prints or goes live.
                    </p>
                </div>
                {canUpload && (
                    <>
                        <input
                            ref={inputRef}
                            type="file"
                            accept="image/*,video/*"
                            className="hidden"
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) void upload(file);
                            }}
                        />
                        <Button size="sm" variant="outline" className="h-8 bg-card" disabled={busy} onClick={() => inputRef.current?.click()}>
                            <Upload className="mr-1.5 size-3.5" />
                            Upload ADX design
                        </Button>
                    </>
                )}
            </div>
            {!campaign.creativePath && (
                <p className="mt-4 text-sm text-muted-foreground">
                    No creative path chosen yet — the wizard&rsquo;s step 12. Nothing can be uploaded until it is.
                </p>
            )}
            {campaign.creativePath && current.length === 0 && (
                <p className="mt-4 text-sm text-muted-foreground">No artwork uploaded yet.</p>
            )}
            {current.length > 0 && (
                <ul className="mt-4 divide-y">
                    {current.map((creative) => (
                        <CreativeLine key={creative.id} creative={creative} campaign={campaign} />
                    ))}
                </ul>
            )}
        </Card>
    );
}

function CreativeLine({ creative, campaign }: { creative: CampaignCreativeRow; campaign: CampaignDetail }) {
    const spot = campaign.spots?.find((row) => row.id === creative.spotId);
    return (
        <li className="flex items-start gap-3 py-3">
            <PrivateFile
                src={creative.fileUrl}
                alt={creative.fileName ?? "Artwork"}
                className="size-14 shrink-0 rounded-md object-cover"
                frameClassName="size-14 shrink-0 rounded-md"
            />
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                        {spot?.listing?.title ?? (creative.spotId ? "One spot" : "Whole campaign")}
                    </span>
                    <StatusBadge status={creativeMeta(creative.status)} />
                    {creative.designedByAdx && <StatusBadge status={{ label: "ADX design", tone: "info" }} />}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {creative.fileName ?? "No file yet"}
                    {creative.submittedAt ? ` · submitted ${formatDateTime(creative.submittedAt)}` : ""}
                </p>
                {creative.flags.length > 0 && (
                    <p className="mt-1 text-xs text-danger">{creative.flags.map(flagLabel).join(" · ")}</p>
                )}
                {creative.reviewNote && (
                    <p className="mt-1 rounded-md bg-muted/60 px-2 py-1 text-xs text-foreground">
                        <span className="text-muted-foreground">Review note: </span>
                        {creative.reviewNote}
                    </p>
                )}
                {creative.status === "AWAITING_ADVERTISER" && (
                    <p className="mt-1 text-xs text-muted-foreground">Waiting for the advertiser to accept it.</p>
                )}
            </div>
            {creative.fileUrl && (
                <Button size="sm" variant="ghost" className="h-7 shrink-0" asChild>
                    <Link href={`/creatives/${creative.id}`}>Review</Link>
                </Button>
            )}
        </li>
    );
}

/* ------------------------------------------------------------------ */
/* Tracking codes and the interactions                                 */
/* ------------------------------------------------------------------ */

/** QR-1: what the hoarding carries — the engine's short URL when hosted, ADX's own /t/ otherwise. */
export const printedUrlOf = (code: TrackingCode): string => code.printedUrl ?? code.url;

/** QR-1: the code as the vector a print designer wants — fetched behind the bearer token, then saved. */
function SvgDownload({ campaignId, code, fileName }: { campaignId: string; code: string; fileName: string }) {
    const [busy, setBusy] = React.useState(false);
    const save = async () => {
        setBusy(true);
        try {
            const blob = await fetchPrivateBlob(trackingCodeSvgUrl(campaignId, code));
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = fileName;
            anchor.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not fetch the SVG.");
        } finally {
            setBusy(false);
        }
    };
    return (
        <button
            type="button"
            onClick={save}
            disabled={busy}
            className="mt-1 text-xs text-primary underline underline-offset-2 disabled:opacity-60"
            data-testid={`download-svg-${code}`}
        >
            {busy ? "Fetching…" : "Download SVG for print"}
        </button>
    );
}

export function TrackingCard({ campaign, codes, onChanged }: { campaign: CampaignDetail; codes: TrackingCode[]; onChanged?: () => void }) {
    const { user } = useAuth();
    const [syncing, setSyncing] = React.useState(false);
    const isAdmin = user?.roles?.includes("ADMIN") ?? false;
    // QR-1: codes the hoarding carries as /t/ — the engine has not taken them yet.
    const unhosted = codes.filter((code) => code.method === "QR_OR_DEEPLINK" && code.engine !== "GENQR");
    const hosted = codes.filter((code) => code.engine === "GENQR");

    const sync = async () => {
        setSyncing(true);
        try {
            const result = await campaignService.syncTrackingCodesWithEngine(campaign.id);
            toast.success(
                result.linked === 0 ? "Nothing to link — GenQR hosts every code already, or no engine hosts codes." : `GenQR now hosts ${result.linked} code${result.linked === 1 ? "" : "s"}`,
            );
            onChanged?.();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not sync the codes with the QR engine.");
        } finally {
            setSyncing(false);
        }
    };

    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Tracking codes</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Minted at authorisation so the artwork can embed them.
                        {hosted.length > 0
                            ? ` GenQR hosts ${hosted.length} of ${codes.length}: the hoarding carries the short URL, which sends the scan through ADX.`
                            : " The QR is drawn by the API and the hoarding carries ADX's own /t/ link."}
                    </p>
                </div>
                {isAdmin && unhosted.length > 0 && (
                    <Button size="sm" variant="outline" className="h-8" disabled={syncing} onClick={sync} data-testid="button-sync-engine">
                        {syncing ? "Syncing…" : `Host ${unhosted.length} on GenQR`}
                    </Button>
                )}
            </div>
            {codes.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                    {campaign.status === "DRAFT" || campaign.status === "PENDING_PAYMENT"
                        ? "Codes are minted when the campaign is authorised."
                        : "No codes on this campaign."}
                </p>
            ) : (
                <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                    {codes.map((code) => {
                        const spot = campaign.spots?.find((row) => row.id === code.spotId);
                        return (
                            <li key={code.id} className="flex gap-3 rounded-md border p-3">
                                <PrivateFile
                                    src={trackingCodeImageUrl(campaign.id, code.code, 240)}
                                    alt={`QR for ${code.code}`}
                                    className="size-24 shrink-0 rounded bg-white"
                                    frameClassName="size-24 shrink-0 rounded"
                                />
                                <div className="min-w-0 flex-1 text-sm">
                                    <p className="flex items-center gap-2 truncate font-medium text-foreground">
                                        <span className="truncate">{spot?.listing?.title ?? "Whole campaign"}</span>
                                        {code.engine === "GENQR" && <StatusBadge status={{ label: "GenQR", tone: "info" }} />}
                                    </p>
                                    <p className="truncate font-mono text-xs text-muted-foreground" title={printedUrlOf(code)}>
                                        {printedUrlOf(code)}
                                    </p>
                                    {code.engine === "GENQR" && (
                                        <p className="truncate text-[11px] text-muted-foreground" title={code.url}>
                                            → {code.url}
                                        </p>
                                    )}
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {code.scans} scan{code.scans === 1 ? "" : "s"} · {code.clicks} click{code.clicks === 1 ? "" : "s"}
                                        {code.promoCode ? ` · ${code.promoCode} (${code.redemptions} redeemed)` : ""}
                                    </p>
                                    <p className="mt-1 truncate text-xs text-muted-foreground">
                                        {code.destination ?? "No destination — the plain thanks page"}
                                    </p>
                                    <SvgDownload campaignId={campaign.id} code={code.code} fileName={`${campaign.reference ?? campaign.id}-${code.code}.svg`} />
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}

/**
 * QR-1: the QR engine's log of the same scans, folded over the hosted
 * codes — the phone's country, city, browser and OS that ADX itself does
 * not read. Beside the measured number, labelled as the engine's; absent
 * when nothing is hosted.
 */
export function EngineCard({ analytics }: { analytics: CampaignAnalytics | null }) {
    const engine = analytics?.engine ?? null;
    if (!engine) return null;

    const block = (title: string, rows: { label: string; count: number }[]) => (
        <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
            {rows.length === 0 ? (
                <p className="mt-1.5 text-xs text-muted-foreground">Nothing yet.</p>
            ) : (
                <ul className="mt-1.5 space-y-1 text-sm">
                    {rows.slice(0, 6).map((row) => (
                        <li key={row.label} className="flex items-center justify-between gap-3">
                            <span className="truncate text-foreground">{row.label}</span>
                            <span className="tabular-nums text-muted-foreground">{row.count}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );

    const busiest = engine.hourlyBreakdown.reduce<{ hour: number; count: number } | null>(
        (best, row) => (row.count > 0 && (!best || row.count > best.count) ? row : best),
        null,
    );

    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="engine-card">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-foreground">As GenQR saw it</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{engine.basis}</p>
                </div>
                <StatusBadge status={{ label: "Engine", tone: "info" }} />
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                    <dt className="text-xs text-muted-foreground">Scans, all time</dt>
                    <dd className="text-lg font-semibold tabular-nums text-foreground">{engine.totalScans}</dd>
                </div>
                <div>
                    <dt className="text-xs text-muted-foreground">Last {engine.days} days</dt>
                    <dd className="text-lg font-semibold tabular-nums text-foreground">{engine.scansInWindow}</dd>
                </div>
                <div>
                    <dt className="text-xs text-muted-foreground">Busiest hour</dt>
                    <dd className="text-lg font-semibold tabular-nums text-foreground">{busiest ? `${String(busiest.hour).padStart(2, "0")}:00` : "—"}</dd>
                </div>
            </dl>
            {engine.codesUnanswered > 0 && (
                <p className="mt-2 text-xs text-warning">
                    GenQR did not answer for {engine.codesUnanswered} of {engine.codesLinked} hosted codes on this read; the figures fold the rest.
                </p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {block("City", engine.cityBreakdown)}
                {block("Country", engine.countryBreakdown)}
                {block("Device", engine.deviceBreakdown)}
                {block("Browser", engine.browserBreakdown)}
                {block("OS", engine.osBreakdown)}
            </div>
        </Card>
    );
}

const HOUR = (hour: number | null) => (hour === null ? "Unknown hour" : `${String(hour).padStart(2, "0")}:00 IST`);

/** Lot D (Q7): what happened on the landing page after the scan — MEASURED, or nothing. */
export function InteractionsCard({ analytics }: { analytics: CampaignAnalytics | null }) {
    const interactions = analytics?.interactions;
    const empty = !interactions || [interactions.byDevice, interactions.byHour, interactions.byCity, interactions.byCta].every((rows) => rows.length === 0);

    const block = (title: string, rows: { label: string; count: number }[]) => (
        <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
            {rows.length === 0 ? (
                <p className="mt-1.5 text-xs text-muted-foreground">Nothing yet.</p>
            ) : (
                <ul className="mt-1.5 space-y-1 text-sm">
                    {rows.slice(0, 6).map((row) => (
                        <li key={row.label} className="flex items-center justify-between gap-3">
                            <span className="truncate text-foreground">{row.label}</span>
                            <span className="tabular-nums text-muted-foreground">{row.count}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );

    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground">Landing-page interactions</h3>
                {interactions && <StatusBadge status={{ label: "Measured", tone: "success" }} />}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
                Views, CTA presses and form submits after a scan. Counted by ADX; bots are not.
            </p>
            {analytics === null ? (
                <p className="mt-4 text-sm text-muted-foreground">The analytics read failed; try again later.</p>
            ) : empty ? (
                <p className="mt-4 text-sm text-muted-foreground">No interactions recorded yet.</p>
            ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {block(
                        "By device",
                        interactions.byDevice.map((row) => ({ label: row.device ?? "Unknown", count: row.count })),
                    )}
                    {block(
                        "By hour",
                        interactions.byHour.map((row) => ({ label: HOUR(row.hourIst), count: row.count })),
                    )}
                    {block(
                        "By city",
                        interactions.byCity.map((row) => ({ label: row.city ?? "Unknown", count: row.count })),
                    )}
                    {block(
                        "By call to action",
                        interactions.byCta.map((row) => ({ label: row.ctaLabel ?? "View", count: row.count })),
                    )}
                </div>
            )}
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* The insertion order and the refund                                  */
/* ------------------------------------------------------------------ */

export function InsertionOrderCard({
    review,
    acceptance,
}: {
    review: CampaignReview | null;
    /** The acceptance row anchored on this campaign, when the register had it. */
    acceptance: AgreementAcceptance | null;
}) {
    const standing = review?.agreements?.find((row) => row.kind === "INSERTION_ORDER") ?? null;
    const state = !standing
        ? null
        : standing.current
          ? { icon: CheckCircle2, tone: "success" as const, title: `Accepted on v${standing.templateVersion ?? "—"}, the version live now` }
          : standing.accepted
            ? { icon: AlertTriangle, tone: "warning" as const, title: `Accepted v${standing.templateVersion}; v${standing.currentVersion ?? "—"} is live now — the advertiser accepts again before authorisation` }
            : { icon: CircleDashed, tone: "warning" as const, title: standing.currentVersion === null ? "Nothing to accept: no insertion order is live" : "Not accepted yet — authorisation waits on the advertiser's click" };
    const Icon = state?.icon ?? CircleDashed;

    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <h3 className="text-base font-semibold text-foreground">Insertion order</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
                The advertiser&rsquo;s own click, on the version live at the time. Authorisation refuses without it.
            </p>
            {state ? (
                <div className="mt-4 flex items-start gap-2.5">
                    <Icon
                        className={`mt-0.5 size-4 shrink-0 ${state.tone === "success" ? "text-success" : "text-warning"}`}
                        aria-hidden
                    />
                    <div className="min-w-0 text-sm">
                        <p className="text-foreground">{state.title}</p>
                        {acceptance && (
                            <FieldList
                                className="mt-2 max-w-md space-y-1 text-xs"
                                items={[
                                    ["Version", `v${acceptance.templateVersion} · ${acceptance.template.title}`],
                                    ["When", formatDateTime(acceptance.acceptedAt)],
                                    ["By", `${acceptance.acceptedBy.name ?? "—"} · ${acceptance.acceptedBy.mobile}`],
                                    ["Signature", acceptance.signatureProvider ?? "NONE"],
                                ]}
                            />
                        )}
                    </div>
                </div>
            ) : (
                <p className="mt-4 text-sm text-muted-foreground">The review read did not answer; the standing is unknown.</p>
            )}
        </Card>
    );
}

export function RefundRow({ refund }: { refund: CampaignRefundSummary | null | undefined }) {
    if (!refund) return null;
    const meta = {
        PENDING: { label: "Awaiting finance", tone: "warning" as const },
        RELEASED: { label: "Released", tone: "success" as const },
        REJECTED: { label: "Refused", tone: "danger" as const },
    }[refund.status];
    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Campaign refund</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        What the cancel owes for the unused days. Finance releases or refuses it at the refund desk.
                    </p>
                </div>
                <Button size="sm" variant="outline" className="h-8 bg-card" asChild>
                    <Link href="/finance/refunds">Refund desk</Link>
                </Button>
            </div>
            <SimpleTable
                className="mt-4"
                rows={[refund]}
                rowKey={(row) => row.id}
                columns={[
                    { key: "amount", label: "Amount", render: (row) => <span className="tabular-nums">{formatMoney(row.amount)}</span> },
                    { key: "status", label: "Status", render: () => <StatusBadge status={meta} /> },
                    { key: "reason", label: "Reason", render: (row) => row.reason },
                    {
                        key: "decided",
                        label: "Decided",
                        render: (row) => (row.releasedAt ? formatDateTime(row.releasedAt) : "—"),
                    },
                ]}
            />
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* OM-1: the spots and their orders                                    */
/* ------------------------------------------------------------------ */

/** What each spot's fulfilment state is called on the card. */
const SPOT_STATUS_LABEL: Record<string, string> = {
    RESERVED: "Reserved",
    BOOKED: "Booked",
    LIVE: "Live",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
};

/**
 * OM-1: the spots on the campaign, each linked to the order that puts it
 * up. Campaigns never linked down to Orders before — the page looked spots
 * up only to label creatives and tracking codes. A spot with no order yet
 * has not been authorised, or was placed before the campaign existed.
 */
export function SpotsCard({ campaign }: { campaign: CampaignDetail }) {
    const spots = campaign.spots ?? [];
    const withOrder = spots.filter((spot) => spot.orderId).length;

    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="campaign-spots">
            <div>
                <h3 className="text-base font-semibold text-foreground">Spots</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    {spots.length === 0
                        ? "No spots chosen yet."
                        : `${spots.length} spot${spots.length === 1 ? "" : "s"}, ${withOrder} with an order to put it up.`}
                </p>
            </div>
            {spots.length > 0 && (
                <SimpleTable
                    className="mt-4"
                    rows={spots}
                    rowKey={(spot) => spot.id}
                    emptyMessage="No spots chosen yet."
                    columns={[
                        {
                            key: "listing",
                            label: "Site",
                            render: (spot) =>
                                spot.listing ? (
                                    <Link href={`/listings/${spot.listing.id}`} className="text-foreground underline-offset-4 hover:underline">
                                        {spot.listing.title}
                                        {spot.listing.city ? <span className="text-muted-foreground"> · {spot.listing.city}</span> : null}
                                    </Link>
                                ) : (
                                    spot.listingId
                                ),
                        },
                        {
                            key: "status",
                            label: "Status",
                            render: (spot) => <span className="text-muted-foreground">{SPOT_STATUS_LABEL[spot.status] ?? spot.status}</span>,
                        },
                        {
                            key: "value",
                            label: "Value",
                            render: (spot) => <span className="tabular-nums">{spot.lineTotal ? formatMoney(spot.lineTotal) : "—"}</span>,
                        },
                        {
                            key: "order",
                            label: "Order",
                            render: (spot) =>
                                spot.orderId ? (
                                    <Link
                                        href={`/orders/${spot.orderId}`}
                                        className="text-primary underline-offset-4 hover:underline"
                                        data-testid={`spot-order-${spot.id}`}
                                    >
                                        Open order
                                    </Link>
                                ) : (
                                    <span className="text-muted-foreground/60">Not yet</span>
                                ),
                        },
                    ]}
                />
            )}
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* DQ-1: the design quote                                              */
/* ------------------------------------------------------------------ */

/**
 * DQ-1: ADX&rsquo;s price for designing the artwork, on a campaign that chose
 * ADX Design Agency. The desk names it here or on the design-requests
 * desk; the advertiser answers from the app. Accepted, it is a fee on the
 * booking (the bill card shows it); declined or unanswered, it may be
 * quoted again. Drawn only on the ADX path: elsewhere there is nothing
 * to price.
 */
export function DesignQuoteCard({ campaign, onQuote }: { campaign: CampaignDetail; onQuote: (() => void) | null }) {
    if (campaign.creativePath !== "ADX_DESIGN_AGENCY") return null;
    const quote = designQuoteOf(campaign);
    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="campaign-design-quote">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Design quote</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        The advertiser asked ADX to design the artwork. The fee named here goes on the booking once they accept it.
                    </p>
                </div>
                <StatusBadge status={designQuoteStatusMeta(quote)} />
            </div>
            {quote ? (
                <FieldList
                    className="mt-4"
                    items={[
                        ["Design fee", <span key="amt" className="tabular-nums">{formatMoney(quote.amount)} + GST</span>],
                        ["Quoted", quote.quotedAt ? formatDateTime(quote.quotedAt) : "—"],
                        ["Answered", quote.respondedAt ? formatDateTime(quote.respondedAt) : "Not yet"],
                        ...(quote.note ? ([["Note", quote.note]] as [string, React.ReactNode][]) : []),
                    ]}
                />
            ) : (
                <p className="mt-4 text-sm text-muted-foreground">No price named yet. The advertiser cannot accept a design fee until there is one.</p>
            )}
            {onQuote && (
                <div className="mt-4 flex justify-end">
                    <Button size="sm" variant="outline" className="h-8 bg-card" onClick={onQuote} data-testid="campaign-quote-button">
                        {quote ? "Re-quote" : "Quote the design"}
                    </Button>
                </div>
            )}
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* RF-1: the reservation                                               */
/* ------------------------------------------------------------------ */

/**
 * RF-1: the reservation on the campaign: the fee that held its spots,
 * where it stands, and what the checkout still asks for. Absent when none
 * was ever taken; most bookings pay in full and never see one.
 */
export function ReservationCard({ reservation }: { reservation: CampaignReservation | null | undefined }) {
    if (!reservation) return null;
    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="campaign-reservation">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Reservation</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        The spots were held against a fee. Folded into the checkout when the advertiser goes ahead; part of it kept when they do not.
                    </p>
                </div>
                <StatusBadge status={reservationStatusMeta(reservation.status)} />
            </div>
            <FieldList
                className="mt-4"
                items={[
                    ["Fee", <span key="fee" className="tabular-nums">{formatMoney(reservation.fee)}</span>],
                    ["Fee due by", reservation.dueAt ? formatDateTime(reservation.dueAt) : "—"],
                    ["Fee paid", reservation.paidAt ? formatDateTime(reservation.paidAt) : "Not paid"],
                    ["Spots held until", reservation.holdUntil ? formatDateTime(reservation.holdUntil) : "—"],
                    ["Still payable", reservation.payable ? <span key="pay" className="tabular-nums">{formatMoney(reservation.payable)}</span> : "—"],
                    ...(reservation.retained
                        ? ([["Retained", <span key="ret" className="tabular-nums">{formatMoney(reservation.retained)}</span>]] as [string, React.ReactNode][])
                        : []),
                    [
                        "Payment",
                        reservation.paymentId ? (
                            <Link key="p" href="/finance/payments" className="font-mono text-xs underline-offset-4 hover:underline">
                                {reservation.paymentId}
                            </Link>
                        ) : (
                            "—"
                        ),
                    ],
                ]}
            />
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/* The bill, as the review prices it                                   */
/* ------------------------------------------------------------------ */

/**
 * What the advertiser is asked to pay, exactly as `GET /campaigns/:id/review`
 * prices it and Review &amp; pay draws it: spots + fees − discount + GST = total.
 * GST-D: the discount comes off the taxable value, so the GST shown is net
 * and the tax the discount took with it is printed under the discount. DQ-1:
 * an accepted design quote is a fee line of its own. PS-1: each spot says
 * who prints it. RF-1: the reservation offer, when the total earns one.
 */
export function BillCard({ campaign, review }: { campaign: CampaignDetail; review: CampaignReview | null }) {
    if (!review || review.total === undefined) return null;
    const lines = review.lines ?? [];
    const money = (value: string | null | undefined) => (value === null || value === undefined ? "—" : formatMoney(value));
    const discount = Number(review.discount ?? "0") > 0;
    const offer = review.reservationFee ?? null;

    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="campaign-bill">
            <h3 className="text-base font-semibold text-foreground">The bill</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">As Review &amp; pay prices it: spots, fees, the discount off the taxable value, GST on what is paid.</p>

            {lines.length > 0 && (
                <ul className="mt-4 divide-y text-sm" data-testid="bill-lines">
                    {lines.map((line) => {
                        const printing = fulfilmentLabel(line.fulfilment, campaign.fulfilment);
                        return (
                            <li key={line.spotId} className="flex items-start justify-between gap-3 py-2">
                                <div className="min-w-0">
                                    <p className="truncate text-foreground">
                                        {line.title}
                                        {line.city ? <span className="text-muted-foreground"> · {line.city}</span> : null}
                                    </p>
                                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                        <span>
                                            {line.days} day{line.days === 1 ? "" : "s"}
                                            {line.quantity > 1 ? ` × ${line.quantity}` : ""}
                                        </span>
                                        {printing && <StatusBadge status={{ label: printing, tone: line.fulfilment ? "info" : "neutral" }} />}
                                    </p>
                                </div>
                                <span className="shrink-0 tabular-nums text-foreground">{formatMoney(line.gross)}</span>
                            </li>
                        );
                    })}
                </ul>
            )}

            <dl className="mt-4 space-y-2 border-t pt-3 text-sm" data-testid="bill-totals">
                <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Spots</dt>
                    <dd className="tabular-nums text-foreground">{money(review.spotsSubtotal)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Fees{review.designFee ? " (design included)" : ""}</dt>
                    <dd className="tabular-nums text-foreground">{money(review.feesTotal)}</dd>
                </div>
                {review.designFee && (
                    <div className="flex items-start justify-between gap-4 pl-4" data-testid="bill-design-fee">
                        <dt className="text-muted-foreground">
                            Design by ADX
                            {review.designFee.note ? <span className="block text-xs">{review.designFee.note}</span> : null}
                        </dt>
                        <dd className="shrink-0 text-right tabular-nums text-foreground">
                            {formatMoney(review.designFee.amount)}
                            <span className="block text-xs text-muted-foreground">+ {formatMoney(review.designFee.gst)} GST</span>
                        </dd>
                    </div>
                )}
                {discount && (
                    <div className="flex items-start justify-between gap-4" data-testid="bill-discount">
                        <dt className="text-muted-foreground">
                            Discount{review.promo ? ` (${review.promo.code})` : ""}
                            {Number(review.discountGst ?? "0") > 0 ? (
                                <span className="block text-xs">GST on the discounted part, {formatMoney(review.discountGst)}, comes off too</span>
                            ) : null}
                        </dt>
                        <dd className="shrink-0 tabular-nums text-foreground">− {money(review.discount)}</dd>
                    </div>
                )}
                <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">GST{discount ? " (net)" : ""}</dt>
                    <dd className="tabular-nums text-foreground">{money(review.gstAmount)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-t pt-2 font-medium">
                    <dt className="text-foreground">Total</dt>
                    <dd className="tabular-nums text-foreground">{money(review.total)}</dd>
                </div>
            </dl>

            {offer && offer.enabled && offer.offered && (
                <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground" data-testid="bill-reservation-offer">
                    Reservable: {formatMoney(offer.amount)} ({offer.pct}% of the total) holds the spots for {offer.holdHours} hours, due within{" "}
                    {offer.payWithinMinutes} minutes; {offer.retainPct}% is kept if the advertiser walks away.
                </p>
            )}
        </Card>
    );
}
