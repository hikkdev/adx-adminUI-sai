/**
 * The audience / footfall vocabulary the console shares — Y-C over Y-B.
 *
 * The owner (15 Sep 2026): "in the Audience data section I want to add
 * both GeoIQ and Azira at the same time, for rich data on the audience in
 * a particular geography." So the backend's `shared/audience` seam runs an
 * enabled SET of vendors and blends their answers by a policy — per field
 * group a primary vendor, whether the other fills a null, and for footfall
 * whether two figures are averaged. Three screens read the result: the
 * integrations card (the set and the policy), a listing's audience panel
 * (`GET /listings/:id/audience`) and a city's audience profile
 * (`GET /geo/cities/:slug/audience`). This file is their one vocabulary:
 * the vendors, the policy with its defaults and its one-line preview, the
 * per-field provenance and how a figure's agreement is said. No HTTP here
 * — each reader's service owns its route.
 */

import type { MixItem } from "@/services/section-overviews";
import type { Tone } from "@/types";

export type AudienceVendor = "GEOIQ" | "AZIRA";

/** In the backend's catalogue order — the order every set is answered in. */
export const AUDIENCE_VENDORS: readonly AudienceVendor[] = ["GEOIQ", "AZIRA"];

export const AUDIENCE_VENDOR_LABEL: Record<AudienceVendor, string> = {
    GEOIQ: "GeoIQ",
    AZIRA: "Azira",
};

/** What each vendor is, in one line — printed beside its switch. */
export const AUDIENCE_VENDOR_NATURE: Record<AudienceVendor, string> = {
    GEOIQ: "A data panel: demographics, income and affinities per catalogue variable; footfall where the account bought it.",
    AZIRA: "A mobility panel: footfall by hour and weekday from device movement; demographics where the contract carries them.",
};

export const otherVendor = (vendor: AudienceVendor): AudienceVendor => (vendor === "AZIRA" ? "GEOIQ" : "AZIRA");

/* ------------------------------------------------------------------ */
/* The policy                                                           */
/* ------------------------------------------------------------------ */

export type AudienceFootfallBlend = "PRIMARY" | "AVERAGE";

export const AUDIENCE_FOOTFALL_BLENDS: readonly AudienceFootfallBlend[] = ["PRIMARY", "AVERAGE"];

export const AUDIENCE_FOOTFALL_BLEND_LABEL: Record<AudienceFootfallBlend, string> = {
    PRIMARY: "Primary's figure only",
    AVERAGE: "Average of both when both answer",
};

/** The three field groups the policy decides per — the seam's, in its order. */
export const AUDIENCE_GROUPS = ["footfall", "demographics", "affinities"] as const;
export type AudienceGroup = (typeof AUDIENCE_GROUPS)[number];

export const AUDIENCE_GROUP_LABEL: Record<AudienceGroup, string> = {
    footfall: "Footfall",
    demographics: "Demographics",
    affinities: "Affinities",
};

/** What each group covers, for the card's helper line. */
export const AUDIENCE_GROUP_FIELDS: Record<AudienceGroup, string> = {
    footfall: "daily figure, by hour, by weekday",
    demographics: "age bands, gender, income bands",
    affinities: "interest affinities",
};

/**
 * The blend policy exactly as `GET /integrations` answers it — always full,
 * the stored subset laid over the backend's defaults (`resolveAudiencePolicy`).
 */
export interface AudiencePolicy {
    footfall: { primary: AudienceVendor; fallback: boolean; blend: AudienceFootfallBlend };
    demographics: { primary: AudienceVendor; fallback: boolean };
    affinities: { primary: AudienceVendor; fallback: boolean };
}

/** What a `PUT /integrations` may carry for `policy`: any subset, merged over the stored policy by the backend. */
export interface AudiencePolicyPatch {
    footfall?: Partial<AudiencePolicy["footfall"]>;
    demographics?: Partial<AudiencePolicy["demographics"]>;
    affinities?: Partial<AudiencePolicy["affinities"]>;
}

/** The backend's `DEFAULT_AUDIENCE_POLICY`: Azira leads footfall (a mobility panel), GeoIQ the rest (a data panel), every fallback on. */
export const DEFAULT_AUDIENCE_POLICY: AudiencePolicy = {
    footfall: { primary: "AZIRA", fallback: true, blend: "AVERAGE" },
    demographics: { primary: "GEOIQ", fallback: true },
    affinities: { primary: "GEOIQ", fallback: true },
};

/**
 * Only what moved, per group per key — the backend merges a partial policy
 * over the stored one, so a diff is enough and the audit trail records the
 * change rather than a restatement. An empty object means nothing moved.
 */
export function audiencePolicyPatch(stored: AudiencePolicy, draft: AudiencePolicy): AudiencePolicyPatch {
    const patch: AudiencePolicyPatch = {};
    const footfall: Partial<AudiencePolicy["footfall"]> = {};
    if (draft.footfall.primary !== stored.footfall.primary) footfall.primary = draft.footfall.primary;
    if (draft.footfall.fallback !== stored.footfall.fallback) footfall.fallback = draft.footfall.fallback;
    if (draft.footfall.blend !== stored.footfall.blend) footfall.blend = draft.footfall.blend;
    if (Object.keys(footfall).length) patch.footfall = footfall;
    for (const group of ["demographics", "affinities"] as const) {
        const next: Partial<AudiencePolicy["demographics"]> = {};
        if (draft[group].primary !== stored[group].primary) next.primary = draft[group].primary;
        if (draft[group].fallback !== stored[group].fallback) next.fallback = draft[group].fallback;
        if (Object.keys(next).length) patch[group] = next;
    }
    return patch;
}

/** "Azira, averaged with GeoIQ when both answer" — one group's clause of the preview. */
export function audienceGroupSentence(group: AudienceGroup, policy: AudiencePolicy, providers: readonly AudienceVendor[]): string {
    const rule = policy[group];
    const primary = AUDIENCE_VENDOR_LABEL[rule.primary];
    const other = otherVendor(rule.primary);
    const otherLabel = AUDIENCE_VENDOR_LABEL[other];
    const bothOn = providers.includes(rule.primary) && providers.includes(other);
    if (!bothOn) {
        if (providers.includes(rule.primary)) return `${primary} alone`;
        if (providers.includes(other)) return rule.fallback ? `${otherLabel} (${primary} is off)` : `nobody — ${primary} is off and ${otherLabel} may not fill in`;
        return "no vendor";
    }
    if (group === "footfall" && policy.footfall.blend === "AVERAGE") return `${primary}, averaged with ${otherLabel} when both answer`;
    return rule.fallback ? `${primary}, ${otherLabel} as fallback` : `${primary} only`;
}

/**
 * The one-line preview under the policy: "Footfall: Azira, averaged with
 * GeoIQ when both answer · Demographics: GeoIQ, Azira as fallback ·
 * Affinities: GeoIQ, Azira as fallback". With nothing enabled it says so.
 */
export function audiencePolicyPreview(policy: AudiencePolicy, providers: readonly AudienceVendor[]): string {
    if (providers.length === 0) return "No vendor is on: the analytics say no panel backs an audience figure.";
    return AUDIENCE_GROUPS.map((group) => `${AUDIENCE_GROUP_LABEL[group]}: ${audienceGroupSentence(group, policy, providers)}`).join(" · ");
}

/** "GeoIQ + Azira", "GeoIQ", or "Off". */
export function audienceVendorsLabel(vendors: readonly AudienceVendor[]): string {
    if (vendors.length === 0) return "Off";
    return AUDIENCE_VENDORS.filter((vendor) => vendors.includes(vendor))
        .map((vendor) => AUDIENCE_VENDOR_LABEL[vendor])
        .join(" + ");
}

/* ------------------------------------------------------------------ */
/* The GeoIQ variable map and the vendor test (AC-C over AC-B2)         */
/* ------------------------------------------------------------------ */

/**
 * The seam's field groups, as `GET /integrations/audience/fields` names
 * them: the named rows (footfall, age, gender, income) and the one
 * free-form group, affinities, whose rows the account names itself.
 */
export type AudienceFieldGroup = "footfall" | "age" | "gender" | "income" | "affinity";

/** One row of the variable map the card offers an input for. */
export interface AudienceFieldDescriptor {
    field: string;
    group: AudienceFieldGroup;
    label: string;
    required: boolean;
}

export interface AudienceFieldGroupDescriptor {
    group: AudienceFieldGroup;
    label: string;
    /** Takes any `<group>.<name>` — the card draws it as an add-a-row list. */
    freeForm: boolean;
    pattern?: string;
}

/** What `GET /integrations/audience/fields` answers. */
export interface AudienceFieldsCatalogue {
    fields: AudienceFieldDescriptor[];
    groups: AudienceFieldGroupDescriptor[];
    /** The backend's own `AUDIENCE_FIELD_PATTERN` source — what a PUT admits as a key. */
    pattern: string;
    testPoint: { lat: number; lng: number; label: string };
}

/** The backend's default GeoIQ host (India) — the base URL field's placeholder. */
export const GEOIQ_DEFAULT_BASE_URL = "https://dataserving-in.geoiq.io/production/v1.0";

/** Where the account's catalogue ids are listed; they are account-specific and never guessed. */
export const GEOIQ_CATALOGUE_URL = "https://catalog.geoiq.io";

/** The console's copy of the backend's key rule, so a stray affinity name is refused before the round trip. */
export const AUDIENCE_FIELD_PATTERN = /^(footfall\.daily|age\.[a-z0-9_]+|gender\.(male|female|other)|income\.[a-z0-9_]+|affinity\.[a-z0-9_]+)$/i;

/** The affinity rows as the card edits them: the name after `affinity.`, and the id, both as typed. */
export interface AffinityRow {
    name: string;
    id: string;
}

/** The affinity group of a stored map, as rows — `affinity.<name>` → `{ name, id }`, in stored order. */
export function affinityRowsOf(variables: Record<string, string> | undefined): AffinityRow[] {
    return Object.entries(variables ?? {})
        .filter(([field]) => field.toLowerCase().startsWith("affinity."))
        .map(([field, id]) => ({ name: field.slice("affinity.".length), id }));
}

/** A stored field that is neither in the catalogue nor an affinity: kept as a row of its own so a mapped `age.60_plus` is not lost. */
export function extraFieldsOf(variables: Record<string, string> | undefined, catalogue: readonly AudienceFieldDescriptor[]): AudienceFieldDescriptor[] {
    const known = new Set(catalogue.map((row) => row.field));
    return Object.keys(variables ?? {})
        .filter((field) => !known.has(field) && !field.toLowerCase().startsWith("affinity."))
        .map((field) => ({ field, group: field.split(".")[0] as AudienceFieldGroup, label: field, required: false }));
}

/**
 * The variable map as the PUT carries it: ONE record — every named row
 * with an id typed, then every affinity row with both a name and an id,
 * blanks left out (blank means unmapped). Trimmed, the affinity name
 * lower-cased the way the seam reads it.
 */
export function geoiqVariablesOf(named: Record<string, string>, affinities: readonly AffinityRow[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const [field, id] of Object.entries(named)) {
        const text = id.trim();
        if (text) map[field] = text;
    }
    for (const row of affinities) {
        const name = row.name.trim().toLowerCase();
        const id = row.id.trim();
        if (name && id) map[`affinity.${name}`] = id;
    }
    return map;
}

/** Whether two maps say the same thing, key order aside. */
export function sameVariables(a: Record<string, string>, b: Record<string, string>): boolean {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    return keysA.length === keysB.length && keysA.every((key, index) => key === keysB[index] && a[key] === b[key]);
}

/** Why a map cannot be saved yet: an affinity row half filled, or a name the seam's pattern refuses. Null when it can. */
export function geoiqVariablesProblem(affinities: readonly AffinityRow[]): string | null {
    for (const row of affinities) {
        const name = row.name.trim().toLowerCase();
        const id = row.id.trim();
        if (!name && !id) continue;
        if (!name) return "An affinity row needs a name — the word after affinity. that the panel prints.";
        if (!id) return `The affinity "${name}" needs a catalogue id, or remove the row.`;
        if (!AUDIENCE_FIELD_PATTERN.test(`affinity.${name}`)) return `"${name}" is not an affinity name: letters, digits and underscores only.`;
    }
    const names = affinities.map((row) => row.name.trim().toLowerCase()).filter(Boolean);
    if (new Set(names).size !== names.length) return "An affinity is named twice.";
    return null;
}

/**
 * What `POST /integrations/audience/test` answers — a plain verdict, never
 * a key. `status` is the vendor's EFFECTIVE status (the one inside GeoIQ's
 * gateway envelope, not the HTTP 200 around it); null when nothing was
 * asked or nothing answered. `message` is the vendor's own sentence when
 * it gave one.
 */
export interface AudienceVendorTest {
    vendor: AudienceVendor;
    keyPresent: boolean;
    variablesMapped: number;
    reachable: boolean;
    authorized: boolean;
    status: number | null;
    message: string;
    fieldsAnswered: string[];
    fieldsMissing: string[];
    sample: { footfallDaily?: number | null };
}

export type AudienceTestKind = "NO_KEY" | "UNREACHABLE" | "REFUSED" | "ANSWERED" | "EMPTY";

/** Which of the five things happened, in the order the card decides them. */
export function audienceTestKind(verdict: AudienceVendorTest): AudienceTestKind {
    if (!verdict.keyPresent) return "NO_KEY";
    if (!verdict.reachable) return "UNREACHABLE";
    if (!verdict.authorized) return "REFUSED";
    return verdict.fieldsAnswered.length ? "ANSWERED" : "EMPTY";
}

/** The card's verdict badge. */
export function audienceTestBadge(verdict: AudienceVendorTest): { label: string; tone: Tone } {
    switch (audienceTestKind(verdict)) {
        case "NO_KEY":
            return { label: "No key", tone: "neutral" };
        case "UNREACHABLE":
            return { label: "Unreachable", tone: "danger" };
        case "REFUSED":
            return { label: "Not authorised", tone: "danger" };
        case "EMPTY":
            return { label: "Reached, nothing answered", tone: "warning" };
        case "ANSWERED":
            return { label: "Working", tone: "success" };
    }
}

/**
 * The one plain sentence over the vendor's own message. A refusal is said
 * the way the operator must act on it: the key is on file, the vendor
 * refuses it, and it is the vendor's account desk that fixes that.
 */
export function audienceTestSentence(verdict: AudienceVendorTest): string {
    const vendor = AUDIENCE_VENDOR_LABEL[verdict.vendor];
    switch (audienceTestKind(verdict)) {
        case "NO_KEY":
            return `No ${vendor} key is stored, so nothing was asked. Type the key and save first.`;
        case "UNREACHABLE":
            return `${vendor} could not be reached from the backend — check the base URL and the network before the key.`;
        case "REFUSED":
            return verdict.vendor === "GEOIQ"
                ? "The key is stored but GeoIQ refuses it — ask GeoIQ to enable the Data API on this key."
                : `The key is stored but ${vendor} refuses it — ask ${vendor} to enable this key for the account.`;
        case "EMPTY":
            return `${vendor} accepted the key but answered none of the fields asked — check the catalogue ids against the account.`;
        case "ANSWERED":
            return `${vendor} answered ${verdict.fieldsAnswered.length} of ${verdict.fieldsAnswered.length + verdict.fieldsMissing.length} fields asked.`;
    }
}

/* ------------------------------------------------------------------ */
/* What a blended answer carries                                        */
/* ------------------------------------------------------------------ */

/** A share of the catchment under one label, 0–100. */
export interface AudienceShare {
    label: string;
    share: number;
}

export interface AudienceFootfall {
    /** Average daily footfall in the catchment over the period. */
    daily: number | null;
    /** 24 shares, midnight first, summing to 100 — null when the vendor has no hourly panel. */
    byHour: number[] | null;
    /** 7 shares, Monday first — null when the vendor has no weekday panel. */
    byWeekday: number[] | null;
}

export interface AudienceDemographics {
    ageBands: AudienceShare[] | null;
    gender: AudienceShare[] | null;
    incomeBands: AudienceShare[] | null;
    affinities: AudienceShare[] | null;
}

/** One vendor's own answer — what `rawByVendor` holds for the desk. */
export interface AudienceCatchment {
    footfall: AudienceFootfall;
    demographics: AudienceDemographics;
    /** Every figure is a PANEL figure: modelled by the vendor, not observed by ADX. */
    provenance: "PANEL";
    vendor: AudienceVendor;
    /** YYYY-MM. */
    period: string;
    radiusM: number;
    fetchedAt: string;
}

/** Where a field group came from: one vendor, or both (`BLENDED`). */
export type AudienceSource = AudienceVendor | "BLENDED";

export interface AudienceProvenanceByField {
    footfall: AudienceSource | null;
    demographics: AudienceSource | null;
    affinities: AudienceSource | null;
}

/** The seam's blended answer: the legacy one-vendor shape plus who gave what, and each vendor's own answer beside. */
export interface BlendedAudienceCatchment extends AudienceCatchment {
    provenanceByField: AudienceProvenanceByField;
    vendors: AudienceVendor[];
    /** `1 − |a − b| / max(a, b)` over the two daily figures; null unless both vendors gave one. */
    agreement: { footfall: number | null };
    rawByVendor: Partial<Record<AudienceVendor, AudienceCatchment>>;
}

/** "GeoIQ", "Azira", "Both, blended", or "Not provided" against a null. */
export function audienceSourceLabel(source: AudienceSource | null): string {
    if (source === null) return "Not provided";
    if (source === "BLENDED") return "Both, blended";
    return AUDIENCE_VENDOR_LABEL[source];
}

/**
 * "Both vendors agree within 12% on daily footfall" — the agreement as a
 * distance, which is how a desk reads it; null when only one vendor gave
 * a daily figure, so nothing is printed rather than "agree within 100%".
 */
export function agreementSentence(agreement: number | null): string | null {
    if (agreement === null) return null;
    const apart = Math.round((1 - agreement) * 1000) / 10;
    if (apart <= 0) return "Both vendors give the same daily footfall";
    return `Both vendors agree within ${apart}% on daily footfall`;
}

/* ------------------------------------------------------------------ */
/* Periods                                                              */
/* ------------------------------------------------------------------ */

export interface AudiencePeriod {
    /** YYYY-MM, what the query carries. */
    value: string;
    /** "September 2026". */
    label: string;
}

/** The month `now` falls in, UTC — the backend's `currentPeriod`. */
export function currentAudiencePeriod(now = new Date()): string {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * The last `count` months, this one first — the period picker's options.
 * Three, because a vendor's panel is one month deep and a spot's snapshot
 * is stored per month: further back is a call nobody made.
 */
export function audiencePeriods(now = new Date(), count = 3): AudiencePeriod[] {
    const out: AudiencePeriod[] = [];
    for (let back = 0; back < count; back += 1) {
        const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
        out.push({
            value: currentAudiencePeriod(date),
            label: date.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }),
        });
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* Drawing a mix                                                        */
/* ------------------------------------------------------------------ */

/** The demographic groups a panel carries, in the order the screens draw them. */
export const AUDIENCE_MIXES = ["ageBands", "gender", "incomeBands", "affinities"] as const;
export type AudienceMix = (typeof AUDIENCE_MIXES)[number];

export const AUDIENCE_MIX_LABEL: Record<AudienceMix, string> = {
    ageBands: "Age",
    gender: "Gender",
    incomeBands: "Income",
    affinities: "Affinities",
};

/** Which policy group a mix answers to — for its provenance label. */
export const AUDIENCE_MIX_GROUP: Record<AudienceMix, AudienceGroup> = {
    ageBands: "demographics",
    gender: "demographics",
    incomeBands: "demographics",
    affinities: "affinities",
};

/** The kit's five tones, cycled over a mix's bands — a mix has no state to colour by, only an order. */
const MIX_TONES: readonly Tone[] = ["info", "success", "warning", "neutral", "danger"];

/** A share group as the `MixBar` draws it (`sharesOnly`): one segment per band, the share as its count. */
export function shareMixItems(shares: readonly AudienceShare[]): MixItem[] {
    return shares.map((share, index) => ({
        key: share.label,
        label: share.label,
        count: Math.round(share.share * 10) / 10,
        href: null,
        tone: MIX_TONES[index % MIX_TONES.length],
    }));
}

/** Monday first, the way the seam orders `byWeekday`. */
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
