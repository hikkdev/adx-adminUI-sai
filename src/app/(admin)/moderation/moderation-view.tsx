"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Film, Flag, Image as ImageIcon, RotateCcw, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { PrivateFile } from "@/components/adx/private-file";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import {
    CREATIVE_PATH_LABEL,
    CREATIVE_STATUSES,
    CREATIVE_STATUS_META,
    fileSizeLabel,
    flagLabel,
    isVideo,
    moderationService,
    placementLabel,
    type CreativeDecision,
    type CreativeReviewRow,
    type CreativeStatus,
    type ReviewQueuePage,
} from "@/services/moderation";
import { DecisionDialog, type PendingDecision } from "./decision-dialog";

export type QueueFacet = "all" | "flagged" | "static" | "video" | "resubmitted";

interface ModerationViewProps {
    page: ReviewQueuePage;
    status: CreativeStatus | "ALL";
    onStatusChange: (status: CreativeStatus | "ALL") => void;
    facet: QueueFacet;
    onFacetChange: (facet: QueueFacet) => void;
    q: string;
    onSearch: (q: string) => void;
    onChanged: () => void;
}

/** The statuses the chip row offers — the ones a reviewer can act on or look back at. */
const CHIP_STATUSES: readonly CreativeStatus[] = CREATIVE_STATUSES.filter(
    (status) => status !== "UPLOADED" && status !== "PENDING_UPLOAD",
);

/** The states a decision can be made in; anything else is not the desk's to touch yet. */
const decidable = (row: CreativeReviewRow): boolean =>
    row.fileUrl !== null && row.status !== "AWAITING_ADVERTISER" && row.status !== "PENDING_UPLOAD";

/**
 * DR 10's Content Review queue (`5102:38568`), live.
 *
 * The frame's layout stands — the card grid with a preview, a kind chip, a
 * flag, a checkbox, Approve and Reject on every card and a sticky bar for
 * the selection — and every figure on it is the API's. The chips are the
 * status histogram the list contract sends plus the frame's own four facets,
 * each a `?` the server cuts rather than a filter over a capped page.
 */
export function ModerationView({
    page,
    status,
    onStatusChange,
    facet,
    onFacetChange,
    q,
    onSearch,
    onChanged,
}: ModerationViewProps) {
    const router = useRouter();
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [pending, setPending] = React.useState<(PendingDecision & { ids: string[] }) | null>(null);
    const [busy, setBusy] = React.useState(false);

    const awaiting = page.counts.IN_REVIEW ?? 0;
    const total = Object.values(page.counts).reduce((sum, count) => sum + count, 0);

    const toggle = (id: string) => {
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    /** A card's own decision goes to its row; the selection goes to the bulk route. */
    const decide = async (ids: string[], decision: CreativeDecision, note: string) => {
        setBusy(true);
        try {
            if (ids.length === 1) {
                const row = page.items.find((item) => item.id === ids[0]);
                if (!row) throw new Error("That artwork is no longer in the queue.");
                await moderationService.review(row.campaignId, row.id, { decision, ...(note ? { note } : {}) });
                toast.success(`${row.campaign.name}: ${CREATIVE_STATUS_META[decision].label.toLowerCase()}`, {
                    description: "The advertiser has been notified.",
                });
            } else {
                const result = await moderationService.reviewMany(ids, decision, note || undefined);
                const verb = CREATIVE_STATUS_META[decision].label.toLowerCase();
                if (result.failed.length === 0) {
                    toast.success(`${result.reviewed.length} creatives ${verb}`, {
                        description: "Each advertiser has been notified.",
                    });
                } else {
                    toast.warning(`${result.reviewed.length} ${verb}, ${result.failed.length} could not be`, {
                        description: result.failed.map((row) => row.reason).join(" · "),
                    });
                }
            }
            setPending(null);
            setSelected(new Set());
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The decision could not be recorded.");
        } finally {
            setBusy(false);
        }
    };

    const ask = (ids: string[], decision: CreativeDecision) => {
        if (ids.length === 0) return;
        setPending({ decision, count: ids.length, ids });
    };

    const selectedIds = [...selected];

    return (
        <div className="space-y-5">
            <PageHeader
                title="Creative review"
                subtitle={`${awaiting} creative${awaiting === 1 ? "" : "s"} awaiting review before campaigns go live.`}
                actions={
                    <>
                        <Button
                            variant="outline"
                            className="bg-card text-danger hover:text-danger"
                            disabled={selected.size === 0 || busy}
                            onClick={() => ask(selectedIds, "REJECTED")}
                        >
                            Reject selected
                        </Button>
                        <Button disabled={selected.size === 0 || busy} onClick={() => ask(selectedIds, "APPROVED")}>
                            Approve selected{selected.size > 0 ? ` (${selected.size})` : ""}
                        </Button>
                    </>
                }
            />

            <div className="flex flex-wrap items-center gap-3">
                <FilterChips<CreativeStatus | "ALL">
                    value={status}
                    onChange={(next) => {
                        setSelected(new Set());
                        onStatusChange(next);
                    }}
                    chips={[
                        { value: "ALL", label: "All", count: total },
                        ...CHIP_STATUSES.map((value) => ({
                            value,
                            label: CREATIVE_STATUS_META[value].label,
                            count: page.counts[value] ?? 0,
                        })),
                    ]}
                />
                <div className="relative ml-auto w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={q}
                        onChange={(event) => onSearch(event.target.value)}
                        placeholder="Campaign, reference or brand"
                        className="h-8 pl-9"
                        aria-label="Search the queue"
                    />
                </div>
            </div>

            <FilterChips<QueueFacet>
                value={facet}
                onChange={(next) => {
                    setSelected(new Set());
                    onFacetChange(next);
                }}
                /* E7-2: `counts` carries the four facets beside the status
                   histogram, counted over the same scope. */
                chips={[
                    { value: "all", label: "Every kind", count: total },
                    { value: "flagged", label: "Flagged", count: page.counts.flagged ?? 0 },
                    { value: "static", label: "Static", count: page.counts.static ?? 0 },
                    { value: "video", label: "Video", count: page.counts.video ?? 0 },
                    { value: "resubmitted", label: "Resubmitted", count: page.counts.resubmitted ?? 0 },
                ]}
            />

            {page.items.length === 0 ? (
                <Card className="rounded-lg border-border shadow-none">
                    <EmptyState
                        icon={ImageIcon}
                        title="Nothing in this queue"
                        description={
                            status === "IN_REVIEW" && facet === "all" && !q
                                ? "Every submitted artwork has been decided. New uploads land here the moment an advertiser submits them."
                                : "No artwork matches these chips. Try another status or clear the search."
                        }
                    />
                </Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {page.items.map((creative) => {
                        const isSelected = selected.has(creative.id);
                        const flagged = creative.flags.length > 0;
                        const video = isVideo(creative);
                        const canDecide = decidable(creative);
                        return (
                            <Card
                                key={creative.id}
                                className={cn(
                                    "overflow-hidden rounded-lg border-border shadow-none transition-shadow",
                                    isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-canvas",
                                )}
                            >
                                <div className="relative aspect-[16/10] bg-muted/40">
                                    {video ? (
                                        <div className="flex size-full items-center justify-center">
                                            <Film className="size-8 text-foreground/30" strokeWidth={1.5} aria-hidden />
                                        </div>
                                    ) : (
                                        <PrivateFile
                                            src={creative.fileUrl}
                                            alt={`${creative.campaign.name} artwork`}
                                            className="size-full object-cover"
                                            frameClassName="size-full"
                                        />
                                    )}
                                    <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
                                        <span className="flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                            {video ? <Film className="size-3" /> : <ImageIcon className="size-3" />}
                                            {CREATIVE_PATH_LABEL[creative.path]}
                                        </span>
                                        {flagged && (
                                            <span className="flex items-center gap-1 rounded-full bg-danger px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                                <Flag className="size-3" />
                                                Flagged
                                            </span>
                                        )}
                                        {creative.resubmissionOfId && (
                                            <span className="flex items-center gap-1 rounded-full bg-info px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                                <RotateCcw className="size-3" />
                                                Resubmitted
                                            </span>
                                        )}
                                        {creative.designedByAdx && (
                                            <span className="flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                                <Sparkles className="size-3" />
                                                ADX design
                                            </span>
                                        )}
                                    </div>
                                    {canDecide && (
                                        <div className="absolute right-3 top-3">
                                            <Checkbox
                                                checked={isSelected}
                                                onCheckedChange={() => toggle(creative.id)}
                                                aria-label={`Select ${creative.campaign.name}`}
                                                className="bg-white/80"
                                            />
                                        </div>
                                    )}
                                    {fileSizeLabel(creative.fileSize) && (
                                        <span className="absolute bottom-3 left-3 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white">
                                            {fileSizeLabel(creative.fileSize)}
                                        </span>
                                    )}
                                </div>

                                <div className="p-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="truncate text-xs font-medium text-muted-foreground">
                                            {creative.campaign.advertiser.companyName ?? creative.campaign.advertiser.name}
                                        </p>
                                        <StatusBadge status={CREATIVE_STATUS_META[creative.status]} />
                                    </div>
                                    <Link
                                        href={`/moderation/${creative.id}`}
                                        className="mt-0.5 block truncate text-sm font-semibold text-foreground hover:underline"
                                    >
                                        {creative.campaign.name}
                                    </Link>
                                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                        {placementLabel(creative)}
                                        {creative.submittedAt ? ` · Submitted ${formatDateTime(creative.submittedAt)}` : ""}
                                    </p>
                                    {flagged && (
                                        <p className="mt-2 rounded-md bg-danger-soft px-2 py-1.5 text-xs text-danger">
                                            {flagLabel(creative.flags[0])}
                                            {creative.flags.length > 1 ? ` +${creative.flags.length - 1}` : ""}
                                        </p>
                                    )}
                                    {creative.status === "AWAITING_ADVERTISER" && (
                                        <p className="mt-2 rounded-md bg-info-soft px-2 py-1.5 text-xs text-info">
                                            Waiting for the advertiser to accept ADX&rsquo;s design. Ops review comes after.
                                        </p>
                                    )}
                                    <div className="mt-3 flex items-center gap-1.5">
                                        <Button
                                            size="sm"
                                            className="h-8 flex-1"
                                            disabled={!canDecide || busy || creative.status === "APPROVED"}
                                            onClick={() => ask([creative.id], "APPROVED")}
                                        >
                                            Approve
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 flex-1 text-danger hover:text-danger"
                                            disabled={!canDecide || busy || creative.status === "REJECTED"}
                                            onClick={() => ask([creative.id], "REJECTED")}
                                        >
                                            Reject
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="size-8 shrink-0"
                                            aria-label="Review creative"
                                            onClick={() => router.push(`/moderation/${creative.id}`)}
                                        >
                                            <Eye className="size-4" />
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {page.total > page.items.length && (
                <p className="text-xs text-muted-foreground">
                    Showing the oldest {page.items.length} of {page.total}. Decide these and the next ones move up.
                </p>
            )}

            {selected.size > 0 && (
                <div className="sticky bottom-4 flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5 shadow-lg">
                    <span className="text-sm font-medium">{selected.size} selected</span>
                    <button
                        type="button"
                        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                        onClick={() => setSelected(new Set())}
                    >
                        Clear
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                        <Button size="sm" className="h-8" disabled={busy} onClick={() => ask(selectedIds, "APPROVED")}>
                            Approve {selected.size} creative{selected.size === 1 ? "" : "s"}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            disabled={busy}
                            onClick={() => ask(selectedIds, "CHANGES_REQUESTED")}
                        >
                            Request changes
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-danger hover:text-danger"
                            disabled={busy}
                            onClick={() => ask(selectedIds, "REJECTED")}
                        >
                            Reject
                        </Button>
                    </div>
                </div>
            )}

            <DecisionDialog
                pending={pending}
                busy={busy}
                onOpenChange={(open) => !open && !busy && setPending(null)}
                onConfirm={(note) => pending && decide(pending.ids, pending.decision, note)}
            />
        </div>
    );
}
