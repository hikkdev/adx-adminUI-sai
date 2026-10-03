"use client";

import * as React from "react";
import { CheckCircle2, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { readImageSize, type ImageSize } from "../../settings/brand/image-size";
import { formatBytes, mediaService, parseTags, specLine, specProblems, type MediaAsset, type MediaSpec } from "@/services/media";

interface MediaUploadDialogProps {
    open: boolean;
    specs: MediaSpec[];
    /** Pre-picks a spec (the media picker opens it for the field's spec) and locks it. */
    lockedSpec?: string;
    onOpenChange: (open: boolean) => void;
    onUploaded: (asset: MediaAsset) => void;
}

/**
 * Upload one picture against a size spec. The spec is checked here first —
 * shape within 1%, at least the minimum size, no heavier than the cap, JPEG
 * PNG or WebP — so the operator hears before the file leaves; the server
 * checks again and its word is final. Alt text is asked for up front: a
 * block will not take a picture without it.
 */
export function MediaUploadDialog({ open, specs, lockedSpec, onOpenChange, onUploaded }: MediaUploadDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                {open && <UploadForm specs={specs} lockedSpec={lockedSpec} onClose={() => onOpenChange(false)} onUploaded={onUploaded} />}
            </DialogContent>
        </Dialog>
    );
}

function UploadForm({ specs, lockedSpec, onClose, onUploaded }: { specs: MediaSpec[]; lockedSpec?: string; onClose: () => void; onUploaded: (asset: MediaAsset) => void }) {
    const [specKey, setSpecKey] = React.useState(lockedSpec ?? specs[0]?.key ?? "");
    const [file, setFile] = React.useState<File | null>(null);
    const [size, setSize] = React.useState<ImageSize | null>(null);
    const [altText, setAltText] = React.useState("");
    const [title, setTitle] = React.useState("");
    const [tags, setTags] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [serverError, setServerError] = React.useState<string[] | null>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const autoTitle = React.useRef("");

    const spec = specs.find((item) => item.key === specKey) ?? null;

    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
    /* The object URL is made when a file is picked and let go when another is, or when the dialog closes. */
    const urlRef = React.useRef<string | null>(null);
    const swapPreview = (next: File | null) => {
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = next && typeof URL.createObjectURL === "function" ? URL.createObjectURL(next) : null;
        setPreviewUrl(urlRef.current);
    };
    React.useEffect(
        () => () => {
            if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        },
        [],
    );

    async function pick(next: File | null) {
        setServerError(null);
        setFile(next);
        setSize(null);
        swapPreview(next);
        if (!next) return;
        /* The file's name stands in as the title until one is typed; a new pick replaces a stand-in, never a typed title. */
        const suggested = next.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
        const previous = autoTitle.current;
        autoTitle.current = suggested;
        setTitle((current) => (current === "" || current === previous ? suggested : current));
        setSize(await readImageSize(next));
    }

    const problems = file && spec ? specProblems(spec, { width: size?.width ?? null, height: size?.height ?? null, bytes: file.size, mime: file.type }) : [];
    const altMissing = altText.trim() === "";
    const ready = !!file && !!spec && problems.length === 0 && !altMissing && !busy;

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (!ready || !file || !spec) return;
        setBusy(true);
        setServerError(null);
        try {
            const asset = await mediaService.upload({ file, spec: spec.key, altText: altText.trim(), title: title.trim() || undefined, tags: parseTags(tags) });
            toast.success("Uploaded", { description: `${asset.title ?? "The picture"} is in the library.` });
            onUploaded(asset);
        } catch (cause) {
            const listed = cause instanceof ApiError ? ((cause.details as { problems?: unknown } | undefined)?.problems as string[] | undefined) : undefined;
            setServerError(Array.isArray(listed) && listed.length ? listed : [cause instanceof Error ? cause.message : "The upload did not reach ADX."]);
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>Upload a picture</DialogTitle>
                <DialogDescription>Pick the size spec first — the file is checked against it here, then again by the server.</DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
                <Label htmlFor="media-spec">Size spec</Label>
                <Select value={specKey} onValueChange={setSpecKey} disabled={!!lockedSpec}>
                    <SelectTrigger id="media-spec" aria-label="Size spec">
                        <SelectValue placeholder="Pick a spec" />
                    </SelectTrigger>
                    <SelectContent>
                        {specs.map((item) => (
                            <SelectItem key={item.key} value={item.key}>
                                {item.label} · {item.width}×{item.height}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {spec && <p className="text-xs text-muted-foreground">{specLine(spec)}</p>}
            </div>

            <input
                ref={inputRef}
                type="file"
                accept={(spec?.formats ?? ["image/jpeg", "image/png", "image/webp"]).join(",")}
                className="hidden"
                onChange={(e) => void pick(e.target.files?.[0] ?? null)}
                data-testid="media-file-input"
            />
            {file ? (
                <div className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-start gap-3">
                        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                            {previewUrl && (
                                // eslint-disable-next-line @next/next/no-img-element -- a local object URL
                                <img src={previewUrl} alt="" className="max-h-full max-w-full object-contain" />
                            )}
                        </div>
                        <div className="min-w-0 flex-1 text-sm">
                            <p className="truncate font-medium text-foreground">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                                {size ? `${size.width} × ${size.height}` : "Size unknown — the server will measure it"} · {formatBytes(file.size)}
                            </p>
                            {problems.length === 0 ? (
                                <p className="mt-1 flex items-center gap-1 text-xs text-success">
                                    <CheckCircle2 className="size-3.5" aria-hidden />
                                    Meets {spec?.label ?? "the spec"}
                                </p>
                            ) : (
                                <ul className="mt-1 space-y-0.5 text-xs text-danger" data-testid="media-spec-problems">
                                    {problems.map((problem) => (
                                        <li key={problem}>{problem}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                void pick(null);
                                if (inputRef.current) inputRef.current.value = "";
                            }}
                        >
                            <X className="size-3.5" aria-hidden />
                            <span className="sr-only">Remove</span>
                        </Button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        e.preventDefault();
                        const dropped = e.dataTransfer.files[0];
                        if (dropped) void pick(dropped);
                    }}
                    className={cn("flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-sm text-muted-foreground transition-colors hover:border-foreground/30")}
                >
                    <ImagePlus className="size-6" aria-hidden />
                    Drop a picture here, or click to choose one
                </button>
            )}

            <div className="space-y-1.5">
                <Label htmlFor="media-alt">Alt text</Label>
                <Input id="media-alt" value={altText} onChange={(e) => setAltText(e.target.value)} maxLength={300} placeholder="What the picture shows, for someone who cannot see it" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label htmlFor="media-title">Title</Label>
                    <Input id="media-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Diwali banner" />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="media-tags">Tags (comma-separated)</Label>
                    <Input id="media-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="festive, home" />
                </div>
            </div>

            {serverError && (
                <div className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
                    {serverError.map((line) => (
                        <p key={line}>{line}</p>
                    ))}
                </div>
            )}

            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button type="submit" disabled={!ready} data-testid="media-upload-submit">
                    {busy ? "Uploading…" : altMissing && file ? "Add alt text to upload" : "Upload"}
                </Button>
            </DialogFooter>
        </form>
    );
}
