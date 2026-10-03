import { api as http } from "@/lib/api-client";
import { apiConfig, isLive } from "@/lib/api-config";
import type { CampaignStatus } from "@/services/campaigns";
import type { OrderPlacedBy } from "@/types";

/**
 * Landing pages — Lot E (Q7/Q106), wired.
 *
 * The ADX page a campaign's QR code sends people to when the advertiser
 * gives no destination of their own. The advertiser drafts and publishes
 * it from their app; the console reviews what is live and is the only
 * party that can take one down — `POST /campaigns/:id/landing-page/unpublish`
 * with a reason the advertiser reads in their inbox.
 *
 * The read is the list contract: `GET /campaigns/landing-pages?status=`
 * answers `items`, `total`, `page`, `pageSize` and `counts` by status, each
 * row with its campaign and advertiser joined. Two statuses only — a page
 * is DRAFT or PUBLISHED; there is no flagged state on the row, and the desk
 * does not invent one.
 *
 * `GET /p/:slug` is the public render, at the API origin's root rather
 * than under `/api/v1`. It answers only for a PUBLISHED page — a DRAFT is
 * no page — so the preview draws the blocks itself and offers the live
 * document beside them.
 */

export type LandingPageStatus = "DRAFT" | "PUBLISHED";
export const LANDING_PAGE_STATUSES: readonly LandingPageStatus[] = ["DRAFT", "PUBLISHED"];

export const LANDING_PAGE_STATUS_META: Record<LandingPageStatus, { label: string; tone: "success" | "neutral" }> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    PUBLISHED: { label: "Published", tone: "success" },
};

/** The five closed block shapes the backend renders — `landingBlockSchema`. */
export type LandingBlock =
    | { type: "hero"; headline: string; subheadline?: string; imageUrl?: string | null }
    | { type: "offer"; title: string; body: string; highlight?: string }
    | { type: "cta"; label: string; href?: string | null }
    | { type: "contact"; phone?: string; email?: string; address?: string; hours?: string; note?: string; formEnabled: boolean }
    | { type: "gallery"; images: { url: string; alt?: string }[]; placeholders: number };

export interface LandingTheme {
    primaryColor?: string;
    accentColor?: string;
    font?: "sans" | "serif";
}

/** One row of `GET /campaigns/landing-pages`, the campaign beside it. */
export interface LandingPageRow {
    id: string;
    campaignId: string;
    slug: string;
    blocks: LandingBlock[];
    theme: LandingTheme | null;
    version: number;
    status: LandingPageStatus;
    generatedByAi: boolean;
    publishedAt: string | null;
    createdByUserId: string;
    createdAt: string;
    updatedAt: string;
    campaign: {
        id: string;
        reference: string;
        name: string;
        status: CampaignStatus;
        advertiserId: string;
        advertiser: { id: string; name: string; companyName: string | null };
    } | null;
    /*
     * 2 Oct 2026 — the admin list's added columns, each optional so the
     * table draws before the backend sends them.
     */
    /** The advertiser in the orders' `placedBy` shape — business + ADV-…, person + ADX-…. */
    advertiser?: OrderPlacedBy | null;
    /** The hero block's headline, read on the server so the list need not carry the blocks. */
    heroTitle?: string | null;
    /** Lifetime counts off the page's tracking events. */
    views?: number | null;
    ctaClicks?: number | null;
    enquiries?: number | null;
}

/** The page's title: the server's hero title, else the hero block's headline, else the slug. */
export function landingTitle(row: Pick<LandingPageRow, "heroTitle" | "blocks" | "slug">): string {
    if (row.heroTitle?.trim()) return row.heroTitle.trim();
    const hero = (row.blocks ?? []).find((block): block is Extract<LandingBlock, { type: "hero" }> => block.type === "hero");
    return hero?.headline?.trim() || `/p/${row.slug}`;
}

/**
 * The advertiser in the shared party shape — the row's own `advertiser`
 * when the server sends it, else the narrow join the list has always
 * carried (business name only, no person, no ids beyond the profile's).
 */
export function landingAdvertiser(row: Pick<LandingPageRow, "advertiser" | "campaign">): OrderPlacedBy | null {
    if (row.advertiser !== undefined) return row.advertiser;
    const joined = row.campaign?.advertiser;
    if (!joined) return null;
    return {
        userId: "",
        name: joined.name,
        displayId: null,
        business: { id: joined.id, name: joined.companyName ?? joined.name, displayId: null },
    };
}

export interface LandingPagesPage {
    items: LandingPageRow[];
    total: number;
    page: number;
    pageSize: number;
    counts: Partial<Record<LandingPageStatus, number>>;
}

/** The query string the list takes, with nothing sent that was not asked for. `q` (2 Oct 2026) matches the campaign, the advertiser and the slug. */
export function landingPagesPath(query: { status?: LandingPageStatus; q?: string; page?: number; pageSize?: number } = {}): string {
    const params = new URLSearchParams();
    if (query.status) params.set("status", query.status);
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.page && query.page > 1) params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize ?? 50));
    return `/campaigns/landing-pages?${params.toString()}`;
}

/**
 * Where the public render lives: the API origin's root, not `/api/v1`.
 * `https://api.adx.in/api/v1` serves the page at `https://api.adx.in/p/:slug`.
 */
export function previewUrl(slug: string): string {
    const origin = apiConfig.baseUrl.replace(/\/api\/v\d+$/, "");
    return `${origin}/p/${encodeURIComponent(slug)}`;
}

/** The trimmed reason the unpublish takes, or null when it is too short to send (the schema wants three characters). */
export function unpublishReason(raw: string): string | null {
    const reason = raw.trim();
    return reason.length >= 3 ? reason.slice(0, 500) : null;
}

/** What the page is made of, for the row — "hero, offer, cta, contact, gallery". */
export function blockSummary(blocks: LandingBlock[]): string {
    const counts = new Map<string, number>();
    for (const block of blocks) counts.set(block.type, (counts.get(block.type) ?? 0) + 1);
    return [...counts.entries()].map(([type, count]) => (count === 1 ? type : `${type} ×${count}`)).join(", ");
}

function live() {
    if (!isLive("campaigns")) throw new Error("Landing pages read the API; connect the console to the ADX backend first.");
    return http;
}

export const landingPageService = {
    list: (query: Parameters<typeof landingPagesPath>[0] = {}): Promise<LandingPagesPage> =>
        live().get<LandingPagesPage>(landingPagesPath(query)),

    /**
     * The one write. Back to DRAFT; the code keeps counting scans; the
     * campaign's creator is told why in their inbox. Addressed by the
     * campaign, because a campaign has at most one page.
     */
    unpublish: (campaignId: string, reason: string): Promise<LandingPageRow> =>
        live().post<LandingPageRow>(`/campaigns/${encodeURIComponent(campaignId)}/landing-page/unpublish`, { reason: reason.trim() }),

    /** One campaign's page with its blocks — the campaign page's Landing page card. 404 when the campaign has none. */
    get: (campaignId: string): Promise<LandingPageDetail> => live().get<LandingPageDetail>(`/campaigns/${encodeURIComponent(campaignId)}/landing-page`),
};

/** `GET /campaigns/:id/landing-page` — the row with its blocks and its public `url`. */
export interface LandingPageDetail {
    id: string;
    campaignId: string;
    slug: string;
    blocks: LandingBlock[];
    theme: LandingTheme | null;
    version: number;
    status: LandingPageStatus;
    generatedByAi: boolean;
    publishedAt: string | null;
    updatedAt: string;
    url?: string;
}
