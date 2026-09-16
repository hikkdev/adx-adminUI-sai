import { apiConfig } from "./api-config";

/**
 * Thin client over the ADX backend.
 *
 * The backend answers `{ success, data }` on success and
 * `{ success: false, error: { code, message, details } }` on failure, so the
 * envelope is unwrapped here and callers only ever see the payload.
 */

export class ApiError extends Error {
    readonly status: number;
    readonly code: string;
    readonly details?: unknown;

    constructor(status: number, code: string, message: string, details?: unknown) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
        this.details = details;
    }

    /** Field-level messages from a Zod flatten(), when the backend sent one. */
    get fieldErrors(): Record<string, string[]> {
        const flattened = this.details as { fieldErrors?: Record<string, string[]> } | undefined;
        return flattened?.fieldErrors ?? {};
    }

    /**
     * Seconds to wait before trying again, when the backend said so.
     *
     * The OTP budget refusals carry it twice — as a `Retry-After` header and
     * as `details.retryAfterSeconds` — and either is enough. Read here so a
     * screen counting down a resend button does not have to know which.
     */
    get retryAfterSeconds(): number | null {
        const fromDetails = (this.details as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds;
        if (typeof fromDetails === "number" && Number.isFinite(fromDetails)) return fromDetails;
        return this.retryAfterHeader;
    }

    /** Set by `apiFetch` from the response header; not part of the envelope. */
    retryAfterHeader: number | null = null;
}

/* ------------------------------------------------------------------ */
/* Token storage                                                       */
/* ------------------------------------------------------------------ */

const ACCESS_KEY = "adx.accessToken";
const REFRESH_KEY = "adx.refreshToken";

/** Kept in memory too so the very first request after login is authenticated. */
let accessToken: string | null = null;

export const tokens = {
    get access() {
        if (accessToken) return accessToken;
        if (typeof window === "undefined") return null;
        accessToken = window.localStorage.getItem(ACCESS_KEY);
        return accessToken;
    },
    get refresh() {
        if (typeof window === "undefined") return null;
        return window.localStorage.getItem(REFRESH_KEY);
    },
    set(next: { accessToken: string; refreshToken?: string }) {
        accessToken = next.accessToken;
        if (typeof window === "undefined") return;
        window.localStorage.setItem(ACCESS_KEY, next.accessToken);
        if (next.refreshToken) window.localStorage.setItem(REFRESH_KEY, next.refreshToken);
    },
    clear() {
        accessToken = null;
        if (typeof window === "undefined") return;
        window.localStorage.removeItem(ACCESS_KEY);
        window.localStorage.removeItem(REFRESH_KEY);
    },
};

/* ------------------------------------------------------------------ */
/* Request                                                             */
/* ------------------------------------------------------------------ */

/**
 * Hard ceiling on a single API request.
 *
 * `fetch` has no default timeout, so before this a request to an unreachable or
 * cold-starting backend simply never settled — the UI sat on its spinner for
 * however long the browser felt like waiting (minutes), with no error and no
 * way for the user to tell a slow server from a broken one. A bounded failure
 * that says what happened is strictly better.
 *
 * Generous on purpose: a free-tier host cold-starting its container plus a
 * serverless database waking from suspend can legitimately take ~30s on the
 * first request of the day. Anything past this is not "slow", it is broken.
 */
const REQUEST_TIMEOUT_MS = 45_000;

export interface RequestOptions extends Omit<RequestInit, "body"> {
    body?: unknown;
    /** Skip the Authorization header (login, forgot password, reset password). */
    anonymous?: boolean;
    /**
     * A bearer other than the session's own — the fifteen-minute token
     * `POST /users/:id/impersonate` mints for the read-only view-as panel.
     *
     * A 401 under it is that token's, not the admin's session: it is neither
     * refreshed (there is no refresh token for it) nor allowed to sign the
     * admin out. The caller sees `IMPERSONATION_EXPIRED` and ends the panel.
     */
    bearer?: string;
    /** Internal: prevents a refresh loop. */
    _retried?: boolean;
}

/** One in-flight refresh shared by every 401 that lands while it runs. */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
    const refreshToken = tokens.refresh;
    if (!refreshToken) return false;

    if (!refreshInFlight) {
        refreshInFlight = (async () => {
            try {
                const response = await fetch(`${apiConfig.baseUrl}/auth/refresh`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ refreshToken }),
                });
                if (!response.ok) return false;
                const payload = await response.json();
                const next = payload?.data;
                if (!next?.accessToken) return false;
                tokens.set(next);
                return true;
            } catch {
                return false;
            } finally {
                refreshInFlight = null;
            }
        })();
    }

    return refreshInFlight;
}

/** Fired when a session cannot be recovered, so the app can send you to /login. */
type SessionEndedListener = () => void;
const sessionEndedListeners = new Set<SessionEndedListener>();

export function onSessionEnded(listener: SessionEndedListener): () => void {
    sessionEndedListeners.add(listener);
    return () => {
        sessionEndedListeners.delete(listener);
    };
}

function endSession() {
    tokens.clear();
    sessionEndedListeners.forEach((listener) => listener());
}

/**
 * Lot K2: the backend holds a session to enrolling an authenticator app
 * when the policy requires one — every route but the enrolment ones
 * answers 403 `TOTP_ENROLMENT_REQUIRED`. Fired once per such refusal so the
 * admin shell can put the setup in front of the operator; the caller still
 * gets the error, so a screen that was loading says so too.
 */
export const ENROLMENT_REQUIRED = "TOTP_ENROLMENT_REQUIRED";

const enrolmentRequiredListeners = new Set<() => void>();

export function onEnrolmentRequired(listener: () => void): () => void {
    enrolmentRequiredListeners.add(listener);
    return () => {
        enrolmentRequiredListeners.delete(listener);
    };
}

/** True for the guard's refusal, whatever route it came off. */
export function isEnrolmentRequired(error: unknown): error is ApiError {
    return error instanceof ApiError && error.status === 403 && error.code === ENROLMENT_REQUIRED;
}

function noticeOf(error: ApiError): ApiError {
    if (isEnrolmentRequired(error)) enrolmentRequiredListeners.forEach((listener) => listener());
    return error;
}

/**
 * The request itself: headers, the timeout, and the 401 → refresh → replay
 * dance. Shared by the JSON and the blob readers so a download recovers from
 * an expired access token exactly the way a page read does — before this the
 * three services that pulled a file each re-implemented `fetch` with a raw
 * token and simply failed on a stale one.
 */
async function send(path: string, options: RequestOptions): Promise<Response> {
    const { body, anonymous, bearer, _retried, headers, ...rest } = options;

    const requestHeaders = new Headers(headers);
    if (body !== undefined && !(body instanceof FormData)) {
        requestHeaders.set("Content-Type", "application/json");
    }
    if (bearer) {
        requestHeaders.set("Authorization", `Bearer ${bearer}`);
    } else if (!anonymous) {
        const token = tokens.access;
        if (token) requestHeaders.set("Authorization", `Bearer ${token}`);
    }

    let response: Response;
    try {
        response = await fetch(`${apiConfig.baseUrl}${path}`, {
            ...rest,
            /* A caller-supplied signal still wins; this only supplies the
               default ceiling when nobody asked for their own. */
            signal: rest.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            headers: requestHeaders,
            body:
                body === undefined
                    ? undefined
                    : body instanceof FormData
                      ? body
                      : JSON.stringify(body),
        });
    } catch (error) {
        /* Distinguish "took too long" from "could not connect" — they point at
           very different problems and the user can act on the difference. */
        if (error instanceof DOMException && error.name === "TimeoutError") {
            throw new ApiError(
                0,
                "TIMEOUT",
                "The server took too long to respond. It may be starting up — try again in a moment."
            );
        }
        throw new ApiError(0, "NETWORK", "Could not reach the ADX backend.");
    }

    /* An explicit bearer's 401 is its own expiry, never the session's. */
    if (response.status === 401 && bearer) {
        throw new ApiError(401, "IMPERSONATION_EXPIRED", "The view-as session has expired.");
    }

    /* 401 → refresh once, then replay the original request. */
    if (response.status === 401 && !anonymous && !_retried) {
        const refreshed = await refreshAccessToken();
        if (refreshed) return send(path, { ...options, _retried: true });
        endSession();
        throw new ApiError(401, "UNAUTHENTICATED", "Your session has expired.");
    }

    return response;
}

/** The backend's failure envelope as an `ApiError`, with a fallback when the body is not JSON. */
async function failureOf(response: Response, fallback: string): Promise<ApiError> {
    let code = "REQUEST_FAILED";
    let message = fallback;
    let details: unknown;
    try {
        const payload = (await response.json()) as { error?: { code?: string; message?: string; details?: unknown } };
        code = payload.error?.code ?? code;
        message = payload.error?.message ?? message;
        details = payload.error?.details;
    } catch {
        /* Not a JSON envelope — a storage error page, say. The status is enough. */
    }
    const error = new ApiError(response.status, code, message, details);
    const retryAfter = Number(response.headers.get("Retry-After"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterHeader = retryAfter;
    return noticeOf(error);
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await send(path, options);

    if (response.status === 204) return undefined as T;

    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        if (response.ok) return undefined as T;
        throw new ApiError(response.status, "BAD_RESPONSE", "The server sent an unreadable response.");
    }

    const envelope = payload as {
        success?: boolean;
        data?: T;
        error?: { code?: string; message?: string; details?: unknown };
    };

    if (!response.ok || envelope.success === false) {
        const error = new ApiError(
            response.status,
            envelope.error?.code ?? "REQUEST_FAILED",
            envelope.error?.message ?? "Something went wrong.",
            envelope.error?.details
        );
        const retryAfter = Number(response.headers.get("Retry-After"));
        if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterHeader = retryAfter;
        throw noticeOf(error);
    }

    return (envelope.data ?? (payload as T)) as T;
}

/**
 * The whole envelope, for the few reads that carry facts *beside* `data`.
 *
 * `GET /users` (K-B1) answers `{ success, data: [rows], counts, total }` —
 * the array stays `data` for the callers that read it as a list, and the
 * per-state counts the directory's chips draw travel next to it. `apiFetch`
 * unwraps to `data` alone, which is right everywhere else; this keeps the
 * siblings. Same headers, timeout and 401 → refresh → replay.
 */
export async function apiFetchEnvelope<T, M extends object = Record<string, never>>(
    path: string,
    options: RequestOptions = {},
): Promise<{ data: T } & M> {
    const response = await send(path, options);
    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        throw new ApiError(response.status, "BAD_RESPONSE", "The server sent an unreadable response.");
    }
    const envelope = payload as {
        success?: boolean;
        data?: T;
        error?: { code?: string; message?: string; details?: unknown };
    } & M;
    if (!response.ok || envelope.success === false) {
        throw noticeOf(
            new ApiError(
                response.status,
                envelope.error?.code ?? "REQUEST_FAILED",
                envelope.error?.message ?? "Something went wrong.",
                envelope.error?.details
            )
        );
    }
    const { success: _success, error: _error, ...rest } = envelope;
    return rest as { data: T } & M;
}

/* ------------------------------------------------------------------ */
/* Blob mode                                                           */
/* ------------------------------------------------------------------ */

export interface BlobResult {
    blob: Blob;
    /** What `Content-Disposition: attachment; filename="…"` named, if anything. */
    filename: string | null;
    contentType: string | null;
}

/** The filename a `Content-Disposition: attachment; filename="…"` header names, if any. */
export function attachmentFilename(header: string | null): string | null {
    const match = header?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * A route that streams bytes rather than a JSON envelope — an invoice PDF,
 * a bank file, the audit CSV, a private KYC image.
 *
 * Same headers, same timeout, same 401 → refresh → replay as `apiFetch`; the
 * only difference is what is done with the body. A failure is still the
 * backend's envelope when it sent one, so a 403 on a file reads like a 403
 * anywhere else.
 */
export async function apiFetchBlob(path: string, options: RequestOptions = {}): Promise<BlobResult> {
    const response = await send(path, { ...options, method: options.method ?? "GET" });
    if (!response.ok) throw await failureOf(response, "The download failed.");
    return {
        blob: await response.blob(),
        filename: attachmentFilename(response.headers.get("content-disposition")),
        contentType: response.headers.get("content-type"),
    };
}

/** Hands a blob to the browser as a download. A no-op outside a document. */
export function saveBlob(blob: Blob, filename: string): void {
    if (typeof document === "undefined") return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

export const api = {
    get: <T>(path: string, options?: RequestOptions) => apiFetch<T>(path, { ...options, method: "GET" }),
    post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
        apiFetch<T>(path, { ...options, method: "POST", body }),
    patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
        apiFetch<T>(path, { ...options, method: "PATCH", body }),
    put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
        apiFetch<T>(path, { ...options, method: "PUT", body }),
    delete: <T>(path: string, options?: RequestOptions) =>
        apiFetch<T>(path, { ...options, method: "DELETE" }),
    /** A GET whose answer carries facts beside `data` (`counts`, `total`) — the envelope minus `success`. */
    getEnvelope: <T, M extends object = Record<string, never>>(path: string, options?: RequestOptions) =>
        apiFetchEnvelope<T, M>(path, { ...options, method: "GET" }),
    /** Bytes rather than an envelope, through the same refresh-and-replay path. */
    blob: (path: string, options?: RequestOptions) => apiFetchBlob(path, options),
};
