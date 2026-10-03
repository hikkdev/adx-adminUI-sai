"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mediaService, parseTags, type MediaAsset } from "@/services/media";

/** The words around a picture — alt text, title, tags. The picture itself never changes; upload a new one. */
export function MediaEditDialog({ asset, onOpenChange, onSaved }: { asset: MediaAsset | null; onOpenChange: (open: boolean) => void; onSaved: (asset: MediaAsset) => void }) {
    return (
        <Dialog open={asset !== null} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">{asset && <EditForm asset={asset} onClose={() => onOpenChange(false)} onSaved={onSaved} />}</DialogContent>
        </Dialog>
    );
}

function EditForm({ asset, onClose, onSaved }: { asset: MediaAsset; onClose: () => void; onSaved: (asset: MediaAsset) => void }) {
    const [altText, setAltText] = React.useState(asset.altText ?? "");
    const [title, setTitle] = React.useState(asset.title ?? "");
    const [tags, setTags] = React.useState(asset.tags.join(", "));
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const saved = await mediaService.update(asset.id, { altText: altText.trim() || null, title: title.trim() || null, tags: parseTags(tags) });
            toast.success("Saved");
            onSaved(saved);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "That did not go through.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>Edit picture</DialogTitle>
                <DialogDescription>The alt text is read aloud and shown when the picture cannot be. A block needs it.</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center rounded-md bg-muted/60 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- a stored picture of any size */}
                <img src={asset.url} alt={asset.altText ?? ""} className="max-h-40 max-w-full object-contain" />
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="media-edit-alt">Alt text</Label>
                <Input id="media-edit-alt" value={altText} onChange={(e) => setAltText(e.target.value)} maxLength={300} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label htmlFor="media-edit-title">Title</Label>
                    <Input id="media-edit-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="media-edit-tags">Tags (comma-separated)</Label>
                    <Input id="media-edit-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
                </div>
            </div>
            {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                    {busy ? "Saving…" : "Save"}
                </Button>
            </DialogFooter>
        </form>
    );
}
