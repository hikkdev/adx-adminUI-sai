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

interface RequestOptions extends Omit<RequestInit, "body"> {
    body?: unknown;
    /** Skip the Authorization header (login, forgot password, reset password). */
    anonymous?: boolean;
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

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { body, anonymous, _retried, headers, ...rest } = options;

    const requestHeaders = new Headers(headers);
    if (body !== undefined && !(body instanceof FormData)) {
        requestHeaders.set("Content-Type", "application/json");
    }
    if (!anonymous) {
        const token = tokens.access;
        if (token) requestHeaders.set("Authorization", `Bearer ${token}`);
    }

    let response: Response;
    try {
        response = await fetch(`${apiConfig.baseUrl}${path}`, {
            ...rest,
            headers: requestHeaders,
            body:
                body === undefined
                    ? undefined
                    : body instanceof FormData
                      ? body
                      : JSON.stringify(body),
        });
    } catch {
        throw new ApiError(0, "NETWORK", "Could not reach the ADX backend.");
    }

    /* 401 → refresh once, then replay the original request. */
    if (response.status === 401 && !anonymous && !_retried) {
        const refreshed = await refreshAccessToken();
        if (refreshed) return apiFetch<T>(path, { ...options, _retried: true });
        endSession();
        throw new ApiError(401, "UNAUTHENTICATED", "Your session has expired.");
    }

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
        throw new ApiError(
            response.status,
            envelope.error?.code ?? "REQUEST_FAILED",
            envelope.error?.message ?? "Something went wrong.",
            envelope.error?.details
        );
    }

    return (envelope.data ?? (payload as T)) as T;
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
};
