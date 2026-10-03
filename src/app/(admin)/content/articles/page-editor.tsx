"use client";

import * as React from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownField } from "@/components/adx/markdown-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    CATEGORY_META,
    CONTENT_CATEGORIES,
    CONTENT_SURFACES,
    SURFACE_LABEL,
    contentService,
    slugProblem,
    slugify,
    type ContentCategory,
    type ContentPage,
    type ContentSurface,
} from "@/services/content";

/** A brand-new page, another version of one that exists, a draft being edited, or a published version being read. */
export type EditorTarget =
    | { mode: "new" }
    | { mode: "version"; from: ContentPage; nextVersion: number }
    | { mode: "edit"; page: ContentPage }
    | { mode: "read"; page: ContentPage };

export function PageEditor({
    target,
    onOpenChange,
    onSaved,
    onWriteNewVersion,
}: {
    target: EditorTarget | null;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
    /** Offered on a published version, which cannot change: carry its text into the next one. */
    onWriteNewVersion?: (from: ContentPage) => void;
}) {
    if (!target) return <Dialog open={false} onOpenChange={onOpenChange} />;
    const key =
        target.mode === "new" ? "new" : target.mode === "version" ? `version-${target.from.slug}-${target.nextVersion}` : `${target.mode}-${target.page.id}`;
    return <PageForm key={key} target={target} onOpenChange={onOpenChange} onSaved={onSaved} onWriteNewVersion={onWriteNewVersion} />;
}

/**
 * The one form on the content screen.
 *
 * Saving makes a DRAFT; going live is a separate act, as it is on the legal
 * and agreements screens, because text people read should be read over
 * first. A page must name at least one surface before it can be published —
 * the server refuses otherwise, and so does the Save-and-publish button, so
 * the refusal is never a surprise.
 */
function PageForm({
    target,
    onOpenChange,
    onSaved,
    onWriteNewVersion,
}: {
    target: EditorTarget;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
    onWriteNewVersion?: (from: ContentPage) => void;
}) {
    const source = target.mode === "new" ? null : target.mode === "version" ? target.from : target.page;
    const readOnly = target.mode === "read";
    const editingDraft = target.mode === "edit";

    const [slug, setSlug] = React.useState(source?.slug ?? "");
    const [slugTouched, setSlugTouched] = React.useState(Boolean(source));
    const [category, setCategory] = React.useState<ContentCategory>(source?.category ?? "PAGE");
    const [title, setTitle] = React.useState(source?.title ?? "");
    const [summary, setSummary] = React.useState(source?.summary ?? "");
    const [body, setBody] = React.useState(source?.body ?? "");
    const [surfaces, setSurfaces] = React.useState<string[]>(source?.surfaces ?? ["WEBSITE"]);
    const [tags, setTags] = React.useState((source?.tags ?? []).join(", "));
    const [seoTitle, setSeoTitle] = React.useState(source?.seoTitle ?? "");
    const [seoDescription, setSeoDescription] = React.useState(source?.seoDescription ?? "");
    const [changeNote, setChangeNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    /* A new page takes its address from its title until somebody types one. */
    const onTitle = (next: string) => {
        setTitle(next);
        if (target.mode === "new" && !slugTouched) setSlug(slugify(next));
    };

    const problem = slugProblem(slug);
    const ready = title.trim().length > 0 && body.trim().length > 0 && !problem;
    const canPublish = ready && surfaces.length > 0;

    const toggleSurface = (surface: ContentSurface) =>
        setSurfaces((current) => (current.includes(surface) ? current.filter((item) => item !== surface) : [...current, surface]));

    const save = async (publish: boolean) => {
        if (!ready || busy) return;
        setBusy(true);
        try {
            const fields = {
                category,
                title: title.trim(),
                summary: summary.trim() || undefined,
                body,
                surfaces,
                tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
                seoTitle: seoTitle.trim() || undefined,
                seoDescription: seoDescription.trim() || undefined,
                changeNote: changeNote.trim() || undefined,
            };
            if (editingDraft) {
                await contentService.update(target.page.id, fields);
                if (publish) await contentService.publish(target.page.id);
            } else {
                await contentService.create({ ...fields, slug, publish });
            }
            toast.success(publish ? `“${title.trim()}” is live` : "Draft saved", {
                description: publish ? "Anyone reading that surface sees it now." : "Publish it when the text has been read over.",
            });
            onSaved();
            onOpenChange(false);
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "That did not save.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => (!open && !busy ? onOpenChange(false) : undefined)}>
            <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>
                        {target.mode === "new"
                            ? "New page"
                            : target.mode === "version"
                              ? `${target.from.title} — version ${target.nextVersion}`
                              : `${target.page.title} — version ${target.page.version}`}
                    </DialogTitle>
                    <DialogDescription>
                        {readOnly
                            ? "A published version, as it was read. Its text cannot change — the button below starts the next version with this text in it."
                            : "Saving makes a draft. Publishing is the separate act that puts it in front of people."}
                    </DialogDescription>
                </DialogHeader>

                <div className="-mr-2 grid min-h-0 flex-1 gap-4 overflow-y-auto pb-2 pr-2">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="content-title">Title</Label>
                            <Input id="content-title" value={title} onChange={(event) => onTitle(event.target.value)} disabled={readOnly} data-testid="content-title" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="content-slug">Address</Label>
                            <Input
                                id="content-slug"
                                value={slug}
                                onChange={(event) => {
                                    setSlugTouched(true);
                                    setSlug(event.target.value);
                                }}
                                disabled={readOnly || target.mode !== "new"}
                                placeholder="how-it-works"
                                data-testid="content-slug"
                            />
                            <p className={cn("text-xs", problem && slug ? "text-danger" : "text-muted-foreground")} data-testid="content-slug-hint">
                                {problem && slug ? problem : target.mode === "new" ? "The page's address. It never changes once made." : "Fixed — this is the page's address."}
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid content-start gap-1.5">
                            <Label htmlFor="content-category">Kind</Label>
                            <Select value={category} onValueChange={(value) => setCategory(value as ContentCategory)} disabled={readOnly}>
                                <SelectTrigger id="content-category" data-testid="content-category">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CONTENT_CATEGORIES.map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {CATEGORY_META[option].label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid content-start gap-1.5">
                            <Label>Read on</Label>
                            <div className="flex flex-wrap gap-1.5">
                                {CONTENT_SURFACES.map((surface) => (
                                    <Button
                                        key={surface}
                                        type="button"
                                        size="sm"
                                        variant={surfaces.includes(surface) ? "default" : "outline"}
                                        className={cn("h-8", !surfaces.includes(surface) && "bg-card")}
                                        disabled={readOnly}
                                        onClick={() => toggleSurface(surface)}
                                        data-testid={`content-surface-${surface}`}
                                    >
                                        {SURFACE_LABEL[surface]}
                                    </Button>
                                ))}
                            </div>
                        </div>
                        {/* One line under the whole row, never a hint under one cell (the form symmetry policy). */}
                        <p className="-mt-1 text-xs text-muted-foreground sm:col-span-2">A page on no surface cannot be published.</p>
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="content-summary">Summary</Label>
                        <Input id="content-summary" value={summary} onChange={(event) => setSummary(event.target.value)} disabled={readOnly} placeholder="One line under the title in an index" data-testid="content-summary" />
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="content-body">Body — Markdown</Label>
                        <MarkdownField
                            id="content-body"
                            value={body}
                            onChange={setBody}
                            disabled={readOnly}
                            rows={16}
                            placeholder="The page's text, in Markdown. Preview shows what a reader will see."
                        />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="content-tags">Tags</Label>
                            <Input id="content-tags" value={tags} onChange={(event) => setTags(event.target.value)} disabled={readOnly} placeholder="payouts, getting-started" data-testid="content-tags" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="content-seo-title">Browser tab title</Label>
                            <Input id="content-seo-title" value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} disabled={readOnly} placeholder={title || "The title, when empty"} data-testid="content-seo-title" />
                        </div>
                    </div>

                    <div className="grid gap-1.5">
                        <Label htmlFor="content-seo-description">Search description</Label>
                        <Input id="content-seo-description" value={seoDescription} onChange={(event) => setSeoDescription(event.target.value)} disabled={readOnly} placeholder={summary || "The summary, when empty"} data-testid="content-seo-description" />
                    </div>

                    {!readOnly && (
                        <div className="grid gap-1.5">
                            <Label htmlFor="content-note">What changed</Label>
                            <Input id="content-note" value={changeNote} onChange={(event) => setChangeNote(event.target.value)} placeholder="For the history beside this version" data-testid="content-note" />
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" className="bg-card" onClick={() => onOpenChange(false)} disabled={busy}>
                        {readOnly ? "Close" : "Cancel"}
                    </Button>
                    {readOnly && onWriteNewVersion && (
                        <Button
                            type="button"
                            onClick={() => {
                                onOpenChange(false);
                                onWriteNewVersion(target.page);
                            }}
                            data-testid="content-write-new-version"
                        >
                            Write a new version
                        </Button>
                    )}
                    {!readOnly && (
                        <>
                            <Button type="button" variant="outline" className="bg-card" disabled={!ready || busy} onClick={() => void save(false)} data-testid="content-save-draft">
                                {busy ? "Saving…" : "Save draft"}
                            </Button>
                            <Button type="button" disabled={!canPublish || busy} onClick={() => void save(true)} data-testid="content-save-publish">
                                Save and publish
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
