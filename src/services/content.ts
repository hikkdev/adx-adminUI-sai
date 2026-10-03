import { api as http } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import type { StatusMeta } from "@/types";

/**
 * CT-1 (24 Sep 2026): the pages ADX writes itself.
 *
 * `legal` holds thirteen fixed documents, each a legal deliverable with its
 * own slot. This holds everything else: a help article, a guide, a policy
 * outside those thirteen, a page the website needs. A page is addressed by
 * its slug, so the desk adds one without a deploy, and every version is
 * kept — publishing an older one is the rollback.
 */

export const CONTENT_CATEGORIES = ["PAGE", "HELP", "GUIDE", "POLICY", "NEWS"] as const;
export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

export const CATEGORY_META: Record<ContentCategory, { label: string; blurb: string }> = {
    PAGE: { label: "Pages", blurb: "A standing page — How it works, For publishers, Careers" },
    HELP: { label: "Help articles", blurb: "One answer in the help centre" },
    GUIDE: { label: "Guides", blurb: "A how-to with steps" },
    POLICY: { label: "Policies", blurb: "A policy the thirteen legal documents do not cover" },
    NEWS: { label: "News", blurb: "Something dated — a release note, an announcement in full" },
};

export const CONTENT_SURFACES = ["WEBSITE", "APP_USER", "APP_AGENT", "CONSOLE"] as const;
export type ContentSurface = (typeof CONTENT_SURFACES)[number];

export const SURFACE_LABEL: Record<ContentSurface, string> = {
    WEBSITE: "Website",
    APP_USER: "User app",
    APP_AGENT: "Agent app",
    CONSOLE: "Admin console",
};

export type PageState = "DRAFT" | "PUBLISHED" | "RETIRED";

export const STATE_META: Record<PageState, StatusMeta> = {
    DRAFT: { label: "Draft", tone: "warning" },
    PUBLISHED: { label: "Live", tone: "success" },
    RETIRED: { label: "Retired", tone: "neutral" },
};

export interface ContentPage {
    id: string;
    slug: string;
    version: number;
    category: ContentCategory;
    title: string;
    summary: string | null;
    body: string;
    surfaces: string[];
    tags: string[];
    seoTitle: string | null;
    seoDescription: string | null;
    sortOrder: number;
    isActive: boolean;
    publishedAt: string | null;
    retiredAt: string | null;
    createdByUserId: string | null;
    changeNote: string | null;
    createdAt: string;
    updatedAt: string;
    state: PageState;
}

export interface NewPageInput {
    slug: string;
    category: ContentCategory;
    title: string;
    summary?: string;
    body: string;
    surfaces?: string[];
    tags?: string[];
    seoTitle?: string;
    seoDescription?: string;
    sortOrder?: number;
    changeNote?: string;
    publish?: boolean;
}

/** The slug a title suggests — the same rule the server applies before it stores one. */
export function slugify(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RESERVED_SLUGS = ["pages", "index"];

/** Why this slug cannot be used, or null. */
export function slugProblem(slug: string): string | null {
    if (!slug) return "A page needs an address.";
    if (!SLUG_PATTERN.test(slug)) return "Lowercase letters, digits and single hyphens — “how-it-works”.";
    if (RESERVED_SLUGS.includes(slug)) return `“${slug}” is reserved.`;
    return null;
}

/** One page, gathered from its versions: newest first, with the live one named. */
export interface PageGroup {
    slug: string;
    title: string;
    category: ContentCategory;
    versions: ContentPage[];
    live: ContentPage | null;
    /** Nothing live: never published, or taken down. */
    takenDown: boolean;
}

/**
 * The desk's rail: one entry per slug, the newest version's title, grouped
 * by category. A page whose newest version is a draft still shows its live
 * text as the live one — they are different versions of the same page.
 */
export function groupPages(pages: ContentPage[]): PageGroup[] {
    const bySlug = new Map<string, ContentPage[]>();
    for (const page of pages) {
        const list = bySlug.get(page.slug) ?? [];
        list.push(page);
        bySlug.set(page.slug, list);
    }
    const groups: PageGroup[] = [];
    for (const [slug, list] of bySlug) {
        const versions = [...list].sort((a, b) => b.version - a.version);
        const newest = versions[0]!;
        const live = versions.find((version) => version.isActive) ?? null;
        groups.push({
            slug,
            title: (live ?? newest).title,
            category: (live ?? newest).category,
            versions,
            live,
            takenDown: live === null && versions.some((version) => version.publishedAt !== null),
        });
    }
    return groups.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * The draft waiting on a page: its newest version, when that is a draft.
 * An older draft left behind a later published version is history, not
 * the next thing to publish — publishing it would roll the page back.
 */
export const latestDraft = (group: Pick<PageGroup, "versions">): ContentPage | null => (group.versions[0]?.state === "DRAFT" ? group.versions[0] : null);

/** The next version number for a slug — what a new draft will be. */
export const nextVersion = (versions: ContentPage[]): number => (versions[0]?.version ?? 0) + 1;

/** This screen reads the API or says it cannot; there is no seeded stand-in. */
export const contentReadsApi = (): boolean => apiConfig.live;

export const contentService = {
    /** Every version of every page — the desk's list. */
    list: (slug?: string) => http.get<ContentPage[]>(`/content/pages${slug ? `?slug=${encodeURIComponent(slug)}` : ""}`),
    get: (id: string) => http.get<ContentPage>(`/content/pages/${id}`),
    /** A new version. The slug decides which page it belongs to; a new slug starts a page. */
    create: (input: NewPageInput) => http.post<ContentPage>("/content/pages", input),
    /** Only a draft's text may change. */
    update: (id: string, patch: Partial<Omit<NewPageInput, "slug" | "publish">>) => http.patch<ContentPage>(`/content/pages/${id}`, patch),
    discard: (id: string) => http.delete<{ message: string }>(`/content/pages/${id}`),
    /** Makes a version live; an older version published again is the rollback. */
    publish: (id: string) => http.post<ContentPage>(`/content/pages/${id}/publish`, {}),
    /** Takes the live version down: the page 404s until something is published again. */
    unpublish: (id: string) => http.post<ContentPage>(`/content/pages/${id}/unpublish`, {}),
};
