"use client";

import * as React from "react";
import { ExternalLink, FileText, ImageOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiError, tokens } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";

/**
 * A file the API only hands over with the bearer token.
 *
 * A KYC document, a liveness video, an evidence photograph, a creative on a
 * private bucket and a campaign's QR image are all served through the API —
 * `GET /files/:id`, `GET /campaigns/:id/tracking-codes/:code/image.png` — and
 * every one of them refuses a plain `<img src>`, because a browser sends no
 * Authorization header with one. This component fetches the bytes with the
 * token (following the 302 to a presigned read — the browser drops the header
 * on the cross-origin hop, which is what the presigned URL wants), hands the
 * browser an object URL, and revokes it when the picture goes away. What it
 * draws follows the bytes: an image inline, a video with controls, a PDF as
 * a link that opens in a new tab.
 *
 * One component for every private file on the console, so the fetch and its
 * failure modes live in one place rather than once per screen. A public URL —
 * anything not under the API — is passed straight through.
 */

/** Whether the URL is one the API serves and the token unlocks. */
export function isApiUrl(src: string): boolean {
    if (src.startsWith("/")) return true;
    return src.startsWith(`${apiConfig.baseUrl}/`);
}

/** Is this the `/files/:id` shape a private KYC column holds? Any host — the row records the backend's own base URL. */
export function isPrivateFileUrl(src: string | null | undefined): boolean {
    if (!src) return false;
    return isApiUrl(src) || /\/api\/v1\/files\/[A-Za-z0-9_-]+(?:[?#].*)?$/.test(src);
}

/** The `/files/:id` URL for a bare file id — what a liveness row carries. */
export function privateFileUrl(fileId: string): string {
    return `${apiConfig.baseUrl}/files/${fileId}`;
}

/** The path relative to the API base, for a URL that is under it. */
function apiPath(src: string): string {
    if (src.startsWith(apiConfig.baseUrl)) return src.slice(apiConfig.baseUrl.length);
    // A `/files/:id` recorded against another base URL (the backend's own
    // BASE_URL, say, while the console points at localhost): keep the path.
    const match = /\/api\/v1(\/files\/[A-Za-z0-9_-]+(?:[?#].*)?)$/.exec(src);
    if (match) return match[1];
    return src;
}

export type PrivateFileKind = "image" | "video" | "pdf" | "other";

export function kindOf(mimeType: string): PrivateFileKind {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType === "application/pdf") return "pdf";
    return "other";
}

/** A guess from the extension, for a public URL that is never fetched here. */
export function kindFromUrl(url: string): PrivateFileKind {
    const path = url.split("?")[0].toLowerCase();
    if (/\.(mp4|mov|webm|m4v)$/.test(path)) return "video";
    if (/\.pdf$/.test(path)) return "pdf";
    return "image";
}

/**
 * The bytes behind a private URL, with the bearer token. Throws the same
 * `ApiError` every other request does, so a screen can show the message.
 */
export async function fetchPrivateBlob(src: string, fetchImpl: typeof fetch = fetch): Promise<Blob> {
    return (await fetchPrivateResponse(src, fetchImpl)).blob();
}

async function fetchPrivateResponse(src: string, fetchImpl: typeof fetch): Promise<Response> {
    const token = tokens.access;
    if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Sign in again to view this file.");
    let response: Response;
    try {
        response = await fetchImpl(`${apiConfig.baseUrl}${apiPath(src)}`, {
            headers: { Authorization: `Bearer ${token}` },
            redirect: "follow",
        });
    } catch {
        throw new ApiError(0, "NETWORK", "Could not reach the ADX backend.");
    }
    if (!response.ok) {
        let message =
            response.status === 403
                ? "You are not allowed to open this file — only its owner, the desk, or an agent holding a live grant can."
                : response.status === 404
                  ? "This file is no longer stored. It may have been purged."
                  : "The file could not be loaded.";
        let code = "REQUEST_FAILED";
        try {
            const payload = (await response.json()) as { error?: { code?: string; message?: string } };
            message = payload.error?.message ?? message;
            code = payload.error?.code ?? code;
        } catch {
            /* Not JSON; the message above stands. */
        }
        throw new ApiError(response.status, code, message);
    }
    return response;
}

export interface LoadedPrivateFile {
    objectUrl: string;
    mimeType: string;
    kind: PrivateFileKind;
}

/** The blob as an object URL, typed by what it is. The caller revokes it. */
export async function fetchPrivateFile(src: string, fetchImpl: typeof fetch = fetch): Promise<LoadedPrivateFile> {
    const response = await fetchPrivateResponse(src, fetchImpl);
    const blob = await response.blob();
    // The blob's own type first; the header when the store sent one the
    // body did not carry (a local stream sets Content-Type explicitly).
    const mimeType = blob.type || response.headers.get("Content-Type")?.split(";")[0]?.trim() || "application/octet-stream";
    return { objectUrl: URL.createObjectURL(blob), mimeType, kind: kindOf(mimeType) };
}

/**
 * Opens a file in a new tab: a public one directly, a private one through a
 * short-lived object URL. For the "View" and "Recorded · open" links beside a
 * document slot.
 */
export async function openPrivateFile(src: string): Promise<void> {
    if (!isPrivateFileUrl(src)) {
        window.open(src, "_blank", "noopener,noreferrer");
        return;
    }
    const loaded = await fetchPrivateFile(src);
    window.open(loaded.objectUrl, "_blank", "noopener,noreferrer");
    // The tab holds its own reference once opened; a minute is ample.
    window.setTimeout(() => URL.revokeObjectURL(loaded.objectUrl), 60_000);
}

export interface PrivateObjectUrl {
    url: string | null;
    /** What the bytes are — from the blob for a private file, the extension for a public one. */
    kind: PrivateFileKind;
    loading: boolean;
    error: string | null;
}

/**
 * An object URL for a private file, revoked when the source changes or the
 * component unmounts. A public URL comes back as itself, at once.
 */
export function usePrivateObjectUrl(src: string | null): PrivateObjectUrl {
    const isPrivate = src !== null && isPrivateFileUrl(src);
    const [state, setState] = React.useState<{ src: string | null; url: string | null; kind: PrivateFileKind; error: string | null }>({
        src: null,
        url: null,
        kind: "image",
        error: null,
    });

    React.useEffect(() => {
        if (!src || !isPrivate) return;
        let active = true;
        let objectUrl: string | null = null;
        void (async () => {
            try {
                const loaded = await fetchPrivateFile(src);
                if (!active) {
                    URL.revokeObjectURL(loaded.objectUrl);
                    return;
                }
                objectUrl = loaded.objectUrl;
                setState({ src, url: objectUrl, kind: loaded.kind, error: null });
            } catch (cause) {
                if (!active) return;
                setState({
                    src,
                    url: null,
                    kind: "image",
                    error: cause instanceof ApiError ? cause.message : "The file could not be loaded.",
                });
            }
        })();
        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [src, isPrivate]);

    if (!src) return { url: null, kind: "image", loading: false, error: null };
    if (!isPrivate) return { url: src, kind: kindFromUrl(src), loading: false, error: null };
    if (state.src !== src) return { url: null, kind: "image", loading: true, error: null };
    return { url: state.url, kind: state.kind, loading: false, error: state.error };
}

interface PrivateFileProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
    /** A `/files/:id` path, an absolute URL under the API, or a public URL. */
    src: string | null;
    alt: string;
    /** Wraps the placeholder states; the image itself takes `className`. */
    frameClassName?: string;
    /** Say what a public URL is when the extension does not. A private file is typed by its bytes. */
    kind?: PrivateFileKind;
}

/**
 * A file that may need the bearer token to load.
 *
 * Renders a spinner while the bytes arrive and a quiet placeholder when they
 * do not, so a private document that has expired or been deleted reads as
 * "not available" rather than the browser's broken-image glyph. An image is
 * drawn inline, a video with controls, a PDF as a link.
 */
export function PrivateFile({ src, alt, className, frameClassName, kind: kindHint, ...rest }: PrivateFileProps) {
    const { url, kind: detected, loading, error } = usePrivateObjectUrl(src);
    const kind = src && !isPrivateFileUrl(src) && kindHint ? kindHint : detected;

    if (!src || error) {
        return (
            <div
                role="img"
                aria-label={error ? `${alt} (not available)` : alt}
                title={error ?? undefined}
                className={cn(
                    "flex items-center justify-center bg-muted text-muted-foreground",
                    frameClassName,
                    className,
                )}
                data-testid={error ? "private-file-error" : "private-file-empty"}
            >
                <ImageOff className="size-5" strokeWidth={1.5} aria-hidden />
                {error && <span className="sr-only">{error}</span>}
            </div>
        );
    }

    if (loading || !url) {
        return (
            <div
                role="img"
                aria-label={alt}
                aria-busy
                className={cn("flex items-center justify-center bg-muted text-muted-foreground", frameClassName, className)}
                data-testid="private-file-skeleton"
            >
                <Loader2 className="size-4 animate-spin" aria-hidden />
            </div>
        );
    }

    if (kind === "video") {
        return (
            <video src={url} controls playsInline aria-label={alt} className={className} data-testid="private-file-video" />
        );
    }

    if (kind === "pdf" || kind === "other") {
        return (
            <div
                className={cn("flex flex-col items-center justify-center gap-2 bg-muted p-4 text-center", frameClassName, className)}
                data-testid="private-file-link"
            >
                <FileText className="size-8 text-muted-foreground/60" strokeWidth={1.5} aria-hidden />
                <p className="text-sm font-medium text-foreground">{alt}</p>
                <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                    <ExternalLink className="size-3" aria-hidden />
                    {kind === "pdf" ? "Open the PDF" : "Open the file"}
                </a>
            </div>
        );
    }

    // eslint-disable-next-line @next/next/no-img-element -- an object URL or the upload host, never a Next-optimisable asset
    return <img src={url} alt={alt} className={className} data-testid="private-file-image" {...rest} />;
}
