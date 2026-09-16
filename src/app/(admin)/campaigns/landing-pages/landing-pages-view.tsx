"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    LANDING_PAGE_STATUS_META,
    blockSummary,
    landingPageService,
    previewUrl,
    unpublishReason,
    type LandingBlock,
    type LandingPageRow,
    type LandingPageStatus,
    type LandingPagesPage,
} from "@/services/landing-pages";

interface LandingPagesViewProps {
    page: LandingPagesPage;
    status: LandingPageStatus | "ALL";
    onStatusChange: (status: LandingPageStatus | "ALL") => void;
    onChanged: () => void;
}

/**
 * The review desk: the list on the left, the selected page's blocks on the
 * right, and Unpublish with a reason as the one action.
 *
 * The preview draws the five block shapes from the row rather than an
 * iframe, because `GET /p/:slug` answers only for a PUBLISHED page and the
 * desk has to show a draft too. For a published one the live document is a
 * click away, in its own tab, with its `noindex` and beacon intact.
 */
export function LandingPagesView({ page, status, onStatusChange, onChanged }: LandingPagesViewProps) {
    const [selectedId, setSelectedId] = React.useState<string | undefined>(page.items[0]?.id);
    const selected = page.items.find((row) => row.id === selectedId) ?? page.items[0] ?? null;
    const [unpublishing, setUnpublishing] = React.useState(false);
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    async function unpublish() {
        const target = selected;
        const trimmed = unpublishReason(reason);
        if (!target || !trimmed) return;
        setBusy(true);
        try {
            await landingPageService.unpublish(target.campaignId, trimmed);
            toast.success("Landing page unpublished", {
                description: "Back to draft. Scans still count; the campaign's creator has been told why.",
            });
            setUnpublishing(false);
            setReason("");
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not unpublish the page.");
        } finally {
            setBusy(false);
        }
    }

    const total = (page.counts.DRAFT ?? 0) + (page.counts.PUBLISHED ?? 0);

    return (
        <div className="space-y-5">
            <PageHeader
                title="Landing pages"
                subtitle={`${page.counts.PUBLISHED ?? 0} live · ${page.counts.DRAFT ?? 0} in draft`}
                actions={
                    <FilterChips<LandingPageStatus | "ALL">
                        chips={[
                            { value: "PUBLISHED", label: "Published", count: page.counts.PUBLISHED ?? 0 },
                            { value: "DRAFT", label: "Draft", count: page.counts.DRAFT ?? 0 },
                            { value: "ALL", label: "All", count: total },
                        ]}
                        value={status}
                        onChange={onStatusChange}
                    />
                }
            />

            {page.items.length === 0 ? (
                <EmptyState
                    icon={Megaphone}
                    title="No landing pages here"
                    description="A page appears once an advertiser generates one from their campaign brief; it goes live when they publish it."
                />
            ) : (
                <div className="grid gap-4 xl:grid-cols-3">
                    <Card className="h-fit overflow-hidden rounded-lg border-border shadow-none">
                        <ul className="divide-y">
                            {page.items.map((row) => {
                                const active = row.id === selected?.id;
                                return (
                                    <li key={row.id}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedId(row.id)}
                                            className={cn("w-full px-4 py-3.5 text-left transition-colors", active ? "bg-primary/[0.04]" : "hover:bg-muted/50")}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-mono text-[11px] text-muted-foreground">/p/{row.slug}</span>
                                                <StatusBadge status={LANDING_PAGE_STATUS_META[row.status]} />
                                            </div>
                                            <p className="mt-0.5 truncate text-sm font-medium text-foreground">{row.campaign?.name ?? row.campaignId}</p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {row.campaign?.advertiser.companyName ?? row.campaign?.advertiser.name ?? "Unknown advertiser"} · v{row.version}
                                                {row.generatedByAi ? " · drafted by the model" : ""}
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {row.publishedAt ? `Published ${formatDate(row.publishedAt)}` : `Edited ${formatDate(row.updatedAt)}`}
                                            </p>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                        {page.items.length < page.total && (
                            <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
                                Showing the first {page.items.length} of {page.total}.
                            </p>
                        )}
                    </Card>

                    {selected && (
                        <div className="space-y-4 xl:col-span-2">
                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="font-mono text-xs text-muted-foreground">/p/{selected.slug}</p>
                                        <h2 className="mt-0.5 text-lg font-semibold text-foreground">{selected.campaign?.name ?? selected.campaignId}</h2>
                                        <p className="text-sm text-muted-foreground">
                                            {selected.campaign ? (
                                                <>
                                                    <Link href={`/campaigns/${selected.campaign.id}`} className="text-primary hover:underline">
                                                        {selected.campaign.reference}
                                                    </Link>
                                                    {" · "}
                                                    <Link href={`/advertisers/${selected.campaign.advertiserId}`} className="text-primary hover:underline">
                                                        {selected.campaign.advertiser.companyName ?? selected.campaign.advertiser.name}
                                                    </Link>
                                                </>
                                            ) : (
                                                "The campaign could not be joined"
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {selected.status === "PUBLISHED" && (
                                            <Button variant="outline" className="bg-card" asChild>
                                                <a href={previewUrl(selected.slug)} target="_blank" rel="noreferrer">
                                                    <ExternalLink className="mr-1.5 size-4" />
                                                    Open live page
                                                </a>
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            className="bg-card text-danger hover:text-danger"
                                            disabled={selected.status !== "PUBLISHED"}
                                            onClick={() => setUnpublishing(true)}
                                        >
                                            Unpublish
                                        </Button>
                                    </div>
                                </div>
                                <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                                    <Fact label="Status" value={LANDING_PAGE_STATUS_META[selected.status].label} />
                                    <Fact label="Version" value={`v${selected.version}`} />
                                    <Fact label="Blocks" value={blockSummary(selected.blocks) || "None"} />
                                    <Fact label="Theme" value={selected.theme ? [selected.theme.font, selected.theme.primaryColor, selected.theme.accentColor].filter(Boolean).join(" · ") : "Default"} />
                                    <Fact label="Published" value={selected.publishedAt ? formatDateTime(selected.publishedAt) : "Not live"} />
                                    <Fact label="Last edited" value={formatDateTime(selected.updatedAt)} />
                                </dl>
                            </Card>

                            <Card className="overflow-hidden rounded-lg border-border shadow-none">
                                <div className="border-b px-5 py-3">
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview — the blocks as stored</h3>
                                </div>
                                <div className="mx-auto max-w-md space-y-4 px-5 py-6" style={{ fontFamily: selected.theme?.font === "serif" ? "Georgia, serif" : undefined }}>
                                    {selected.blocks.map((block, index) => (
                                        <BlockPreview key={index} block={block} accent={selected.theme?.primaryColor} />
                                    ))}
                                </div>
                            </Card>
                        </div>
                    )}
                </div>
            )}

            <ConfirmDialog
                open={unpublishing}
                onOpenChange={(open) => {
                    if (!open) setUnpublishing(false);
                }}
                title="Unpublish this landing page?"
                description="The page goes back to draft and /p/:slug stops answering. Codes printed on the artwork keep counting scans and fall through to the plain thanks page. The campaign's creator is told the reason in their inbox."
                confirmLabel="Unpublish"
                destructive
                busy={busy}
                disabled={unpublishReason(reason) === null}
                onConfirm={() => void unpublish()}
            >
                <div className="space-y-2">
                    <Label htmlFor="unpublish-reason">Reason — what the advertiser reads</Label>
                    <Textarea
                        id="unpublish-reason"
                        rows={3}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="The offer block promises a discount the brief does not authorise."
                    />
                    <p className="text-xs text-muted-foreground">At least three characters; up to five hundred.</p>
                </div>
            </ConfirmDialog>
        </div>
    );
}

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-4">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium text-foreground">{value}</dd>
        </div>
    );
}

/** One block, drawn plainly — the same five shapes the backend renders, without its styles. */
function BlockPreview({ block, accent }: { block: LandingBlock; accent: string | undefined }) {
    switch (block.type) {
        case "hero":
            return (
                <header className="space-y-2">
                    {block.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={block.imageUrl} alt="" className="aspect-[16/9] w-full rounded-md object-cover" />
                    )}
                    <h1 className="text-xl font-semibold text-foreground" style={{ color: accent }}>
                        {block.headline}
                    </h1>
                    {block.subheadline && <p className="text-sm text-muted-foreground">{block.subheadline}</p>}
                </header>
            );
        case "offer":
            return (
                <section className="rounded-md border p-4">
                    {block.highlight && <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>{block.highlight}</p>}
                    <h2 className="text-base font-semibold text-foreground">{block.title}</h2>
                    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{block.body}</p>
                </section>
            );
        case "cta":
            return (
                <div>
                    <span className="inline-flex rounded-md px-4 py-2 text-sm font-medium text-primary-foreground" style={{ backgroundColor: accent ?? "var(--primary)" }}>
                        {block.label}
                    </span>
                    <p className="mt-1 text-xs text-muted-foreground">{block.href ? block.href : "Opens the contact form"}</p>
                </div>
            );
        case "contact":
            return (
                <section className="rounded-md border p-4 text-sm">
                    <h2 className="text-base font-semibold text-foreground">Contact</h2>
                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                        {block.phone && <li>{block.phone}</li>}
                        {block.email && <li>{block.email}</li>}
                        {block.address && <li>{block.address}</li>}
                        {block.hours && <li>{block.hours}</li>}
                        {block.note && <li>{block.note}</li>}
                    </ul>
                    <p className="mt-2 text-xs text-muted-foreground">{block.formEnabled ? "Name-and-phone form on" : "No form"}</p>
                </section>
            );
        case "gallery":
            return (
                <section className="grid grid-cols-3 gap-2">
                    {block.images.map((image, index) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={index} src={image.url} alt={image.alt ?? ""} className="aspect-square w-full rounded-md object-cover" />
                    ))}
                    {Array.from({ length: block.placeholders ?? 0 }).map((_, index) => (
                        <div key={`empty-${index}`} className="flex aspect-square items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground">
                            empty frame
                        </div>
                    ))}
                </section>
            );
    }
}
