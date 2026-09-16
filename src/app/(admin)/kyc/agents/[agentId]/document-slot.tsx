"use client";

import * as React from "react";
import { ExternalLink, FileCheck2, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openPrivateFile } from "@/components/adx/private-file";
import { uploadService, type UploadPurpose } from "@/services/uploads";

interface DocumentSlotProps {
    label: string;
    /** Where the document lives, once uploaded. */
    url: string | undefined;
    onChange: (url: string | undefined) => void;
    disabled?: boolean;
    /** Which private purpose the file goes up under. The agent desk's by default; the employee desk names its own. */
    purpose?: UploadPurpose;
    /** Lot N: the party the file belongs to when the desk records on their behalf — the publisher's, the advertiser's or the partner's user id. */
    ownerUserId?: string | null;
}

const ACCEPT = ".jpg,.jpeg,.png,.pdf";

/**
 * One document at the desk: a file goes up the moment it is picked (D3's
 * `POST /upload`, purpose AGENT_KYC or EMPLOYEE_KYC — Lot N: KYC,
 * ADVERTISER_KYC or PRINT_PARTNER_KYC with `ownerUserId` naming the party)
 * and the slot holds where it landed — a `/files/:id` URL since Lot D,
 * opened with the token.
 *
 * Deliberately one row per document rather than the market-data dropzone —
 * the desk records seven of these in a sitting and a page of tall drop targets
 * is not a form anyone fills.
 */
export function DocumentSlot({ label, url, onChange, disabled, purpose = "AGENT_KYC", ownerUserId = null }: DocumentSlotProps) {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = React.useState(false);
    const [opening, setOpening] = React.useState(false);

    const pick = async (file: File) => {
        setUploading(true);
        try {
            const uploaded = await uploadService.upload(file, purpose, { ownerUserId });
            onChange(uploaded.url);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : `${label} did not upload.`);
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const open = async () => {
        if (!url) return;
        setOpening(true);
        try {
            await openPrivateFile(url);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : `${label} could not be opened.`);
        } finally {
            setOpening(false);
        }
    };

    return (
        <div className="flex items-center gap-3 py-2.5">
            {url ? (
                <FileCheck2 className="size-4 shrink-0 text-success" aria-hidden />
            ) : (
                <Upload className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="truncate text-xs text-muted-foreground">
                    {url ? (
                        <button
                            type="button"
                            onClick={() => void open()}
                            disabled={opening}
                            className="inline-flex items-center gap-1 hover:text-foreground disabled:opacity-60"
                        >
                            {opening ? "Opening…" : "Recorded · open"}
                            <ExternalLink className="size-3" aria-hidden />
                        </button>
                    ) : (
                        "Not recorded"
                    )}
                </p>
            </div>
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                disabled={disabled || uploading}
                aria-label={`Upload ${label}`}
                onChange={(event) => {
                    const picked = event.target.files?.[0];
                    if (picked) void pick(picked);
                }}
            />
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={disabled || uploading}
                onClick={() => inputRef.current?.click()}
            >
                {uploading ? <Loader2 className="mr-1 size-3 animate-spin" aria-hidden /> : null}
                {url ? "Replace" : "Upload"}
            </Button>
            {url && (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Remove ${label}`}
                    disabled={disabled || uploading}
                    onClick={() => onChange(undefined)}
                >
                    <X className="size-3.5" aria-hidden />
                </Button>
            )}
        </div>
    );
}
