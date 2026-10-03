"use client";

import * as React from "react";
import { Archive, ArchiveRestore, Send, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BulkAction } from "@/components/adx/bulk-actions";
import { layoutsService } from "@/services/layouts";
import { PAGE_CHANNEL_LABEL, sitePagesService, type SitePageChannel, type SitePageRow } from "@/services/site-pages";

/**
 * Pages › bulk (28 Sep 2026): what a selection of pages can have done to it,
 * each the single-row route once per page.
 *
 * Publish and discard follow where a page's versions live: a SYSTEM page's
 * under its layout surface (`/layouts/:surface/…`), a CUSTOM page's under
 * its key (`/site/pages/:key/…`). Archive, restore and "Read on" are for a
 * CUSTOM page only — the site's own pages never leave the site and are
 * always website pages (the backend refuses both), so they are skipped,
 * not failed. No bulk address change: an address moves one page at a time,
 * through its own dialog.
 */

export const PAGE_BULK_BLOCKED = {
    publish: "Publishing needs content.approve.",
    discard: "Discarding a draft needs content.delete.",
    archive: "Archiving a page needs content.delete.",
    restore: "Restoring a page needs content.edit.",
    channels: "Changing where a page is read needs content.edit.",
} as const;

/** The three "Read on" choices, in the order the menu lists them. */
export const CHANNEL_CHOICES: { key: string; label: string; channels: SitePageChannel[] }[] = [
    { key: "website", label: PAGE_CHANNEL_LABEL.WEBSITE, channels: ["WEBSITE"] },
    { key: "apps", label: PAGE_CHANNEL_LABEL.APPS, channels: ["APPS"] },
    { key: "both", label: `${PAGE_CHANNEL_LABEL.WEBSITE} + ${PAGE_CHANNEL_LABEL.APPS.toLowerCase()}`, channels: ["WEBSITE", "APPS"] },
];

const sameChannels = (a: readonly string[], b: readonly string[]): boolean => [...a].sort().join() === [...b].sort().join();

/** Why each action leaves a page alone — pure, so the tests read them without a screen. */
export const pageSkip = {
    publish: (row: SitePageRow): string | null => (row.archivedAt ? "archived" : !row.draft ? "no draft" : row.kind === "SYSTEM" && !row.surface ? "no layout surface" : null),
    discard: (row: SitePageRow): string | null => (!row.draft ? "no draft" : row.kind === "SYSTEM" && !row.surface ? "no layout surface" : null),
    archive: (row: SitePageRow): string | null => (row.kind === "SYSTEM" ? "a site page" : row.archivedAt ? "already archived" : null),
    restore: (row: SitePageRow): string | null => (row.kind === "SYSTEM" ? "a site page" : !row.archivedAt ? "not archived" : null),
    channels:
        (channels: readonly SitePageChannel[]) =>
        (row: SitePageRow): string | null =>
            row.kind === "SYSTEM" ? "a site page — always the website" : sameChannels(row.channels, channels) ? "already there" : null,
};

/** A page's waiting draft goes live — through the surface for a site page, through the key for a Studio page. */
export function publishPageDraft(row: SitePageRow, changeNote?: string) {
    return row.kind === "SYSTEM" && row.surface ? layoutsService.publish(row.surface, changeNote) : sitePagesService.publish(row.key, changeNote);
}

/** A page's waiting draft thrown away — the same two doors as publishing. */
export function discardPageDraft(row: SitePageRow) {
    return row.kind === "SYSTEM" && row.surface ? layoutsService.discardDraft(row.surface) : sitePagesService.discardDraft(row.key);
}

/** The Pages desk's bulk actions, gated by the powers their routes name. */
export function usePageBulkActions({ mayPublish, mayDelete, mayEdit }: { mayPublish: boolean; mayDelete: boolean; mayEdit: boolean }): BulkAction<SitePageRow>[] {
    const [note, setNote] = React.useState("");
    return [
        {
            key: "publish",
            label: "Publish drafts",
            icon: Send,
            blocked: mayPublish ? null : PAGE_BULK_BLOCKED.publish,
            skip: pageSkip.publish,
            participle: "published",
            noun: ["draft", "drafts"],
            phrase: (count) => `Publish ${count}`,
            description: "Each draft becomes its page's live version, and the one live now retires.",
            onOpen: () => setNote(""),
            body: (
                <div className="grid gap-1.5">
                    <Label htmlFor="bulk-publish-note">What changed</Label>
                    <Input id="bulk-publish-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional — one note for every page" maxLength={200} data-testid="bulk-publish-note" />
                    <p className="text-xs text-muted-foreground">Kept on each page's new version, as a single publish keeps it.</p>
                </div>
            ),
            run: (row) => publishPageDraft(row, note.trim() || undefined),
        },
        {
            key: "discard",
            label: "Discard drafts",
            icon: Trash2,
            blocked: mayDelete ? null : PAGE_BULK_BLOCKED.discard,
            skip: pageSkip.discard,
            participle: "discarded",
            noun: ["draft", "drafts"],
            phrase: (count) => `Discard ${count}`,
            description: "Each page keeps whatever is live now. This cannot be undone.",
            destructive: true,
            run: discardPageDraft,
        },
        {
            key: "archive",
            label: "Archive",
            icon: Archive,
            blocked: mayDelete ? null : PAGE_BULK_BLOCKED.archive,
            skip: pageSkip.archive,
            participle: "archived",
            noun: ["page", "pages"],
            phrase: (count) => `Archive ${count}`,
            description: "Each answers 404 until it is restored. Every version is kept, and the keys stay taken.",
            destructive: true,
            run: (row) => sitePagesService.archive(row.key),
        },
        {
            key: "restore",
            label: "Restore",
            icon: ArchiveRestore,
            blocked: mayEdit ? null : PAGE_BULK_BLOCKED.restore,
            skip: pageSkip.restore,
            participle: "restored",
            noun: ["page", "pages"],
            phrase: (count) => `Restore ${count}`,
            description: "Each answers at its address again with whatever version was live.",
            run: (row) => sitePagesService.restorePage(row.key),
        },
        ...CHANNEL_CHOICES.map(
            (choice): BulkAction<SitePageRow> => ({
                key: `channels-${choice.key}`,
                label: choice.label,
                menu: "Read on",
                blocked: mayEdit ? null : PAGE_BULK_BLOCKED.channels,
                skip: pageSkip.channels(choice.channels),
                participle: `put on ${choice.label}`,
                noun: ["page", "pages"],
                phrase: (count) => `Put ${count} on ${choice.label}`,
                description: "Where each page is read changes at once; what is live on it does not.",
                run: (row) => sitePagesService.update(row.key, { channels: choice.channels }),
            }),
        ),
    ];
}
