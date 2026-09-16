import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * The login form knows when there is nothing to sign into: an admin whose
 * stored session is still valid — a reopened tab, or a bounce that landed
 * here with tokens set — goes to the dashboard instead of being asked again.
 */

const { router, auth } = vi.hoisted(() => ({
    router: { replace: vi.fn(), push: vi.fn() },
    auth: {
        signIn: vi.fn(),
        signInWithGoogle: vi.fn(),
        user: null as null | { id: string; name: string; email: string; roles: string[] },
        loading: true,
    },
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/auth", () => ({
    useAuth: () => auth,
    holdsAdmin: (user: { roles?: string[] } | null) => !!user?.roles?.includes("ADMIN"),
}));
vi.mock("@/lib/api-config", () => ({ apiConfig: { live: true, baseUrl: "http://localhost:4000/api/v1" } }));
vi.mock("@/components/adx/google-sign-in-button", () => ({ GoogleSignInButton: () => null }));
vi.mock("@/components/adx/turnstile-widget", () => ({ TurnstileWidget: () => null }));

import LoginPage from "./page";

describe("/login with a session already in hand", () => {
    beforeEach(() => {
        router.replace.mockClear();
    });

    it("waits while the stored session is being checked", () => {
        auth.loading = true;
        auth.user = null;
        render(<LoginPage />);
        expect(router.replace).not.toHaveBeenCalled();
        expect(screen.getByLabelText(/email/i)).toBeTruthy();
    });

    it("sends a signed-in admin to the dashboard", async () => {
        auth.loading = false;
        auth.user = { id: "usr_1", name: "Ops", email: "ops@adx.in", roles: ["ADMIN"] };
        render(<LoginPage />);
        await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"));
    });

    it("keeps the form for a signed-out visitor and for a non-admin account", () => {
        auth.loading = false;
        auth.user = null;
        render(<LoginPage />);
        expect(router.replace).not.toHaveBeenCalled();
        auth.user = { id: "usr_2", name: "Pub", email: "pub@x.in", roles: ["PUBLISHER"] };
        render(<LoginPage />);
        expect(router.replace).not.toHaveBeenCalled();
    });
});
