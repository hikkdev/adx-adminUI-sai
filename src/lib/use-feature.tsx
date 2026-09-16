"use client";

import * as React from "react";
import { isLive } from "@/lib/api-config";
import { useAuth } from "@/lib/auth";
import { answerFor, flagsService, type OperatorAnswers } from "@/services/flags";

/**
 * Is a feature on for the operator? — package CG5 (answer 144), G11-2.
 *
 * The console reads `GET /flags/me` once per session, through the flags
 * service, and answers every `useFeature(key)` from that read: the
 * server's own evaluation of every flag on every surface for the signed-in
 * operator — the same bucket, the same rules, the city through the port —
 * so the console holds no evaluator and no SHA-1 of its own to drift. The
 * answers are cached at module level, every mounted hook subscribes, and
 * the cache is refreshed when the window regains focus or the tab becomes
 * visible again, so a kill switch thrown from another tab reaches this one
 * the next time somebody looks at it. A write on Settings › Feature flags
 * calls `refreshFeatures()` so the same tab does not wait for a focus.
 *
 * What a caller sees while the read is in flight is `null`: neither on
 * nor off. `<FeatureGate>` draws nothing then, so a dark feature does not
 * flash on and off. A read that FAILS answers `true` — the server's own
 * rule, that a flags-table hiccup must not become a platform-wide outage,
 * holds for the console too: a kill switch is for a buggy feature, not a
 * broken network. A key the server did not answer is off — a typo in a
 * call site fails closed, as it does on the server; call sites name the
 * canonical key.
 */

type Status = "idle" | "loading" | "ready" | "failed";

interface Snapshot {
    status: Status;
    /** `key → { enabled, variant }` as the server answered for `subjectId`. */
    answers: OperatorAnswers;
    subjectId: string | null;
}

let snapshot: Snapshot = { status: "idle", answers: {}, subjectId: null };
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: Snapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
}

async function load(subjectId: string | null): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
        if (snapshot.status !== "ready") publish({ ...snapshot, status: "loading" });
        try {
            const answers = await flagsService.me();
            publish({ status: "ready", answers, subjectId });
        } catch {
            /* A refresh that fails leaves the answers already read in place;
               only a session with nothing read yet is told the read failed. */
            if (snapshot.status !== "ready") publish({ ...snapshot, status: "failed" });
        } finally {
            inFlight = null;
        }
    })();
    return inFlight;
}

/** Re-reads the answers now — called after a write on the flags screen. A no-op while the API is off. */
export function refreshFeatures(): Promise<void> {
    if (!isLive("flags")) return Promise.resolve();
    return load(snapshot.subjectId);
}

/** Test-only: forget the session's read. */
export function resetFeaturesForTests(): void {
    snapshot = { status: "idle", answers: {}, subjectId: null };
    inFlight = null;
}

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};
const getSnapshot = () => snapshot;
/* One object, not a fresh one per call — React expects the server snapshot to be stable. */
const SERVER_SNAPSHOT: Snapshot = { status: "idle", answers: {}, subjectId: null };
const getServerSnapshot = () => SERVER_SNAPSHOT;

export interface FeatureState {
    /** True or false once the answers are read; null while they are in flight; true when the read failed. */
    enabled: boolean | null;
    variant: string | null;
    status: Status;
}

/** The session's answer for one feature key, as the server evaluated it for the operator. */
export function useFeature(key: string): FeatureState {
    const { user } = useAuth();
    const live = isLive("flags");
    const subjectId = user?.id ?? null;
    const state = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    React.useEffect(() => {
        if (!live) return;
        if (state.status === "idle" || (state.status === "ready" && state.subjectId !== subjectId)) void load(subjectId);
    }, [live, state.status, state.subjectId, subjectId]);

    /* One listener per document, registered by whichever hook mounts first. */
    React.useEffect(() => {
        if (!live) return;
        const onFocus = () => {
            if (document.visibilityState === "visible") void load(subjectId);
        };
        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onFocus);
        return () => {
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onFocus);
        };
    }, [live, subjectId]);

    return React.useMemo<FeatureState>(() => {
        /* With the API off there is nothing to read and nothing to hide:
           every screen already says it is not connected. */
        if (!live) return { enabled: true, variant: null, status: "ready" };
        if (state.status === "failed") return { enabled: true, variant: null, status: "failed" };
        if (state.status !== "ready") return { enabled: null, variant: null, status: state.status };
        const answer = answerFor(state.answers, key);
        /* An unknown key is off — a typo in a call site fails closed, as it does on the server. */
        if (!answer) return { enabled: false, variant: null, status: "ready" };
        return { enabled: answer.enabled, variant: answer.variant, status: "ready" };
    }, [live, state, key]);
}

interface FeatureGateProps {
    feature: string;
    children: React.ReactNode;
    /** Drawn in place of the children while the feature is off for the operator. Nothing by default. */
    fallback?: React.ReactNode;
}

/**
 * Hides a screen or an action while the feature is off for the operator.
 * Nothing is drawn while the answer is still in flight; the fallback is
 * drawn once the answer is no.
 */
export function FeatureGate({ feature, children, fallback = null }: FeatureGateProps) {
    const { enabled } = useFeature(feature);
    if (enabled === null) return null;
    return <>{enabled ? children : fallback}</>;
}
