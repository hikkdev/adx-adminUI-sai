import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * The admin second factor's last step, end to end in the browser.
 *
 * The bug this pins: once `POST /auth/2fa/verify` answers, the provider sets
 * the tokens and clears the stored challenge in the same tick. The page then
 * re-reads "no challenge" and its guard — meant for somebody who opened
 * /verify without signing in — sent the operator to /login on top of the
 * /dashboard navigation that had just been issued. The last replace wins, so
 * the login form came back with a valid session behind it.
 */

const { router, params, challengeStore, twoFactor, completeSignIn, toast } = vi.hoisted(() => {
    const router = { replace: vi.fn(), push: vi.fn() };
    const params = new URLSearchParams();
    type Stored = { challengeToken: string; methods: string[]; maskedMobile: string | null; maskedEmail: string | null } | null;
    let stored: Stored = {
        challengeToken: "chal_1",
        methods: ["SMS", "EMAIL"],
        maskedMobile: "+91 98••• ••123",
        maskedEmail: "o•••@adx.in",
    };
    const challengeStore = {
        get: vi.fn(() => stored),
        set: vi.fn((next: Stored) => {
            stored = next;
        }),
        clear: vi.fn(() => {
            stored = null;
        }),
        reset(methods: string[] = ["SMS", "EMAIL"]) {
            stored = {
                challengeToken: "chal_1",
                methods,
                maskedMobile: "+91 98••• ••123",
                maskedEmail: "o•••@adx.in",
            };
        },
    };
    const session = () => ({
        accessToken: "acc",
        refreshToken: "ref",
        user: { id: "usr_1", name: "Ops", email: "ops@adx.in", roles: ["ADMIN"] },
    });
    const twoFactor = {
        send: vi.fn(async () => ({ message: "sent", method: "SMS", expiresInSeconds: 300, resendAfterSeconds: 30 })),
        verify: vi.fn(async (): Promise<ReturnType<typeof session> & { recoveryCodesLeft?: number; warning?: string | null }> => session()),
        session,
    };
    /* The real completeSignIn clears the challenge — reproduce exactly that. */
    const completeSignIn = vi.fn(() => {
        challengeStore.clear();
    });
    const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    return { router, params, challengeStore, twoFactor, completeSignIn, toast };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("next/navigation", () => ({
    useRouter: () => router,
    useSearchParams: () => params,
}));

vi.mock("@/lib/two-factor", () => ({
    twoFactorChallenge: challengeStore,
}));

vi.mock("@/services/two-factor", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/two-factor")>();
    return { ...actual, twoFactorService: twoFactor };
});

vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ completeSignIn, signIn: vi.fn(), signInWithGoogle: vi.fn(), user: null, loading: false }),
    holdsAdmin: (user: { roles?: string[] } | null) => !!user?.roles?.includes("ADMIN"),
}));

import TwoFactorPage from "./page";

describe("/verify after a correct code", () => {
    beforeEach(() => {
        router.replace.mockClear();
        router.push.mockClear();
        twoFactor.send.mockClear();
        twoFactor.verify.mockClear();
        twoFactor.verify.mockImplementation(async () => twoFactor.session());
        completeSignIn.mockClear();
        toast.warning.mockClear();
        challengeStore.reset();
    });

    it("lands on the dashboard and never bounces to /login once the challenge is spent", async () => {
        render(<TwoFactorPage />);

        /* The first code goes out as the page opens. */
        await waitFor(() => expect(twoFactor.send).toHaveBeenCalledWith("chal_1", "SMS"));

        const digits = await screen.findAllByLabelText(/Digit \d/);
        expect(digits).toHaveLength(6);
        "482913".split("").forEach((digit, index) => fireEvent.change(digits[index], { target: { value: digit } }));

        fireEvent.click(screen.getByRole("button", { name: /verify and continue/i }));

        await waitFor(() => expect(twoFactor.verify).toHaveBeenCalledWith("chal_1", "482913"));
        await waitFor(() => expect(completeSignIn).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"));

        /* The challenge is gone now — that must not read as "nobody signed in". */
        expect(challengeStore.get()).toBeNull();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(router.replace).not.toHaveBeenCalledWith("/login");
        expect(router.replace.mock.calls.at(-1)?.[0]).toBe("/dashboard");
    });

    it("still sends somebody with no challenge at all back to /login", async () => {
        challengeStore.clear();
        render(<TwoFactorPage />);
        await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
        expect(twoFactor.send).not.toHaveBeenCalled();
    });
});

/**
 * Lot K2 — the authenticator app at sign-in. An enrolled admin's challenge
 * lists AUTHENTICATOR first: the page opens on the app's six boxes and
 * sends nothing, the digits go to `POST /auth/2fa/verify` as they are, and
 * "Use a recovery code" takes an XXXX-XXXX code whose low-water warning is
 * printed once the operator is through.
 */
describe("/verify with an authenticator app", () => {
    beforeEach(() => {
        router.replace.mockClear();
        twoFactor.send.mockClear();
        twoFactor.verify.mockClear();
        twoFactor.verify.mockImplementation(async () => twoFactor.session());
        completeSignIn.mockClear();
        toast.warning.mockClear();
        challengeStore.reset(["AUTHENTICATOR", "SMS", "EMAIL"]);
    });

    it("opens on the app, sends nothing, and posts the six digits to /auth/2fa/verify", async () => {
        render(<TwoFactorPage />);

        const digits = await screen.findAllByTestId("app-digit");
        expect(digits).toHaveLength(6);
        expect(screen.getByText(/code from your authenticator app/i)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /resend/i })).not.toBeInTheDocument();
        expect(twoFactor.send).not.toHaveBeenCalled();

        "246810".split("").forEach((digit, index) => fireEvent.change(digits[index], { target: { value: digit } }));
        fireEvent.click(screen.getByRole("button", { name: /verify and continue/i }));

        await waitFor(() => expect(twoFactor.verify).toHaveBeenCalledWith("chal_1", "246810"));
        await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"));
        expect(twoFactor.send).not.toHaveBeenCalled();
        expect(toast.warning).not.toHaveBeenCalled();
    });

    it("takes a recovery code under the switch and prints the server's low-codes warning after", async () => {
        twoFactor.verify.mockImplementation(async () => ({
            ...twoFactor.session(),
            recoveryCodesLeft: 2,
            warning: "2 recovery codes left. Generate a new set from your security settings.",
        }));
        render(<TwoFactorPage />);

        fireEvent.click(await screen.findByRole("button", { name: /use a recovery code/i }));
        const field = screen.getByLabelText(/recovery code/i);
        fireEvent.change(field, { target: { value: "abcd-efgh" } });
        expect(field).toHaveValue("ABCD-EFGH");
        fireEvent.click(screen.getByRole("button", { name: /verify and continue/i }));

        await waitFor(() => expect(twoFactor.verify).toHaveBeenCalledWith("chal_1", "ABCDEFGH"));
        await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"));
        expect(toast.warning).toHaveBeenCalledWith("2 recovery codes left. Generate a new set from your security settings.", expect.anything());
    });

    it("still sends by SMS when asked, and the SMS path is then the one the boxes take", async () => {
        render(<TwoFactorPage />);
        fireEvent.click(await screen.findByRole("button", { name: /use sms instead/i }));
        await waitFor(() => expect(twoFactor.send).toHaveBeenCalledWith("chal_1", "SMS"));
        expect(await screen.findAllByTestId("sms-digit")).toHaveLength(6);
        /* A code is out now, so the way back to the app is not offered: the server would check the sent code first. */
        expect(screen.queryByRole("button", { name: /use your authenticator app/i })).not.toBeInTheDocument();
    });
});
