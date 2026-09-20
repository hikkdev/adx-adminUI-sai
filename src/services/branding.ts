import { api } from "@/lib/api-client";

/**
 * QR-9 (17 Sep 2026): the brand — DR 11 by default, retuned from Settings ›
 * Brand & theme — as `GET /app/branding` answers it to anyone, before
 * sign-in. QR-11: the retune is a draft until published; this file also
 * carries the manager's reads and writes (`brandManagerService`) and the
 * colour maths the page shares with the backend, so the previews and the
 * legibility checks are live as you type and agree with what Publish
 * records.
 *
 * The console draws the wordmark in the header and on the sign-in card,
 * the mark as the favicon, and sets its primary colour from `primaryColor`
 * (`BrandProvider` writes the CSS variables). `version` changes with any
 * field; the provider re-reads on load and after a publish.
 */
export interface BrandWebsite {
    taglines: string[];
    heroImageUrl: string | null;
    ogImageUrl: string | null;
    faviconUrl: string | null;
    /** QR-12: the `<title>` and the meta description. */
    title: string;
    description: string;
}

export interface Brand {
    platformName: string;
    tagline: string;
    primaryColor: string;
    deepColor: string;
    inkColor: string;
    groundColor: string;
    /** QR-11: what is written on the primary — white, or the ink when that reads better. */
    onPrimaryColor: string;
    wordmarkUrl: string;
    wordmarkInverseUrl: string;
    markUrl: string;
    markInverseUrl: string;
    iconUrl: string;
    /** QR-11: the website kit. */
    website: BrandWebsite;
    /** QR-12: the phones' launcher icon for the next build — null means DR 11's, already baked. */
    apps: { iconUrl: string | null };
    /** QR-12: the console's tab title. */
    console: { title: string };
    /** The fields still on DR 11's defaults. */
    defaults: string[];
    version: string;
}

/** What the console draws before the read answers, and when it cannot: DR 11, from the bundled files. */
export const BRAND_FALLBACK: Brand = {
    platformName: "ADX",
    tagline: "Space that gets seen.",
    primaryColor: "#E40209",
    deepColor: "#BD2020",
    inkColor: "#0F0F0F",
    groundColor: "#F5F5F5",
    onPrimaryColor: "#FFFFFF",
    wordmarkUrl: "/brand/adx-wordmark-red.svg",
    wordmarkInverseUrl: "/brand/adx-wordmark-white.svg",
    markUrl: "/brand/adx-mark-red.svg",
    markInverseUrl: "/brand/adx-mark-white.svg",
    iconUrl: "/brand/adx-icon-tile.svg",
    website: {
        taglines: ["Space that gets seen.", "Own the city.", "Real world. Real reach."],
        heroImageUrl: null,
        ogImageUrl: null,
        faviconUrl: "/brand/adx-icon-tile.svg",
        title: "ADX — Space that gets seen.",
        description: "Real-world ad space, booked like a room: hoardings, screens, walls and windows across India, listed by the people who own them.",
    },
    apps: { iconUrl: null },
    console: { title: "ADX Admin" },
    defaults: [],
    version: "bundled",
};

/** DR 11's four colours, and DR 09's primary — the presets the colour section offers. */
export const DR11_COLOURS = { primaryColor: "#E40209", deepColor: "#BD2020", inkColor: "#0F0F0F", groundColor: "#F5F5F5" } as const;
export const DR09_PRIMARY = "#8D0B0C";

// ── colour maths (the backend's, repeated so the page is live as you type) ──

export const HEX = /^#[0-9a-fA-F]{6}$/;

function toRgb(hex: string): [number, number, number] {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** `a` mixed towards `b` by `amount` (0 = a, 1 = b), as `#RRGGBB`. */
export function mix(a: string, b: string, amount: number): string {
    const [ar, ag, ab] = toRgb(a);
    const [br, bg, bb] = toRgb(b);
    const part = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
    return `#${part(ar + (br - ar) * amount)}${part(ag + (bg - ag) * amount)}${part(ab + (bb - ab) * amount)}`.toUpperCase();
}

export function luminance(hex: string): number {
    const channel = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const [r, g, b] = toRgb(hex);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** White on the primary unless the ink reads better there — the backend's and the phones' rule. */
export function onPrimaryFor(primary: string, ink: string): string {
    return contrastRatio(primary, "#FFFFFF") >= contrastRatio(primary, ink) ? "#FFFFFF" : ink;
}

export type BrandCheckLevel = "ok" | "warn" | "fail";

export interface BrandCheck {
    key: "text-on-primary" | "primary-on-ground" | "ink-on-ground" | "white-on-deep";
    label: string;
    pair: [string, string];
    ratio: number;
    level: BrandCheckLevel;
    message: string;
}

/** The backend's four legibility checks, on whatever colours the form holds right now. */
export function brandChecks(b: Pick<Brand, "primaryColor" | "onPrimaryColor" | "inkColor" | "groundColor" | "deepColor">): BrandCheck[] {
    const round = (n: number) => Math.round(n * 10) / 10;
    const grade = (ratio: number, fail: number, warn: number): BrandCheckLevel => (ratio < fail ? "fail" : ratio < warn ? "warn" : "ok");
    const one = (key: BrandCheck["key"], label: string, pair: [string, string], fail: number, warn: number, said: Record<BrandCheckLevel, string>): BrandCheck => {
        const ratio = round(contrastRatio(pair[0], pair[1]));
        const level = grade(ratio, fail, warn);
        return { key, label, pair, ratio, level, message: said[level] };
    };
    return [
        one("text-on-primary", "Button labels on the primary", [b.onPrimaryColor, b.primaryColor], 3, 4.5, {
            ok: "Reads well.",
            warn: "Readable, but under the 4.5 : 1 body-text bar — keep button labels bold.",
            fail: "Too faint: the label on every primary button will be hard to read.",
        }),
        one("primary-on-ground", "Links and icons on the page", [b.primaryColor, b.groundColor], 2, 3, {
            ok: "Reads well.",
            warn: "Faint: red links and icons will not stand out on the page.",
            fail: "Nearly invisible on the page — links, active tabs and icons will disappear.",
        }),
        one("ink-on-ground", "Body text on the page", [b.inkColor, b.groundColor], 4.5, 7, {
            ok: "Reads well.",
            warn: "Passes, but small text will tire the eye.",
            fail: "Below 4.5 : 1 — body text on every page will be hard to read.",
        }),
        one("white-on-deep", "The white mark on the deep colour", ["#FFFFFF", b.deepColor], 2, 3, {
            ok: "Reads well.",
            warn: "Faint: the mark on the icon tile and the inverse lockups will look washed out.",
            fail: "The white mark will vanish on the icon tile.",
        }),
    ];
}

/** `#RRGGBB` → the `H S% L%` triple shadcn's `--primary` variable takes. */
export function hexToHslTriple(hex: string): string | null {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
    if (!m) return null;
    const [r, g, b] = [m[1], m[2], m[3]].map((part) => parseInt(part!, 16) / 255) as [number, number, number];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return `0 0% ${Math.round(l * 100)}%`;
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
    return `${Math.round(h * 10) / 10} ${Math.round(s * 1000) / 10}% ${Math.round(l * 1000) / 10}%`;
}

export const brandingService = {
    /** Public: no token, so the sign-in page can draw the brand too. */
    current: (): Promise<Brand> => api.get<Brand>("/app/branding", { anonymous: true }),
};

// ── QR-11: the manager ──────────────────────────────────────────────────────

/** The draft as stored — every key, null where DR 11 is in force; `taglines` is a list. */
export type BrandDraft = Record<string, string | string[] | null>;

export interface ReleaseSummary {
    number: number;
    version: string;
    note: string | null;
    publishedAt: string;
    publishedBy: { id: string; name: string | null } | null;
    platformName: string;
    tagline: string;
    colours: { primaryColor: string; deepColor: string; inkColor: string; groundColor: string };
    wordmarkUrl: string;
    markUrl: string;
    live: boolean;
}

export interface BrandManagerView {
    draft: BrandDraft;
    draftBrand: Brand;
    live: Brand;
    release: ReleaseSummary | null;
    dirty: boolean;
    checks: BrandCheck[];
}

export interface ReleasesPage {
    rows: ReleaseSummary[];
    total: number;
    page: number;
    pageSize: number;
}

/** What `PUT /branding/draft` takes: blank keeps, null clears back to DR 11. */
export type BrandDraftPatch = Partial<Record<string, string | string[] | null>>;

export const brandManagerService = {
    get: (): Promise<BrandManagerView> => api.get<BrandManagerView>("/branding"),
    saveDraft: (patch: BrandDraftPatch): Promise<BrandManagerView> => api.put<BrandManagerView>("/branding/draft", patch),
    publish: (note?: string): Promise<BrandManagerView> => api.post<BrandManagerView>("/branding/publish", note ? { note } : {}),
    releases: (page = 1, pageSize = 20): Promise<ReleasesPage> => api.get<ReleasesPage>(`/branding/releases?page=${page}&pageSize=${pageSize}`),
    restore: (number: number): Promise<BrandManagerView> => api.post<BrandManagerView>(`/branding/releases/${number}/restore`, {}),
};
