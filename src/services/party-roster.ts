import { EMPTY_CITY_FACET, cityFacetValue, type CityFacet } from "@/lib/city-facet";
import { DEFAULT_ACCOUNT_STATUS, isAccountStatusFacet, type AccountStatusCounts, type AccountStatusFacet } from "@/services/account-state";
import { KYC_QUEUE_STATES, KYC_STATE_META, type KycQueueState } from "@/services/kyc-state";
import { ONBOARDING_SOURCE_LABEL, type OnboardingSource } from "@/types";

/**
 * One roster for every party desk — 29 Sep 2026. The owner, comparing
 * Publishers › Directory with Advertisers: "Why this table columns look
 * different than advertisers?", and earlier, about production: "make sure
 * everything is uniform all across".
 *
 * Publishers, Advertisers, Print partners and Agents now draw the same
 * columns in the same order (`components/adx/party-roster-columns`) under
 * the same filter bar (`components/adx/party-roster-filter-bar`). This file
 * is the vocabulary the two share and the four services send: the five
 * filters as the bar holds them, what goes on the wire for each, and the
 * page every roster read answers.
 *
 * Every filter is the server's — the list routes take `q`, `onboardedVia`,
 * `kycState`, `type` and `city` — so a filter never hides a row that sits
 * on a page the console has not read yet.
 */

/** "Every door", "Every KYC state", "Every type" — the value a select holds when it is not filtering. */
export const ROSTER_ANY = "all";

/** The five filters as the bar holds them: the text typed, and each select's value (`ROSTER_ANY` for none). */
export interface PartyRosterFilters {
    q: string;
    door: string;
    kycState: string;
    type: string;
    /** The city as typed; a catalogued pick carries its slug, and that is what the request sends. */
    city: CityFacet;
    /**
     * 2 Oct 2026 (the account lifecycle): the Status select — Active (the
     * default), Suspended, Deactivated, Closed, Left, Everyone — on every
     * party roster. The print partners offer Active, Deactivated, Closed
     * and Everyone (`printPartnerStatusFacet`) — a shop is never suspended.
     */
    status?: string;
}

export const EMPTY_ROSTER_FILTERS: PartyRosterFilters = {
    q: "",
    door: ROSTER_ANY,
    kycState: ROSTER_ANY,
    type: ROSTER_ANY,
    city: EMPTY_CITY_FACET,
};

/** What a roster read sends — nothing that was not asked for. The agent route names the text `search`; its service renames it. */
export interface PartyRosterQuery {
    q?: string;
    onboardedVia?: string;
    kycState?: KycQueueState;
    type?: string;
    /** A catalogue slug, or the text as typed for a town the catalogue lacks. */
    city?: string;
    /** `?status=` — ACTIVE is the server's default, sent all the same so the read says what it shows. */
    status?: AccountStatusFacet;
}

/** The filters as a query: blanks and "every" dropped, the text trimmed, the city as `cityFacetValue` sends it. */
export function rosterQueryOf(filters: PartyRosterFilters): PartyRosterQuery {
    const q = filters.q.trim();
    const city = cityFacetValue(filters.city);
    const kycState = (KYC_QUEUE_STATES as readonly string[]).includes(filters.kycState) ? (filters.kycState as KycQueueState) : undefined;
    const status = filters.status && isAccountStatusFacet(filters.status) ? filters.status : undefined;
    return {
        ...(q ? { q } : {}),
        ...(filters.door !== ROSTER_ANY && filters.door ? { onboardedVia: filters.door } : {}),
        ...(kycState ? { kycState } : {}),
        ...(filters.type !== ROSTER_ANY && filters.type ? { type: filters.type } : {}),
        ...(city ? { city } : {}),
        ...(status ? { status } : {}),
    };
}

/** The query's filters as search params, in one order on every desk; `textKey` is `search` on the agent route. */
export function rosterParams(query: PartyRosterQuery, textKey: "q" | "search" = "q"): URLSearchParams {
    const params = new URLSearchParams();
    if (query.q) params.set(textKey, query.q);
    if (query.onboardedVia) params.set("onboardedVia", query.onboardedVia);
    if (query.kycState) params.set("kycState", query.kycState);
    if (query.type) params.set("type", query.type);
    if (query.city) params.set("city", query.city);
    if (query.status) params.set("status", query.status);
    return params;
}

/** A stable string for the query — what a roster read is keyed on, so a changed filter refetches and nothing else does. */
export function rosterQueryKey(query: PartyRosterQuery): string {
    return rosterParams(query).toString();
}

/** Whether any filter is set beyond its default — the bar offers "Clear" only then; the Status select's Active is the default. */
export function rosterFiltersActive(filters: PartyRosterFilters): boolean {
    const { status, ...rest } = rosterQueryOf(filters);
    return Object.keys(rest).length > 0 || (status !== undefined && status !== DEFAULT_ACCOUNT_STATUS);
}

/**
 * One page of a roster, whichever way the route pages: the rows, the token
 * for the next page (a page number, a cursor or an offset, as a string — the
 * service knows which), and the server's count of every row the filters
 * match when the route carries one.
 */
export interface PartyRosterPage<T> {
    rows: T[];
    nextCursor: string | null;
    total: number | null;
    /** 2 Oct 2026: the server's count per account state over the other filters — the Status select's numbers. Empty when not sent. */
    statusCounts?: AccountStatusCounts;
}

/** An option in one of the bar's selects. */
export interface RosterOption {
    value: string;
    label: string;
}

/** The KYC select — the six states the queue and every party page print, in the queue's order. */
export const KYC_STATE_OPTIONS: readonly RosterOption[] = KYC_QUEUE_STATES.map((state) => ({ value: state, label: KYC_STATE_META[state].label }));

/** The door select for the parties that carry the QR-14 stamp — publishers and advertisers. */
export const ONBOARDING_DOOR_OPTIONS: readonly RosterOption[] = (Object.keys(ONBOARDING_SOURCE_LABEL) as OnboardingSource[]).map((door) => ({
    value: door,
    label: ONBOARDING_SOURCE_LABEL[door],
}));

/**
 * A print partner's doors: a shop applies in the app, is added at the desk
 * or arrives in an import — no agent onboards one, so the two agent doors
 * are not offered.
 */
export const PRINT_PARTNER_DOOR_OPTIONS: readonly RosterOption[] = (["SELF", "DESK", "IMPORT"] as OnboardingSource[]).map((door) => ({
    value: door,
    label: ONBOARDING_SOURCE_LABEL[door],
}));

/** "1 spot", "3 campaigns" — the Activity cell. */
export function activityLine(count: number, noun: readonly [string, string]): string {
    return `${count} ${count === 1 ? noun[0] : noun[1]}`;
}
