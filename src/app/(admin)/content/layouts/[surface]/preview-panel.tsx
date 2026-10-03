"use client";

import * as React from "react";
import { Eye, Loader2, Megaphone, Monitor, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarkdownPreview } from "@/components/adx/markdown-field";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
    SIDE_LABEL,
    SURFACE_CLIENT,
    SURFACE_SIDES,
    TARGET_KIND_META,
    layoutsService,
    mediaOf,
    resolvedExtra,
    type LayoutSide,
    type LayoutSurface,
    type LayoutTarget,
    type ResolvedAd,
    type ResolvedBlock,
    type ResolvedLayout,
} from "@/services/layouts";
import { useBuilder } from "./builder-context";
import { CityPick } from "./field-inputs";

type PreviewVersion = "draft" | number;

interface PreviewPanelProps {
    surface: LayoutSurface;
    /** Versions that can be previewed: the draft when there is one, the live number, 0 for the defaults. */
    hasDraft: boolean;
    liveNumber: number | null;
    /** Bumped after a save, so the draft preview refetches. */
    stamp: string;
    dirty: boolean;
}

/**
 * The layout as a viewer would get it: `GET /layouts/:surface/preview`
 * resolved for a side and a city, drawn as a faithful wireframe — each
 * block a labelled card with its real pictures and words, a system block a
 * named placeholder. It shows what is SAVED; unsaved edits say so.
 */
export function PreviewPanel({ surface, hasDraft, liveNumber, stamp, dirty }: PreviewPanelProps) {
    const sides = SURFACE_SIDES[surface];
    const [side, setSide] = React.useState<LayoutSide>(sides[0]!);
    const [cityIds, setCityIds] = React.useState<string[]>([]);
    const [version, setVersion] = React.useState<PreviewVersion>(hasDraft ? "draft" : (liveNumber ?? 0));
    const [answer, setAnswer] = React.useState<{ key: string; data: ResolvedLayout | null; error: string | null } | null>(null);
    const [nonce, setNonce] = React.useState(0);

    // A discarded draft or a first publish changes what can be previewed.
    const effective: PreviewVersion = version === "draft" && !hasDraft ? (liveNumber ?? 0) : version;
    const cityId = cityIds[0];
    const requestKey = `${surface}|${side}|${cityId ?? ""}|${effective}|${stamp}|${nonce}`;
    /* The last answer stays on screen, dimmed, while the next one is fetched. */
    const state = { loading: answer?.key !== requestKey, data: answer?.data ?? null, error: answer?.key === requestKey ? answer.error : null };

    React.useEffect(() => {
        let active = true;
        layoutsService.preview(surface, { side, cityId, version: effective }).then(
            (data) => active && setAnswer({ key: requestKey, data, error: null }),
            (cause: unknown) => active && setAnswer({ key: requestKey, data: null, error: cause instanceof ApiError ? cause.message : "The preview could not be read." }),
        );
        return () => {
            active = false;
        };
    }, [surface, side, cityId, effective, requestKey]);

    const Frame = SURFACE_CLIENT[surface] === "APP" ? Smartphone : Monitor;

    return (
        <Card className="rounded-lg border-border shadow-none" data-testid="layout-preview">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Eye className="size-4 text-muted-foreground" aria-hidden />
                    Preview
                </h3>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setNonce((n) => n + 1)} aria-label="Refresh preview">
                    <RefreshCw className={cn("size-3.5", state.loading && "animate-spin")} />
                </Button>
            </div>
            <div className="space-y-3 border-b px-4 py-3">
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                        <Label className="text-xs">Version</Label>
                        <Select value={String(effective)} onValueChange={(next) => setVersion(next === "draft" ? "draft" : Number(next))}>
                            <SelectTrigger className="h-9" aria-label="Version">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {hasDraft && <SelectItem value="draft">Saved draft</SelectItem>}
                                {liveNumber !== null && <SelectItem value={String(liveNumber)}>Live · v{liveNumber}</SelectItem>}
                                <SelectItem value="0">Default order</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Side</Label>
                        <Select value={side} onValueChange={(next) => setSide(next as LayoutSide)}>
                            <SelectTrigger className="h-9" aria-label="Side">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {sides.map((item) => (
                                    <SelectItem key={item} value={item}>
                                        {SIDE_LABEL[item]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">City — none is a viewer whose city is unknown</Label>
                    <CityPick value={cityIds} onChange={setCityIds} single placeholder="Preview in a city" />
                </div>
                {dirty && effective === "draft" && <p className="rounded-md bg-warning-soft px-2.5 py-1.5 text-xs text-warning">Unsaved changes are not in the preview — save the draft to see them.</p>}
            </div>
            <div className="bg-muted/40 p-4">
                <div className={cn("mx-auto space-y-3", SURFACE_CLIENT[surface] === "APP" ? "max-w-[360px]" : "")}>
                    <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <Frame className="size-3.5" aria-hidden />
                        {state.data ? (state.data.isDefault ? "Default order" : `Version ${state.data.version}`) : "…"} · {SIDE_LABEL[side]}
                    </p>
                    {state.error ? (
                        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
                    ) : state.loading && !state.data ? (
                        <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" aria-hidden /> Resolving…
                        </p>
                    ) : state.data && state.data.blocks.length === 0 ? (
                        <p className="rounded-md border border-dashed bg-card px-3 py-8 text-center text-sm text-muted-foreground">Nothing shows to this viewer — every block is hidden, scheduled away or targeted elsewhere.</p>
                    ) : (
                        <div className={cn("space-y-3", state.loading && "opacity-60")}>
                            {state.data?.blocks.map((block) => (
                                <PreviewBlock key={block.id} block={block} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );
}

function targetLine(target: unknown): string | null {
    const t = target as Partial<LayoutTarget> | undefined;
    if (!t?.kind || !(t.kind in TARGET_KIND_META)) return null;
    return t.value ? `${TARGET_KIND_META[t.kind].label}: ${t.value}` : TARGET_KIND_META[t.kind].label;
}

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

/** One resolved block as a wireframe card. */
export function PreviewBlock({ block }: { block: ResolvedBlock }) {
    const { types } = useBuilder();
    const def = types.get(block.type);
    const label = def?.label ?? block.type;
    const props = block.props ?? {};
    const shell = (children: React.ReactNode, tone: "system" | "content" | "ad" = "content") => (
        <div
            className={cn("rounded-lg border bg-card p-3", tone === "system" && "border-dashed", tone === "ad" && "border-info/50")}
            data-testid={`preview-block-${block.type}`}
        >
            {children}
        </div>
    );

    if (def?.kind === "SYSTEM") {
        return shell(
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{str(props.title) ?? label}</p>
                    {str(props.title) && <p className="text-[11px] text-muted-foreground">{label}, retitled</p>}
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">System block: {label}</span>
            </div>,
            "system",
        );
    }

    switch (block.type) {
        case "promo_banner": {
            const media = mediaOf(props);
            const wide = props.aspect !== "SQUARE";
            return shell(
                <div className="space-y-2">
                    <Kind>Promo banner · house</Kind>
                    <div className={cn("overflow-hidden rounded-md bg-muted", wide ? "aspect-[10/3]" : "mx-auto aspect-square max-w-[240px]")}>
                        {media ? (
                            // eslint-disable-next-line @next/next/no-img-element -- the resolved picture as the client draws it
                            <img src={media.url} alt={media.altText ?? ""} className="size-full object-cover" />
                        ) : (
                            <span className="flex size-full items-center justify-center text-xs text-muted-foreground">Picture missing</span>
                        )}
                    </div>
                    {str(props.headline) && <p className="text-sm font-semibold text-foreground">{str(props.headline)}</p>}
                    {str(props.body) && <p className="text-xs text-muted-foreground">{str(props.body)}</p>}
                    <div className="flex items-center gap-2">
                        {str(props.ctaLabel) && <span className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background">{str(props.ctaLabel)}</span>}
                        {targetLine(props.target) && <span className="text-[11px] text-muted-foreground">Opens {targetLine(props.target)}</span>}
                    </div>
                </div>,
            );
        }
        case "tile_grid": {
            const tiles = Array.isArray(props.tiles) ? (props.tiles as Record<string, unknown>[]) : [];
            const columns = Number(props.columns) || 3;
            return shell(
                <div className="space-y-2">
                    <Kind>Tile grid{str(props.title) ? ` · ${str(props.title)}` : ""}</Kind>
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(columns, 4)}, minmax(0, 1fr))` }}>
                        {tiles.map((tile, index) => {
                            const media = mediaOf(tile);
                            return (
                                <div key={index} className="space-y-1">
                                    <div className="aspect-square overflow-hidden rounded bg-muted">
                                        {media && (
                                            // eslint-disable-next-line @next/next/no-img-element -- the resolved picture
                                            <img src={media.url} alt={media.altText ?? ""} className="size-full object-cover" />
                                        )}
                                    </div>
                                    <p className="truncate text-[11px] text-foreground">{str(tile.label) ?? "—"}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>,
            );
        }
        case "listing_rail": {
            const query = resolvedExtra<Record<string, unknown>>(block, "query");
            const count = Math.min(Number(props.count) || 4, 12);
            return shell(
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <Kind>Listing rail · {str(props.title) ?? "Untitled"}</Kind>
                        {str(props.seeAllLabel) && <span className="text-[11px] text-muted-foreground">{str(props.seeAllLabel)} →</span>}
                    </div>
                    <div className="flex gap-2 overflow-hidden">
                        {Array.from({ length: Math.min(count, 4) }, (_, index) => (
                            <div key={index} className="h-16 w-24 shrink-0 rounded bg-muted" />
                        ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        {count} listings · {String(props.source ?? "")}
                        {str(props.value) ? ` · ${str(props.value)}` : ""}
                    </p>
                    {query && <p className="break-all font-mono text-[10px] text-muted-foreground">browse {JSON.stringify(query)}</p>}
                </div>,
            );
        }
        case "rich_text": {
            const markdown = str(resolvedExtra<string>(block, "markdown")) ?? str(props.markdown);
            return shell(
                <div className="space-y-1">
                    <Kind>Text{str(props.contentSlug) ? ` · /${str(props.contentSlug)}` : ""}</Kind>
                    <div className="max-h-48 overflow-hidden text-sm">{markdown ? <MarkdownPreview source={markdown} /> : <p className="text-xs text-muted-foreground">No text.</p>}</div>
                </div>,
            );
        }
        case "ad_slot": {
            const slot = resolvedExtra<{ key: string; label: string; spec: string }>(block, "slot");
            const ads = resolvedExtra<ResolvedAd[]>(block, "ads") ?? [];
            const first = ads[0];
            return shell(
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <Kind>
                            <Megaphone className="mr-1 inline size-3" aria-hidden />
                            Ad slot · {slot?.label ?? str(props.slotKey) ?? "?"}
                        </Kind>
                        <span className="rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-background">Ad</span>
                    </div>
                    {first ? (
                        <div className="space-y-1">
                            {first.media && (
                                // eslint-disable-next-line @next/next/no-img-element -- the sold artwork
                                <img src={first.media.url} alt={first.media.altText ?? ""} className="w-full rounded object-cover" />
                            )}
                            {first.headline && <p className="text-sm font-medium text-foreground">{first.headline}</p>}
                            <p className="text-[11px] text-muted-foreground">
                                {first.displayId ?? first.adBookingId}
                                {ads.length > 1 ? ` · rotates with ${ads.length - 1} more` : ""}
                            </p>
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground">No live ad here today — the client draws nothing in this place.</p>
                    )}
                </div>,
                "ad",
            );
        }
        /* PB-1: the content blocks Studio pages are built from, as wireframes. */
        case "hero": {
            const media = mediaOf(props);
            const primary = props.primaryCta as { label?: string; target?: unknown } | undefined;
            const secondary = props.secondaryCta as { label?: string; target?: unknown } | undefined;
            return shell(
                <div className={cn("space-y-2", props.align === "CENTER" && "text-center")}>
                    <Kind>Hero</Kind>
                    {media && (
                        // eslint-disable-next-line @next/next/no-img-element -- the resolved picture
                        <img src={media.url} alt={media.altText ?? ""} className="aspect-[10/3] w-full rounded-md object-cover" />
                    )}
                    <p className="text-base font-semibold text-foreground">{str(props.headline) ?? "Headline"}</p>
                    {str(props.subheadline) && <p className="text-xs text-muted-foreground">{str(props.subheadline)}</p>}
                    <div className={cn("flex flex-wrap items-center gap-2", props.align === "CENTER" && "justify-center")}>
                        {str(primary?.label) && <span className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background">{str(primary?.label)}</span>}
                        {str(secondary?.label) && <span className="rounded-md border px-2.5 py-1 text-xs font-medium text-foreground">{str(secondary?.label)}</span>}
                        {targetLine(primary?.target) && <span className="text-[11px] text-muted-foreground">Opens {targetLine(primary?.target)}</span>}
                    </div>
                </div>,
            );
        }
        case "cta_strip":
            return shell(
                <div className={cn("space-y-1 rounded-md p-3", props.tone === "BRAND" ? "bg-primary/10" : props.tone === "INK" ? "bg-foreground text-background" : "bg-muted")}>
                    <Kind>Call to action</Kind>
                    <p className="text-sm font-semibold">{str(props.headline) ?? "Headline"}</p>
                    {str(props.body) && <p className="text-xs opacity-80">{str(props.body)}</p>}
                    <span className="inline-block rounded-md border px-2.5 py-1 text-xs font-medium">{str(props.ctaLabel) ?? "Button"}</span>
                </div>,
            );
        case "columns": {
            const columns = Array.isArray(props.columns) ? (props.columns as Record<string, unknown>[]) : [];
            return shell(
                <div className="space-y-2">
                    <Kind>Columns · {columns.length}</Kind>
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(2, Math.min(columns.length || 2, 4))}, minmax(0, 1fr))` }}>
                        {columns.map((column, index) => (
                            <div key={index} className="space-y-1 rounded bg-muted/60 p-2">
                                {str(column.title) && <p className="text-xs font-medium text-foreground">{str(column.title)}</p>}
                                <p className="line-clamp-3 text-[11px] text-muted-foreground">{str(column.markdown) ?? "…"}</p>
                            </div>
                        ))}
                    </div>
                </div>,
            );
        }
        case "image": {
            const media = mediaOf(props);
            return shell(
                <div className="space-y-1">
                    <Kind>Image{props.width === "CONTAINED" ? " · contained" : ""}</Kind>
                    {media ? (
                        // eslint-disable-next-line @next/next/no-img-element -- the resolved picture
                        <img src={media.url} alt={media.altText ?? ""} className={cn("rounded-md object-cover", props.width === "CONTAINED" ? "mx-auto max-w-[70%]" : "w-full")} />
                    ) : (
                        <div className="flex aspect-video items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">Picture missing</div>
                    )}
                    {str(props.caption) && <p className="text-[11px] text-muted-foreground">{str(props.caption)}</p>}
                </div>,
            );
        }
        case "video":
            return shell(
                <div className="space-y-1">
                    <Kind>Video</Kind>
                    <div className="flex aspect-video items-center justify-center rounded-md bg-foreground/80 text-xs text-background">▶ {str(props.url) ?? "No address"}</div>
                    {str(props.caption) && <p className="text-[11px] text-muted-foreground">{str(props.caption)}</p>}
                </div>,
            );
        case "faq": {
            const items = Array.isArray(props.items) ? (props.items as Record<string, unknown>[]) : [];
            return shell(
                <div className="space-y-1">
                    <Kind>FAQ{str(props.title) ? ` · ${str(props.title)}` : ""}</Kind>
                    {items.slice(0, 5).map((item, index) => (
                        <p key={index} className="text-xs text-foreground">
                            ▸ {str(item.question) ?? "Question"}
                        </p>
                    ))}
                    {items.length > 5 && <p className="text-[11px] text-muted-foreground">and {items.length - 5} more</p>}
                </div>,
            );
        }
        case "steps": {
            const items = Array.isArray(props.items) ? (props.items as Record<string, unknown>[]) : [];
            return shell(
                <div className="space-y-1">
                    <Kind>Steps{str(props.title) ? ` · ${str(props.title)}` : ""}</Kind>
                    <ol className="space-y-1">
                        {items.map((item, index) => (
                            <li key={index} className="flex gap-2 text-xs">
                                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] text-background">{index + 1}</span>
                                <span>
                                    <span className="font-medium text-foreground">{str(item.title) ?? "Step"}</span>
                                    {str(item.body) && <span className="text-muted-foreground"> — {str(item.body)}</span>}
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>,
            );
        }
        case "stats": {
            const items = Array.isArray(props.items) ? (props.items as Record<string, unknown>[]) : [];
            return shell(
                <div className="space-y-1">
                    <Kind>Numbers</Kind>
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(2, Math.min(items.length || 2, 4))}, minmax(0, 1fr))` }}>
                        {items.map((item, index) => (
                            <div key={index} className="rounded bg-muted/60 p-2 text-center">
                                <p className="text-base font-semibold text-foreground">{str(item.value) ?? "—"}</p>
                                <p className="text-[11px] text-muted-foreground">{str(item.label) ?? ""}</p>
                            </div>
                        ))}
                    </div>
                </div>,
            );
        }
        case "divider":
            return shell(props.style === "SPACE" ? <div className="h-6" aria-label="Space" /> : <hr className="border-border" />);
        case "button_row": {
            const buttons = Array.isArray(props.buttons) ? (props.buttons as Record<string, unknown>[]) : [];
            return shell(
                <div className="flex flex-wrap gap-2">
                    {buttons.map((button, index) => (
                        <span key={index} className={cn("rounded-md px-2.5 py-1 text-xs font-medium", button.style === "SECONDARY" ? "border text-foreground" : "bg-foreground text-background")}>
                            {str(button.label) ?? "Button"}
                        </span>
                    ))}
                </div>,
            );
        }
        case "category_tiles":
            return shell(
                <div className="space-y-2">
                    <Kind>Category mosaic{str(props.title) ? ` · ${str(props.title)}` : ""}</Kind>
                    <div className="grid grid-cols-4 gap-2">
                        {["Indoor", "Outdoor", "Transit", "Media"].map((category) => (
                            <div key={category} className="flex aspect-square items-center justify-center rounded bg-muted text-[11px] text-muted-foreground">
                                {category}
                            </div>
                        ))}
                    </div>
                </div>,
            );
        case "listing_grid": {
            const query = resolvedExtra<Record<string, unknown>>(block, "query");
            const columns = Math.min(Math.max(Number(props.columns) || 3, 2), 4);
            return shell(
                <div className="space-y-2">
                    <Kind>Listing grid · {str(props.title) ?? "Untitled"}</Kind>
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                        {Array.from({ length: columns * 2 }, (_, index) => (
                            <div key={index} className="aspect-[4/3] rounded bg-muted" />
                        ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        {String(props.source ?? "")}
                        {str(props.value) ? ` · ${str(props.value)}` : ""}
                    </p>
                    {query && <p className="break-all font-mono text-[10px] text-muted-foreground">browse {JSON.stringify(query)}</p>}
                </div>,
            );
        }
        case "form": {
            const form = props.form as { key?: string; title?: string; definition?: { screens?: { fields?: unknown[] }[] } } | null | undefined;
            const count = form?.definition?.screens?.reduce((sum, screen) => sum + (screen.fields?.length ?? 0), 0) ?? 0;
            return shell(
                <div className="space-y-1">
                    <Kind>Form · {str(props.formKey) ?? "?"}</Kind>
                    {str(props.heading) && <p className="text-sm font-semibold text-foreground">{str(props.heading)}</p>}
                    {str(props.intro) && <p className="text-xs text-muted-foreground">{str(props.intro)}</p>}
                    {form ? (
                        <p className="text-xs text-muted-foreground">
                            {form.title ?? form.key} · {count} {count === 1 ? "field" : "fields"}
                        </p>
                    ) : (
                        <p className="text-xs text-warning">No published form by that key — the client draws nothing here.</p>
                    )}
                </div>,
            );
        }
        default:
            return shell(
                <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-foreground">{label}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{block.type}</span>
                </div>,
            );
    }
}

function Kind({ children }: { children: React.ReactNode }) {
    return <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</p>;
}
