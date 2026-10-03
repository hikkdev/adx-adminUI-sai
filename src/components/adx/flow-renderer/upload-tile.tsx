"use client";

import * as React from "react";
import { FileText, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isPrivateFileUrl } from "@/components/adx/private-file";
import { cn } from "@/lib/utils";

interface UploadTileProps {
    id: string;
    /** Extensions or MIME patterns for the file input: ["image/*"], [".pdf", "image/*"]. */
    accept: string[];
    /** The URL already stored, or null for an empty tile. */
    url: string | null;
    busy?: boolean;
    /** Left out (a preview, an offline console), the tile is drawn and not tappable. */
    onPick?: (file: File) => void;
    onClear?: () => void;
    hint?: string;
    /** The small variant, for the phone frame. */
    compact?: boolean;
    disabled?: boolean;
}

/** The file's own name off its URL — what the phone prints under a stored upload. */
export const fileNameOf = (url: string): string => url.split("?")[0]!.split("/").pop() || url;

/**
 * ST-2 (28 Sep 2026): a private file's URL is `/files/:id` — its last segment
 * is an id, not a name. The tile prints the name of the file just picked
 * when it has one, and otherwise says the file is kept privately.
 */
export const storedLabel = (url: string, pickedName: string | null): string => (isPrivateFileUrl(url) ? (pickedName ?? "Private file") : fileNameOf(url));

/**
 * FL-3 (27 Sep 2026): one upload tile, the way the apps draw a photograph
 * or a document — a dashed box to tap, then the file's name with a way to
 * remove it. The file goes up the moment it is chosen; the tile holds the
 * URL the listing will carry.
 */
export function UploadTile({ id, accept, url, busy = false, onPick, onClear, hint, compact = false, disabled = false }: UploadTileProps) {
    const inputRef = React.useRef<HTMLInputElement>(null);
    /* The name of the file last picked here — a private URL does not carry one. */
    const [pickedName, setPickedName] = React.useState<string | null>(null);
    const inert = !onPick || disabled;
    const isDocument = accept.some((pattern) => pattern.includes("pdf"));
    const Icon = isDocument ? FileText : ImageIcon;

    if (url) {
        return (
            <div className={cn("flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3", compact ? "py-2" : "py-2.5")} data-testid={`${id}-stored`}>
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <p className="min-w-0 flex-1 truncate text-sm text-foreground">{storedLabel(url, pickedName)}</p>
                {onClear && (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        disabled={disabled}
                        onClick={() => {
                            setPickedName(null);
                            onClear();
                        }}
                        aria-label="Remove the file"
                    >
                        <X className="size-3.5" aria-hidden />
                        Remove
                    </Button>
                )}
            </div>
        );
    }

    return (
        <div
            className={cn(
                "rounded-md border-2 border-dashed border-border text-center transition-colors",
                compact ? "px-3 py-4" : "px-4 py-6",
                !inert && "cursor-pointer hover:border-primary/50 hover:bg-primary/5",
                inert && "opacity-70",
            )}
            role={inert ? undefined : "button"}
            tabIndex={inert ? undefined : 0}
            onClick={() => !inert && inputRef.current?.click()}
            onKeyDown={(event) => {
                if (!inert && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    inputRef.current?.click();
                }
            }}
            data-testid={`${id}-tile`}
        >
            {busy ? <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" aria-hidden /> : <Upload className="mx-auto size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden />}
            <p className={cn("mt-2 font-medium text-foreground", compact ? "text-xs" : "text-sm")}>{busy ? "Uploading…" : inert ? "Tap to browse" : "Choose a file"}</p>
            {hint && <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">{hint}</p>}
            {!inert && (
                <input
                    ref={inputRef}
                    id={id}
                    type="file"
                    accept={accept.join(",")}
                    className="sr-only"
                    disabled={busy}
                    onChange={(event) => {
                        const picked = event.target.files?.[0];
                        if (picked) {
                            setPickedName(picked.name);
                            onPick(picked);
                        }
                        // Cleared so re-picking the same file still fires change.
                        event.target.value = "";
                    }}
                />
            )}
        </div>
    );
}
