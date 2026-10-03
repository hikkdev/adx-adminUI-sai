"use client";

import * as React from "react";
import { Check, Loader2, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";
import { mediaService, type MediaAsset, type MediaSpec } from "@/services/media";
import { MediaUploadDialog } from "./media-upload-dialog";

interface MediaPickerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The spec (or comma-separated specs) the field needs; the library is cut to them. */
    spec?: string;
    specs: MediaSpec[];
    selectedId?: string;
    onPick: (asset: MediaAsset) => void;
}

/**
 * The layout editor's picture chooser: the library cut to the field's size
 * spec, searchable, and an Upload that files a new picture under that spec
 * and picks it. A picture without alt text is shown but cannot be picked —
 * the block would draw an image nobody can hear. ADX's own pictures only
 * (`owner=adx`): a layout never draws an advertiser's ad artwork by hand.
 */
export function MediaPicker({ open, onOpenChange, spec, specs, selectedId, onPick }: MediaPickerProps) {
    const [q, setQ] = React.useState("");
    const [uploading, setUploading] = React.useState(false);
    const search = useDebounced(q.trim(), 300);
    const wanted = spec ? spec.split(",").map((part) => part.trim()).filter(Boolean) : [];
    const wantedKey = wanted.join(",");
    const resource = useApiResource<MediaAsset[]>(`media:picker:${open}:${search}:${wantedKey}`, () =>
        open ? mediaService.list({ q: search || undefined, spec: wantedKey || undefined, archived: false, owner: "adx" }) : Promise.resolve([]),
    );
    const specLabels = wanted.map((key) => specs.find((item) => item.key === key)?.label ?? key);

    return (
        <>
            <Dialog open={open && !uploading} onOpenChange={onOpenChange}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Choose a picture</DialogTitle>
                        <DialogDescription>{wanted.length ? `This field takes ${specLabels.join(" or ")}.` : "Any picture in the library."}</DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or alt text" className="h-9 pl-8" aria-label="Search pictures" />
                        </div>
                        <Button type="button" variant="outline" className="h-9" onClick={() => setUploading(true)}>
                            <Upload className="mr-1.5 size-4" />
                            Upload new
                        </Button>
                    </div>
                    {resource.loading && resource.data === null ? (
                        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                            Loading…
                        </div>
                    ) : resource.error ? (
                        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{resource.error}</p>
                    ) : (resource.data ?? []).length === 0 ? (
                        <p className="py-10 text-center text-sm text-muted-foreground">No picture {wanted.length ? "of that spec " : ""}yet. Upload one.</p>
                    ) : (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                            {(resource.data ?? []).map((asset) => {
                                const usable = !!asset.altText?.trim();
                                const selected = asset.id === selectedId;
                                return (
                                    <button
                                        key={asset.id}
                                        type="button"
                                        disabled={!usable}
                                        onClick={() => {
                                            onPick(asset);
                                            onOpenChange(false);
                                        }}
                                        className={cn(
                                            "group relative flex flex-col overflow-hidden rounded-md border text-left transition-colors",
                                            selected ? "border-primary ring-2 ring-primary/30" : "hover:border-foreground/40",
                                            !usable && "cursor-not-allowed opacity-50",
                                        )}
                                        data-testid={`media-pick-${asset.id}`}
                                    >
                                        <span className="flex aspect-[4/3] items-center justify-center bg-muted/60 p-1">
                                            {/* eslint-disable-next-line @next/next/no-img-element -- a stored picture of any size */}
                                            <img src={asset.url} alt={asset.altText ?? ""} className="max-h-full max-w-full object-contain" loading="lazy" />
                                        </span>
                                        <span className="truncate px-2 py-1 text-xs text-foreground">{asset.title || "Untitled"}</span>
                                        {!usable && <span className="px-2 pb-1 text-[11px] text-warning">Needs alt text</span>}
                                        {selected && (
                                            <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                                                <Check className="size-3" aria-hidden />
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
            <MediaUploadDialog
                open={uploading}
                specs={specs}
                lockedSpec={wanted.length === 1 ? wanted[0] : undefined}
                onOpenChange={setUploading}
                onUploaded={(asset) => {
                    setUploading(false);
                    onPick(asset);
                    onOpenChange(false);
                }}
            />
        </>
    );
}
