import { apiConfig } from "./api-config";
import { tokens } from "./api-client";

/**
 * PB-1 (27 Sep 2026): the hand-off from the console to Studio, the website's
 * page editor.
 *
 * Studio runs inside the website (`${NEXT_PUBLIC_SITE_URL}/studio/…`) and
 * signs its operator in with the console's own session: the access and
 * refresh tokens travel in the URL FRAGMENT, which the browser never sends
 * to a server and never writes to a log, and Studio reads and clears it on
 * arrival. Nothing here ever puts a token in the query, in a header of the
 * console's own, or in `console.log`.
 *
 * A page opens at `/studio/pages/<key>` whether it is one of the website's
 * own (SYSTEM) or one made in Studio (CUSTOM); an app home opens at
 * `/studio/app/<surface>`.
 */

export type StudioTarget = { kind: "page"; key: string } | { kind: "surface"; surface: string } | { kind: "index" };

/** The Studio path for a target, without the origin or the fragment. */
export function studioPath(target: StudioTarget): string {
    if (target.kind === "page") return `/studio/pages/${encodeURIComponent(target.key)}`;
    if (target.kind === "surface") return `/studio/app/${encodeURIComponent(target.surface)}`;
    return "/studio";
}

/** The fragment that signs Studio in: both tokens, URL-encoded; empty when there is no session to hand over. */
export function studioFragment(session: { access: string | null; refresh: string | null }): string {
    const parts: string[] = [];
    if (session.access) parts.push(`token=${encodeURIComponent(session.access)}`);
    if (session.refresh) parts.push(`refresh=${encodeURIComponent(session.refresh)}`);
    return parts.length ? `#${parts.join("&")}` : "";
}

/** The full Studio URL for a target, signed with the given session (the stored one by default). */
export function studioUrl(target: StudioTarget, session: { access: string | null; refresh: string | null } = { access: tokens.access, refresh: tokens.refresh }): string {
    return `${apiConfig.siteUrl}${studioPath(target)}${studioFragment(session)}`;
}

/**
 * Opens Studio in a new tab. `noopener` keeps the tab from reaching back into
 * the console; the fragment travels with the URL regardless.
 */
export function openStudio(target: StudioTarget): void {
    if (typeof window === "undefined") return;
    window.open(studioUrl(target), "_blank", "noopener");
}
