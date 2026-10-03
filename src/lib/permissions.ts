/**
 * How a missing permission reads to the operator (RP-2, 24 Sep 2026).
 *
 * Every admin route now asks for a permission, so a role that lacks one
 * meets `403 FORBIDDEN` with `details.missing` — the ids, as the catalogue
 * names them. An id is `<group>.<tier>` or `<group>.<capability>`; the
 * sentence names it the way the Roles tab does ("Approve finance") so the
 * operator can say exactly what to ask a super admin for.
 */
const TIER: Record<string, string> = { view: "View", edit: "Edit", approve: "Approve" };

/** The groups whose id is not their name: the catalogue labels them, the token only carries the id. */
const NOUN: Record<string, string> = { kyc: "KYC", hr: "people", dpo: "data protection", print: "print partners", supply: "publishers and listings" };

/** "finance.approve" → "Approve finance"; "kyc.view" → "View KYC"; "system.roles" → "system.roles". */
export function permissionLabel(id: string): string {
    const [group, ...rest] = id.split(".");
    const tier = rest.join(".");
    if (group && TIER[tier]) return `${TIER[tier]} ${NOUN[group] ?? group}`;
    return id;
}

/** The sentence a 403 with `details.missing` shows in place of "Insufficient permissions". */
export function describeMissing(missing: readonly string[]): string {
    const names = missing.map(permissionLabel);
    const list = names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    return `Your role does not hold the permission this needs: ${list}. Ask a super admin to add it.`;
}

/** The ids a 403 carried, or none when the failure was not about permissions. */
export function missingPermissionsOf(details: unknown): string[] {
    const missing = (details as { missing?: unknown } | undefined)?.missing;
    return Array.isArray(missing) ? missing.filter((id): id is string => typeof id === "string") : [];
}
