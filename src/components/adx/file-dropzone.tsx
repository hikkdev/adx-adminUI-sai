"use client";

import * as React from "react";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface FileDropzoneProps {
    /** Extensions, with the dot: [".csv", ".xlsx"]. */
    accept: string[];
    file: File | null;
    onFile: (file: File | null) => void;
    hint?: string;
    disabled?: boolean;
}

const KB = 1024;
const formatSize = (bytes: number): string =>
    bytes < KB * KB ? `${Math.round(bytes / KB)} KB` : `${(bytes / (KB * KB)).toFixed(1)} MB`;

/**
 * Drop a file, or pick one.
 *
 * Exists because the first version of the market-data screen asked people to
 * paste a spreadsheet into a textarea. Research sweeps run to thousands of rows
 * and arrive as files; pasting them is not a workflow anybody has.
 *
 * Both affordances are offered because both get used: dragging is faster when
 * the file is already on screen, and the button is the one that works when it
 * is three folders deep.
 */
export function FileDropzone({ accept, file, onFile, hint, disabled }: FileDropzoneProps) {
    const [over, setOver] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const acceptable = (candidate: File): boolean =>
        accept.some((ext) => candidate.name.toLowerCase().endsWith(ext));

    if (file) {
        return (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                <FileSpreadsheet className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
                </div>
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => {
                        onFile(null);
                        // Cleared so re-picking the same file still fires change.
                        if (inputRef.current) inputRef.current.value = "";
                    }}
                >
                    <X className="mr-1.5 size-3.5" aria-hidden />
                    Remove
                </Button>
            </div>
        );
    }

    return (
        <div
            onDragOver={(event) => {
                event.preventDefault();
                if (!disabled) setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
                event.preventDefault();
                setOver(false);
                if (disabled) return;
                const dropped = event.dataTransfer.files[0];
                if (dropped && acceptable(dropped)) onFile(dropped);
            }}
            className={cn(
                "rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
                over ? "border-primary bg-primary/5" : "border-border",
                disabled && "opacity-60"
            )}
        >
            <Upload className="mx-auto size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <p className="mt-3 text-sm font-medium text-foreground">
                Drop a file here, or choose one
            </p>
            {hint && <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{hint}</p>}
            <input
                ref={inputRef}
                type="file"
                accept={accept.join(",")}
                className="sr-only"
                disabled={disabled}
                onChange={(event) => {
                    const picked = event.target.files?.[0];
                    if (picked) onFile(picked);
                }}
            />
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                disabled={disabled}
                onClick={() => inputRef.current?.click()}
            >
                Choose file
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">{accept.join(", ")}</p>
        </div>
    );
}
