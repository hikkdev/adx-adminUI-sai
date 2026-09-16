import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { FeatureGate, resetFeaturesForTests } from "./use-feature";

/**
 * CG5, G11-2 — `<FeatureGate>` over the session's `GET /flags/me` read.
 *
 * What this pins: one read serves every gate on the page; the read is the
 * server's answer, not `GET /flags` — a rollout by named account, by role
 * or by bucket is decided there, and the console prints what came back; a
 * feature that is off, or a key the server did not answer, hides its
 * children and draws the fallback; and a read that fails does not hide
 * anything.
 */

const { backend, session } = vi.hoisted(() => ({
    backend: { calls: [] as string[], answers: {} as Record<string, { enabled: boolean; variant: string | null }>, fail: false },
    session: { user: { id: "op-1", name: "Priya", email: "priya@adx.test", roles: ["ADMIN"] } },
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: session.user }) }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.calls.push(path);
                if (backend.fail) throw new actual.ApiError(500, "DOWN", "down");
                if (path === "/flags/me") return backend.answers;
                throw new Error(`No route GET ${path}`);
            },
        },
    };
});

describe("FeatureGate", () => {
    beforeEach(() => {
        resetFeaturesForTests();
        backend.calls = [];
        backend.fail = false;
        backend.answers = {
            "marketplace.instant-booking": { enabled: true, variant: null },
            "campaigns.multi-market": { enabled: false, variant: null },
            /* The server decided the named-account rollout and the role rollout; the console only prints them. */
            "publisher.spot-insights": { enabled: true, variant: "treatment" },
            "ops.agents-only": { enabled: false, variant: null },
        };
    });

    it("shows what the server said is on, hides what is off or unanswered, and reads /flags/me once for every gate", async () => {
        render(
            <>
                <FeatureGate feature="marketplace.instant-booking">
                    <p>instant</p>
                </FeatureGate>
                <FeatureGate feature="campaigns.multi-market" fallback={<p>multi-market is off</p>}>
                    <p>multi-market</p>
                </FeatureGate>
                <FeatureGate feature="no.such-feature">
                    <p>typo</p>
                </FeatureGate>
            </>,
        );
        expect(await screen.findByText("instant")).toBeInTheDocument();
        expect(screen.getByText("multi-market is off")).toBeInTheDocument();
        expect(screen.queryByText("multi-market")).not.toBeInTheDocument();
        expect(screen.queryByText("typo")).not.toBeInTheDocument();
        expect(backend.calls).toEqual(["/flags/me"]);
    });

    it("prints the server's rollout answers for the operator rather than evaluating the rows", async () => {
        render(
            <>
                <FeatureGate feature="publisher.spot-insights">
                    <p>named</p>
                </FeatureGate>
                <FeatureGate feature="ops.agents-only" fallback={<p>not for admins</p>}>
                    <p>agents</p>
                </FeatureGate>
            </>,
        );
        expect(await screen.findByText("named")).toBeInTheDocument();
        expect(screen.getByText("not for admins")).toBeInTheDocument();
        // Never the rows: the evaluation is the server's.
        expect(backend.calls).not.toContain("/flags");
    });

    it("hides nothing while the read failed", async () => {
        backend.fail = true;
        render(
            <FeatureGate feature="campaigns.multi-market">
                <p>still drawn</p>
            </FeatureGate>,
        );
        await waitFor(() => expect(screen.getByText("still drawn")).toBeInTheDocument());
    });
});
