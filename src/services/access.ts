import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { StatusMeta } from "@/types";

/**
 * The door-to-door authority, for ops (D6).
 *
 * Every grant ever opened on a party's account, every scan an agent made
 * (refusals included), a party's whole record, and the one write ops has:
 * withdrawing a grant early. Read from `access-grants` and `qr`, which own
 * the rows; no fixtures — when the API is off these screens say so rather
 * than inventing a history for somebody.
 */

export interface WireGrant {
    id: string;
    publisherId: string | null;
    advertiserId: string | null;
    assignedAgentId: string;
    reason: string;
    scope: "PROFILE" | "LISTINGS";
    listingIds: string[];
    purpose: "SUPPORT" | "ONBOARDING";
    status: "PENDING" | "ACTIVE" | "EXPIRED" | "REVOKED";
    durationMinutes: number;
    qrId: string | null;
    createdAt: string;
    claimedAt: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
    revokedById: string | null;
    publisher?: { id: string; name: string; userId: string | null } | null;
    assignedAgent?: { id: string; userId: string } | null;
}

export interface WireScan {
    id: string;
    qrId: string;
    scannedById: string;
    role: string | null;
    outcome: string;
    distanceM: number | null;
    decidedAt: string | null;
    createdAt: string;
    qr: { id: string; type: string; refId: string };
}

/** `GET /access-grants/log/:partyType/:partyId`, as the API sends it. */
export interface WirePartyLog {
    scans: {
        id: string;
        at: string;
        outcome: string;
        distanceM: number | null;
        decidedAt: string | null;
        agent: { name: string | null; displayId: string | null; mobile: string };
    }[];
    grants: {
        id: string;
        purpose: string;
        scope: string;
        status: string;
        from: string | null;
        until: string | null;
        revokedAt: string | null;
    }[];
    changes: {
        id: string;
        at: string;
        action: string;
        fields: string[];
        grantId: string | null;
        by: { name: string | null };
    }[];
}

export interface GrantView {
    id: string;
    party: string;
    partyType: "publisher" | "advertiser";
    partyId: string | null;
    agentId: string;
    purpose: string;
    scope: string;
    reason: string;
    status: WireGrant["status"];
    from: string;
    until: string | null;
    revokedAt: string | null;
    canRevoke: boolean;
}

export interface ScanView {
    id: string;
    at: string;
    code: string;
    outcome: string;
    refused: boolean;
    distance: string | null;
}

const PURPOSE: Record<WireGrant["purpose"], string> = { SUPPORT: "Support", ONBOARDING: "Onboarding" };

const OUTCOME: Record<string, string> = {
    GRANTED: "Approved by the owner",
    PENDING_APPROVAL: "Waiting for the owner",
    USER_DECLINED: "Declined by the owner",
    EXPIRED: "Code had expired",
    ALREADY_USED: "Code already used",
    NOT_AN_AGENT: "Refused — not an ADX agent",
};
const REFUSALS = new Set(["USER_DECLINED", "EXPIRED", "ALREADY_USED", "NOT_AN_AGENT"]);

const CODE: Record<string, string> = {
    PUBLISHER: "Publisher code",
    ADVERTISER: "Advertiser code",
    ACCESS_GRANT: "Access code",
    ORDER: "Order code",
    SITE: "Site code",
    AD: "Ad code",
    AGENT: "Agent referral",
};

export function grantState(status: WireGrant["status"]): StatusMeta {
    switch (status) {
        case "ACTIVE":
            return { label: "Open", tone: "success" };
        case "PENDING":
            return { label: "Not yet used", tone: "warning" };
        case "REVOKED":
            return { label: "Withdrawn", tone: "danger" };
        default:
            return { label: "Ended", tone: "neutral" };
    }
}

export function shapeGrant(grant: WireGrant): GrantView {
    const partyType = grant.advertiserId && !grant.publisherId ? "advertiser" : "publisher";
    const partyId = partyType === "advertiser" ? grant.advertiserId : grant.publisherId;
    const party =
        grant.publisher?.name ?? (partyId ? `${partyType === "advertiser" ? "Advertiser" : "Publisher"} ${partyId}` : "Unknown");
    return {
        id: grant.id,
        party,
        partyType,
        partyId,
        agentId: grant.assignedAgentId,
        purpose: PURPOSE[grant.purpose] ?? grant.purpose,
        scope:
            grant.scope === "LISTINGS"
                ? grant.listingIds.length === 0
                    ? "All listings"
                    : `${grant.listingIds.length} listing${grant.listingIds.length === 1 ? "" : "s"}`
                : "Profile",
        reason: grant.reason,
        status: grant.status,
        from: grant.claimedAt ?? grant.createdAt,
        until: grant.expiresAt,
        revokedAt: grant.revokedAt,
        canRevoke: grant.status === "ACTIVE" || grant.status === "PENDING",
    };
}

export function shapeScan(scan: WireScan): ScanView {
    return {
        id: scan.id,
        at: scan.createdAt,
        code: `${CODE[scan.qr.type] ?? scan.qr.type} · ${scan.qr.refId}`,
        outcome: OUTCOME[scan.outcome] ?? scan.outcome,
        refused: REFUSALS.has(scan.outcome),
        distance:
            scan.distanceM === null ? null : scan.distanceM < 1000 ? `${Math.round(scan.distanceM)} m` : `${(scan.distanceM / 1000).toFixed(1)} km`,
    };
}

function mutable() {
    if (!isLive("access")) {
        throw new Error("The access domain reads the API only; turn the API on before writing.");
    }
    return http;
}

export const accessService = {
    /** Everything still open, platform-wide. Empty when the API is off. */
    open: async (): Promise<GrantView[]> =>
        isLive("access") ? (await http.get<WireGrant[]>("/access-grants/open")).map(shapeGrant) : [],

    /** Every grant an agent ever held. */
    forAgent: async (agentId: string): Promise<GrantView[]> =>
        isLive("access") ? (await http.get<WireGrant[]>(`/access-grants/agent/${agentId}`)).map(shapeGrant) : [],

    /** Every scan one person made — the agent's user id, not their profile id. */
    scansBy: async (userId: string): Promise<ScanView[]> =>
        isLive("access")
            ? (await http.get<WireScan[]>(`/qr/scans?scannedBy=${encodeURIComponent(userId)}`)).map(shapeScan)
            : [],

    /** A party's whole record, as the owner sees it. */
    partyLog: async (partyType: "publisher" | "advertiser", partyId: string): Promise<WirePartyLog | null> =>
        isLive("access") ? http.get<WirePartyLog>(`/access-grants/log/${partyType}/${partyId}`) : null,

    /** Withdraw a grant early; the code goes with it. */
    revoke: (grantId: string) => mutable().post<WireGrant>(`/access-grants/${grantId}/revoke`, {}),
};
