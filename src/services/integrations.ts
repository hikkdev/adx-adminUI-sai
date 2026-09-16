import { api as http } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import {
    AUDIENCE_VENDORS,
    DEFAULT_AUDIENCE_POLICY,
    audiencePolicyPatch,
    geoiqVariablesOf,
    sameVariables,
    type AffinityRow,
    type AudienceFieldsCatalogue,
    type AudiencePolicy,
    type AudienceVendor,
    type AudienceVendorTest,
} from "@/services/audience";

/**
 * Third-party credentials — `GET/PUT /integrations`, the `integrations`
 * module's one screen.
 *
 * The three payment gateways (Lot C, Q110), each with a `testMode` switch
 * drawn as-is, beside the SMS and email rails. Every secret arrives masked —
 * `••••` and the last four — and never round-trips: a field left blank on
 * save keeps the stored value, and only a deliberately typed new key is
 * sent. The AI section has its own reader in `ai.ts`.
 *
 * Live in every mode. A settings screen that reports a gateway nobody
 * configured is how an operator concludes payments are broken when they were
 * never switched on, so there is no seeded stand-in.
 */

export type IntegrationSection =
    | "sms"
    | "email"
    | "twilio"
    | "resend"
    | "razorpay"
    | "cashfree"
    | "ccavenue"
    | "googleMaps"
    | "hrms"
    | "workTool"
    | "maps"
    | "audience";

/**
 * A rail as the server names it. The names — MSG91 and Twilio wired, `third`
 * the seam for the next operator — come from `GET /comms/sms-kinds`
 * (E10-2) rather than a list typed here, so the routing table draws
 * whatever rails the server can send by.
 */
export type SmsRailName = string;

/** The two wired rails have product names; anything else is printed as the server names it. */
const RAIL_LABELS: Record<string, string> = {
    msg91: "MSG91",
    twilio: "Twilio",
    third: "Third rail",
};

export const railLabel = (rail: SmsRailName): string => RAIL_LABELS[rail] ?? rail;

/** One kind's registration on one rail: the rail's own template id, the variables it takes, the registered text. */
export interface SmsKindRegistration {
    templateId: string;
    vars?: string[];
    body?: string;
}

/** `{ <rail>: { <SmsKind>: registration } }` — a rail that has no row for a kind skips it, never sends it. */
export type SmsTemplates = Partial<Record<SmsRailName, Partial<Record<string, SmsKindRegistration>>>>;

export const EMAIL_PRIMARIES = ["SMTP", "RESEND"] as const;
export type EmailPrimary = (typeof EMAIL_PRIMARIES)[number];

/**
 * AE-B/AE-C: the SMTP door's mode. SMTP sends through the host; ETHEREAL
 * sends through a throwaway inbox at ethereal.email the backend mints once
 * and caches for a day - nothing is delivered, every message gets a preview
 * URL. It bears on the SMTP door only: under `primary: "RESEND"` the mode
 * is not consulted.
 */
export const EMAIL_MODES = ["SMTP", "ETHEREAL"] as const;
export type EmailMode = (typeof EMAIL_MODES)[number];

export const EMAIL_MODE_LABEL: Record<EmailMode, string> = {
    SMTP: "SMTP server",
    ETHEREAL: "Ethereal test inbox",
};

/** Where the Ethereal inbox is read: the backend answers it too, this is the fallback for an older read. */
export const ETHEREAL_WEB_URL = "https://ethereal.email/login";

/** The door a send actually leaves by: Resend when it is primary, else the SMTP door in its mode. */
export type EmailDoor = "SMTP" | "RESEND" | "ETHEREAL";

export const EMAIL_DOOR_LABEL: Record<EmailDoor, string> = {
    SMTP: "SMTP",
    RESEND: "Resend",
    ETHEREAL: "Ethereal test inbox",
};

export interface RazorpaySettings {
    keyId: string | null;
    keySecret: string | null;
    webhookSecret: string | null;
    testMode: boolean;
}

export interface CashfreeSettings {
    appId: string | null;
    secretKey: string | null;
    webhookSecret: string | null;
    testMode: boolean;
}

export interface CcavenueSettings {
    merchantId: string | null;
    accessCode: string | null;
    workingKey: string | null;
    testMode: boolean;
}

/**
 * The `sms` section is a routing table, not one key (Lot E, Q128): MSG91's
 * key is the one secret; the rails, the DLT ids and the per-kind template
 * ids are drawn as-is.
 */
export interface SmsSettings {
    authKey: string | null;
    /** MSG91's pre-DLT single template; kept so an old row parses, read by nothing. */
    templateId: string | null;
    primaryRail: SmsRailName;
    /** Tried in order when the primary throws, each only if it has the kind registered and its keys on file. */
    fallbackRails: SmsRailName[];
    /** The TRAI DLT principal entity id. */
    dltEntityId: string | null;
    /** The six-letter DLT header, quoted by every rail. */
    senderId: string | null;
    templates: SmsTemplates;
}

export interface TwilioSettings {
    accountSid: string | null;
    authToken: string | null;
    phoneNumber: string | null;
}

export interface EmailSettings {
    host: string | null;
    port: number | null;
    user: string | null;
    password: string | null;
    from: string | null;
    /** Which door the dispatcher sends by. Null means the resolver's own default: SMTP unless only a Resend key is on file. */
    primary: EmailPrimary | null;
    /** AE-B: the SMTP door's mode in force. Absent on a backend older than AE-B, when SMTP stands in. */
    mode?: EmailMode;
    /** AE-B: under ETHEREAL only - the test inbox's login name (null until a send or a test minted one) and where to open it. */
    ethereal?: { user: string | null; webUrl: string };
}

/** The mode in force as the read carries it; SMTP on an older backend. */
export const emailModeOf = (email: Pick<EmailSettings, "mode"> | null | undefined): EmailMode => email?.mode ?? "SMTP";

/**
 * The door a send leaves by, read the way the backend's resolver reads it:
 * the chosen primary (SMTP unless only a Resend key is on file when nobody
 * chose), and under SMTP the mode decides between the host and Ethereal.
 */
export function effectiveEmailDoor(settings: Pick<IntegrationsSettings, "email" | "resend">): EmailDoor {
    const smtpConfigured = Boolean(settings.email?.host);
    const resendConfigured = Boolean(settings.resend?.apiKey);
    const primary: EmailPrimary = settings.email?.primary ?? (!smtpConfigured && resendConfigured ? "RESEND" : "SMTP");
    if (primary === "RESEND") return "RESEND";
    return emailModeOf(settings.email) === "ETHEREAL" ? "ETHEREAL" : "SMTP";
}

/**
 * Why the test cannot be sent, or null when the door in force has what it
 * needs: SMTP wants a host (or the Ethereal mode), Resend wants its key.
 * Stored values only - a key typed but not saved is not one the backend
 * can use.
 */
export function emailTestBlocker(settings: Pick<IntegrationsSettings, "email" | "resend">): string | null {
    const door = effectiveEmailDoor(settings);
    if (door === "RESEND" && !settings.resend?.apiKey) return "Resend is the primary door but has no API key on file - paste one, or switch the primary door to SMTP.";
    if (door === "SMTP" && !settings.email?.host) return "SMTP has no host on file - fill it, or switch the mode to the Ethereal test inbox.";
    return null;
}

/**
 * AE-B: what `POST /integrations/email/test` answers - one message through
 * the door in force and a plain verdict. A missing host or key, a refused
 * login, a Resend 4xx and a door that does not answer in 15 s are all
 * `ok: false` with a sentence, never a 5xx. `response` is the vendor's line
 * with the secrets masked; `previewUrl` is set under Ethereal only.
 */
export interface EmailDoorVerdict {
    provider: EmailDoor;
    configured: boolean;
    ok: boolean;
    messageId: string | null;
    previewUrl: string | null;
    response: string | null;
    message: string;
}

export interface ResendSettings {
    apiKey: string | null;
    fromEmail: string | null;
}

/**
 * Lot E (Q98): the HR tool. A portal link, not a sync — `/employees` opens
 * `portalUrl`, and the backend builds each person's deep link from
 * `employeeLinkTemplate` and the record's `externalHrmsId`. `apiKey` is
 * the one secret, masked; it is read by nothing today.
 */
export type HrmsProvider = "NONE" | "ZOHO_PEOPLE" | "KEKA" | "GREYTHR";

export interface HrmsSettings {
    provider: HrmsProvider;
    portalUrl: string | null;
    apiBaseUrl: string | null;
    apiKey: string | null;
    employeeLinkTemplate: string | null;
}

/**
 * E10-1: the work tool — a portal link the console follows from the
 * employees overview's "Internal work" card, and a name for it ("ADX Jira",
 * "Ops board"). No secret in it, so nothing is masked. Written by
 * `PUT /integrations { section: 'workTool', patch }` like every section.
 */
export type WorkToolProvider = "NONE" | "JIRA" | "TRELLO" | "ASANA" | "OTHER";

export const WORK_TOOL_PROVIDERS: readonly WorkToolProvider[] = ["NONE", "JIRA", "TRELLO", "ASANA", "OTHER"];

export const WORK_TOOL_PROVIDER_LABEL: Record<WorkToolProvider, string> = {
    NONE: "None",
    JIRA: "Jira",
    TRELLO: "Trello",
    ASANA: "Asana",
    OTHER: "Other",
};

export interface WorkToolSettings {
    provider: WorkToolProvider;
    portalUrl: string | null;
    name: string | null;
}

/** "ADX Jira" when named, else the provider's own name, else null while the tool is off. */
export function workToolLabel(workTool: Pick<WorkToolSettings, "provider" | "name"> | null | undefined): string | null {
    if (!workTool || workTool.provider === "NONE") return null;
    const name = workTool.name?.trim();
    if (name) return name;
    return workTool.provider === "OTHER" ? "Work tool" : WORK_TOOL_PROVIDER_LABEL[workTool.provider];
}

/** The portal link the "Internal work" card follows: only while a provider is chosen and a URL is on file. */
export function workToolLink(workTool: Pick<WorkToolSettings, "provider" | "portalUrl"> | null | undefined): string | null {
    if (!workTool || workTool.provider === "NONE") return null;
    return workTool.portalUrl?.trim() || null;
}

/**
 * The console's browser key for the inventory map — masked on read. The
 * server key (geocoding, distances) stays in the backend's environment
 * (answer 58) and never appears in this response.
 */
export interface GoogleMapsSettings {
    apiKey: string | null;
}

/**
 * G7 (Q101/132/137): the maps seam. Google unless ops chose Mapbox. Two
 * keys per vendor because they are two different things: the browser key
 * / public token is what a phone or the console draws tiles with, the
 * server key / secret token is what the backend spends on geocoding and
 * directions and never leaves it. All four arrive masked — a browser key
 * is public on a phone but still a credential on a settings screen.
 */
export type MapsProvider = "GOOGLE" | "MAPBOX" | "OSM";

export const MAPS_PROVIDERS: readonly MapsProvider[] = ["GOOGLE", "MAPBOX", "OSM"];

export const MAPS_PROVIDER_LABEL: Record<MapsProvider, string> = {
    GOOGLE: "Google Maps Platform",
    MAPBOX: "Mapbox",
    OSM: "OpenStreetMap",
};

/**
 * Z-C (the owner, 15 Sep 2026): OpenStreetMap, the third provider. No key
 * to speak of — three service URLs (Nominatim geocodes, OSRM routes,
 * Photon autocompletes), the contact email and User-Agent the public
 * Nominatim usage policy demands (the email is REQUIRED to select OSM; the
 * backend refuses otherwise), and the tile line the console and the
 * phones draw with. `tileApiKey` is the one secret — a MapTiler / Stadia /
 * Thunderforest / Geoapify key — masked on read. The read always answers
 * the section in force, defaults filled in, and `publicTiles` is the
 * server's own warning: true while the template still names
 * tile.openstreetmap.org, whose policy forbids heavy app use.
 */
export interface OsmSettings {
    nominatimBaseUrl: string;
    osrmBaseUrl: string;
    photonBaseUrl: string;
    contactEmail: string | null;
    userAgent: string;
    tileUrlTemplate: string;
    tileAttribution: string;
    tileMaxZoom: number;
    tileApiKey: string | null;
    publicTiles: boolean;
}

export interface MapsSettings {
    provider: MapsProvider;
    googleBrowserKey: string | null;
    googleServerKey: string | null;
    mapboxPublicToken: string | null;
    mapboxSecretToken: string | null;
    /** Z-C: always present on a Z-B backend; absent on an older one, when OSM cannot be chosen here. */
    osm?: OsmSettings;
    /**
     * AC-B1: present only while the STORED provider is OSM. The phones draw
     * OpenStreetMap tiles through the Mapbox SDK, which needs the PUBLIC
     * token to initialise — this is the verdict on that token (stored or
     * from the environment), never the token; the console and the backend
     * never need it.
     */
    phoneEngine?: PhoneMapEngine;
}

export interface PhoneMapEngine {
    engine: "MAPBOX";
    tokenPresent: boolean;
}

/**
 * Whether the phones can draw the map under OpenStreetMap: the backend's
 * verdict when it gave one (stored provider is OSM), else whether the
 * masked public token is on file — the same truth read the other way,
 * for the moment the operator has picked OSM but not saved it yet.
 */
export function phoneEngineTokenPresent(stored: Pick<MapsSettings, "phoneEngine" | "mapboxPublicToken">): boolean {
    return stored.phoneEngine?.tokenPresent ?? Boolean(stored.mapboxPublicToken);
}

/** The public OSM tile server — the one `publicTiles` warns about; the console's copy of the backend's rule so the warning follows the template as it is typed. */
export const OSM_PUBLIC_TILE_HOST = "tile.openstreetmap.org";

export const OSM_PUBLIC_TILES_WARNING = "tile.openstreetmap.org is for light use — point production at a tile provider.";

/** The hostname of a URL or a `{z}/{x}/{y}` template; null when it is not one. */
function hostOf(url: string): string | null {
    try {
        return new URL(url.replace(/\{[^}]*\}/g, "x")).hostname.toLowerCase();
    } catch {
        return null;
    }
}

/** Does this tile template still draw from the public OSM server (or one of its `a.`/`b.`/`c.` mirrors)? */
export function isPublicOsmTileTemplate(template: string): boolean {
    const host = hostOf(template.trim());
    return host === OSM_PUBLIC_TILE_HOST || host?.endsWith(`.${OSM_PUBLIC_TILE_HOST}`) === true;
}

/** A tile template the backend will accept: an http(s) URL naming all three slots. */
export function tileTemplateProblem(template: string): string | null {
    const text = template.trim();
    if (!text) return null;
    if (!/^https?:\/\/\S+$/.test(text)) return "The tile template must be an http(s) URL.";
    if (!["{z}", "{x}", "{y}"].every((slot) => text.includes(slot))) return "The tile template must carry {z}, {x} and {y}.";
    return null;
}

/** The OSM fields the card edits as text; `tileMaxZoom` is typed and parsed by `parseTileMaxZoom`. */
export type OsmDraft = Record<"nominatimBaseUrl" | "osrmBaseUrl" | "photonBaseUrl" | "contactEmail" | "userAgent" | "tileUrlTemplate" | "tileAttribution" | "tileMaxZoom" | "tileApiKey", string>;

/** The draft the card starts from: the section as stored, the secret blank (masked on read, never round-tripped). */
export const osmDraftOf = (stored: OsmSettings): OsmDraft => ({
    nominatimBaseUrl: stored.nominatimBaseUrl,
    osrmBaseUrl: stored.osrmBaseUrl,
    photonBaseUrl: stored.photonBaseUrl,
    contactEmail: stored.contactEmail ?? "",
    userAgent: stored.userAgent,
    tileUrlTemplate: stored.tileUrlTemplate,
    tileAttribution: stored.tileAttribution,
    tileMaxZoom: String(stored.tileMaxZoom),
    tileApiKey: "",
});

/** 1–22, the bounds the server applies; null for anything else. */
export function parseTileMaxZoom(text: string): number | null {
    if (!/^\d+$/.test(text.trim())) return null;
    const value = Number(text.trim());
    return value >= 1 && value <= 22 ? value : null;
}

/** What the OSM patch carries per field: text, a number, or null to clear the field back to its default. */
export type OsmPatch = Partial<Record<keyof OsmDraft, string | number | null>>;

/**
 * The `osm` sub-object of the maps patch: only what moved. A field typed
 * over its stored value travels as text; a field emptied travels as
 * `null`, which the backend reads as "back to the default" (the read
 * answers the defaults filled in, so an empty field is never a value in
 * its own right). The tile key is a secret — blank keeps, a typed value
 * sends, a masked value never travels. `tileMaxZoom` travels as a number
 * when it parses and differs. Never `publicTiles`: the server derives it.
 */
export function osmSectionPatch(stored: OsmSettings, draft: OsmDraft): OsmPatch {
    const patch: OsmPatch = {};
    const text = (key: Exclude<keyof OsmDraft, "tileMaxZoom" | "tileApiKey">) => {
        const typed = draft[key].trim();
        const before = stored[key] ?? "";
        if (typed === before) return;
        patch[key] = typed || null;
    };
    text("nominatimBaseUrl");
    text("osrmBaseUrl");
    text("photonBaseUrl");
    text("contactEmail");
    text("userAgent");
    text("tileUrlTemplate");
    text("tileAttribution");
    const zoom = parseTileMaxZoom(draft.tileMaxZoom);
    if (zoom !== null && zoom !== stored.tileMaxZoom) patch.tileMaxZoom = zoom;
    const key = draft.tileApiKey.trim();
    if (key && !isMasked(key)) patch.tileApiKey = key;
    return patch;
}

/**
 * The whole maps patch: the provider when it moved, the four vendor keys
 * by `sectionPatch`'s secret rule, and the `osm` sub-object only when
 * something in it moved (the backend merges it over the stored one).
 */
export function mapsSectionPatch(stored: MapsSettings, provider: MapsProvider, typed: Record<string, string>, osm: OsmDraft | null): Record<string, unknown> {
    const patch: Record<string, unknown> = sectionPatch("maps", { provider, ...typed }, stored as unknown as Record<string, string | number | boolean | null>);
    if (osm && stored.osm) {
        const sub = osmSectionPatch(stored.osm, osm);
        if (Object.keys(sub).length) patch.osm = sub;
    }
    return patch;
}

/**
 * G7 (Q109) / Y-B: the audience / footfall vendors. `providers` is the
 * enabled SET — both at once for rich data on a geography (the owner, 15
 * Sep 2026) — and empty means the analytics say "no panel backs this"
 * rather than draw a figure; `policy` is the full blend policy the seam
 * applies, the stored subset laid over the backend's defaults. `provider`
 * is the legacy one-vendor label an older reader printed: the footfall
 * primary in force, or NONE; the card no longer writes it. The two API keys
 * are secrets; the base URLs, the client id, the catchment radius and the
 * GeoIQ variable map are drawn as-is.
 */
export type AudienceProvider = "NONE" | AudienceVendor;

export const AUDIENCE_PROVIDER_LABEL: Record<AudienceProvider, string> = {
    NONE: "None",
    GEOIQ: "GeoIQ",
    AZIRA: "Azira",
};

export interface AudienceSettings {
    provider: AudienceProvider;
    /** Y-B: the enabled set, in catalogue order. A backend older than Y-B leaves it off; `audienceProvidersOf` reads the legacy label then. */
    providers?: AudienceVendor[];
    /** Y-B: always full on the wire. Absent on a backend older than Y-B, when the defaults stand in. */
    policy?: AudiencePolicy;
    geoiqApiKey: string | null;
    geoiqBaseUrl: string | null;
    /** The seam's field names (`footfall.daily`, `age.<band>`, …) to the catalogue ids the account bought. */
    geoiqVariables: Record<string, string>;
    aziraApiKey: string | null;
    aziraClientId: string | null;
    aziraBaseUrl: string | null;
    /** 50–5,000 m: the circle every spot is asked about, so two spots' figures compare. */
    catchmentRadiusM: number;
}

/** The enabled set as stored: `providers`, or the legacy label as a one-element set. */
export function audienceProvidersOf(stored: Pick<AudienceSettings, "provider" | "providers">): AudienceVendor[] {
    const set = stored.providers ?? (stored.provider === "NONE" ? [] : [stored.provider]);
    return AUDIENCE_VENDORS.filter((vendor) => set.includes(vendor));
}

/** The policy as stored, the defaults where the backend sent none. */
export const audiencePolicyOf = (stored: Pick<AudienceSettings, "policy">): AudiencePolicy => stored.policy ?? DEFAULT_AUDIENCE_POLICY;

/**
 * Whether a vendor can answer, by the seam's own rule (`requireConfig` in
 * each adapter): GeoIQ wants its key and at least one catalogue id mapped;
 * Azira has no public host, so it wants its key and the contract's base URL.
 * A vendor switched on without these is skipped by every read, not fatal —
 * the card says "Not configured" so nobody wonders why a spot has no figure.
 */
export function audienceVendorConfigured(stored: AudienceSettings, vendor: AudienceVendor): boolean {
    if (vendor === "GEOIQ") return Boolean(stored.geoiqApiKey) && Object.values(stored.geoiqVariables ?? {}).some((id) => Boolean(id));
    return Boolean(stored.aziraApiKey) && Boolean(stored.aziraBaseUrl);
}

/** What the audience card edits beyond the typed credential fields. */
export interface AudienceDraft {
    providers: AudienceVendor[];
    policy: AudiencePolicy;
    /** As typed; parsed by `parseRadius`. */
    radius: string;
    /** The credential fields as typed — a blank secret keeps the stored one. */
    typed: Record<string, string>;
    /**
     * AC-C: the GeoIQ variable map as edited — the named rows by seam field
     * (blank = unmapped) and the affinity rows. Absent on a card that does
     * not edit the map.
     */
    variables?: { named: Record<string, string>; affinities: AffinityRow[] };
}

/**
 * The `audience` patch: only what moved. The set travels whole when it
 * changed (it is one value), the policy as the per-key diff the backend
 * merges over the stored one, the radius as a number, the credentials by
 * `sectionPatch`'s rule. Never `provider` — the legacy label is read-only
 * from Y-B on, and the backend clears it from the row once `providers` is
 * written.
 */
export function audienceSectionPatch(stored: AudienceSettings, draft: AudienceDraft): Record<string, unknown> {
    const patch: Record<string, unknown> = sectionPatch("audience", draft.typed, stored as unknown as Record<string, string | number | boolean | null>);
    const before = audienceProvidersOf(stored);
    const after = AUDIENCE_VENDORS.filter((vendor) => draft.providers.includes(vendor));
    if (before.join(",") !== after.join(",")) patch.providers = after;
    const policy = audiencePolicyPatch(audiencePolicyOf(stored), draft.policy);
    if (Object.keys(policy).length) patch.policy = policy;
    const radius = parseRadius(draft.radius);
    if (radius !== null && radius !== stored.catchmentRadiusM) patch.catchmentRadiusM = radius;
    /* The map is one record: it travels whole, blanks left out, when anything in it moved. */
    if (draft.variables) {
        const next = geoiqVariablesOf(draft.variables.named, draft.variables.affinities);
        if (!sameVariables(next, stored.geoiqVariables ?? {})) patch.geoiqVariables = next;
    }
    return patch;
}

/** The sections this screen draws; the response carries more, read by other screens. */
export interface IntegrationsSettings {
    sms?: SmsSettings;
    email?: EmailSettings;
    twilio?: TwilioSettings;
    resend?: ResendSettings;
    razorpay?: RazorpaySettings;
    cashfree?: CashfreeSettings;
    ccavenue?: CcavenueSettings;
    /** Read by `/employees` for the "Open in <tool>" card. */
    hrms?: HrmsSettings;
    /** E10-1: read by `/employees` for the "Internal work" card. */
    workTool?: WorkToolSettings;
    googleMaps?: GoogleMapsSettings;
    /** G7: the maps seam — the provider switch and its four masked keys. */
    maps?: MapsSettings;
    /** G7 (Q109): the audience vendor. */
    audience?: AudienceSettings;
    /** G11-2: the push verdict — read-only, never a section the PUT accepts. */
    push?: PushStatus;
}

/**
 * G11-2: whether FCM can send — `shared/push`'s `readServiceAccount` over
 * `FIREBASE_SERVICE_ACCOUNT_JSON`, the verdict only; the service account
 * itself is never a field of the response. `reason` says which way it
 * failed: unset, or set but not a usable service account.
 */
export interface PushStatus {
    configured: boolean;
    reason?: "FCM_NOT_CONFIGURED" | "FCM_MISCONFIGURED";
}

export const PUSH_REASON_LABEL: Record<NonNullable<PushStatus["reason"]>, string> = {
    FCM_NOT_CONFIGURED: "FIREBASE_SERVICE_ACCOUNT_JSON is not set in the backend's environment.",
    FCM_MISCONFIGURED: "FIREBASE_SERVICE_ACCOUNT_JSON is set but is not a usable service account — the JSON does not parse or lacks the fields FCM needs.",
};

/** Which fields of each section are secrets — masked on read, blank means "keep". */
export const SECRET_FIELDS: Record<IntegrationSection, readonly string[]> = {
    sms: ["authKey"],
    email: ["password"],
    twilio: ["authToken"],
    resend: ["apiKey"],
    razorpay: ["keySecret", "webhookSecret"],
    cashfree: ["secretKey", "webhookSecret"],
    ccavenue: ["accessCode", "workingKey"],
    googleMaps: ["apiKey"],
    hrms: ["apiKey"],
    workTool: [],
    maps: ["googleBrowserKey", "googleServerKey", "mapboxPublicToken", "mapboxSecretToken"],
    audience: ["geoiqApiKey", "aziraApiKey"],
};

/** A value the server masked — never something to send back. */
export const isMasked = (value: string | null | undefined): boolean => typeof value === "string" && value.startsWith("••••");

/**
 * The patch a section's form sends: the fields that were typed, with a
 * blank secret left off so the stored one survives. `testMode` travels
 * whenever it moved, because false is a value too.
 */
export function sectionPatch(
    section: IntegrationSection,
    typed: Record<string, string | boolean>,
    stored: Record<string, string | number | boolean | null> | undefined,
): Record<string, string | number | boolean> {
    const patch: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(typed)) {
        if (typeof value === "boolean") {
            if (stored?.[key] !== value) patch[key] = value;
            continue;
        }
        const text = value.trim();
        if (SECRET_FIELDS[section].includes(key)) {
            if (text && !isMasked(text)) patch[key] = text;
            continue;
        }
        const before = stored?.[key];
        const beforeText = before === null || before === undefined ? "" : String(before);
        if (text !== beforeText) patch[key] = key === "port" ? Number(text) : text;
    }
    return patch;
}

/** What the routing card edits: the rails, the DLT ids and the template-id grid. */
export interface SmsRoutingDraft {
    primaryRail: SmsRailName;
    fallbackRails: SmsRailName[];
    dltEntityId: string;
    senderId: string;
    /** `templates[rail][kind]` as typed — a blank id drops the registration. */
    templateIds: Partial<Record<SmsRailName, Partial<Record<string, string>>>>;
}

/**
 * The rails the table draws: the server's list, plus any rail the stored row
 * names that the list no longer does — a registration on file is not
 * hidden because the vocabulary moved.
 */
export function railsOf(stored: SmsSettings | undefined, rails: readonly SmsRailName[]): SmsRailName[] {
    const names = [...rails];
    const mentioned = [stored?.primaryRail, ...(stored?.fallbackRails ?? []), ...Object.keys(stored?.templates ?? {})];
    for (const rail of mentioned) if (rail && !names.includes(rail)) names.push(rail);
    return names;
}

export const routingDraftOf = (stored: SmsSettings | undefined, rails: readonly SmsRailName[]): SmsRoutingDraft => {
    const templateIds: SmsRoutingDraft["templateIds"] = {};
    for (const rail of railsOf(stored, rails)) {
        const kinds = stored?.templates?.[rail] ?? {};
        templateIds[rail] = Object.fromEntries(Object.entries(kinds).map(([kind, registration]) => [kind, registration?.templateId ?? ""]));
    }
    return {
        primaryRail: stored?.primaryRail ?? rails[0] ?? "msg91",
        fallbackRails: stored?.fallbackRails ?? [],
        dltEntityId: stored?.dltEntityId ?? "",
        senderId: stored?.senderId ?? "",
        templateIds,
    };
};

/** The DLT header is at most 11 characters; the entity id at most 40. */
export function routingProblem(draft: SmsRoutingDraft): string | null {
    if (draft.senderId.trim().length > 11) return "The sender header is at most 11 characters.";
    if (draft.dltEntityId.trim().length > 40) return "The DLT entity id is at most 40 characters.";
    if (draft.fallbackRails.includes(draft.primaryRail)) return "A rail cannot be its own fallback.";
    if (new Set(draft.fallbackRails).size !== draft.fallbackRails.length) return "A rail is listed twice as a fallback.";
    return null;
}

/**
 * The `sms` patch for the routing card: only what moved. The template
 * grid travels whole when any id changed, each rail's existing `vars` and
 * `body` carried along so a registration is not stripped down to its id.
 */
export function smsRoutingPatch(stored: SmsSettings | undefined, draft: SmsRoutingDraft, rails: readonly SmsRailName[]): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    const before = routingDraftOf(stored, rails);
    if (draft.primaryRail !== before.primaryRail) patch.primaryRail = draft.primaryRail;
    if (draft.fallbackRails.join(",") !== before.fallbackRails.join(",")) patch.fallbackRails = draft.fallbackRails;
    if (draft.dltEntityId.trim() !== before.dltEntityId) patch.dltEntityId = draft.dltEntityId.trim();
    if (draft.senderId.trim() !== before.senderId) patch.senderId = draft.senderId.trim();

    const templates: SmsTemplates = {};
    let changed = false;
    for (const rail of railsOf(stored, rails)) {
        const kinds = draft.templateIds[rail] ?? {};
        const existing = stored?.templates?.[rail] ?? {};
        const next: Partial<Record<string, SmsKindRegistration>> = {};
        for (const [kind, typed] of Object.entries(kinds)) {
            const templateId = (typed ?? "").trim();
            const was = existing[kind];
            if (!templateId) {
                if (was) changed = true;
                continue;
            }
            if (was?.templateId !== templateId) changed = true;
            next[kind] = { ...(was ?? {}), templateId };
        }
        for (const kind of Object.keys(existing)) if (!(kind in kinds)) next[kind] = existing[kind];
        templates[rail] = next;
    }
    if (changed) patch.templates = templates;
    return patch;
}

/**
 * The `catchmentRadiusM` field is a number on the wire; `sectionPatch`
 * carries text. The audience card parses it here so the bounds the server
 * applies (50–5,000) are refused before the round trip.
 */
export function parseRadius(text: string): number | null {
    if (!/^\d+$/.test(text.trim())) return null;
    const value = Number(text.trim());
    return value >= 50 && value <= 5000 ? value : null;
}

/** This screen reads the API or says it cannot. */
export const integrationsReadApi = (): boolean => apiConfig.live;

export const integrationsService = {
    get: () => http.get<IntegrationsSettings>("/integrations"),

    /** One section at a time; a field omitted keeps its stored value. Audited by field name, never value. */
    update: (section: IntegrationSection, patch: Record<string, unknown>) =>
        http.put<IntegrationsSettings>("/integrations", { section, patch }),

    /** AC-B2: the seam's field catalogue the GeoIQ variable map is drawn from — the named rows, the groups, the key pattern. */
    audienceFields: () => http.get<AudienceFieldsCatalogue>("/integrations/audience/fields"),

    /**
     * AC-B2: asks the vendor ONCE at the backend's fixed test point with the
     * stored key and answers a plain verdict — a refused key or a dead host
     * is a verdict, never a 5xx. Audited INTEGRATION_TESTED, never with the key.
     */
    testAudienceVendor: (vendor: AudienceVendor) => http.post<AudienceVendorTest>("/integrations/audience/test", { vendor }),

    /**
     * AE-B/AE-C: one test message through the door in force to `to`, and the
     * verdict. Audited INTEGRATION_TESTED with the door and the verdict, never
     * the address or a secret.
     */
    testEmailDoor: (to: string) => http.post<EmailDoorVerdict>("/integrations/email/test", { to }),
};
