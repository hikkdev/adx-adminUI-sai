import { ApiError, api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { formatDate } from "@/lib/format";
import type { StatusMeta, Tone, UserRole } from "@/types";

/**
 * Users — the console's own identity domain, wired to the backend `users`
 * module (Lot A).
 *
 * Three response shapes come off the wire, one per endpoint group, and they
 * are not interchangeable (see `users.mapper.ts` on the backend): the admin
 * list carries `isActive` and `lastLoginAt`; `GET /users/:id` and `/users/me`
 * carry the profile plus `closedAt` / `closeReason`; the admin update echoes
 * a narrower object still. Each has its own type here rather than one merged
 * `User` with a dozen optionals nobody can trust.
 *
 * No fixture fallback. The `usr_*` seeds that used to draw these screens are
 * gone: their ids were never issued by the backend, and the fields they
 * carried — a city, "verified identity", "12 minutes ago", a list of
 * sessions — have no source on the admin list. With the API off the screens
 * say so.
 *
 * Package CD extends this file with the closure and erasure calls
 * (`/users/closure-cases`, `/users/:id/erasure`, …); keep the functions here
 * small and append below the `usersService` object rather than inside it.
 */

/* ------------------------------------------------------------------ */
/* The wire                                                            */
/* ------------------------------------------------------------------ */

/**
 * Lot K2: the second-factor summary every admin read carries — each
 * `GET /users` row and `GET /users/:id`. `method` is the factor the next
 * sign-in asks for: the app once enrolled, SMS for an account the second
 * factor is on for, null otherwise. `enrolledAt` and `recoveryCodesLeft`
 * are the app's — null and 0 without one.
 */
export interface TwoFactorSummary {
    required: boolean;
    method: "AUTHENTICATOR" | "SMS" | null;
    enrolledAt: string | null;
    recoveryCodesLeft: number;
}

/** The 2FA column and the Access card's headline: what the next sign-in asks for. */
export function twoFactorLabel(summary: TwoFactorSummary | null | undefined): "Authenticator" | "SMS" | "Not set" {
    if (summary?.method === "AUTHENTICATOR") return "Authenticator";
    if (summary?.method === "SMS") return "SMS";
    return "Not set";
}

/**
 * What `POST /users/:id/2fa/reset` clears, named before the desk confirms:
 * the email backup count always; the app and its codes only when there is
 * one. The confirm prints exactly this list so nobody is surprised.
 */
export function twoFactorResetClears(summary: TwoFactorSummary | null | undefined): string[] {
    const cleared = ["the email backup count for the last thirty days"];
    if (summary?.method === "AUTHENTICATOR") {
        cleared.push(summary.enrolledAt ? `the authenticator app enrolled on ${formatDate(summary.enrolledAt)}` : "the authenticator app");
        cleared.push(
            summary.recoveryCodesLeft === 1 ? "the 1 unused recovery code" : `the ${summary.recoveryCodesLeft} unused recovery codes`,
        );
    }
    return cleared;
}

/** What the reset answers: the sentence, and what it actually cleared. */
export interface TwoFactorResetResult {
    message: string;
    cleared: { emailFallback: boolean; authenticator: boolean; recoveryCodes: number };
}

/** One row of `GET /users` — `adminListPayload`. */
export interface WireUserRow {
    id: string;
    mobile: string;
    name: string | null;
    email: string | null;
    language: string | null;
    isActive: boolean;
    closedAt: string | null;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
    roles: UserRole[];
    /** E6: the console role, or null — so the members roster needs no per-row read. */
    roleConfig: { id: string; name: string } | null;
    /** Lot K2: the factor the next sign-in asks for. Optional on the read for a backend older than the field. */
    twoFactor?: TwoFactorSummary;
}

/** `GET /users/:id` — `profilePayload` plus the console role. */
export interface WireUserDetail {
    id: string;
    mobile: string;
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
    hasPassword: boolean;
    language: string | null;
    closedAt: string | null;
    closeReason: string | null;
    /** E6: the account facts beside the profile — the list used to be the only read that said them. */
    isActive: boolean;
    createdAt: string;
    lastLoginAt: string | null;
    roles: UserRole[];
    roleConfig: { id: string; name: string } | null;
    /** K-B1: how many contact rows sit beside the primary pair. */
    contactsCount: number;
    /** K-B1: open sessions, counted on the read. */
    sessionsCount: number;
    /** K-B1: when the second factor was switched on for this account; null when it never was. */
    twoFactorRequiredAt: string | null;
    /** Lot K2: the factor the next sign-in asks for, the app's enrolment date and its unused codes. */
    twoFactor?: TwoFactorSummary;
    /** K-B1: every party this person is, so the page can link across. */
    parties: UserParties;
}

/** A party profile the account holds — `{ id, displayId }` — or null. */
export type PartyRef = { id: string; displayId: string | null } | null;

export interface UserParties {
    publisher: PartyRef;
    advertiser: PartyRef;
    agent: PartyRef;
    printPartner: PartyRef;
}

/** Where each party's page is, for the header's links. */
export const PARTY_LINKS: { key: keyof UserParties; label: string; href: (id: string) => string }[] = [
    { key: "publisher", label: "Publisher", href: (id) => `/publishers/${encodeURIComponent(id)}` },
    { key: "advertiser", label: "Advertiser", href: (id) => `/advertisers/${encodeURIComponent(id)}` },
    { key: "agent", label: "Agent", href: (id) => `/agents/${encodeURIComponent(id)}` },
    { key: "printPartner", label: "Print partner", href: (id) => `/print-partners/${encodeURIComponent(id)}` },
];

/**
 * `GET /users/me` — the same profile plus the second-factor state (E6):
 * when a challenge was last required and how much of the
 * three-in-thirty-days email backup has been used. `/me` only; the admin
 * reads do not carry it. M-B: the console role rides along as
 * `roleConfig { id, name, isSystem }` and `isSuperAdmin` says whether the
 * operator may hand out the system role (a member of it, or an ADMIN with
 * no role config under the launch rule — the predicate the grant guard
 * applies), so the console never makes a second read to decide it; a
 * non-admin reads null / false.
 */
export type WireMe = Omit<WireUserDetail, "roleConfig" | "contactsCount" | "sessionsCount" | "twoFactorRequiredAt" | "twoFactor" | "parties"> & {
    roleConfig: { id: string; name: string; isSystem: boolean } | null;
    isSuperAdmin: boolean;
    twoFactorRequiredAt: string | null;
    emailOtpFallbackCount: number;
    emailOtpFallbackResetAt: string | null;
};

/** `PATCH /users/:id` — the narrow echo. */
export interface WireUserUpdated {
    id: string;
    mobile: string;
    name: string | null;
    email: string | null;
    isActive: boolean;
    roles: UserRole[];
}

/** One row of `GET /users/me/sessions`. */
export interface WireSession {
    id: string;
    userAgent: string | null;
    ipAddress: string | null;
    lastUsedAt: string | null;
    createdAt: string;
    expiresAt: string;
    current: boolean;
}

/** One row of `GET /users/me/activity`. */
export interface WireActivity {
    id: string;
    action: string;
    module: string | null;
    targetType: string | null;
    targetId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
}

export type InviteMethod = "PASSWORD" | "GOOGLE";
export type InviteStatus = "OPEN" | "ACCEPTED" | "REVOKED" | "EXPIRED";

/** An invitation as `/users/invites*` sends it. */
export interface Invite {
    id: string;
    email: string;
    method: InviteMethod;
    roleConfigId: string | null;
    expiresAt: string;
    acceptedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
    status: InviteStatus;
    invitedBy?: { id: string; name: string | null; email: string | null };
}

/* ------------------------------------------------------------------ */
/* How the screens read a row                                          */
/* ------------------------------------------------------------------ */

/**
 * The three states an account can be in, from the two columns the list
 * carries. A closed account is kept rather than deleted (Q21), so it needs
 * its own word; "deactivated" is `isActive: false` on an account that is
 * still open.
 */
export type UserStatus = "active" | "deactivated" | "closed";

export const USER_STATUS_META: Record<UserStatus, StatusMeta> = {
    active: { label: "Active", tone: "success" },
    deactivated: { label: "Deactivated", tone: "danger" },
    closed: { label: "Closed", tone: "neutral" },
};

export function userStatusOf(user: Pick<WireUserRow, "isActive" | "closedAt">): UserStatus {
    if (user.closedAt) return "closed";
    return user.isActive ? "active" : "deactivated";
}

/**
 * The backend's `User.name` is nullable — an invited account has none until
 * it is filled in — and the local part of the email is the best stand-in.
 */
export function displayNameOf(user: { name: string | null; email: string | null; mobile?: string }): string {
    const name = user.name?.trim();
    if (name) return name;
    const local = user.email?.split("@")[0]?.trim();
    if (local) return local;
    return user.mobile ?? "ADX user";
}

export interface UserRow extends WireUserRow {
    displayName: string;
    status: UserStatus;
}

export function shapeUserRow(wire: WireUserRow): UserRow {
    return { ...wire, displayName: displayNameOf(wire), status: userStatusOf(wire) };
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export interface UsersQuery {
    /** Sent to the API: `?closed=true|false`. Left off, the API answers everybody. */
    closed?: boolean;
    /** E6: `?q=` — name, email or mobile contains; K-B1: any contact row's value too. The employee picker (CE3) searches with it. */
    q?: string;
    /** E6: `?role=` — one role. The reviewer pickers send `ADMIN` rather than filtering the whole roster here (CE5). */
    role?: UsersRoleFacet;
    /** K-B1: `?state=` — the directory's chips. CLOSED is `closedAt` set, INACTIVE `isActive: false` on an open account. */
    state?: UserState;
    /** K-B1: `?sort=`; the server's default is newest. */
    sort?: UserSort;
}

/** The one role facet `GET /users?role=` takes — the assignable roles, one at a time. */
export type UsersRoleFacet = "ADMIN" | "AGENT_PUBLISHER" | "AGENT_ADVERTISER" | "PUBLISHER" | "ADVERTISER" | "PARTNER";
export const USERS_ROLE_FACETS: readonly UsersRoleFacet[] = ["PUBLISHER", "ADVERTISER", "AGENT_PUBLISHER", "AGENT_ADVERTISER", "PARTNER", "ADMIN"];

/** K-B1: the three states `?state=` takes, and how the chips name them. */
export type UserState = "ACTIVE" | "INACTIVE" | "CLOSED";
export const USER_STATES: readonly UserState[] = ["ACTIVE", "INACTIVE", "CLOSED"];
export const USER_STATE_LABEL: Record<UserState, string> = { ACTIVE: "Active", INACTIVE: "Inactive", CLOSED: "Closed" };

export type UserSort = "newest" | "oldest" | "name" | "lastLogin";
export const USER_SORTS: readonly UserSort[] = ["newest", "oldest", "name", "lastLogin"];
export const USER_SORT_LABEL: Record<UserSort, string> = {
    newest: "Newest first",
    oldest: "Oldest first",
    name: "By name",
    lastLogin: "Last signed in",
};

/** `?closed=`, `?q=`, `?role=`, `?state=` and `?sort=` exactly as `adminUsersQuerySchema` parses them. */
export function buildUsersQuery(query: UsersQuery = {}): string {
    const params = new URLSearchParams();
    if (query.closed !== undefined) params.set("closed", String(query.closed));
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.role) params.set("role", query.role);
    if (query.state) params.set("state", query.state);
    if (query.sort) params.set("sort", query.sort);
    return params.toString();
}

/** K-B1: what `GET /users` carries beside the rows — the per-state counts (with the state facet removed) and the total. */
export interface UsersDirectory {
    rows: UserRow[];
    counts: Record<UserState, number>;
    total: number;
}

/**
 * What the status facet means for the one parameter the API takes.
 *
 * Only "closed" narrows the server read: picking it alone asks for closed
 * accounts, picking anything else without it asks for open ones, and mixing
 * or picking nothing asks for everybody. Active versus deactivated is then
 * `filterUsers` over the answer, because the API does not split them.
 */
export function closedFacetOf(statuses: readonly UserStatus[]): boolean | undefined {
    if (statuses.length === 0) return undefined;
    const wantsClosed = statuses.includes("closed");
    if (wantsClosed && statuses.length === 1) return true;
    if (!wantsClosed) return false;
    return undefined;
}

/**
 * The one facet the API does not take.
 *
 * Since E6 `GET /users` cuts on `closed`, `q` and `role`; active versus
 * deactivated is the split it still does not make, so that one is applied
 * here, on the list the API answered. Pure so the rule can be pinned
 * without a transport.
 */
export function filterUsers(rows: UserRow[], facets: { status?: UserStatus[] }): UserRow[] {
    const statuses = facets.status ?? [];
    if (!statuses.length) return rows;
    return rows.filter((row) => statuses.includes(row.status));
}

/* ------------------------------------------------------------------ */
/* Bodies                                                              */
/* ------------------------------------------------------------------ */

/**
 * `PATCH /users/:id`. A mobile or email change needs `reason` (the server
 * compares against the row, so an unchanged form never asks); the API
 * refuses a mobile change on an admin. K-B1: `language` and `avatarUrl`
 * (null clears it) too.
 */
export interface UpdateUserInput {
    name?: string;
    email?: string;
    mobile?: string;
    isActive?: boolean;
    language?: string;
    avatarUrl?: string | null;
    reason?: string;
}

/** The reason's bounds, as the users schemas spell them — the editor's identity moves and every contact write. */
export const USER_REASON_MIN = 10;
export const USER_REASON_MAX = 500;

/** The fields the edit dialog holds, as the form types them. */
export interface UserEditForm {
    name: string;
    email: string;
    mobile: string;
    language: string;
    avatarUrl: string;
}

export type EditableUser = Pick<WireUserDetail, "id" | "name" | "email" | "mobile" | "language" | "avatarUrl">;

export function editFormOf(user: EditableUser): UserEditForm {
    return {
        name: user.name ?? "",
        email: user.email ?? "",
        mobile: user.mobile,
        language: user.language ?? "",
        avatarUrl: user.avatarUrl ?? "",
    };
}

/**
 * K-B1: the diff-only body — a field goes on the wire only when it differs
 * from the row, so a form saved unchanged sends nothing and never asks for
 * a reason. `movesIdentity` is true when the mobile or the email changes:
 * the dialog demands a reason then and warns that sign-in moves. An empty
 * email is not sent as a clear (the schema takes no null email); an
 * emptied avatar is sent as `null` only when the row had one.
 */
export function userEditDiff(user: EditableUser, form: UserEditForm): { body: UpdateUserInput; movesIdentity: boolean } {
    const body: UpdateUserInput = {};
    const name = form.name.trim();
    if (name && name !== (user.name ?? "")) body.name = name;
    const email = form.email.trim().toLowerCase();
    if (email && email !== (user.email ?? "").toLowerCase()) body.email = email;
    const mobile = form.mobile.trim();
    if (mobile && mobile !== user.mobile) body.mobile = mobile;
    const language = form.language.trim();
    if (language && language !== (user.language ?? "")) body.language = language;
    const avatarUrl = form.avatarUrl.trim();
    if (avatarUrl !== (user.avatarUrl ?? "")) {
        if (avatarUrl) body.avatarUrl = avatarUrl;
        else if (user.avatarUrl) body.avatarUrl = null;
    }
    return { body, movesIdentity: body.mobile !== undefined || body.email !== undefined };
}

/**
 * What a 409 `CONTACT_TAKEN` says: whose the value already is, and whether
 * as their sign-in identity or as a contact row. Null for any other error.
 */
export interface ContactTaken {
    which: "PRIMARY" | "CONTACT";
    userId: string;
    contactId: string | null;
    kind: "EMAIL" | "PHONE" | null;
    value: string | null;
}

export function contactTakenOf(error: unknown): ContactTaken | null {
    if (!(error instanceof ApiError) || error.code !== "CONTACT_TAKEN") return null;
    const details = (error.details ?? {}) as Partial<ContactTaken>;
    return {
        which: details.which === "CONTACT" ? "CONTACT" : "PRIMARY",
        userId: typeof details.userId === "string" ? details.userId : "",
        contactId: typeof details.contactId === "string" ? details.contactId : null,
        kind: details.kind === "EMAIL" || details.kind === "PHONE" ? details.kind : null,
        value: typeof details.value === "string" ? details.value : null,
    };
}

/** "already on <who>" — the sentence the desk reads on a taken value. */
export function contactTakenMessage(taken: ContactTaken): string {
    const what = taken.value ? `${taken.value} is` : "That value is";
    const who = taken.userId ? `account ${taken.userId}` : "another account";
    if (taken.which === "PRIMARY") {
        const as = taken.kind === "EMAIL" ? "email" : taken.kind === "PHONE" ? "mobile" : "identity";
        return `${what} already on ${who} as their sign-in ${as}.`;
    }
    return `${what} already on ${who} as a contact.`;
}

/** `POST /users` — `createUserSchema`: mobile + name? + email? + roles, K-B1 `roleConfigId?`. */
export interface CreateUserInput {
    mobile: string;
    name?: string;
    email?: string;
    roles: UsersRoleFacet[];
    roleConfigId?: string;
}

/** What `POST /users` echoes. */
export interface WireUserCreated {
    id: string;
    mobile: string;
    name: string | null;
    roles: UserRole[];
}

/* ---- K-B1: contacts --------------------------------------------- */

export type ContactKind = "EMAIL" | "PHONE";
export const CONTACT_KIND_LABEL: Record<ContactKind, string> = { EMAIL: "Email", PHONE: "Phone" };

/** One `UserContact` row as `/users/:id/contacts` sends it. */
export interface WireContact {
    id: string;
    kind: ContactKind;
    value: string;
    label: string | null;
    verifiedAt: string | null;
    addedBy: { id: string; name: string | null };
    createdAt: string;
}

/** `GET /users/:id/contacts` — the primary pair and every row beside it. */
export interface WireContacts {
    primary: {
        mobile: string;
        mobileVerifiedAt: string | null;
        email: string | null;
        /** Derived from the codes the address has answered — `User` has no `emailVerifiedAt`. */
        emailVerified: boolean;
    };
    contacts: WireContact[];
}

/** `POST /users/:id/contacts` — the desk's add carries a reason. */
export interface AddContactInput {
    kind: ContactKind;
    value: string;
    label?: string;
    reason: string;
}

/** What send-code answers; the desk never sees the code itself. */
export interface ContactCodeSent {
    kind: ContactKind;
    expiresInSeconds: number;
    resendAfterSeconds: number;
    sendsRemaining: number;
}

/** What make-primary answers: the swap, and whether the sessions went with it. */
export interface PrimaryChanged {
    kind: ContactKind;
    before: string | null;
    after: string;
    wasVerified: boolean;
    primary: { mobile: string; email: string | null };
    sessionsRevoked: boolean;
}

/** `POST /users/invites`. */
export interface InviteInput {
    email: string;
    roleConfigId?: string;
    method: InviteMethod;
}

/** What `GET /auth/invites/:token` says about a link before anybody types. */
export interface InviteDescription {
    email: string;
    method: InviteMethod;
    expiresAt: string | null;
    valid: boolean;
}

/** `POST /auth/accept-invite`: step one without `otpCode`, step two with it. */
export interface AcceptInviteInput {
    token: string;
    name: string;
    mobile: string;
    otpCode?: string;
    password?: string;
}

export type AcceptInviteResult =
    | {
          stage: "OTP_SENT";
          mobile: string;
          expiresInSeconds: number;
          resendAfterSeconds: number;
          sendsRemaining: number;
          devOtp?: string;
      }
    | {
          stage: "ACCEPTED";
          user: { id: string; email: string | null; mobile: string; name: string | null };
          roles: UserRole[];
      };

/* ------------------------------------------------------------------ */
/* The service                                                         */
/* ------------------------------------------------------------------ */

/**
 * Refuses to talk to the API while the domain is off. There is nothing to
 * fall back to — the user fixtures are gone — so a request that would have
 * gone out with a seeded id stops here instead.
 */
function live() {
    if (!isLive("users")) throw new Error("Users read the API; connect the console to the ADX backend first.");
    return http;
}

/** `/users/me*` is the session's own record and belongs with sign-in. */
function session() {
    if (!isLive("auth")) throw new Error("Your account reads the API; connect the console to the ADX backend first.");
    return http;
}

export const usersService = {
    /* ---- everybody ---------------------------------------------- */

    /** The admin list. `closed`, `q` and `role` go to the API; active versus deactivated is `filterUsers`. */
    list: async (query: UsersQuery = {}): Promise<UserRow[]> => {
        const qs = buildUsersQuery(query);
        const rows = await live().get<WireUserRow[]>(`/users${qs ? `?${qs}` : ""}`);
        return (rows ?? []).map(shapeUserRow);
    },

    /**
     * K-B1: the directory — the same list with the per-state `counts` and
     * the `total` the server sends beside `data`, so the state chips say how
     * many each would show without a second call.
     */
    directory: async (query: UsersQuery = {}): Promise<UsersDirectory> => {
        const qs = buildUsersQuery(query);
        const page = await live().getEnvelope<WireUserRow[], { counts?: Partial<Record<UserState, number>>; total?: number }>(
            `/users${qs ? `?${qs}` : ""}`,
        );
        const rows = (page.data ?? []).map(shapeUserRow);
        return {
            rows,
            counts: { ACTIVE: page.counts?.ACTIVE ?? 0, INACTIVE: page.counts?.INACTIVE ?? 0, CLOSED: page.counts?.CLOSED ?? 0 },
            total: page.total ?? rows.length,
        };
    },

    /** One account with its console role. */
    get: (id: string): Promise<WireUserDetail> => live().get<WireUserDetail>(`/users/${id}`),

    /** K-B1: `POST /users` — the desk creating a person; 409 CONTACT_TAKEN on a taken mobile or email. */
    create: (input: CreateUserInput): Promise<WireUserCreated> => live().post<WireUserCreated>("/users", input),

    /* ---- K-B1: contacts ------------------------------------------ */

    /** The primary pair and every contact row beside it. */
    contactsOf: (id: string): Promise<WireContacts> => live().get<WireContacts>(`/users/${id}/contacts`),

    /** Adds a row, unverified, with the desk's reason. 409 CONTACT_TAKEN when any account already has the value. */
    addContact: (id: string, input: AddContactInput): Promise<WireContact> =>
        live().post<WireContact>(`/users/${id}/contacts`, {
            kind: input.kind,
            value: input.value.trim(),
            ...(input.label?.trim() ? { label: input.label.trim() } : {}),
            reason: input.reason.trim(),
        }),

    updateContactLabel: (id: string, contactId: string, label: string | null): Promise<WireContact> =>
        live().patch<WireContact>(`/users/${id}/contacts/${contactId}`, { label: label?.trim() || null }),

    /** The reason travels in the DELETE body — the schema demands one. */
    removeContact: (id: string, contactId: string, reason: string): Promise<{ message: string }> =>
        live().delete<{ message: string }>(`/users/${id}/contacts/${contactId}`, { body: { reason: reason.trim() } }),

    /** A code to the contact itself, on the person's behalf; 409 ALREADY_VERIFIED. */
    sendContactCode: (id: string, contactId: string): Promise<ContactCodeSent> =>
        live().post<ContactCodeSent>(`/users/${id}/contacts/${contactId}/send-code`),

    /** The code the person read back. The OTP refusals pass through. */
    verifyContact: (id: string, contactId: string, code: string): Promise<WireContact> =>
        live().post<WireContact>(`/users/${id}/contacts/${contactId}/verify`, { code: code.trim() }),

    /** The desk's word, no code typed — audited with the reason. */
    markContactVerified: (id: string, contactId: string, reason: string): Promise<WireContact> =>
        live().post<WireContact>(`/users/${id}/contacts/${contactId}/mark-verified`, { reason: reason.trim() }),

    /**
     * The swap: the row becomes the primary, the old primary drops down as a
     * verified contact. A PHONE promotion ends every session the account
     * holds. The desk may promote an unverified row; the audit row says so.
     */
    makeContactPrimary: (id: string, contactId: string, reason: string): Promise<PrimaryChanged> =>
        live().post<PrimaryChanged>(`/users/${id}/contacts/${contactId}/make-primary`, { reason: reason.trim() }),

    /** E6: somebody else's open sessions — the `/me/sessions` shape, `current` always false. There is no admin revoke. */
    sessionsOf: async (id: string): Promise<WireSession[]> => (await live().get<WireSession[]>(`/users/${id}/sessions`)) ?? [],

    /** E6: somebody else's recent activity — the `/me/activity` shape. */
    activityOf: async (id: string): Promise<WireActivity[]> =>
        (await live().get<WireActivity[]>(`/users/${id}/activity`)) ?? [],

    /**
     * E6: `POST /users/:id/reset-password` — sends the ordinary reset link
     * to the account's email. 409 `NO_EMAIL` without one; audited against
     * the account as `PASSWORD_RESET_SENT_BY_ADMIN`.
     */
    resetPassword: (id: string): Promise<{ message: string }> => live().post(`/users/${id}/reset-password`),

    update: (id: string, input: UpdateUserInput): Promise<WireUserUpdated> =>
        live().patch<WireUserUpdated>(`/users/${id}`, input),

    /** `PUT /users/:id/role-config` — `null` removes the role, which under the launch rule is a widening. */
    setRoleConfig: (id: string, roleConfigId: string | null): Promise<{ userId: string; roleConfig: { id: string; name: string } | null }> =>
        live().put(`/users/${id}/role-config`, { roleConfigId }),

    /**
     * `POST /users/roles` — grants one seeded role. The roles ride in the
     * access token, so the server ends every session; granting ADMIN also
     * turns the second factor on, and an agent role gets its profile made.
     * There is no route that takes a role away.
     */
    grantRole: (userId: string, role: UsersRoleFacet): Promise<{ message: string }> => live().post("/users/roles", { userId, role }),

    /**
     * `POST /users/:id/2fa/reset` — hands the email backup back and, Lot K2,
     * clears the authenticator app and every recovery code, so the next
     * sign-in is a code to the phone again. The answer says what it cleared.
     */
    resetTwoFactor: (id: string): Promise<TwoFactorResetResult> => live().post<TwoFactorResetResult>(`/users/${id}/2fa/reset`),

    /* ---- invitations -------------------------------------------- */

    invites: async (): Promise<Invite[]> => (await live().get<Invite[]>("/users/invites")) ?? [],

    invite: (input: InviteInput): Promise<Invite> => live().post<Invite>("/users/invites", input),

    /** A new token and a new week; the old link stops working. */
    resendInvite: (id: string): Promise<Invite> => live().post<Invite>(`/users/invites/${id}/resend`),

    revokeInvite: (id: string): Promise<Invite> => live().delete<Invite>(`/users/invites/${id}`),

    /* ---- the anonymous half, for /accept-invite ------------------ */

    describeInvite: (token: string): Promise<InviteDescription> =>
        http.get<InviteDescription>(`/auth/invites/${encodeURIComponent(token)}`, { anonymous: true }),

    acceptInvite: (input: AcceptInviteInput): Promise<AcceptInviteResult> =>
        http.post<AcceptInviteResult>("/auth/accept-invite", input, { anonymous: true }),

    /* ---- me ------------------------------------------------------ */

    me: (): Promise<WireMe> => session().get<WireMe>("/users/me"),

    updateMe: (input: { name?: string; email?: string; language?: string }): Promise<WireMe> =>
        session().patch<WireMe>("/users/me", input),

    mySessions: async (): Promise<WireSession[]> => (await session().get<WireSession[]>("/users/me/sessions")) ?? [],

    revokeMySession: (id: string): Promise<{ message: string }> => session().delete(`/users/me/sessions/${id}`),

    /** E6: `DELETE /users/me/sessions` — ends every other device's session and keeps this one; `{ revoked }`. */
    revokeMyOtherSessions: (): Promise<{ revoked: number }> => session().delete("/users/me/sessions"),

    myActivity: async (): Promise<WireActivity[]> => (await session().get<WireActivity[]>("/users/me/activity")) ?? [],

    /** `POST /auth/change-password`. `currentPassword` is optional only on an account that has none yet. */
    changeMyPassword: (input: { currentPassword?: string; newPassword: string }): Promise<{ message: string }> =>
        session().post("/auth/change-password", input),
};

/* ================================================================== */
/* Package CD — closing an account and erasing the person behind it   */
/* (`account-lifecycle`, mounted under `/users`; Lot A, Q21/Q60)       */
/* ================================================================== */

/*
 * An account with history is closed, never deleted. `DELETE /users/:id`
 * refuses with 409 USER_HAS_HISTORY and names the closure case as the path.
 * A closure is a case before it is an act: somebody asks, the case records
 * the four numbers that mattered at that moment, and an admin decides it.
 * Only the CLOSED decision does anything, and it re-runs the review first —
 * so a 409 CLOSURE_BLOCKED can come back at the decision with today's
 * blockers, which the console draws off `details` rather than off a message.
 *
 * Erasure is four gates: somebody asks, the account is CLOSED, a DPO signs
 * (`dpo.erasure`, its own permission group), an admin executes. Approval and
 * execution are separate people-acts on purpose; the second is irreversible.
 *
 * Money stays a string end to end. `Money` on the wire is a decimal string
 * and it becomes a number nowhere in this file.
 */

/* ---- vocabulary ------------------------------------------------- */

export type ClosureDecision = "PENDING" | "CLOSED" | "REFUSED";
export const CLOSURE_DECISIONS: readonly ClosureDecision[] = ["PENDING", "CLOSED", "REFUSED"];

export const CLOSURE_DECISION_META: Record<ClosureDecision, StatusMeta> = {
    PENDING: { label: "Pending", tone: "warning" },
    CLOSED: { label: "Closed", tone: "neutral" },
    REFUSED: { label: "Refused", tone: "danger" },
};

export type ErasureStatus = "PENDING" | "APPROVED" | "DONE" | "REFUSED";
export const ERASURE_STATUSES: readonly ErasureStatus[] = ["PENDING", "APPROVED", "DONE", "REFUSED"];

export const ERASURE_STATUS_META: Record<ErasureStatus, StatusMeta> = {
    PENDING: { label: "Awaiting DPO", tone: "warning" },
    APPROVED: { label: "Approved, not carried out", tone: "info" },
    DONE: { label: "Erased", tone: "neutral" },
    REFUSED: { label: "Refused", tone: "danger" },
};

export type ErasureVia = "APP" | "EMAIL" | "OPS";
export const ERASURE_VIA_LABEL: Record<ErasureVia, string> = {
    APP: "From the app",
    EMAIL: "By email",
    OPS: "At the desk",
};

export type WalletKind = "PUBLISHER" | "ADVERTISER" | "AGENT";
export const WALLET_KIND_LABEL: Record<WalletKind, string> = {
    PUBLISHER: "Publisher",
    ADVERTISER: "Advertiser",
    AGENT: "Agent",
};

/** The person a case or a request is about, as the list joins them. */
export interface LifecyclePerson {
    id: string;
    name: string | null;
    mobile: string;
    closedAt: string | null;
}

/** Name, then number, then the id — never blank in a table cell. */
export function personLabel(person: LifecyclePerson | null | undefined, fallbackId?: string): string {
    const name = person?.name?.trim();
    if (name) return name;
    if (person?.mobile) return person.mobile;
    return fallbackId ?? "—";
}

/* ---- the review -------------------------------------------------- */

/**
 * One line of the review. The seven kinds the server knows are listed for
 * the detail printer; `blocking` is the server's verdict and the console
 * keeps no list of its own about which kinds refuse a closure.
 */
export type ClosureBlockerKind =
    | "WITHDRAWALS_IN_FLIGHT"
    | "OPEN_ORDERS"
    | "OPEN_CAMPAIGNS"
    | "OPEN_AGENT_WORK"
    | "WALLET_BALANCE"
    | "OPEN_AGREEMENTS"
    | "OPEN_TICKETS";

export interface ClosureBlocker {
    kind: ClosureBlockerKind | (string & {});
    label: string;
    count: number;
    /** True when a closure is refused while this stands. */
    blocking: boolean;
    /** Ids, references, an amount — shaped per kind; see `blockerDetailLines`. */
    detail?: unknown;
}

export interface WalletLine {
    kind: WalletKind;
    partyId: string;
    walletId: string;
    balance: string;
    withdrawable: string;
    frozenAt: string | null;
}

export interface ClosureSummary {
    /** Every wallet the account's profiles own, added up. A decimal string. */
    walletBalance: string;
    withdrawalsInFlight: number;
    openOrders: number;
    openWork: number;
    openCampaigns: number;
    openAgreements: number;
    openTickets: number;
    canClose: boolean;
}

/** `GET /users/:id/closure-review`. */
export interface ClosureReview {
    userId: string;
    name: string | null;
    mobile: string;
    closedAt: string | null;
    parties: { publisherId: string | null; advertiserId: string | null; agentProfileId: string | null };
    wallets: WalletLine[];
    summary: ClosureSummary;
    blockers: ClosureBlocker[];
}

/** The lines that actually refuse a closure, by the server's flag. */
export const blockingOf = (blockers: ClosureBlocker[]): ClosureBlocker[] =>
    blockers.filter((blocker) => blocker.blocking);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * What to print under a blocker, per kind.
 *
 * `detail` is `unknown` on the wire on purpose — each kind carries its own
 * shape — and this is the one place that knows them. Anything it does not
 * recognise prints nothing rather than `[object Object]`.
 */
export function blockerDetailLines(blocker: ClosureBlocker): string[] {
    const { kind, detail } = blocker;

    if (kind === "WITHDRAWALS_IN_FLIGHT" && Array.isArray(detail)) {
        return detail.filter(isRecord).map((row) => {
            const reference =
                typeof row.reference === "string" && row.reference ? row.reference : String(row.id ?? "");
            return `${reference} · ${String(row.status ?? "")}`;
        });
    }

    if (kind === "OPEN_ORDERS" && Array.isArray(detail)) {
        return detail.filter((id): id is string => typeof id === "string");
    }

    if (kind === "OPEN_CAMPAIGNS" && Array.isArray(detail)) {
        return detail.flatMap((row) => {
            if (typeof row === "string") return [row];
            if (!isRecord(row)) return [];
            const name = typeof row.name === "string" && row.name ? row.name : String(row.id ?? "");
            if (!name) return [];
            return [row.status ? `${name} · ${String(row.status)}` : name];
        });
    }

    if (kind === "OPEN_AGENT_WORK" && isRecord(detail)) {
        const parts = (
            [
                ["offers", "offer"],
                ["visits", "visit"],
                ["milestones", "milestone"],
            ] as const
        )
            .map(([key, noun]) => [Number(detail[key] ?? 0), noun] as const)
            .filter(([count]) => count > 0)
            .map(([count, noun]) => plural(count, noun));
        return parts.length ? [`${parts.join(", ")} — handed back by the closure`] : [];
    }

    if (kind === "WALLET_BALANCE" && isRecord(detail) && Array.isArray(detail.wallets)) {
        return detail.wallets
            .filter(isRecord)
            .filter((line) => typeof line.balance === "string" && !/^0(\.0+)?$/.test(line.balance))
            .map((line) => {
                const kindLabel = WALLET_KIND_LABEL[line.kind as WalletKind] ?? String(line.kind ?? "");
                return `${kindLabel} wallet · ${String(line.balance)}`;
            });
    }

    return [];
}

/** The blockers a 409 CLOSURE_BLOCKED carries. Empty for any other error. */
export function closureBlockedBlockers(error: unknown): ClosureBlocker[] {
    if (!(error instanceof ApiError) || error.code !== "CLOSURE_BLOCKED") return [];
    const details = error.details as { blockers?: unknown } | undefined;
    return Array.isArray(details?.blockers) ? (details.blockers as ClosureBlocker[]) : [];
}

/** What a 409 USER_HAS_HISTORY says the account has behind it. */
export interface UserHistoryLine {
    kind: string;
    label: string;
    count: number;
}

export function userHistoryOf(error: unknown): UserHistoryLine[] {
    if (!(error instanceof ApiError) || error.code !== "USER_HAS_HISTORY") return [];
    const details = error.details as { has?: unknown } | undefined;
    return Array.isArray(details?.has) ? (details.has as UserHistoryLine[]) : [];
}

/* ---- cases ------------------------------------------------------- */

/** `AccountClosureCase`, with the person joined on the list. */
export interface ClosureCase {
    id: string;
    userId: string;
    ticketId: string | null;
    reason: string;
    requestedById: string | null;
    requestedAt: string;
    /** The balance when the case was raised — a snapshot, not a gate. */
    walletBalance: string | null;
    withdrawalsInFlight: number;
    openOrders: number;
    openWork: number;
    lossNote: string | null;
    decision: ClosureDecision;
    decidedById: string | null;
    decidedAt: string | null;
    user: LifecyclePerson | null;
}

export interface ClosurePayout {
    walletId: string;
    amount: string;
    reference: string | null;
    outcome: "REQUESTED" | "NO_VERIFIED_METHOD" | "NOTHING_WITHDRAWABLE";
}

/** What CLOSED did, in the order it did it. */
export interface ClosureOutcome {
    userId: string;
    closedAt: string;
    suspended: { partyType: WalletKind; partyId: string; scopes: string[] }[];
    listingsRetired: string[];
    payouts: ClosurePayout[];
    /** What the closure could not finish — a balance left frozen, say. */
    note: string | null;
}

/** `POST /users/:id/closure-cases`. */
export interface OpenClosureCaseInput {
    reason: string;
    ticketId?: string;
}

/** `POST /users/closure-cases/:id/decide`. */
export interface DecideClosureInput {
    decision: "CLOSED" | "REFUSED";
    /** Money ADX is writing off. Its presence stops the final withdrawal. */
    lossNote?: string;
}

/** One page of the designed-list contract. */
export interface ListPage<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    /** Rows per facet value, counted with the facet removed. */
    counts: Record<string, number>;
}

export interface ClosureCasesQuery {
    decision?: ClosureDecision;
    q?: string;
    page?: number;
    pageSize?: number;
}

export interface ErasureQuery {
    status?: ErasureStatus;
    q?: string;
    page?: number;
    pageSize?: number;
}

/** `?q=&page=&pageSize=&<facet>=` in the order the list contract names them. */
function listQuery(
    query: { q?: string; page?: number; pageSize?: number },
    facet: [string, string | undefined],
): string {
    const params = new URLSearchParams();
    const q = query.q?.trim();
    if (q) params.set("q", q);
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? 20));
    if (facet[1]) params.set(facet[0], facet[1]);
    return params.toString();
}

/* ---- erasure ----------------------------------------------------- */

/** `ErasureRequest`, with the person joined. */
export interface ErasureRequest {
    id: string;
    userId: string;
    requestedVia: ErasureVia;
    requestedAt: string;
    /** Thirty days from the ask. The obligation's clock. */
    dueAt: string;
    status: ErasureStatus;
    reason: string | null;
    approvedById: string | null;
    approvedAt: string | null;
    dpoName: string | null;
    completedAt: string | null;
    /** Whole financial years from completion; the books stay until then. */
    retainUntil: string | null;
    refusedReason: string | null;
    user: LifecyclePerson | null;
    /** Only on the execute response: what the erasure actually removed. */
    footprint?: { documentsDeleted: number; profilesAnonymised: string[]; kycRecordsMasked: string[] };
}

export interface RaiseErasureInput {
    reason?: string;
    /** Which channel the ask came through. The desk's default is OPS. */
    requestedVia?: ErasureVia;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days to the deadline; negative once it has passed. */
export function daysUntil(dueAt: string, now: Date = new Date()): number {
    return Math.trunc((new Date(dueAt).getTime() - now.getTime()) / DAY_MS);
}

const settled = (status: ErasureStatus): boolean => status === "DONE" || status === "REFUSED";

/** How urgently an open request needs working: a week out is warning, past is danger. */
export function dueTone(request: Pick<ErasureRequest, "status" | "dueAt">, now: Date = new Date()): Tone {
    if (settled(request.status)) return "neutral";
    const days = daysUntil(request.dueAt, now);
    if (days < 0) return "danger";
    if (days <= 7) return "warning";
    return "success";
}

export function dueLabel(request: Pick<ErasureRequest, "status" | "dueAt">, now: Date = new Date()): string {
    if (request.status === "DONE") return "Done";
    if (request.status === "REFUSED") return "Refused";
    const days = daysUntil(request.dueAt, now);
    if (days === 0) return "Due today";
    if (days > 0) return `Due in ${plural(days, "day")}`;
    return `Overdue by ${plural(-days, "day")}`;
}

/* ---- the service ------------------------------------------------- */

/** The closure columns off the admin read — enough to draw the banner. */
export type ClosedState = Pick<WireUserDetail, "id" | "name" | "mobile" | "closedAt" | "closeReason">;

/**
 * Its own export rather than more keys on `usersService`, so this half and
 * the identity half can change hands without touching each other.
 */
export const accountLifecycleService = {
    /* ---- closure ------------------------------------------------ */

    /** The blockers, the wallets and the seven numbers, read fresh. */
    closureReview: (userId: string): Promise<ClosureReview> =>
        live().get<ClosureReview>(`/users/${userId}/closure-review`),

    /** Opens a case, or hands back the pending one. Nothing changes on the account. */
    createClosureCase: (
        userId: string,
        input: OpenClosureCaseInput,
    ): Promise<{ case: ClosureCase; summary: ClosureSummary; blockers: ClosureBlocker[] }> =>
        live().post(`/users/${userId}/closure-cases`, {
            reason: input.reason,
            ...(input.ticketId ? { ticketId: input.ticketId } : {}),
        }),

    closureCases: (query: ClosureCasesQuery = {}): Promise<ListPage<ClosureCase>> =>
        live().get<ListPage<ClosureCase>>(
            `/users/closure-cases?${listQuery(query, ["decision", query.decision])}`,
        ),

    /**
     * CLOSED runs the closure before the case is marked; a 409 CLOSURE_BLOCKED
     * leaves it pending and carries today's blockers — `closureBlockedBlockers`.
     * An empty loss note is not sent: the server's floor is three characters.
     */
    decideClosure: (
        caseId: string,
        input: DecideClosureInput,
    ): Promise<{ case: ClosureCase; outcome: ClosureOutcome | null }> => {
        const lossNote = input.lossNote?.trim();
        return live().post(`/users/closure-cases/${caseId}/decide`, {
            decision: input.decision,
            ...(lossNote ? { lossNote } : {}),
        });
    },

    /** `closedAt` and `closeReason` off `GET /users/:id`, for the banner on a person's page. */
    closedState: async (userId: string): Promise<ClosedState> => {
        const user = await live().get<WireUserDetail>(`/users/${userId}`);
        return {
            id: user.id,
            name: user.name,
            mobile: user.mobile,
            closedAt: user.closedAt,
            closeReason: user.closeReason,
        };
    },

    /* ---- erasure ------------------------------------------------ */

    erasureRequests: (query: ErasureQuery = {}): Promise<ListPage<ErasureRequest>> =>
        live().get<ListPage<ErasureRequest>>(`/users/erasure?${listQuery(query, ["status", query.status])}`),

    /** Opens a request (or hands back the open one), due in thirty days. */
    raiseErasure: (userId: string, input: RaiseErasureInput = {}): Promise<ErasureRequest> =>
        live().post<ErasureRequest>(`/users/${userId}/erasure`, {
            requestedVia: input.requestedVia ?? "OPS",
            ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
        }),

    /** The DPO's signature. Needs `dpo.erasure`; refuses on an account that is still open. */
    approveErasure: (id: string, dpoName: string): Promise<ErasureRequest> =>
        live().post<ErasureRequest>(`/users/erasure/${id}/approve`, { dpoName: dpoName.trim() }),

    refuseErasure: (id: string, reason: string): Promise<ErasureRequest> =>
        live().post<ErasureRequest>(`/users/erasure/${id}/refuse`, { reason: reason.trim() }),

    /** Irreversible. Only an APPROVED request; the response carries the footprint. */
    executeErasure: (id: string): Promise<ErasureRequest> =>
        live().post<ErasureRequest>(`/users/erasure/${id}/execute`),

    /** `GET /users/:id/erasure` — the open request against this account, or null when there is none. */
    openErasure: async (userId: string): Promise<ErasureRequest | null> =>
        (await live().get<ErasureRequest | null>(`/users/${userId}/erasure`)) ?? null,
};


/* ================================================================== */
/* Package CD4 — read-only impersonation (Lot A, Q27)                   */
/* ================================================================== */

/*
 * `POST /users/:id/impersonate { reason }` opens an `ImpersonationSession`
 * and mints a fifteen-minute token for the target carrying `act` and
 * `scope: 'read'`. The backend refuses every non-GET request under it, so
 * the console's view-as panel can only ever read; it reads the party's own
 * endpoints (`/publishers/me`, `/publishers/me/dashboard`, `/payouts/wallet`)
 * with that token through the api client's `bearer` option, which keeps the
 * admin's own session out of it — a 401 under the view-as token ends the
 * panel, never the console.
 *
 * Never another admin (403), never an inactive account, never yourself, and
 * the reason is required — it is the field nobody can reconstruct later.
 */

export interface ImpersonationStart {
    sessionId: string;
    accessToken: string;
    /** ISO; fifteen minutes from the start. */
    expiresAt: string;
    scope: "read";
    target: { id: string; name: string | null; mobile: string; roles: UserRole[] };
}

export interface ImpersonationSession {
    id: string;
    adminUserId: string;
    targetUserId: string;
    reason: string;
    startedAt: string;
    expiresAt: string;
    endedAt: string | null;
    /** E7-3: the person being read and their primary role, on the open-sessions list. Null when the account is gone. */
    target?: { id: string; name: string | null; role: string | null } | null;
}

/** How the open-sessions list names the account a session is looking through. */
export function impersonationSessionLabel(session: Pick<ImpersonationSession, "targetUserId" | "target">): string {
    return session.target?.name?.trim() || session.target?.id || session.targetUserId;
}

/** The reason's bounds, as `impersonateSchema` spells them. */
export const IMPERSONATION_REASON_MIN = 10;
export const IMPERSONATION_REASON_MAX = 500;

/** How the panel labels the account it is looking through. */
export function impersonationTargetLabel(target: ImpersonationStart["target"]): string {
    return target.name?.trim() ? target.name : target.mobile;
}

export const impersonationService = {
    /** Opens the session; the token comes back on the answer and is never stored. */
    start: (userId: string, reason: string): Promise<ImpersonationStart> =>
        live().post<ImpersonationStart>(`/users/${userId}/impersonate`, { reason: reason.trim() }),

    /** Ends it early; ending an already-ended session answers with the row rather than a conflict. */
    end: (sessionId: string): Promise<ImpersonationSession> =>
        live().post<ImpersonationSession>(`/users/impersonations/${sessionId}/end`),

    /** The caller's own open sessions. */
    open: async (): Promise<ImpersonationSession[]> =>
        (await live().get<ImpersonationSession[]>("/users/impersonations")) ?? [],

    /**
     * A read as the party, under the view-as token. `unknown` on purpose: the
     * panel renders whatever the party's endpoint answers as a JSON card
     * rather than modelling three more shapes the console never otherwise
     * reads.
     */
    readAs: (accessToken: string, path: string): Promise<unknown> =>
        live().get<unknown>(path, { bearer: accessToken }),
};
