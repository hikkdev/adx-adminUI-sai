import { api as http, saveBlob } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";

/**
 * The audit trail — the console's window onto `ActivityLog`, wired to the
 * backend `audit` module (Lot A, Q28).
 *
 * Three reads and nothing else: the list contract over the whole trail, the
 * same filter streamed as CSV, and one record's timeline. The console never
 * writes here — every row is written by the module that did the thing, and
 * the export itself lands as an `AUDIT_EXPORTED` row before the first byte.
 *
 * No fixture fallback. The seeded `aud_*` rows that used to draw this page
 * described actors, targets and modules the backend never issued; with the
 * API off the page says so rather than showing a trail nobody left.
 */

/* ------------------------------------------------------------------ */
/* The wire                                                            */
/* ------------------------------------------------------------------ */

export interface AuditActor {
    id: string;
    name: string | null;
    email: string | null;
}

/** `{ field: { before, after } }` — written only by the money and status models. */
export type AuditDiff = Record<string, { before: unknown; after: unknown }>;

/** One row exactly as `GET /audit` sends it, actor joined. */
export interface AuditRow {
    id: string;
    userId: string;
    action: string;
    /** Null on rows written before Lot A — counted under `(none)`. */
    module: string | null;
    targetType: string | null;
    targetId: string | null;
    requestId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    metadata: Record<string, unknown> | null;
    diff: AuditDiff | null;
    createdAt: string;
    user: AuditActor | null;
}

export interface AuditPage {
    items: AuditRow[];
    total: number;
    page: number;
    pageSize: number;
    /** Rows per module, counted with the module facet removed. */
    counts: Record<string, number>;
}

/** The key the server counts pre-Lot-A rows under. */
export const NO_MODULE = "(none)";

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export type AuditSort = "newest" | "oldest";

export interface AuditQuery {
    q?: string;
    action?: string;
    module?: string;
    targetType?: string;
    targetId?: string;
    userId?: string;
    /** ISO date or datetime. A bare date is the start of that day, UTC. */
    from?: string;
    to?: string;
    sort?: AuditSort;
    page?: number;
    pageSize?: number;
}

export const AUDIT_PAGE_SIZE = 50;

/**
 * `?q=&module=&from=…` exactly as `listAuditQuerySchema` parses it.
 *
 * Pure, so the shape the page sends can be pinned without a transport: a
 * facet the caller did not set is not sent at all, and whitespace-only text
 * counts as unset — the schema refuses an empty token.
 */
export function buildAuditQuery(query: AuditQuery = {}): string {
    const params = new URLSearchParams();
    const text: (keyof AuditQuery)[] = ["q", "action", "module", "targetType", "targetId", "userId", "from", "to"];
    for (const key of text) {
        const value = query[key];
        if (typeof value === "string" && value.trim()) params.set(key, value.trim());
    }
    if (query.sort) params.set("sort", query.sort);
    if (query.page !== undefined) params.set("page", String(query.page));
    if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));
    return params.toString();
}

/** The export takes the filter and the sort; the page is meaningless to it. */
export function buildExportQuery(query: AuditQuery = {}): string {
    const { page: _page, pageSize: _pageSize, ...filter } = query;
    return buildAuditQuery(filter);
}

/* ------------------------------------------------------------------ */
/* How the page reads a row                                            */
/* ------------------------------------------------------------------ */

/** "Priya Rao", or the email, or the id — whatever the join gave us. */
export function actorName(row: Pick<AuditRow, "user" | "userId">): string {
    return row.user?.name?.trim() || row.user?.email || row.userId;
}

/**
 * "AUDIT_EXPORTED" → "Audit exported"; "orders.PATCH /orders/:id" — the
 * generic tap's rows — stay as written, because the route template is the
 * information.
 */
export function actionLabel(action: string): string {
    if (!/^[A-Z][A-Z0-9_]*$/.test(action)) return action;
    const words = action.toLowerCase().split("_");
    return words.map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join(" ");
}

/** "Order · cmf…" for the Object column; the type alone when there is no id. */
export function targetLabel(row: Pick<AuditRow, "targetType" | "targetId">): string {
    if (!row.targetType && !row.targetId) return "—";
    return [row.targetType, row.targetId].filter(Boolean).join(" · ");
}

export function moduleLabel(module: string | null): string {
    if (!module || module === NO_MODULE) return "Unfiled";
    return module.charAt(0).toUpperCase() + module.slice(1).replace(/-/g, " ");
}

/** The diff as rows for a before/after table, in the order the server wrote them. */
export function diffRows(diff: AuditDiff | null | undefined): { field: string; before: unknown; after: unknown }[] {
    if (!diff) return [];
    return Object.entries(diff).map(([field, change]) => ({ field, before: change?.before, after: change?.after }));
}

/** A value from metadata or a diff, fit for a cell. */
export function cellText(value: unknown): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "string") return value || "—";
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value);
}

/**
 * The chip row: every module the server counted, largest first, with the
 * unfiled rows last whatever their count so the row reads as a list of
 * modules rather than opening on a bucket.
 */
export function moduleChips(counts: Record<string, number>): { value: string; label: string; count: number }[] {
    return Object.entries(counts)
        .sort(([a, x], [b, y]) => {
            if (a === NO_MODULE) return 1;
            if (b === NO_MODULE) return -1;
            return y - x || a.localeCompare(b);
        })
        .map(([value, count]) => ({ value, label: moduleLabel(value), count }));
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

/**
 * Refuses to talk to the API while the domain is off.
 *
 * There is nothing to fall back to. Throwing here, before a request goes
 * out, is what keeps a fixture trail from ever standing in for the real one.
 */
function live() {
    if (!isLive("audit")) throw new Error("The audit log reads the API; connect the console to the ADX backend first.");
    return http;
}

/** Every count present as a number, whatever the server sent. */
function shapePage(page: Partial<AuditPage> & { items?: AuditRow[] }): AuditPage {
    return {
        items: page.items ?? [],
        total: page.total ?? 0,
        page: page.page ?? 1,
        pageSize: page.pageSize ?? AUDIT_PAGE_SIZE,
        counts: page.counts ?? {},
    };
}

/** `audit-2026-09-12-10-42-00.csv`, from the Content-Disposition header when it names one. */
export function exportFilename(disposition: string | null): string {
    const match = disposition?.match(/filename="?([^";]+)"?/);
    return match?.[1] ?? `audit-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
}

export const auditService = {
    /** The list contract: every facet goes to the API, and `counts` comes back by module. */
    list: async (query: AuditQuery = {}): Promise<AuditPage> =>
        shapePage(await live().get<Partial<AuditPage>>(`/audit?${buildAuditQuery({ pageSize: AUDIT_PAGE_SIZE, ...query })}`)),

    /** One record's timeline — every row that named it. */
    target: async (targetType: string, targetId: string, query: Pick<AuditQuery, "sort" | "page" | "pageSize"> = {}): Promise<AuditPage> =>
        shapePage(
            await live().get<Partial<AuditPage>>(
                `/audit/targets/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}?${buildAuditQuery({ pageSize: AUDIT_PAGE_SIZE, ...query })}`,
            ),
        ),

    /**
     * The same filter as CSV, pulled with the bearer token and handed to the
     * browser as a file.
     *
     * Through the api client's blob mode rather than a raw `fetch`: the route
     * streams `text/csv` instead of a JSON envelope, but the token, the
     * timeout and the refresh-and-replay on a stale access token are the same
     * as every other read here. The server writes its `AUDIT_EXPORTED` row
     * before the first byte whether or not the browser finishes saving it.
     */
    exportCsv: async (query: AuditQuery = {}): Promise<{ filename: string; bytes: number }> => {
        const result = await live().blob(`/audit/export.csv?${buildExportQuery(query)}`);
        // The blob reader has already parsed the header; the fallback is the date.
        const filename = result.filename ?? exportFilename(null);
        saveBlob(result.blob, filename);
        return { filename, bytes: result.blob.size };
    },
};
