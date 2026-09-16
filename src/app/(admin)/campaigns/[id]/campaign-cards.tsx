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
import { useAuth } from "@/lib/auth";
import type { AgreementAcceptance } from "@/services/agreements";
import {
    campaignService,
    trackingCodeImageUrl,
    trackingCodeSvgUrl,
    type CampaignAnalytics,
    type CampaignCreativeRow,
    type CampaignDetail,
    type CampaignRefundSummary,
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
                    <Link href={`/moderation/${creative.id}`}>Review</Link>
                </Button>
            )}
        </li>
    );
}

/** The pixel size of an image file, for the dimensions check; null for anything that is not an image. */
function imageSize(file: File): Promise<{ width: number; height: number } | null> {
    if (!file.type.startsWith("image/") || typeof window === "undefined") return Promise.resolve(null);
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const image = new window.Image();
        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: image.naturalWidth, height: image.naturalHeight });
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        image.src = url;
    });
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
