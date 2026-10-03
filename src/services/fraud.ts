import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { SCOPES_BY_PARTY, type SuspensionPartyType, type SuspensionScope } from "@/services/suspension";
import type { StatusMeta } from "@/types";

/**
 * Fraud cases — Lot D (Q54/Q92/Q121), wired to the backend `fraud` module.
 *
 * A case is a record: a subject (one of the four parties `suspension`
 * knows), a kind, a summary, the notes and evidence gathered while it is
 * worked, and a decision. The decision is the only thing that touches the
 * party, and it does so through the suspension module — CONFIRMED applies
 * scopes with the case number as the reason (BLOCK_NEW + FREEZE_WALLET by
 * default), DISMISSED lifts exactly what this case applied.
 *
 * The seeded `FR-*` cases are gone rather than kept: their fraud score, link
 * graph, shared signals and value at risk were fields no `FraudCase` had,
 * and their statuses ("escalated to legal", "accounts suspended") named
 * moves the backend never had. With the API off the desk says so.
 *
 * Lot G (Q118/138, package CG2) gave the case what the frame drew: an
 * explainable score over thirteen signals (`POST …/score`, stored on the
 * row), the accounts those signals tie the party to (`GET …/linked`,
 * computed now), an escalation with a note and a named admin
 * (`POST …/escalate` → ESCALATED, a working status), and a scan over a
 * party with no case (`POST /fraud/scan/:type/:id`, stored nowhere). The
 * shaping for the signals card and the link graph lives here so the tests
 * pin it without a DOM.
 */

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export type FraudCaseStatus = "OPEN" | "INVESTIGATING" | "ESCALATED" | "CONFIRMED" | "DISMISSED";

export const FRAUD_CASE_STATUSES: readonly FraudCaseStatus[] = ["OPEN", "INVESTIGATING", "ESCALATED", "CONFIRMED", "DISMISSED"];

export const FRAUD_CASE_STATUS_META: Record<FraudCaseStatus, StatusMeta> = {
    OPEN: { label: "Open", tone: "warning" },
    INVESTIGATING: { label: "Investigating", tone: "info" },
    /** Lot G (Q118): handed up with a note — still open; notes, evidence and the decision continue. */
    ESCALATED: { label: "Escalated to legal", tone: "danger" },
    CONFIRMED: { label: "Confirmed — suspended", tone: "danger" },
    DISMISSED: { label: "Dismissed", tone: "neutral" },
};

/** OPEN, INVESTIGATING or ESCALATED — the backend's own definition of "open" for the scan and the dispute link. */
export const OPEN_FRAUD_STATUSES: readonly FraudCaseStatus[] = ["OPEN", "INVESTIGATING", "ESCALATED"];

/** The subject is one of the four parties a suspension can land on. */
export type FraudSubjectType = SuspensionPartyType;

export const FRAUD_SUBJECT_TYPES: readonly FraudSubjectType[] = ["LISTING", "PUBLISHER", "ADVERTISER", "AGENT"];

/** Where the subject's own page is. */
export const SUBJECT_PATH: Record<FraudSubjectType, string> = {
    LISTING: "/listings",
    PUBLISHER: "/publishers",
    ADVERTISER: "/advertisers",
    AGENT: "/agents",
};

export const subjectHref = (subjectType: FraudSubjectType, subjectId: string): string =>
    `${SUBJECT_PATH[subjectType]}/${encodeURIComponent(subjectId)}`;

/** Decision 121: the wallet freeze is the FREEZE_WALLET scope; a confirmed case blocks new work and freezes the money by default. */
export const DEFAULT_CONFIRMED_SCOPES: readonly SuspensionScope[] = ["BLOCK_NEW", "FREEZE_WALLET"];

/**
 * Which scopes a confirmation may apply to this subject: the suspend
 * dialog's own per-party table, so a listing is never offered a wallet
 * freeze, and the default pair narrowed the same way.
 */
export const confirmableScopes = (subjectType: FraudSubjectType): SuspensionScope[] =>
    [...SCOPES_BY_PARTY[subjectType]];

export const defaultScopesFor = (subjectType: FraudSubjectType): SuspensionScope[] =>
    DEFAULT_CONFIRMED_SCOPES.filter((scope) => SCOPES_BY_PARTY[subjectType].includes(scope));

/** The bounds the schemas put on the free text. */
export const FRAUD_KIND_MIN = 2;
export const FRAUD_SUMMARY_MIN = 10;
export const FRAUD_DECISION_MIN = 3;

/* ------------------------------------------------------------------ */
/* The wire                                                            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Signals — Lot G (Q118/138)                                          */
/* ------------------------------------------------------------------ */

/** The party types a shared signal can link — a listing resolves to its publisher before evaluation. */
export type LinkedPartyType = "PUBLISHER" | "ADVERTISER" | "AGENT";

export interface LinkedParty {
    type: LinkedPartyType;
    id: string;
    name: string | null;
}

/**
 * One stored signal on `FraudCase.signals` (and one row of a scan): a fixed
 * key, its weight, a value 0..1 (null when it could not be computed here —
 * the photo hash without a decoder), one line of detail, and the accounts
 * it tied the subject to.
 */
export interface FraudSignal {
    key: string;
    weight: number;
    value: number | null;
    detail: string;
    links?: LinkedParty[];
    /** G13-B: the parties the signal compared against, matched or not — at most 20 per signal. */
    candidates?: LinkedParty[];
}

/** What the desk calls each signal key. An unknown key (a signal added since) prints as itself. */
export const SIGNAL_LABEL: Record<string, string> = {
    SHARED_PAN: "PAN number",
    SHARED_BANK: "Payout account",
    SHARED_IP_SUBNET: "IP subnet",
    SHARED_PHONE_ACROSS_ROLES: "Mobile across roles",
    SHARED_DEVICE: "Device fingerprint",
    BANK_NAME_MISMATCH: "Payout account in another name",
    DUPLICATE_LISTING_PHOTOS: "Duplicate listing photos",
    PROOF_FAR_FROM_SITE: "Installation proofs far from site",
    SELF_DEALING: "Self-dealing",
    COMMISSION_FARMING: "Commission farming",
    REFUND_DISPUTE_RATE: "Refund and dispute rate",
    WITHDRAW_AFTER_CREDIT: "Withdrawal straight after credit",
    LISTING_VELOCITY: "Listing velocity",
};

export const signalLabel = (key: string): string => SIGNAL_LABEL[key] ?? key;

/** One row of the SHARED SIGNALS card. */
export interface SignalRow {
    key: string;
    label: string;
    weight: number;
    /** Null when the signal could not be computed — shown, adds nothing. */
    value: number | null;
    /** `weight × value`, what this signal put on the score; 0 while null. */
    contribution: number;
    detail: string;
    /** The distinct accounts this signal tied the subject to. */
    links: LinkedParty[];
}

/**
 * The SHARED SIGNALS card: every signal that is present — a value above
 * zero, or null (the platform could not compute it and says so) — with its
 * weight, value, detail and the accounts it names, strongest first. A
 * signal that read 0 is absent and is not listed: the card says what was
 * found, not what was looked for.
 */
export function shapeSignals(signals: readonly FraudSignal[] | null | undefined): SignalRow[] {
    if (!signals) return [];
    return signals
        .filter((signal) => signal.value === null || signal.value > 0)
        .map((signal) => ({
            key: signal.key,
            label: signalLabel(signal.key),
            weight: signal.weight,
            value: signal.value,
            contribution: signal.value === null ? 0 : Math.round(signal.weight * signal.value * 1000) / 1000,
            detail: signal.detail,
            links: dedupeParties(signal.links ?? []),
        }))
        .sort((a, b) => b.contribution - a.contribution || (a.value === null ? 1 : 0) - (b.value === null ? 1 : 0));
}

const partyKey = (party: { type: string; id: string }) => `${party.type}:${party.id}`;

function dedupeParties(parties: readonly LinkedParty[]): LinkedParty[] {
    const seen = new Map<string, LinkedParty>();
    for (const party of parties) if (!seen.has(partyKey(party))) seen.set(partyKey(party), party);
    return [...seen.values()];
}

/** The distinct accounts the stored signals name — what a queue row prints as "N accounts" without the linked read. */
export function linkedPartiesOf(signals: readonly FraudSignal[] | null | undefined): LinkedParty[] {
    return dedupeParties((signals ?? []).flatMap((signal) => signal.links ?? []));
}

/** "0.912" → "0.91"; null → null. The column is DECIMAL(4,3); the frame prints two places. */
export function formatScore(score: string | null | undefined): string | null {
    if (score === null || score === undefined) return null;
    const value = Number(score);
    return Number.isFinite(value) ? value.toFixed(2) : null;
}

/* ------------------------------------------------------------------ */
/* Linked accounts and the graph                                       */
/* ------------------------------------------------------------------ */

/** The subject as the scan and the linked read summarise it — never the PAN itself. */
export interface SubjectSummary {
    type: LinkedPartyType;
    id: string;
    name: string | null;
    kycStatus: string | null;
    /** A LISTING subject keeps the listing it came from. */
    listingId: string | null;
}

/**
 * One account the shared signals tie the subject to, every signal that does
 * so, and (G11-1) what is at stake on it: its wallet balance as money (null
 * when it holds no wallet) and how many of its orders are still open.
 */
export interface LinkedAccount {
    party: LinkedParty;
    via: string[];
    walletBalance: string | null;
    openBookings: number;
    /** 28 Sep 2026: the party's KYC status, for the graph's hover card. Absent from a server one release behind. */
    kycStatus?: string | null;
}

/**
 * 28 Sep 2026: one shared attribute on the linked read — a thing the
 * subject and some linked accounts both hold, one per linking signal that
 * tied anybody. `display` is MASKED by the server ("PAN ••••234F",
 * "HDFC ••4821", "Device 4f2a", "103.21.58.x/24", "Mobile ••3210", or the
 * label for any other signal) and is never a full PAN, account number,
 * mobile or address; the desk re-checks it (`maskedDisplay`) before drawing.
 * `accounts` is how many LINKED accounts share it — the subject not counted.
 */
export interface SharedAttribute {
    signal: string;
    label: string;
    display: string;
    accounts: number;
}

/**
 * `GET /fraud/cases/:id/linked` — computed now, most-linked first. G11-1:
 * `valueAtRisk` is every linked wallet's balance plus every linked open
 * order's value, as money — the accounts around the case, never the
 * subject's own figures.
 */
export interface LinkedAccountsRead {
    subject: SubjectSummary;
    linked: LinkedAccount[];
    /**
     * G13-B: the parties the last scoring compared the subject against
     * without a link — the graph's "Clean" nodes — the subject and anything
     * linked now taken out; `[]` on a case never scored. Absent from a
     * server one release behind.
     */
    evaluated?: { party: LinkedParty; linked: false }[];
    /**
     * 28 Sep 2026: the graph's shared-attribute nodes, masked. Absent from a
     * server one release behind — the graph then derives one node per signal
     * key the linked accounts' `via` carries (`graphAttributes`).
     */
    attributes?: SharedAttribute[];
    valueAtRisk: string;
    computedAt: string;
}

/* ------------------------------------------------------------------ */
/* The link graph — bipartite, 28 Sep 2026                             */
/* ------------------------------------------------------------------ */

/*
 * DR 10 frame 5102:27407 draws the linked accounts as a bipartite graph:
 * account nodes (red ring, two letters, the name under the circle) joined by
 * plain grey lines to SHARED-ATTRIBUTE nodes (amber: "PAN ••••1234 · shared
 * by 4", "Device 4f2a", "HDFC ••4821"), with the accounts the scoring
 * compared and cleared standing apart on the right, grey, "Zepto · no link".
 * No edge carries a label: what ties two accounts is the node between them.
 *
 * The star the desk drew before — every account on one ring, every edge
 * captioned with its signals — printed "IP subnet" fifteen times over itself
 * once fifteen accounts shared a subnet. The layout below is laid out for
 * the card's real width (the view measures it), in rows rather than a ring,
 * and a collision pass guarantees no two drawn captions overlap: a caption is
 * the name only, truncated to its room, nudged above its node when the room
 * below is taken, and hidden (shown on hover and focus) as a last resort.
 */

/** A pure-geometry box — a caption's footprint, in the SVG's own pixels. */
export interface GraphBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type GraphNodeKind = "subject" | "account" | "attribute" | "clean" | "more";

export interface GraphNode {
    key: string;
    kind: GraphNodeKind;
    /** The party behind a subject, account or clean node; null on an attribute or "+N more". */
    party: LinkedParty | null;
    /** The signal an attribute node stands for; null otherwise. */
    signal: string | null;
    /** The attribute itself, masked (an attribute node only). */
    attribute: SharedAttribute | null;
    /** What sits in the circle: two letters, an attribute's glyph, "+N". */
    initials: string;
    x: number;
    y: number;
    /** The caption in full — the tooltip and the hover card read it. */
    title: string;
    /** The caption as drawn, one or two lines, truncated to its room; empty when there is none. */
    caption: string[];
    /** Where the caption's lines are centred (clamped into the card), and the first line's baseline. */
    captionX: number;
    captionY: number;
    /** The drawn caption's footprint; null when hidden. */
    captionBox: GraphBox | null;
    /** The collision pass could not place it: drawn only while the node is hovered or focused. */
    captionHidden: boolean;
    /** Higher places its caption first. */
    priority: number;
    /** An account's signal keys; an attribute's own key; "+N more"'s union. */
    via: string[];
    /** G11-1 exposure and the party's KYC — null where the read does not carry them. */
    walletBalance: string | null;
    openBookings: number | null;
    kycStatus: string | null;
    /** An attribute's linked accounts; the accounts or clean parties a "+N more" stands for. */
    count: number | null;
    /** "+N more": which list it points at. */
    moreOf: "accounts" | "clean" | null;
}

export interface GraphEdge {
    from: string;
    to: string;
    /** "+N more" joins the attributes its accounts share with a dashed line. */
    dashed: boolean;
}

export interface FraudGraph {
    width: number;
    height: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
    attributes: SharedAttribute[];
    /** Linked accounts past the cap — the "+N more" node's; the Linked accounts table lists every one. */
    undrawn: LinkedAccount[];
    /** Clean parties past what the column holds. */
    undrawnClean: LinkedParty[];
}

export function partyInitials(name: string | null, fallback: string): string {
    const source = (name ?? "").trim();
    if (!source) return fallback.slice(0, 2).toUpperCase();
    const words = source.split(/\s+/).filter(Boolean);
    const letters = words.length >= 2 ? words[0][0] + words[1][0] : source.slice(0, 2);
    return letters.toUpperCase();
}

/**
 * A display value the server should have masked and did not: a whole PAN,
 * six digits in a row (an account number, a mobile), a whole IPv4 address,
 * or anything with an "@" (a UPI id, an email). The desk never draws one —
 * the attribute falls back to its label. Defence in depth; the server's
 * masks (`signals/shared-attributes.ts`) keep at most four characters.
 */
const UNMASKED: readonly RegExp[] = [/[A-Z]{5}\d{4}[A-Z]/i, /\d{6,}/, /\b\d{1,3}(?:\.\d{1,3}){3}\b/, /@/];

export const looksUnmasked = (display: string): boolean => UNMASKED.some((pattern) => pattern.test(display));

/** The display a node may print: the server's masked value, else the signal's label. */
export function maskedDisplay(attribute: { signal: string; display?: string | null; label?: string | null }): string {
    const label = attribute.label?.trim() || signalLabel(attribute.signal);
    const display = (attribute.display ?? "").trim();
    return display && !looksUnmasked(display) ? display : label;
}

/**
 * The graph's attribute nodes: the read's `attributes` (deduplicated by
 * signal, every display re-checked for masking), then — for a server a
 * release behind, or a signal it did not name — one per distinct signal key
 * the linked accounts' `via` carries, labelled by the signal's label and
 * counting the accounts that carry it.
 */
export function graphAttributes(read: Pick<LinkedAccountsRead, "linked" | "attributes">): SharedAttribute[] {
    const out = new Map<string, SharedAttribute>();
    for (const attribute of read.attributes ?? []) {
        if (!attribute?.signal || out.has(attribute.signal)) continue;
        out.set(attribute.signal, {
            signal: attribute.signal,
            label: attribute.label?.trim() || signalLabel(attribute.signal),
            display: maskedDisplay(attribute),
            accounts: Math.max(0, Math.round(attribute.accounts ?? 0)),
        });
    }
    const counts = new Map<string, number>();
    for (const account of read.linked) for (const key of new Set(account.via)) counts.set(key, (counts.get(key) ?? 0) + 1);
    for (const [key, count] of counts) {
        if (!out.has(key)) out.set(key, { signal: key, label: signalLabel(key), display: signalLabel(key), accounts: count });
    }
    return [...out.values()];
}

/** One attribute and every linked account that shares it — the narrow card's list, and the table's filter. */
export interface AttributeGroup {
    attribute: SharedAttribute;
    accounts: LinkedAccount[];
}

export function attributeGroups(read: Pick<LinkedAccountsRead, "linked" | "attributes">): AttributeGroup[] {
    return graphAttributes(read).map((attribute) => ({
        attribute,
        accounts: read.linked.filter((account) => account.via.includes(attribute.signal)),
    }));
}

/**
 * "shared with 4" — the other accounts that share the subject's attribute. The
 * same count as the Shared signals card, the "Accounts implicated" tile and the
 * Linked accounts table (28 Sep 2026: "shared by 5" beside "4 accounts" read
 * as two different answers — it had counted the subject too).
 */
export const sharedByLabel = (attribute: Pick<SharedAttribute, "accounts">): string => `shared with ${attribute.accounts}`;

/** The glyph in an attribute's circle — the frame's "ID" and "₹"; the view draws an icon for the rest. */
export const ATTRIBUTE_GLYPH: Record<string, string> = {
    SHARED_PAN: "ID",
    SHARED_BANK: "₹",
};

export const GRAPH_FONT_SIZE = 11;
export const GRAPH_NODE_RADIUS = 22;
export const GRAPH_MIN_HEIGHT = 320;
/** How many linked accounts the graph draws — most-linked first; the rest sit behind "+N more". */
export const GRAPH_MAX_ACCOUNTS = 12;
/**
 * Below this width the card lists the attribute groups instead of drawing
 * (the brief's "~560 px"): 520 keeps the drawing on a 900 px window, where
 * the card measures about 560, and the layout is tested readable at 540.
 */
export const GRAPH_NARROW_WIDTH = 520;
/** The width the graph is laid out at before the card has been measured. */
export const GRAPH_DEFAULT_WIDTH = 760;

const CAPTION_GAP = 5;
const CAPTION_LINE = 14;
/** Where an 11 px line's baseline sits in its 14 px line box. */
const CAPTION_BASELINE = 11;
const ACCOUNT_SLOT = 96;
const ACCOUNT_SLOT_MAX = 150;
const ROW_STEP = 76;
const BAND_TO_ROW = 104;
const STAGGER = 84;
const ATTRIBUTE_MIN_SLOT = 124;
const CAPTION_MAX = 170;
const CAPTION_MIN = 30;
const EDGE_PAD = 8;
const TOP_PAD = 8;
const BOTTOM_PAD = 8;
const CLEAN_STEP = 72;
const CLEAN_MIN_W = 116;
const CLEAN_MAX_W = 168;
const CLEAN_MAX_ROWS = 6;
const NO_LINK = " · no link";

/**
 * The width a caption will take at 11 px Inter, over-estimated a touch so a
 * caption that passes here never crowds its neighbour on screen. Pure — the
 * layout cannot measure text, and the tests must not need a browser.
 */
export function estimateTextWidth(text: string, fontSize = GRAPH_FONT_SIZE): number {
    let em = 0;
    for (const ch of text) {
        if (" .,:;'!|il".includes(ch)) em += 0.3;
        else if ("fjrtI()[]-/".includes(ch)) em += 0.4;
        else if ("mwMW@%".includes(ch)) em += 0.88;
        else if (ch === "•") em += 0.5;
        else if (ch === "…") em += 0.9;
        else if (ch >= "A" && ch <= "Z") em += 0.7;
        else if (ch >= "0" && ch <= "9") em += 0.62;
        else if (ch >= "a" && ch <= "z") em += 0.57;
        else em += 0.75;
    }
    return Math.ceil(em * fontSize);
}

/** The text cut to fit `maxWidth`, with an ellipsis; "" when not even one letter fits. */
export function truncateToWidth(text: string, maxWidth: number, fontSize = GRAPH_FONT_SIZE): string {
    if (estimateTextWidth(text, fontSize) <= maxWidth) return text;
    const chars = [...text];
    for (let n = chars.length - 1; n >= 1; n -= 1) {
        const candidate = `${chars.slice(0, n).join("").trimEnd()}…`;
        if (estimateTextWidth(candidate, fontSize) <= maxWidth) return candidate;
    }
    return "";
}

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/**
 * Positions for a row: as near each target as the minimum gap allows, in
 * order, inside [lo, hi] — least squares under the gap constraint (pool
 * adjacent violators over `target − i × gap`), then clamped so the ends stay
 * in bounds without breaking the gap. `targets` must be ascending.
 */
function spread(targets: readonly number[], lo: number, hi: number, gap: number): number[] {
    const n = targets.length;
    if (n === 0) return [];
    const room = Math.max(0, hi - lo);
    const step = n > 1 ? Math.min(gap, room / (n - 1)) : gap;
    const blocks: { sum: number; count: number }[] = [];
    targets.forEach((target, i) => {
        blocks.push({ sum: target - i * step, count: 1 });
        while (blocks.length > 1) {
            const last = blocks[blocks.length - 1];
            const prev = blocks[blocks.length - 2];
            if (prev.sum / prev.count <= last.sum / last.count) break;
            prev.sum += last.sum;
            prev.count += last.count;
            blocks.pop();
        }
    });
    const out: number[] = [];
    for (const block of blocks) for (let k = 0; k < block.count; k += 1) out.push(block.sum / block.count + out.length * step);
    return out.map((x, i) => Math.round(clamp(x, lo + i * step, hi - (n - 1 - i) * step)));
}

interface Placeable {
    key: string;
    kind: "subject" | "account" | "more";
    target: number;
    priority: number;
    x: number;
    y: number;
    /** Room for the caption, from its neighbours in the row. */
    room: number;
}

const boxesOverlap = (a: GraphBox, b: GraphBox) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const boxHitsCircle = (box: GraphBox, cx: number, cy: number, r: number) => {
    const nx = clamp(cx, box.x, box.x + box.width);
    const ny = clamp(cy, box.y, box.y + box.height);
    return (nx - cx) ** 2 + (ny - cy) ** 2 < r * r;
};

/**
 * The link graph's layout, for a card `width` pixels wide — pure, so the
 * tests pin it without a browser.
 *
 * - The attribute nodes sit on a central band, evenly spaced across the main
 *   area; when there are too many for the width, every other one steps up
 *   (staggered) so their captions have twice the room.
 * - The subject and the linked accounts (most-linked first, at most
 *   `maxAccounts`, the rest behind a "+N more" node) sit in rows above and
 *   below the band, each as near the mean x of the attributes it shares as
 *   the row allows. The subject is always drawn, nearest the band above.
 * - Edges join each account to the attributes it shares (the subject to all
 *   of them); none is captioned.
 * - The clean parties (`evaluated`) stand in a column at the right edge with
 *   no edge, captioned "<name> · no link".
 * - Every caption is placed by priority — subject, attributes, accounts
 *   (most-linked first), "+N more", clean — below its node, else above it,
 *   else narrower, else hidden; no drawn caption overlaps another, or a
 *   circle, or leaves the card.
 */
export function fraudGraphLayout(
    read: Pick<LinkedAccountsRead, "subject" | "linked" | "evaluated" | "attributes">,
    options: { width: number; maxAccounts?: number; minHeight?: number }
): FraudGraph {
    const R = GRAPH_NODE_RADIUS;
    const width = Math.max(280, Math.round(options.width));
    const maxAccounts = Math.max(1, Math.floor(options.maxAccounts ?? GRAPH_MAX_ACCOUNTS));
    const minHeight = options.minHeight ?? GRAPH_MIN_HEIGHT;

    const attributes = graphAttributes(read);
    const subjectKey = partyKey(read.subject);
    const seen = new Set<string>([subjectKey]);
    const ordered = read.linked
        .map((account, index) => ({ account, index }))
        .filter(({ account }) => {
            const key = partyKey(account.party);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => b.account.via.length - a.account.via.length || a.index - b.index)
        .map(({ account }) => account);
    const drawn = ordered.slice(0, maxAccounts);
    const undrawn = ordered.slice(maxAccounts);
    const cleanAll = (read.evaluated ?? [])
        .map((row) => row.party)
        .filter((party) => {
            const key = partyKey(party);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

    /* The main area, and the clean column at the right edge. */
    const cleanW = cleanAll.length ? clamp(Math.round(width * 0.2), CLEAN_MIN_W, CLEAN_MAX_W) : 0;
    const left = EDGE_PAD;
    const right = width - EDGE_PAD - (cleanW ? cleanW + 12 : 0);
    const mainW = Math.max(ACCOUNT_SLOT, right - left);

    /* The attribute band. */
    const attrCount = attributes.length;
    const attrSlot = attrCount ? mainW / attrCount : mainW;
    const staggered = attrCount > 1 && attrSlot < ATTRIBUTE_MIN_SLOT;
    const attrX = attributes.map((_, i) => Math.round(left + attrSlot * (i + 0.5)));
    const attrIndex = new Map(attributes.map((attribute, i) => [attribute.signal, i]));
    const meanX = (signals: readonly string[]) => {
        const xs = signals.map((signal) => attrIndex.get(signal)).filter((i): i is number => i !== undefined).map((i) => attrX[i]);
        return xs.length ? xs.reduce((sum, x) => sum + x, 0) / xs.length : left + mainW / 2;
    };

    /* The accounts to place: the subject, the drawn accounts, and "+N more". */
    const undrawnVia = [...new Set(undrawn.flatMap((account) => account.via))];
    const placeables: Placeable[] = [
        { key: subjectKey, kind: "subject", target: meanX(attributes.map((a) => a.signal)), priority: 1000, x: 0, y: 0, room: 0 },
        ...drawn.map((account, i) => ({
            key: partyKey(account.party),
            kind: "account" as const,
            target: meanX(account.via),
            priority: 500 + account.via.length * 10 - i * 0.01,
            x: 0,
            y: 0,
            room: 0,
        })),
        ...(undrawn.length ? [{ key: "more:accounts", kind: "more" as const, target: meanX(undrawnVia), priority: 100, x: 0, y: 0, room: 0 }] : []),
    ];

    /* Sides: the subject above; the rest by x, each to the lighter side, so both sides span the width. */
    const above: Placeable[] = [placeables[0]];
    const below: Placeable[] = [];
    [...placeables.slice(1)]
        .sort((a, b) => a.target - b.target || b.priority - a.priority)
        .forEach((item) => (below.length < above.length ? below : above).push(item));
    const perRow = Math.max(1, Math.floor(mainW / ACCOUNT_SLOT));
    const toRows = (side: Placeable[]): Placeable[][] => {
        if (side.length === 0) return [];
        const rowCount = Math.ceil(side.length / perRow);
        const sorted = [...side].sort((a, b) => a.target - b.target || b.priority - a.priority);
        const rows: Placeable[][] = Array.from({ length: rowCount }, () => []);
        sorted.forEach((item, i) => rows[i % rowCount].push(item));
        /* The subject nearest the band. */
        const at = rows.findIndex((row) => row.some((item) => item.kind === "subject"));
        if (at > 0) {
            const subject = rows[at].find((item) => item.kind === "subject")!;
            const swap = [...rows[0]].sort((a, b) => Math.abs(a.target - subject.target) - Math.abs(b.target - subject.target))[0];
            rows[at] = rows[at].map((item) => (item === subject ? swap : item)).sort((a, b) => a.target - b.target);
            rows[0] = rows[0].map((item) => (item === swap ? subject : item)).sort((a, b) => a.target - b.target);
        }
        return rows;
    };
    const rowsAbove = toRows(above);
    const rowsBelow = toRows(below);

    /* Vertical rhythm, top-down; then centred when the card is taller than the content. */
    const lift = staggered ? STAGGER : 0;
    /* Nothing linked: the subject alone, centred (with the clean column beside it). */
    const noAttributes = attrCount === 0 && placeables.length === 1;
    let band = TOP_PAD + R + lift + (rowsAbove.length && !noAttributes ? BAND_TO_ROW + (rowsAbove.length - 1) * ROW_STEP : 0);
    const bottom = noAttributes
        ? band + R + CAPTION_GAP + CAPTION_LINE
        : rowsBelow.length
          ? band + BAND_TO_ROW + (rowsBelow.length - 1) * ROW_STEP + R + CAPTION_GAP + CAPTION_LINE
          : band + R + CAPTION_GAP + 2 * CAPTION_LINE;
    const contentHeight = bottom + BOTTOM_PAD;
    const cleanRows = Math.min(cleanAll.length, CLEAN_MAX_ROWS);
    const height = Math.max(minHeight, contentHeight, cleanRows ? cleanRows * CLEAN_STEP + TOP_PAD + BOTTOM_PAD : 0);
    band += Math.floor((height - contentHeight) / 2);

    const place = (rows: Placeable[][], direction: -1 | 1) => {
        rows.forEach((row, k) => {
            const y = noAttributes ? band : band + direction * (BAND_TO_ROW + k * ROW_STEP) - (direction < 0 ? lift : 0);
            const gap = clamp(mainW / row.length, ACCOUNT_SLOT, ACCOUNT_SLOT_MAX);
            const half = Math.min(gap, CAPTION_MAX) / 2;
            const xs = spread(
                row.map((item) => item.target),
                left + Math.max(R, half),
                right - Math.max(R, half),
                gap
            );
            row.forEach((item, i) => {
                item.x = xs[i];
                item.y = Math.round(y);
                const neighbour = Math.min(i > 0 ? xs[i] - xs[i - 1] : Infinity, i < xs.length - 1 ? xs[i + 1] - xs[i] : Infinity);
                item.room = Math.min(CAPTION_MAX, (Number.isFinite(neighbour) ? neighbour : gap) - 8);
            });
        });
    };
    place(rowsAbove, -1);
    place(rowsBelow, 1);

    /* Nodes. */
    const nodes: GraphNode[] = [];
    const blank = {
        party: null,
        signal: null,
        attribute: null,
        captionX: 0,
        captionY: 0,
        captionBox: null,
        captionHidden: false,
        via: [] as string[],
        walletBalance: null,
        openBookings: null,
        kycStatus: null,
        count: null,
        moreOf: null,
    };
    const rooms = new Map<string, number>();
    const byKey = new Map(placeables.map((item) => [item.key, item]));

    const subjectAt = byKey.get(subjectKey)!;
    const subjectTitle = read.subject.name?.trim() || read.subject.id;
    nodes.push({
        ...blank,
        key: subjectKey,
        kind: "subject",
        party: { type: read.subject.type, id: read.subject.id, name: read.subject.name },
        initials: partyInitials(read.subject.name, read.subject.id),
        x: noAttributes ? Math.round(left + mainW / 2) : subjectAt.x,
        y: subjectAt.y,
        title: subjectTitle,
        caption: [subjectTitle],
        priority: subjectAt.priority,
        via: attributes.map((attribute) => attribute.signal),
        kycStatus: read.subject.kycStatus,
    });
    rooms.set(subjectKey, subjectAt.room || CAPTION_MAX);

    attributes.forEach((attribute, i) => {
        const key = `attr:${attribute.signal}`;
        const odd = staggered && i % 2 === 1;
        const shared = sharedByLabel(attribute);
        nodes.push({
            ...blank,
            key,
            kind: "attribute",
            signal: attribute.signal,
            attribute,
            initials: ATTRIBUTE_GLYPH[attribute.signal] ?? "",
            x: attrX[i],
            y: odd ? band - STAGGER : band,
            title: `${attribute.display} · ${shared}`,
            caption: [attribute.display, shared],
            priority: 900 - i,
            via: [attribute.signal],
            count: attribute.accounts,
        });
        rooms.set(key, Math.min(CAPTION_MAX, (staggered ? 2 * attrSlot : attrSlot) - 8));
    });

    drawn.forEach((account) => {
        const key = partyKey(account.party);
        const at = byKey.get(key)!;
        const title = account.party.name?.trim() || account.party.id;
        nodes.push({
            ...blank,
            key,
            kind: "account",
            party: account.party,
            initials: partyInitials(account.party.name, account.party.id),
            x: at.x,
            y: at.y,
            title,
            caption: [title],
            priority: at.priority,
            via: [...account.via],
            walletBalance: account.walletBalance ?? null,
            openBookings: account.openBookings ?? null,
            kycStatus: account.kycStatus ?? null,
        });
        rooms.set(key, at.room);
    });

    if (undrawn.length) {
        const at = byKey.get("more:accounts")!;
        nodes.push({
            ...blank,
            key: at.key,
            kind: "more",
            initials: `+${undrawn.length}`,
            x: at.x,
            y: at.y,
            title: `${undrawn.length} more linked account${undrawn.length === 1 ? "" : "s"}`,
            caption: ["more"],
            priority: at.priority,
            via: undrawnVia,
            count: undrawn.length,
            moreOf: "accounts",
        });
        rooms.set(at.key, at.room);
    }

    /* The clean column. */
    const cleanFits = Math.max(1, Math.floor((height - TOP_PAD - BOTTOM_PAD) / CLEAN_STEP));
    const cleanDrawn = cleanAll.length > cleanFits ? cleanAll.slice(0, cleanFits - 1) : cleanAll;
    const undrawnClean = cleanAll.slice(cleanDrawn.length);
    const cleanSlots = cleanDrawn.length + (undrawnClean.length ? 1 : 0);
    const cleanX = Math.round(width - EDGE_PAD - cleanW / 2);
    const cleanTop = Math.round((height - (cleanSlots * CLEAN_STEP - (CLEAN_STEP - (2 * R + CAPTION_GAP + CAPTION_LINE)))) / 2) + R;
    cleanDrawn.forEach((party, i) => {
        const key = partyKey(party);
        const name = party.name?.trim() || party.id;
        const room = cleanW - 4;
        const cut = truncateToWidth(name, room - estimateTextWidth(NO_LINK));
        nodes.push({
            ...blank,
            key,
            kind: "clean",
            party,
            initials: partyInitials(party.name, party.id),
            x: cleanX,
            y: cleanTop + i * CLEAN_STEP,
            title: `${name}${NO_LINK}`,
            caption: [cut ? `${cut}${NO_LINK}` : "no link"],
            priority: 50 - i * 0.01,
        });
        rooms.set(key, room);
    });
    if (undrawnClean.length) {
        const key = "more:clean";
        nodes.push({
            ...blank,
            key,
            kind: "more",
            initials: `+${undrawnClean.length}`,
            x: cleanX,
            y: cleanTop + cleanDrawn.length * CLEAN_STEP,
            title: `${undrawnClean.length} more compared and cleared`,
            caption: ["more · no link"],
            priority: 40,
            count: undrawnClean.length,
            moreOf: "clean",
        });
        rooms.set(key, cleanW - 4);
    }

    /* Edges: no captions — what ties two accounts is the node between them. */
    const edges: GraphEdge[] = [];
    const hasAttr = new Set(attributes.map((attribute) => attribute.signal));
    for (const node of nodes) {
        if (node.kind !== "subject" && node.kind !== "account" && !(node.kind === "more" && node.moreOf === "accounts")) continue;
        for (const signal of new Set(node.via)) {
            if (hasAttr.has(signal)) edges.push({ from: node.key, to: `attr:${signal}`, dashed: node.kind === "more" });
        }
    }

    /* The collision pass: highest priority first; below, else above, else narrower, else hidden. */
    const placed: GraphBox[] = [];
    for (const node of [...nodes].sort((a, b) => b.priority - a.priority)) {
        const full = node.caption;
        if (full.length === 0) continue;
        const room = Math.max(CAPTION_MIN, rooms.get(node.key) ?? CAPTION_MAX);
        const widths = [room, Math.round(room * 0.75), Math.round(room * 0.55), CAPTION_MIN].filter((w, i, all) => w >= CAPTION_MIN && all.indexOf(w) === i);
        let done = false;
        for (const maxWidth of widths) {
            const lines = full.map((line) => (node.kind === "clean" && line.endsWith(NO_LINK) && estimateTextWidth(line) > maxWidth ? cleanCaption(line, maxWidth) : truncateToWidth(line, maxWidth)));
            if (lines.some((line) => !line)) continue;
            const w = Math.max(...lines.map((line) => estimateTextWidth(line))) + 4;
            const h = lines.length * CAPTION_LINE;
            const cx = clamp(node.x, w / 2 + 1, width - w / 2 - 1);
            for (const aboveNode of [false, true]) {
                const top = aboveNode ? node.y - R - CAPTION_GAP - h : node.y + R + CAPTION_GAP;
                const box: GraphBox = { x: cx - w / 2, y: top, width: w, height: h };
                if (box.y < 0 || box.y + box.height > height) continue;
                if (placed.some((other) => boxesOverlap(box, other))) continue;
                if (nodes.some((other) => other !== node && boxHitsCircle(box, other.x, other.y, R + 1))) continue;
                node.caption = lines;
                node.captionX = Math.round(cx);
                node.captionY = Math.round(top + CAPTION_BASELINE);
                node.captionBox = box;
                placed.push(box);
                done = true;
                break;
            }
            if (done) break;
        }
        if (!done) {
            node.captionHidden = true;
            node.captionBox = null;
            node.captionX = node.x;
            node.captionY = node.y + R + CAPTION_GAP + CAPTION_BASELINE;
        }
    }

    return { width, height, nodes, edges, attributes, undrawn, undrawnClean };
}

/** "Some Long Name · no link" cut in the name, never in " · no link". */
function cleanCaption(line: string, maxWidth: number): string {
    const name = line.slice(0, -NO_LINK.length);
    const cut = truncateToWidth(name, maxWidth - estimateTextWidth(NO_LINK));
    return cut ? `${cut}${NO_LINK}` : "";
}

/* ------------------------------------------------------------------ */
/* The scan                                                            */
/* ------------------------------------------------------------------ */

/** `POST /fraud/scan/:subjectType/:subjectId` — the signals over a party, stored nowhere. */
export interface ScanResult {
    subject: SubjectSummary;
    score: string;
    signals: FraudSignal[];
    scoredAt: string;
    /** The case already open against the party, if any — the desk links to it rather than opening a second. */
    openCase: { id: string; displayId: string | null; status: FraudCaseStatus } | null;
}

/** `?scan=PUBLISHER:cuid` — how a party page hands the desk a subject to scan on arrival. */
export function scanParam(subjectType: FraudSubjectType, subjectId: string): string {
    return `${subjectType}:${subjectId}`;
}

export function parseScanParam(value: string | null): { subjectType: FraudSubjectType; subjectId: string } | null {
    if (!value) return null;
    const [type, ...rest] = value.split(":");
    const subjectId = rest.join(":").trim();
    if (!subjectId || !FRAUD_SUBJECT_TYPES.includes(type as FraudSubjectType)) return null;
    return { subjectType: type as FraudSubjectType, subjectId };
}

/** G11-1: a person on the case as the reads name them — the id, and the name when the label lookup found one. */
export interface CasePerson {
    id: string;
    name: string | null;
}

/**
 * A person as the desk prints them: the read's name, else the id — and the
 * given word for nobody. A write answers the row without the names, so the
 * id column stands in until the desk re-reads.
 */
export function casePersonLabel(person: CasePerson | null | undefined, id: string | null, nobody = "Nobody yet"): string {
    if (person) return person.name?.trim() || person.id;
    return id ?? nobody;
}

/** One `FraudCase` row, as the list and every write answer. */
export interface FraudCase {
    id: string;
    /** FRD-26-0001, minted per Indian calendar year. Null only on rows older than the column. */
    displayId: string | null;
    subjectType: FraudSubjectType;
    subjectId: string;
    kind: string;
    status: FraudCaseStatus;
    summary: string;
    openedByUserId: string;
    assignedToUserId: string | null;
    disputeId: string | null;
    decision: string | null;
    decidedByUserId: string | null;
    decidedAt: string | null;
    /** Lot G (Q118/138): the explainable score 0–1 as a decimal string, the signals behind it, and when. Null until scored. */
    score: string | null;
    signals: FraudSignal[] | null;
    scoredAt: string | null;
    /** Lot G (Q118): set by `/escalate` — the named admin, else the investigator, else nobody. */
    escalatedAt: string | null;
    escalatedToUserId: string | null;
    escalationNote: string | null;
    createdAt: string;
    updatedAt: string;
    /**
     * G11-1: the four people by name beside the `*UserId` columns, on every
     * list row and the case read (one label lookup per read; a failed lookup
     * leaves the names null, never the row). A write answers without them.
     */
    openedBy?: CasePerson | null;
    assignedTo?: CasePerson | null;
    decidedBy?: CasePerson | null;
    escalatedTo?: CasePerson | null;
}

export interface FraudNote {
    id: string;
    caseId: string;
    byUserId: string;
    body: string;
    createdAt: string;
}

export interface FraudEvidence {
    id: string;
    caseId: string;
    kind: string;
    /** A private upload, read through `GET /files/:id` with the bearer token. */
    fileId: string | null;
    url: string | null;
    note: string | null;
    addedByUserId: string;
    createdAt: string;
}

/** Where the subject stands today, from the suspension module. Null when the party no longer resolves. */
export interface SubjectStanding {
    name: string | null;
    scopes: SuspensionScope[];
    suspendedAt: string | null;
    suspensionReason: string | null;
    suspendedById: string | null;
}

/** `GET /fraud/cases/:id` — the file. */
export interface FraudCaseFile extends FraudCase {
    notes: FraudNote[];
    evidence: FraudEvidence[];
    suspension: SubjectStanding | null;
}

/** What `/decide` answers: the row, plus what the decision did to the party. */
export interface FraudDecision extends FraudCase {
    scopesApplied: SuspensionScope[];
    scopesLifted: SuspensionScope[];
}

export interface FraudCasesPage {
    items: FraudCase[];
    total: number;
    page: number;
    pageSize: number;
    /** Rows per status, counted without the status facet in force. */
    counts: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* Queries and inputs                                                  */
/* ------------------------------------------------------------------ */

/** `?q=&status=&sort=&page=&pageSize=` plus `subjectType`, `subjectId`, `disputeId` — the list contract. */
export interface FraudCasesQuery {
    q?: string;
    status?: FraudCaseStatus[];
    sort?: "NEWEST" | "OLDEST";
    page?: number;
    pageSize?: number;
    subjectType?: FraudSubjectType;
    subjectId?: string;
    disputeId?: string;
}

export function fraudCasesPath(query: FraudCasesQuery = {}): string {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.status?.length) params.set("status", query.status.join(","));
    params.set("sort", query.sort ?? "NEWEST");
    if (query.page && query.page > 1) params.set("page", String(query.page));
    params.set("pageSize", String(query.pageSize ?? 100));
    if (query.subjectType) params.set("subjectType", query.subjectType);
    if (query.subjectId) params.set("subjectId", query.subjectId);
    if (query.disputeId) params.set("disputeId", query.disputeId);
    return `/fraud/cases?${params.toString()}`;
}

export interface OpenCaseInput {
    subjectType: FraudSubjectType;
    subjectId: string;
    kind: string;
    summary: string;
    disputeId?: string;
    assignedToUserId?: string;
}

/** At least one of the three: a private upload, a link, or a note. */
export interface AddEvidenceInput {
    kind: string;
    fileId?: string;
    url?: string;
    note?: string;
}

export interface DecideInput {
    status: "CONFIRMED" | "DISMISSED";
    decision: string;
    /** CONFIRMED only. Omitted, the default pair applies. */
    scopes?: SuspensionScope[];
}

/** Working the case: INVESTIGATING, and who is on it. A decision goes through `decide`. */
export interface PatchCaseInput {
    status?: "INVESTIGATING";
    assignedToUserId?: string | null;
}

/** `{ note, toUserId? }` — the schema wants at least three characters of the note. */
export interface EscalateInput {
    note: string;
    toUserId?: string;
}

export const FRAUD_ESCALATION_NOTE_MIN = 3;

export const isDecided = (status: FraudCaseStatus): boolean => status === "CONFIRMED" || status === "DISMISSED";

/** "4 accounts share a PAN" → the kind, then the summary's first line — what the queue row prints. */
export function caseTitle(fraudCase: Pick<FraudCase, "kind" | "summary">): string {
    const line = fraudCase.summary.split(/\r?\n/).find((part) => part.trim())?.trim() ?? fraudCase.summary;
    return line.length > 90 ? `${line.slice(0, 89).trimEnd()}…` : line;
}

function live() {
    if (!isLive("fraud")) {
        throw new Error("Fraud cases read the API. Set NEXT_PUBLIC_USE_API=true to work the desk.");
    }
    return http;
}

export const fraudService = {
    /** The desk, on the list contract, with a count per status chip. */
    list: (query: FraudCasesQuery = {}): Promise<FraudCasesPage> => live().get<FraudCasesPage>(fraudCasesPath(query)),

    /** The file: the case, its notes, its evidence, and where the subject stands today. */
    get: (caseId: string): Promise<FraudCaseFile> => live().get<FraudCaseFile>(`/fraud/cases/${caseId}`),

    /** Opens one against a party that exists (the suspension read is the existence check). `FRAUD_CASE_OPENED`. */
    open: (input: OpenCaseInput): Promise<FraudCase> => live().post<FraudCase>("/fraud/cases", input),

    /** `FRAUD_CASE_NOTE_ADDED`. Refused once the case is decided. */
    addNote: (caseId: string, body: string): Promise<FraudNote> =>
        live().post<FraudNote>(`/fraud/cases/${caseId}/notes`, { body }),

    /** `FRAUD_CASE_EVIDENCE_ADDED`. Refused once the case is decided. */
    addEvidence: (caseId: string, input: AddEvidenceInput): Promise<FraudEvidence> =>
        live().post<FraudEvidence>(`/fraud/cases/${caseId}/evidence`, input),

    /** `FRAUD_CASE_UPDATED` with the columns that moved. */
    patch: (caseId: string, input: PatchCaseInput): Promise<FraudCase> =>
        live().patch<FraudCase>(`/fraud/cases/${caseId}`, input),

    /** `FRAUD_CASE_DECIDED`, carrying `scopesApplied` / `scopesLifted`. Decided once in each direction. */
    decide: (caseId: string, input: DecideInput): Promise<FraudDecision> =>
        live().post<FraudDecision>(`/fraud/cases/${caseId}/decide`, input),

    /** Lot G: the signals recomputed over the party and stored on the case. `FRAUD_CASE_SCORED`. 409 on a decided case. */
    score: (caseId: string): Promise<FraudCase> => live().post<FraudCase>(`/fraud/cases/${caseId}/score`, {}),

    /** Lot G: the accounts the shared signals tie the party to, computed now. Only the linking signals are evaluated. */
    linked: (caseId: string): Promise<LinkedAccountsRead> => live().get<LinkedAccountsRead>(`/fraud/cases/${caseId}/linked`),

    /** Lot G: ESCALATED with a note, to a named admin or the investigator; they are told. `FRAUD_CASE_ESCALATED`. 409 when already escalated or decided. */
    escalate: (caseId: string, input: EscalateInput): Promise<FraudCase> =>
        live().post<FraudCase>(`/fraud/cases/${caseId}/escalate`, input),

    /** Lot G: the signals over a party with no case — stored nowhere, audited `FRAUD_SUBJECT_SCANNED`. 404 on a party that does not exist. */
    scan: (subjectType: FraudSubjectType, subjectId: string): Promise<ScanResult> =>
        live().post<ScanResult>(`/fraud/scan/${subjectType}/${encodeURIComponent(subjectId)}`, {}),
};
