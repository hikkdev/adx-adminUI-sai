"use client";

import * as React from "react";
import Link from "next/link";
import { staleLabel, usePresence } from "@/lib/use-presence";
import { cn } from "@/lib/utils";

/**
 * Whether this operator is at the live desk, on every console page — Lot I.
 *
 * A live chat is assigned to whoever the server believes is online, so an
 * operator who has drifted off the roster — a laptop that slept, a console
 * that lost the backend — needs to find that out from anywhere in the
 * console, not only from the live desk. Hence a dot in the header: green
 * while the presence key is being kept alive, grey the moment it is not, with
 * the number of chats currently held beside it.
 *
 * It draws nothing at all when the desk is not there — the API off, or the
 * live-chat feature switched off — because a dot that cannot mean anything is
 * worse than no dot. A roster read that merely failed is different (I4-C):
 * the dot stays on the last roster and says how old that is, because the
 * operator is still on the desk as far as the server knows, and a dot that
 * vanished on every hiccup would send them to the desk to check for nothing.
 */
export function PresenceDot() {
    const { online, myOpenChats, loading, available, stale, lastReadAt } = usePresence();
    const now = useSecondHand(stale);

    if (!available || loading) return null;

    const hint = stale ? staleLabel(lastReadAt, now) : null;

    return (
        <Link
            href="/support/live"
            aria-label={
                (online
                    ? `Live desk: online, ${myOpenChats} open chat${myOpenChats === 1 ? "" : "s"}`
                    : "Live desk: offline") + (hint ? ` — ${hint}` : "")
            }
            title={(online ? "You are on the live desk" : "You are off the live desk") + (hint ? ` · ${hint}` : "")}
            className="flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50"
        >
            <span
                aria-hidden
                className={cn("size-2 shrink-0 rounded-full", online ? "bg-success" : "bg-muted-foreground/40")}
            />
            <span className="hidden sm:inline">{online ? "Live" : "Off"}</span>
            {online && <span className="tabular-nums text-foreground">{myOpenChats}</span>}
            {hint && (
                <span className="hidden text-[10px] font-normal text-warning md:inline" data-testid="presence-stale">
                    {hint}
                </span>
            )}
        </Link>
    );
}

/* A second hand that only runs while there is something to count — the age of
   a stale roster. An external store rather than a state set from an effect:
   the clock is read fresh on subscribe, so the first frame is right, and it
   stops the moment nobody is listening. */
let tick = 0;
let ticker: ReturnType<typeof setInterval> | null = null;
const hands = new Set<() => void>();

function subscribeSecondHand(onChange: () => void): () => void {
    hands.add(onChange);
    tick = Date.now();
    if (ticker === null) {
        ticker = setInterval(() => {
            tick = Date.now();
            for (const hand of hands) hand();
        }, 1000);
    }
    return () => {
        hands.delete(onChange);
        if (hands.size === 0 && ticker !== null) {
            clearInterval(ticker);
            ticker = null;
        }
    };
}
const subscribeNothing = () => () => undefined;
const readSecondHand = () => tick;

function useSecondHand(running: boolean): number {
    return React.useSyncExternalStore(running ? subscribeSecondHand : subscribeNothing, readSecondHand, readSecondHand);
}
