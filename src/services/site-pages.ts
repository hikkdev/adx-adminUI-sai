import { api as http } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import { parseCsv } from "@/lib/bulk";
import type { StatusMeta } from "@/types";
import type { LayoutBlock, LayoutSurface, LayoutVersionView, PreviewQuery, ResolvedBlock } from "./layouts";

/**
 * PB-1 (27 Sep 2026): the site's pages — every address the website answers
 * and the apps can open, edited in Studio.
 *
 * The owner: "My goal is to be able to edit the layout of existing and
 * create whole new pages, also assign proper URLs to the new pages and edit
 * existing URLs as well." A SYSTEM page is one of the website's own nine
 * (home, explore, listing, …): its sections are a layout surface and its
 * address can move (a redirect is kept from the old one). A CUSTOM page is
 * made here, from a template, and drawn from content blocks alone; its
 * versions follow the layouts' rules — one draft at a time, publish retires
 * the live one, restore publishes a copy.
 *
 * "Only admins can change the addresses." — a path change needs
 * `content.addresses`, which no system role but Super admin holds; the desk
 * disables the dialog and says so rather than letting the server refuse.
 */

export type SitePageKind = "SYSTEM" | "CUSTOM";
export type SitePageChannel = "WEBSITE" | "APPS";
export type SiteRedirectReason = "ADDRESS_CHANGE" | "MANUAL";

export const PAGE_KIND_META: Record<SitePageKind, StatusMeta> = {
    SYSTEM: { label: "Site page", tone: "neutral" },
    CUSTOM: { label: "Studio page", tone: "info" },
};

export const PAGE_CHANNELS = ["WEBSITE", "APPS"] as const;

export const PAGE_CHANNEL_LABEL: Record<SitePageChannel, string> = {
    WEBSITE: "Website",
    APPS: "Apps",
};

export const REDIRECT_REASON_LABEL: Record<SiteRedirectReason, string> = {
    ADDRESS_CHANGE: "Address changed",
    MANUAL: "Added by hand",
};

export const PAGE_TEMPLATES = ["blank", "event", "landing"] as const;
export type PageTemplate = (typeof PAGE_TEMPLATES)[number];

export const PAGE_TEMPLATE_META: Record<PageTemplate, { label: string; blurb: string }> = {
    blank: { label: "Blank", blurb: "Nothing on it yet — add blocks in Studio." },
    event: { label: "Event", blurb: "A hero, two columns, a listing grid, an FAQ and a call to action." },
    landing: { label: "Landing", blurb: "A hero, three numbers, the steps and a call to action." },
};

/** One row of `GET /site/pages`. */
export interface SitePageRow {
    id: string;
    key: string;
    kind: SitePageKind;
    title: string;
    path: string;
    internalPath: string | null;
    surface: LayoutSurface | null;
    channels: SitePageChannel[];
    addressLocked: boolean;
    archivedAt: string | null;
    live: { number: number; publishedAt: string | null } | null;
    draft: { number: number; updatedAt: string } | null;
    updatedAt: string;
    redirectCount: number;
}

/** The SEO a version carries — `meta` on a layout version. */
export interface PageMeta {
    seoTitle?: string | null;
    seoDescription?: string | null;
    seoImageId?: string | null;
    noindex?: boolean;
}

/** A version with the SEO a page's version carries. */
export type PageVersionView = LayoutVersionView & { meta?: PageMeta | null };

/** `GET /site/pages/:key`: the row plus its versions in the layouts' shape. */
export interface SitePageDetail extends Omit<SitePageRow, "live" | "draft"> {
    live: PageVersionView | null;
    draft: PageVersionView | null;
    versions?: LayoutVersionView[];
    defaults?: LayoutBlock[];
}

export interface NewSitePageInput {
    key: string;
    title: string;
    path: string;
    channels?: SitePageChannel[];
    template?: PageTemplate;
}

export interface SitePagePatch {
    title?: string;
    channels?: SitePageChannel[];
    /** `content.addresses` only. */
    path?: string;
}

export interface SiteRedirectRow {
    id: string;
    fromPath: string;
    toPath: string;
    permanent: boolean;
    reason: SiteRedirectReason;
    page: { key: string; title: string } | null;
    createdAt: string;
}

export interface NewRedirectInput {
    fromPath: string;
    toPath: string;
    permanent?: boolean;
}

export interface PreviewToken {
    token: string;
    expiresAt: string;
}

/** `GET /site/pages/:key/preview` — the page resolved for a side and a city, like a surface. */
export interface ResolvedPage {
    key: string;
    title: string;
    path: string;
    channels: SitePageChannel[];
    version: number;
    isDefault: boolean;
    blocks: ResolvedBlock[];
}

/* ------------------------------------------------------------------ */
/* Pure helpers — keys and addresses                                   */
/* ------------------------------------------------------------------ */

/**
 * The nine SYSTEM keys the lead seeded, each with the surface its sections
 * live under. The desk reads the live list; this is the fallback that lets
 * the Layouts list open Studio for a website surface before the read lands.
 */
export const SYSTEM_PAGE_SURFACE: Record<string, LayoutSurface> = {
    home: "WEB_HOME",
    explore: "WEB_EXPLORE",
    listing: "WEB_LISTING",
    categories: "WEB_CATEGORIES",
    formats: "WEB_FORMATS",
    "how-it-works": "WEB_HOW_IT_WORKS",
    advertise: "WEB_ADVERTISE",
    publishers: "WEB_PUBLISHERS",
    help: "WEB_HELP",
};

/** The SYSTEM page key a website surface belongs to, from the seed. */
export function pageKeyForSurface(surface: string): string | null {
    for (const [key, value] of Object.entries(SYSTEM_PAGE_SURFACE)) if (value === surface) return key;
    return null;
}

export const KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const KEY_MAX = 64;

/** The key a title suggests — the same rule the server applies. */
export function pageKeyFrom(title: string): string {
    return title
        .toLowerCase()
        .trim()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, KEY_MAX);
}

/** Why this key cannot be used, or null. `taken` are the keys already in use (the SYSTEM ones always are). */
export function keyProblem(key: string, taken: readonly string[] = []): string | null {
    if (!key) return "A page needs a key.";
    if (key.length > KEY_MAX) return `At most ${KEY_MAX} characters.`;
    if (!KEY_PATTERN.test(key)) return "Lowercase letters, digits and single hyphens — “diwali-2026”.";
    if (taken.includes(key) || key in SYSTEM_PAGE_SURFACE) return `“${key}” is already a page.`;
    return null;
}

/** The first segments the website keeps for itself — the server's list, mirrored so the dialog can say so first. */
export const RESERVED_FIRST_SEGMENTS = [
    "api",
    "_next",
    "studio",
    "pg",
    "preview",
    "sign",
    "verify",
    "verify-2fa",
    "verify-phone",
    "verify-email",
    "advertiser",
    "publisher",
    "partner",
    "cart",
    "q",
    "j",
    "s",
    "t",
    "status",
    "legal",
    "legal-documents",
    "account",
    "admin",
    "public",
    "design",
    "brand",
    "icons",
    "contact",
    "privacy",
    "terms",
    "refund",
    "sitemap.xml",
    "robots.txt",
] as const;

export const PATH_MAX_SEGMENTS = 5;
export const PATH_MAX_LENGTH = 120;
const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The segments of a path after its leading slash; `/` is none. */
export const pathSegments = (path: string): string[] => (path === "/" ? [] : path.replace(/^\//, "").split("/"));

/**
 * Why this address cannot be used, or null — the server's rules, applied
 * first here so the dialog can explain before it asks. `page` says whose
 * address it is: `/` belongs to `home` alone, and a `:param` segment is
 * allowed only where a SYSTEM page's internal path has one.
 */
export function pathProblem(path: string, page?: { key?: string; kind?: SitePageKind; internalPath?: string | null } | null): string | null {
    const trimmed = path.trim();
    if (!trimmed) return "A page needs an address.";
    if (!trimmed.startsWith("/")) return "An address starts with “/”.";
    if (trimmed.length > PATH_MAX_LENGTH) return `At most ${PATH_MAX_LENGTH} characters.`;
    if (trimmed === "/") return page?.key === "home" ? null : "“/” is the home page's address.";
    if (trimmed.endsWith("/")) return "No trailing slash.";
    if (trimmed.includes(".")) return "No dots in an address.";
    const segments = pathSegments(trimmed);
    if (segments.length > PATH_MAX_SEGMENTS) return `At most ${PATH_MAX_SEGMENTS} segments.`;
    const internal = page?.internalPath ? pathSegments(page.internalPath) : [];
    for (const [index, segment] of segments.entries()) {
        if (segment.startsWith(":")) {
            if (page?.kind !== "SYSTEM" || internal[index]?.startsWith(":") !== true) return "A “:param” segment belongs only where the page's own address has one.";
            if (!/^:[a-z][a-zA-Z0-9]*$/.test(segment)) return "A param is “:” and a name — “:id”.";
            continue;
        }
        if (!SEGMENT.test(segment)) return "Segments are lowercase letters, digits and single hyphens — “/diwali-offers”.";
    }
    if (segments.length > 0 && (RESERVED_FIRST_SEGMENTS as readonly string[]).includes(segments[0]!)) return `“/${segments[0]}” is kept by the website.`;
    if (page?.kind === "SYSTEM" && internal.length > 0) {
        const wanted = internal.filter((segment) => segment.startsWith(":")).length;
        const have = segments.filter((segment) => segment.startsWith(":")).length;
        if (wanted !== have) return `This page's address carries ${wanted} ${wanted === 1 ? "param" : "params"} — keep ${wanted === 1 ? "it" : "them"}.`;
    }
    return null;
}

/** Why a redirect's destination cannot be used, or null: a site path or an https address. */
export function toPathProblem(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return "Say where it goes.";
    if (/^https:\/\/\S+$/i.test(trimmed)) return null;
    if (/^http:\/\//i.test(trimmed)) return "An outside address must be https.";
    if (!trimmed.startsWith("/")) return "A site address starts with “/”, or give a full https address.";
    return null;
}

/** One line of a redirects import, read and checked. */
export interface RedirectImportRow {
    /** The line in the file, counting the header when there is one. */
    line: number;
    fromPath: string;
    toPath: string;
    permanent: boolean;
    /** Why this line will not be created, or null. */
    problem: string | null;
}

const PERMANENT_YES = ["", "true", "yes", "y", "1", "permanent", "308"];
const PERMANENT_NO = ["false", "no", "n", "0", "temporary", "307"];

/**
 * A redirects import — `from,to` and an optional third `permanent` column
 * (true/false; empty is permanent, as the Add dialog's default) — read line
 * by line with the checks the Add dialog applies: the source through
 * `pathProblem`, not an address a page or a redirect already answers, not
 * twice in the file; the destination a site path or an https address, and
 * never the source itself. A first line reading `from,…` is a header.
 */
export function readRedirectCsv(text: string, takenPaths: readonly string[] = []): RedirectImportRow[] {
    const rows = parseCsv(text);
    const header = rows[0]?.[0]?.trim().toLowerCase() === "from" ? 1 : 0;
    const taken = new Set(takenPaths);
    const seen = new Set<string>();
    return rows.slice(header).map((cells, index) => {
        const fromPath = (cells[0] ?? "").trim();
        const toPath = (cells[1] ?? "").trim();
        const flag = (cells[2] ?? "").trim().toLowerCase();
        const permanent = PERMANENT_YES.includes(flag) ? true : PERMANENT_NO.includes(flag) ? false : null;
        const fromIssue = pathProblem(fromPath, { kind: "CUSTOM" });
        const toIssue = toPathProblem(toPath);
        const problem =
            cells.slice(3).some((cell) => cell.trim())
                ? "Two or three columns: from, to, permanent."
                : fromIssue
                  ? `From: ${fromIssue}`
                  : taken.has(fromPath)
                    ? "A page or another redirect already answers this address."
                    : seen.has(fromPath)
                      ? "This address is listed twice in the file."
                      : toIssue
                        ? `To: ${toIssue}`
                        : toPath === fromPath
                          ? "It would point at itself."
                          : permanent === null
                            ? "The third column is true or false."
                            : null;
        if (fromPath) seen.add(fromPath);
        return { line: index + header + 1, fromPath, toPath, permanent: permanent ?? true, problem };
    });
}

/** The address the desk suggests for a new page: `/<key>`. */
export const suggestedPath = (key: string): string => (key ? `/${key}` : "");

/** "…/old → …/new" — the line the address dialog prints under the input. */
export const addressChangeLine = (from: string, to: string): string => `${from} → ${to || "…"}`;

/** True when the page is live somewhere a reader can reach. */
export const isLivePage = (page: Pick<SitePageRow, "live" | "archivedAt">): boolean => page.live !== null && page.archivedAt === null;

/** A row's state as one chip. */
export function pageStateMeta(page: Pick<SitePageRow, "live" | "draft" | "archivedAt" | "kind">): StatusMeta {
    if (page.archivedAt) return { label: "Archived", tone: "neutral" };
    if (page.live) return { label: `Live v${page.live.number}`, tone: "success" };
    if (page.kind === "SYSTEM") return { label: "Default order", tone: "neutral" };
    return { label: "Not published", tone: "warning" };
}

/** Rows in the order the desk lists them: the website's own pages first, then Studio pages by title, archived last. */
export function sortPages(rows: readonly SitePageRow[]): SitePageRow[] {
    const order = Object.keys(SYSTEM_PAGE_SURFACE);
    return [...rows].sort((a, b) => {
        if (Boolean(a.archivedAt) !== Boolean(b.archivedAt)) return a.archivedAt ? 1 : -1;
        if (a.kind !== b.kind) return a.kind === "SYSTEM" ? -1 : 1;
        if (a.kind === "SYSTEM") return order.indexOf(a.key) - order.indexOf(b.key);
        return a.title.localeCompare(b.title);
    });
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

/** This desk reads the API or says it cannot; a seeded page would look exactly like a live one. */
export const sitePagesReadApi = (): boolean => apiConfig.live;

function previewQuery(query: PreviewQuery): string {
    const params = new URLSearchParams();
    if (query.side) params.set("side", query.side);
    if (query.cityId) params.set("cityId", query.cityId);
    if (query.version !== undefined) params.set("version", String(query.version));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
}

const pagePath = (key: string) => `/site/pages/${encodeURIComponent(key)}`;

export const sitePagesService = {
    /** Every page, archived ones included, with what is live and whether a draft waits. */
    list: () => http.get<SitePageRow[]>("/site/pages"),
    /** `content.edit`. A CUSTOM page with its draft v1 from the template. */
    create: (input: NewSitePageInput) => http.post<SitePageRow>("/site/pages", input),
    /** PB-6: a WEBSITE article becomes a Studio page of one text block, published at once (`content.edit` + `content.approve`). */
    fromContent: (slug: string) => http.post<SitePageRow>(`/site/pages/from-content/${encodeURIComponent(slug)}`, {}),
    get: (key: string) => http.get<SitePageDetail>(pagePath(key)),
    /** `content.edit` for the title and channels; `content.addresses` for the path (403 otherwise, 409 when locked). */
    update: (key: string, patch: SitePagePatch) => http.patch<SitePageRow>(pagePath(key), patch),
    /** `content.delete`, CUSTOM only. */
    archive: (key: string) => http.post<SitePageRow>(`${pagePath(key)}/archive`, {}),
    restorePage: (key: string) => http.post<SitePageRow>(`${pagePath(key)}/restore-page`, {}),
    /** `content.view` — a 24-hour token the website's preview mode reads the DRAFT with. */
    previewToken: (key: string) => http.post<PreviewToken>(`${pagePath(key)}/preview-token`, {}),
    /* Custom page versions — the layouts' rules. */
    saveDraft: (key: string, blocks: LayoutBlock[], extra: { meta?: PageMeta; changeNote?: string } = {}) =>
        http.put<LayoutVersionView>(`${pagePath(key)}/draft`, { blocks, ...(extra.meta ? { meta: extra.meta } : {}), ...(extra.changeNote ? { changeNote: extra.changeNote } : {}) }),
    discardDraft: (key: string) => http.delete<{ message?: string }>(`${pagePath(key)}/draft`),
    preview: (key: string, query: PreviewQuery = {}) => http.get<ResolvedPage>(`${pagePath(key)}/preview${previewQuery(query)}`),
    publish: (key: string, changeNote?: string) => http.post<LayoutVersionView>(`${pagePath(key)}/publish`, changeNote ? { changeNote } : {}),
    versions: (key: string) => http.get<LayoutVersionView[]>(`${pagePath(key)}/versions`),
    restoreVersion: (key: string, number: number) => http.post<LayoutVersionView>(`${pagePath(key)}/versions/${number}/restore`, {}),
    /* Redirects. */
    redirects: () => http.get<SiteRedirectRow[]>("/site/redirects"),
    /** `content.addresses`. `toPath` is a site path or an https URL. */
    createRedirect: (input: NewRedirectInput) => http.post<SiteRedirectRow>("/site/redirects", input),
    /** `content.addresses`. */
    deleteRedirect: (id: string) => http.delete<{ message?: string }>(`/site/redirects/${encodeURIComponent(id)}`),
};
