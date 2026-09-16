"use client";

import * as React from "react";
import { ApiError } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { useAuth } from "@/lib/auth";
import { HEARTBEAT_MS, liveChatService, startHeartbeat, waitedLabel, type OperatorPresence } from "@/services/live-chat";

/**
 * Whether this operator is at the desk — Lot I.
 *
 * Presence is not a switch in the browser. `PUT /support/presence` writes a
 * Redis member good for ninety seconds and the console keeps it alive with a
 * beat every thirty; stop beating and the operator drops out on their own,
 * which is exactly what should happen to a console that crashed or a laptop
 * that closed. Nothing is assigned to somebody the server no longer believes
 * is there.
 *
 * So the toggle's state is never local: it is `GET /support/presence` read
 * back, which is what makes it survive a client-side navigation. The roster
 * is re-read on a slow poll too, because the count of open chats beside the
 * dot moves when other operators pick chats up.
 *
 * Closing the page is leaving the desk (I4-C). Ninety seconds is how long a
 * closed console would otherwise stay assignable, so `pagehide` — and
 * `beforeunload` as the fallback for a browser that skips it — sends the
 * offline write through `fetch` with `keepalive`, the one request a closing
 * page is allowed to finish. The cost is honest: a full reload goes off the
 * desk too, and the operator flips the switch again. Nothing local could
 * make that decision for them without becoming the thing this hook refuses
 * to be — a presence the server did not write.
 *
 * A roster that cannot be read is not a desk that is off (I4-C). Only the
 * feature switched off — `503 FEATURE_OFF` — or a login the desk is not for
 * takes the dot away; a backend hiccup keeps the last roster, marks it stale
 * with when it was last read, and leaves the dot where it was. The beat
 * keeps going through a stale read for the same reason a dropped beat does
 * not go offline: the server decides, not the console's last failed GET.
 *
 * One hook for both readers — the header's dot on every page and the live
 * desk's own toggle — so the two can never disagree about who is on.
 */

/** How often the roster is re-read; the dot may be a minute stale, never wrong about you. */
const ROSTER_POLL_MS = 60_000;

export interface Presence {
    /** Whether the signed-in operator is on the roster the server holds. */
    online: boolean;
    /** Everybody at the desk, lightest load first — the reassign picker's list. */
    operators: OperatorPresence[];
    /** Open live chats the signed-in operator is holding. */
    myOpenChats: number;
    /** True until the first read lands. */
    loading: boolean;
    /** Set while a toggle is in flight, so the switch can refuse a second click. */
    busy: boolean;
    /** Why the last read failed, when it did — the message the backend or the network gave. */
    error: string | null;
    /**
     * Whether the desk is there at all — the API off, the feature switched off
     * (`503 FEATURE_OFF`), or a login the desk is not for (403). The header
     * draws nothing then, rather than a dot that means nothing.
     */
    available: boolean;
    /**
     * The last read failed for a passing reason and what is shown is the
     * roster from before it. The dot stays; `lastReadAt` says how old it is.
     */
    stale: boolean;
    /** When the roster was last read successfully, in milliseconds; null before the first read lands. */
    lastReadAt: number | null;
    setOnline: (next: boolean) => Promise<void>;
    reload: () => void;
}

/** Whether a failed roster read means the desk is not there, rather than briefly unreachable. */
export function deskGone(cause: unknown): boolean {
    return cause instanceof ApiError && (cause.status === 503 || cause.status === 403);
}

/** "Roster last read 42s ago" beside a stale dot; "Roster not read yet" while there has never been one. */
export function staleLabel(lastReadAt: number | null, now: number): string {
    if (lastReadAt === null) return "Roster not read yet";
    return `Roster last read ${waitedLabel(now - lastReadAt)} ago`;
}

export function usePresence(): Presence {
    const { user } = useAuth();
    const userId = user?.id ?? null;
    const live = isLive("support");

    const [operators, setOperators] = React.useState<OperatorPresence[]>([]);
    const [loaded, setLoaded] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [gone, setGone] = React.useState(false);
    const [lastReadAt, setLastReadAt] = React.useState<number | null>(null);
    const [nonce, setNonce] = React.useState(0);
    /* Derived rather than stored: with the API off there is nothing to wait
       for, and a state set from an effect body would be a cascading render. */
    const loading = live && !loaded;

    React.useEffect(() => {
        if (!live) return;
        let active = true;
        const read = async () => {
            try {
                const roster = await liveChatService.presence();
                if (!active) return;
                setOperators(roster);
                setLastReadAt(Date.now());
                setError(null);
                setGone(false);
            } catch (cause) {
                if (!active) return;
                /* The roster from before stays: a hiccup is not an empty desk.
                   Only the feature being off, or a login the desk is not for,
                   is an answer rather than a failure. */
                setError(cause instanceof ApiError ? cause.message : "The desk roster could not be read.");
                setGone(deskGone(cause));
            } finally {
                if (active) setLoaded(true);
            }
        };
        void read();
        const timer = setInterval(() => void read(), ROSTER_POLL_MS);
        return () => {
            active = false;
            clearInterval(timer);
        };
    }, [live, nonce]);

    const online = userId !== null && operators.some((operator) => operator.userId === userId);
    const myOpenChats = operators.find((operator) => operator.userId === userId)?.openChats ?? 0;

    /* The beat only runs while the server says this operator is on. Tying it
       to the read rather than to the click is deliberate: a toggle that failed
       must not leave a console beating for a presence that was never written. */
    React.useEffect(() => {
        if (!live || !online) return;
        return startHeartbeat(() => liveChatService.heartbeat(), HEARTBEAT_MS);
    }, [live, online]);

    /* Leaving. Sent once per departure whichever event fires first — a
       browser that raises both must not write offline twice — and only while
       the server says this operator is on, because there is nothing to leave
       otherwise. */
    React.useEffect(() => {
        if (!live || !online) return;
        let left = false;
        const leave = () => {
            if (left) return;
            left = true;
            liveChatService.leaveDeskOnUnload();
        };
        window.addEventListener("pagehide", leave);
        window.addEventListener("beforeunload", leave);
        return () => {
            window.removeEventListener("pagehide", leave);
            window.removeEventListener("beforeunload", leave);
        };
    }, [live, online]);

    const setOnline = React.useCallback(
        async (next: boolean) => {
            setBusy(true);
            try {
                await liveChatService.setPresence(next);
                const roster = await liveChatService.presence();
                setOperators(roster);
                setLastReadAt(Date.now());
                setError(null);
                setGone(false);
            } finally {
                setBusy(false);
            }
        },
        [],
    );

    const reload = React.useCallback(() => setNonce((value) => value + 1), []);

    return {
        online,
        operators,
        myOpenChats,
        loading,
        busy,
        error,
        available: live && !gone,
        stale: error !== null && !gone,
        lastReadAt,
        setOnline,
        reload,
    };
}
