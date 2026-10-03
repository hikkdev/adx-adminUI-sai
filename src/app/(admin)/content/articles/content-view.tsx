"use client";

import * as React from "react";
import { EyeOff, FileText, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { openStudio } from "@/lib/studio";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActions, BulkBar, useIdSelection, type BulkAction } from "@/components/adx/bulk-actions";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import {
    CATEGORY_META,
    CONTENT_CATEGORIES,
    STATE_META,
    SURFACE_LABEL,
    contentService,
    groupPages,
    latestDraft,
    nextVersion,
    type ContentPage,
    type ContentSurface,
    type PageGroup,
} from "@/services/content";
import { sitePagesService } from "@/services/site-pages";
import { PageEditor, type EditorTarget } from "./page-editor";

type Pending = { action: "publish" | "unpublish" | "discard" | "studio"; page: ContentPage } | null;

/**
 * CT-1: the text pages ADX writes itself — the articles down the left, the
 * chosen one's live version and its history on the right.
 *
 * Laid out like the legal screen because it is the same shape of work:
 * versioned text ops write, read over, and publish. What differs is that a
 * page here is whatever ops need it to be, so the rail is grouped by kind
 * rather than fixed, and a page can be taken down again.
 *
 * PB-1 / PB-6 (27 Sep 2026): these are Articles now — the Pages tab is the
 * Studio index. A live WEBSITE article can become a Studio page of one
 * text block, published at once, so it gets an address the website
 * answers and blocks around it; its text stays here, versioned.
 *
 * 28 Sep 2026: articles are selectable in the rail — publish the draft
 * waiting on each, discard it, or take the live version down; each the
 * single-version route once per article, as the buttons on a version do.
 */
export function ContentView({ pages, onChanged }: { pages: ContentPage[]; onChanged: () => void }) {
    const { can } = useAuth();
    const mayMakeStudioPage = can("content.edit") && can("content.approve");
    const groups = React.useMemo(() => groupPages(pages), [pages]);
    const selection = useIdSelection(groups, articleSlug);
    const bulkActions = articleBulkActions({ mayApprove: can("content.approve"), mayDelete: can("content.delete") });
    const [slug, setSlug] = React.useState<string | null>(groups[0]?.slug ?? null);
    const [editor, setEditor] = React.useState<EditorTarget | null>(null);
    const [pending, setPending] = React.useState<Pending>(null);
    const [busy, setBusy] = React.useState(false);

    const selected = groups.find((group) => group.slug === slug) ?? groups[0] ?? null;
    const live = selected?.live ?? null;
    const onWebsite = live?.surfaces.includes("WEBSITE") ?? false;

    async function run(target: NonNullable<Pending>) {
        setBusy(true);
        try {
            if (target.action === "publish") await contentService.publish(target.page.id);
            if (target.action === "unpublish") await contentService.unpublish(target.page.id);
            if (target.action === "discard") await contentService.discard(target.page.id);
            if (target.action === "studio") {
                const made = await sitePagesService.fromContent(target.page.slug);
                toast.success(`“${target.page.title}” is a Studio page`, { description: `Live at ${made.path ?? `/${target.page.slug}`}. Its text is still edited here.` });
                setPending(null);
                onChanged();
                openStudio({ kind: "page", key: made.key ?? target.page.slug });
                return;
            }
            toast.success(
                target.action === "publish" ? `Version ${target.page.version} is live` : target.action === "unpublish" ? "Page taken down" : "Draft discarded",
                {
                    description:
                        target.action === "publish"
                            ? "Anyone reading that surface sees it now."
                            : target.action === "unpublish"
                              ? "The address answers 404 until a version is published again."
                              : undefined,
                },
            );
            setPending(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "That did not go through.");
        } finally {
            setBusy(false);
        }
    }

    const liveCount = groups.filter((group) => group.live).length;

    return (
        <div className="space-y-5" data-testid="content-desk">
            <PageHeader
                title="Articles"
                subtitle={`${groups.length} ${groups.length === 1 ? "article" : "articles"}, ${liveCount} live. The text pages ADX writes itself — help articles, guides, news. The pages the website answers by address are the Pages tab; the thirteen policies are Policies.`}
                actions={
                    <Button onClick={() => setEditor({ mode: "new" })} data-testid="content-new">
                        <Plus className="mr-1.5 size-4" />
                        New article
                    </Button>
                }
            />

            {groups.length === 0 ? (
                <Card className="rounded-lg border-border shadow-none">
                    <EmptyState
                        icon={FileText}
                        title="No articles yet"
                        description="An article is whatever the apps or the website need to say: a help answer, a guide, a release note. Make one, read it over, publish it."
                        action={
                            <Button onClick={() => setEditor({ mode: "new" })} data-testid="content-new-empty">
                                New article
                            </Button>
                        }
                    />
                </Card>
            ) : (
                <div className="space-y-3">
                    <BulkBar count={selection.selected.length} total={groups.length} onSelectAll={selection.selectAll} onClear={selection.clear}>
                        <BulkActions<PageGroup>
                            rows={selection.selected}
                            actions={bulkActions}
                            label={(group) => group.title}
                            onSettled={(outcome) => {
                                selection.keep(outcome.failed.map((failure) => failure.row));
                                onChanged();
                            }}
                        />
                    </BulkBar>
                    <div className="grid gap-4 lg:grid-cols-4">
                        {/* The rail: every page, grouped by kind. */}
                        <Card className="h-fit rounded-lg border-border p-2 shadow-none lg:col-span-1">
                            {CONTENT_CATEGORIES.filter((category) => groups.some((group) => group.category === category)).map((category) => (
                                <div key={category} className="mb-2 last:mb-0">
                                    <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{CATEGORY_META[category].label}</p>
                                    {groups
                                        .filter((group) => group.category === category)
                                        .map((group) => (
                                            <div
                                                key={group.slug}
                                                className={cn(
                                                    "flex w-full items-center gap-2 rounded-md pl-2 text-sm transition-colors",
                                                    group.slug === selected?.slug ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                                                )}
                                            >
                                                <Checkbox
                                                    checked={selection.has(group)}
                                                    onCheckedChange={(checked) => selection.toggle(group, checked === true)}
                                                    aria-label={`Select ${group.title}`}
                                                    data-testid={`content-select-${group.slug}`}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setSlug(group.slug)}
                                                    className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2 pr-2 text-left"
                                                    data-testid={`content-rail-${group.slug}`}
                                                >
                                                    <span className="min-w-0 truncate">{group.title}</span>
                                                    <span
                                                        className={cn("size-1.5 shrink-0 rounded-full", group.live ? "bg-success" : group.takenDown ? "bg-danger" : "bg-warning")}
                                                        aria-label={group.live ? "live" : group.takenDown ? "taken down" : "draft"}
                                                    />
                                                </button>
                                            </div>
                                        ))}
                                </div>
                            ))}
                        </Card>

                        {selected && (
                            <div className="space-y-4 lg:col-span-3">
                                <Card className="rounded-lg border-border p-5 shadow-none">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h2 className="text-lg font-semibold text-foreground">{selected.title}</h2>
                                                <StatusBadge status={live ? STATE_META.PUBLISHED : selected.takenDown ? { label: "Taken down", tone: "danger" } : STATE_META.DRAFT} />
                                            </div>
                                            <p className="mt-0.5 font-mono text-xs text-muted-foreground" data-testid="content-address">
                                                /{selected.slug}
                                                {live ? ` · version ${live.version} · published ${formatDateTime(live.publishedAt ?? live.updatedAt)}` : " · nothing published"}
                                            </p>
                                            {live && (
                                                <p className="mt-2 flex flex-wrap gap-1.5">
                                                    {live.surfaces.map((surface) => (
                                                        <span key={surface} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                                            {SURFACE_LABEL[surface as ContentSurface] ?? surface}
                                                        </span>
                                                    ))}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="bg-card"
                                                onClick={() => setEditor({ mode: "version", from: live ?? selected.versions[0]!, nextVersion: nextVersion(selected.versions) })}
                                                data-testid="content-new-version"
                                            >
                                                New version
                                            </Button>
                                            {/* PB-6: a live WEBSITE article becomes a Studio page of one text block, published at once. */}
                                            {live && onWebsite && mayMakeStudioPage && (
                                                <Button variant="outline" size="sm" className="bg-card" onClick={() => setPending({ action: "studio", page: live })} data-testid="content-make-studio-page">
                                                    <Sparkles className="mr-1.5 size-3.5" />
                                                    Make a Studio page
                                                </Button>
                                            )}
                                            {live && (
                                                <Button variant="outline" size="sm" className="bg-card text-danger hover:text-danger" onClick={() => setPending({ action: "unpublish", page: live })} data-testid="content-take-down">
                                                    Take down
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    {live?.summary && <p className="mt-3 text-sm text-muted-foreground">{live.summary}</p>}
                                </Card>

                                <Card className="rounded-lg border-border shadow-none">
                                    <div className="border-b px-5 py-3">
                                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Versions</h3>
                                    </div>
                                    <SimpleTable<ContentPage>
                                        rows={selected.versions}
                                        rowKey={(row) => row.id}
                                        columns={[
                                            { key: "version", label: "Version", render: (row) => <span className="font-medium text-foreground">v{row.version}</span> },
                                            { key: "title", label: "Title", render: (row) => <span className="text-sm">{row.title}</span> },
                                            { key: "state", label: "State", render: (row) => <StatusBadge status={STATE_META[row.state]} /> },
                                            { key: "note", label: "What changed", render: (row) => <span className="text-xs text-muted-foreground">{row.changeNote ?? "—"}</span> },
                                            { key: "when", label: "Saved", render: (row) => <span className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</span> },
                                            {
                                                key: "act",
                                                label: "",
                                                render: (row) => (
                                                    <div className="flex justify-end gap-2">
                                                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditor(row.state === "DRAFT" ? { mode: "edit", page: row } : { mode: "read", page: row })} data-testid={`content-open-${row.id}`}>
                                                            {row.state === "DRAFT" ? "Edit" : "Read"}
                                                        </Button>
                                                        {row.state === "DRAFT" && (
                                                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-danger hover:text-danger" onClick={() => setPending({ action: "discard", page: row })} data-testid={`content-discard-${row.id}`}>
                                                                Discard
                                                            </Button>
                                                        )}
                                                        {!row.isActive && (
                                                            <Button size="sm" className="h-7 px-2 text-xs" onClick={() => setPending({ action: "publish", page: row })} data-testid={`content-publish-${row.id}`}>
                                                                {row.state === "RETIRED" ? "Restore" : "Publish"}
                                                            </Button>
                                                        )}
                                                    </div>
                                                ),
                                            },
                                        ]}
                                    />
                                </Card>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <PageEditor
                target={editor}
                onOpenChange={(open) => !open && setEditor(null)}
                onSaved={() => {
                    onChanged();
                    if (editor?.mode === "new") setSlug(null);
                }}
                onWriteNewVersion={(from) => {
                    const group = groups.find((item) => item.slug === from.slug);
                    setEditor({ mode: "version", from, nextVersion: nextVersion(group?.versions ?? [from]) });
                }}
            />

            <ConfirmDialog
                open={pending !== null}
                onOpenChange={(open) => !open && !busy && setPending(null)}
                title={
                    pending?.action === "publish"
                        ? `Publish version ${pending.page.version}?`
                        : pending?.action === "unpublish"
                          ? "Take this page down?"
                          : pending?.action === "studio"
                            ? `Make “${pending.page.title}” a Studio page?`
                            : "Discard this draft?"
                }
                description={
                    pending?.action === "publish"
                        ? "It becomes the version everyone reads, and whichever version is live now is retired."
                        : pending?.action === "unpublish"
                          ? "The address answers 404 until a version is published again. Every version is kept."
                          : pending?.action === "studio"
                            ? `The website answers /${pending.page.slug} with this article as one text block, published at once. Its text stays here; blocks around it are laid out in Studio.`
                            : "A draft nobody has read. This cannot be undone."
                }
                confirmLabel={pending?.action === "publish" ? "Publish" : pending?.action === "unpublish" ? "Take down" : pending?.action === "studio" ? "Make and open in Studio" : "Discard"}
                destructive={pending?.action === "unpublish" || pending?.action === "discard"}
                busy={busy}
                onConfirm={() => pending && void run(pending)}
            />
        </div>
    );
}

const articleSlug = (group: PageGroup): string => group.slug;

export const ARTICLE_BULK_BLOCKED = {
    publish: "Publishing needs content.approve.",
    takeDown: "Taking a page down needs content.approve.",
    discard: "Discarding a draft needs content.delete.",
} as const;

/** Why each action leaves an article alone. */
export const articleSkip = {
    publish: (group: PageGroup): string | null => (latestDraft(group) ? null : "no draft"),
    discard: (group: PageGroup): string | null => (latestDraft(group) ? null : "no draft"),
    takeDown: (group: PageGroup): string | null => (group.live ? null : "not live"),
};

/**
 * The Articles desk's bulk actions — the three a version's own buttons
 * offer (publish a draft, discard a draft, take the live one down), on the
 * draft waiting on each article or its live version.
 */
function articleBulkActions({ mayApprove, mayDelete }: { mayApprove: boolean; mayDelete: boolean }): BulkAction<PageGroup>[] {
    return [
        {
            key: "publish",
            label: "Publish latest draft",
            icon: Send,
            blocked: mayApprove ? null : ARTICLE_BULK_BLOCKED.publish,
            skip: articleSkip.publish,
            participle: "published",
            noun: ["draft", "drafts"],
            phrase: (count) => `Publish ${count}`,
            description: "Each becomes the version everyone reads, and whichever version is live now is retired.",
            run: (group) => contentService.publish(latestDraft(group)!.id),
        },
        {
            key: "discard",
            label: "Discard latest draft",
            icon: Trash2,
            blocked: mayDelete ? null : ARTICLE_BULK_BLOCKED.discard,
            skip: articleSkip.discard,
            participle: "discarded",
            noun: ["draft", "drafts"],
            phrase: (count) => `Discard ${count}`,
            description: "Drafts nobody has published. This cannot be undone.",
            destructive: true,
            run: (group) => contentService.discard(latestDraft(group)!.id),
        },
        {
            key: "take-down",
            label: "Take down",
            icon: EyeOff,
            blocked: mayApprove ? null : ARTICLE_BULK_BLOCKED.takeDown,
            skip: articleSkip.takeDown,
            participle: "taken down",
            noun: ["article", "articles"],
            phrase: (count) => `Take down ${count}`,
            description: "Each address answers 404 until a version is published again. Every version is kept.",
            destructive: true,
            run: (group) => contentService.unpublish(group.live!.id),
        },
    ];
}
