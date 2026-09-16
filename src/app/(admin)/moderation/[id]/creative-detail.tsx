"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, Download, Film, Flag, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PrivateFile, openPrivateFile, usePrivateObjectUrl } from "@/components/adx/private-file";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import {
    CHECK_RESULT_META,
    CREATIVE_CHECK_META,
    CREATIVE_PATH_LABEL,
    CREATIVE_STATUS_META,
    checklistOf,
    fileSizeLabel,
    flagLabel,
    isVideo,
    moderationService,
    noteRequired,
    placementLabel,
    type CreativeCheck,
    type CreativeCheckResult,
    type CreativeDecision,
    type CreativeReviewRow,
} from "@/services/moderation";

interface CreativeDetailProps {
    creative: CreativeReviewRow;
    queue: CreativeReviewRow[];
    onChanged: () => void;
}

/** The states a decision can be made in; anything else is not the desk's to touch yet. */
const decidable = (row: CreativeReviewRow): boolean =>
    row.fileUrl !== null && row.status !== "AWAITING_ADVERTISER" && row.status !== "PENDING_UPLOAD";

/**
 * DR 10's Creative Review workbench (`5102:39019`), live.
 *
 * The frame's three regions stand: the summary strip, the viewer with its
 * zoom, and the rail — compliance checklist, review note, creative queue.
 * The checklist's first two rows are the checks the server computed at
 * upload; the other three are the reviewer's own, UNKNOWN until judged, and
 * every decision sends the whole list back so the record shows what the
 * desk actually looked at.
 */
export function CreativeDetail({ creative, queue, onChanged }: CreativeDetailProps) {
    const router = useRouter();
    const [zoom, setZoom] = React.useState(100);
    const [note, setNote] = React.useState(creative.reviewNote ?? "");
    const [checks, setChecks] = React.useState<CreativeCheck[]>(() => checklistOf(creative.checks));
    const [busy, setBusy] = React.useState(false);
    const video = isVideo(creative);
    const file = usePrivateObjectUrl(video ? creative.fileUrl : null);
    const canDecide = decidable(creative);

    const judge = (code: CreativeCheck["code"], result: CreativeCheckResult) =>
        setChecks((current) => current.map((check) => (check.code === code ? { ...check, result } : check)));

    const decide = async (decision: CreativeDecision) => {
        const problem = noteRequired(decision, note);
        if (problem) {
            toast.error(problem);
            return;
        }
        setBusy(true);
        try {
            await moderationService.review(creative.campaignId, creative.id, {
                decision,
                ...(note.trim() ? { note: note.trim() } : {}),
                checks,
            });
            toast.success(`${creative.campaign.name} ${CREATIVE_STATUS_META[decision].label.toLowerCase()}`, {
                description: "The advertiser has been notified.",
            });
            if (decision === "APPROVED" && queue[0]) router.push(`/moderation/${queue[0].id}`);
            else onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The decision could not be recorded.");
        } finally {
            setBusy(false);
        }
    };

    const download = async () => {
        if (!creative.fileUrl) return;
        try {
            await openPrivateFile(creative.fileUrl);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The file could not be opened.");
        }
    };

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/moderation"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Creative review
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{creative.campaign.name}</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            <Link href={`/campaigns/${creative.campaignId}`} className="underline-offset-4 hover:underline">
                                {creative.campaign.reference}
                            </Link>
                            {" · "}
                            <Link
                                href={`/advertisers/${creative.campaign.advertiserId}`}
                                className="underline-offset-4 hover:underline"
                            >
                                {creative.campaign.advertiser.companyName ?? creative.campaign.advertiser.name}
                            </Link>
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" className="bg-card" disabled={!creative.fileUrl} onClick={download}>
                            <Download className="mr-1.5 size-4" />
                            Download original
                        </Button>
                        <Button
                            variant="outline"
                            className="bg-card text-danger hover:text-danger"
                            disabled={!canDecide || busy || creative.status === "REJECTED"}
                            onClick={() => decide("REJECTED")}
                        >
                            Reject
                        </Button>
                        <Button disabled={!canDecide || busy || creative.status === "APPROVED"} onClick={() => decide("APPROVED")}>
                            Approve
                        </Button>
                    </div>
                </div>
            </div>

            {/* Summary strip */}
            <Card className="rounded-lg border-border shadow-none">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 sm:grid-cols-3 xl:grid-cols-6">
                    {(
                        [
                            ["Advertiser", creative.campaign.advertiser.companyName ?? creative.campaign.advertiser.name],
                            ["Campaign", creative.campaign.name],
                            ["Placement", creative.spot ? creative.spot.listing.title : "Campaign-level"],
                            ["Format", CREATIVE_PATH_LABEL[creative.path]],
                            ["File size", fileSizeLabel(creative.fileSize) ?? "—"],
                            ["Submitted", creative.submittedAt ? formatDateTime(creative.submittedAt) : "Not yet"],
                        ] as const
                    ).map(([label, value]) => (
                        <div key={label}>
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
                            <dd className="mt-0.5 truncate text-sm font-medium text-foreground" title={value}>
                                {value}
                            </dd>
                        </div>
                    ))}
                </dl>
            </Card>

            {creative.status === "AWAITING_ADVERTISER" && (
                <Card className="rounded-lg border-info/40 bg-info-soft p-4 shadow-none">
                    <p className="text-sm font-medium text-foreground">Waiting for the advertiser</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        ADX designed this artwork. The advertiser or their agent accepts it, or sends it back with a note, before
                        it enters ops review. An admin cannot accept it for them.
                    </p>
                </Card>
            )}

            {creative.resubmissionOfId && (
                <Card className="rounded-lg border-border bg-muted/40 p-4 shadow-none">
                    <p className="text-sm text-foreground">
                        A re-upload.{" "}
                        <Link href={`/moderation/${creative.resubmissionOfId}`} className="underline underline-offset-4">
                            The artwork it replaces
                        </Link>{" "}
                        stays on record with its refusal.
                    </p>
                </Card>
            )}

            <div className="grid gap-4 xl:grid-cols-5">
                {/* Viewer */}
                <Card className="flex flex-col overflow-hidden rounded-lg border-border shadow-none xl:col-span-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={CREATIVE_STATUS_META[creative.status]} />
                            {creative.flags.map((flag) => (
                                <span
                                    key={flag}
                                    className="flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger"
                                >
                                    <Flag className="size-3" />
                                    {flagLabel(flag)}
                                </span>
                            ))}
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label="Zoom out"
                                onClick={() => setZoom((value) => Math.max(50, value - 25))}
                            >
                                <Minus className="size-3.5" />
                            </Button>
                            <span className="w-11 text-center text-xs text-muted-foreground">{zoom}%</span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label="Zoom in"
                                onClick={() => setZoom((value) => Math.min(200, value + 25))}
                            >
                                <Plus className="size-3.5" />
                            </Button>
                        </div>
                    </div>
                    <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/40 p-8">
                        <div
                            className="w-full max-w-2xl transition-transform"
                            style={{ transform: `scale(${zoom / 100})`, transformOrigin: "center" }}
                        >
                            {video ? (
                                file.url ? (
                                    <video src={file.url} controls playsInline className="w-full rounded-md border shadow-sm" />
                                ) : (
                                    <div className="flex aspect-video w-full items-center justify-center rounded-md border bg-card">
                                        <div className="text-center">
                                            <Film className="mx-auto size-8 text-foreground/40" strokeWidth={1.5} />
                                            <p className="mt-2 text-xs text-muted-foreground">
                                                {file.error ?? (file.loading ? "Loading the video…" : "No file uploaded")}
                                            </p>
                                        </div>
                                    </div>
                                )
                            ) : (
                                <PrivateFile
                                    src={creative.fileUrl}
                                    alt={`${creative.campaign.name} artwork`}
                                    className="w-full rounded-md border bg-card shadow-sm"
                                    frameClassName="aspect-video"
                                />
                            )}
                            <p className="mt-2 text-center text-xs text-muted-foreground">
                                {placementLabel(creative)}
                                {creative.fileName ? ` · ${creative.fileName}` : ""}
                            </p>
                        </div>
                    </div>
                </Card>

                {/* Rail */}
                <div className="space-y-4 xl:col-span-2">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Compliance checklist
                        </h3>
                        <ul className="mt-3 divide-y">
                            {checks.map((check) => {
                                const meta = CREATIVE_CHECK_META[check.code];
                                return (
                                    <li key={check.code} className="flex items-center gap-3 py-2.5">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-foreground">{meta.name}</p>
                                            <p className="text-xs text-muted-foreground">{check.note ?? meta.detail}</p>
                                        </div>
                                        {meta.computed && check.result !== "UNKNOWN" ? (
                                            <StatusBadge status={CHECK_RESULT_META[check.result]} />
                                        ) : (
                                            <div className="flex shrink-0 items-center gap-1">
                                                <Button
                                                    variant={check.result === "PASS" ? "default" : "outline"}
                                                    size="sm"
                                                    className="h-7 px-2 text-xs"
                                                    disabled={!canDecide}
                                                    onClick={() => judge(check.code, "PASS")}
                                                >
                                                    <Check className="mr-1 size-3" />
                                                    Pass
                                                </Button>
                                                <Button
                                                    variant={check.result === "FAIL" ? "destructive" : "outline"}
                                                    size="sm"
                                                    className={cn("h-7 px-2 text-xs", check.result !== "FAIL" && "text-warning hover:text-warning")}
                                                    disabled={!canDecide}
                                                    onClick={() => judge(check.code, "FAIL")}
                                                >
                                                    <X className="mr-1 size-3" />
                                                    Fail
                                                </Button>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                        <p className="mt-2 text-xs text-muted-foreground">
                            The first two were computed at upload. The rest are yours; every decision records the list as it stands.
                        </p>
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Review note</h3>
                        <Textarea
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="Add a note for the advertiser and the audit trail"
                            className="mt-3 min-h-20 resize-none"
                            maxLength={1000}
                            disabled={!canDecide}
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                            A note is required when rejecting or requesting changes.
                        </p>
                        {creative.reviewedAt && (
                            <p className="mt-1 text-xs text-muted-foreground">
                                Last decided {formatDateTime(creative.reviewedAt)}.
                            </p>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 h-8 bg-card"
                            disabled={!canDecide || busy || creative.status === "CHANGES_REQUESTED"}
                            onClick={() => decide("CHANGES_REQUESTED")}
                        >
                            Request changes
                        </Button>
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Creative queue</h3>
                        {queue.length === 0 ? (
                            <p className="mt-3 text-sm text-muted-foreground">Nothing else is awaiting review.</p>
                        ) : (
                            <ul className="mt-2 divide-y">
                                {queue.map((item) => (
                                    <li key={item.id}>
                                        <Link
                                            href={`/moderation/${item.id}`}
                                            className="flex items-center justify-between gap-3 py-2.5 text-muted-foreground transition-colors hover:text-foreground"
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm">{item.campaign.name}</span>
                                                <span className="block truncate text-xs">
                                                    {item.campaign.advertiser.companyName ?? item.campaign.advertiser.name}
                                                </span>
                                            </span>
                                            <span className="shrink-0 text-xs">
                                                {item.submittedAt ? formatDateTime(item.submittedAt) : ""}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
}
