import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * ED-1 — every account proves its email; the console gates on the stamp.
 *
 * What is pinned: the decision reads a null stamp and nothing else (a
 * backend that does not send the field must not lock the console), the
 * code box keeps only what a code can contain, and the card sends to the
 * address on file — or a corrected one — then verifies with the same
 * address and the code in capitals.
 */

vi.mock("@/lib/api-config", () => ({
    apiConfig: { live: true, baseUrl: "http://api.test" },
    isLive: () => true,
}));

const { backend } = vi.hoisted(() => ({
    backend: { calls: [] as { method: string; path: string; body?: unknown }[], answers: [] as unknown[] },
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        return backend.answers.shift() ?? {};
    };
    return { ...actual, api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") } };
});

import { VerifyEmailGate } from "@/components/adx/verify-email-gate";
import { EMAIL_CODE_ALPHABET, emailCodeComplete, needsEmailVerification, normalizeEmailCode } from "./email-gate";

describe("needsEmailVerification", () => {
    it("shuts the shell on a null stamp and nothing else", () => {
        expect(needsEmailVerification({ email: "ops@adx.in", emailVerifiedAt: null }, true)).toBe(true);
        expect(needsEmailVerification({ email: "ops@adx.in", emailVerifiedAt: "2026-09-20T08:23:39.938Z" }, true)).toBe(false);
    });

    it("does not lock a console whose backend never sent the field, nor one against fixtures, nor nobody", () => {
        expect(needsEmailVerification({ email: "ops@adx.in" }, true)).toBe(false);
        expect(needsEmailVerification({ email: "ops@adx.in", emailVerifiedAt: null }, false)).toBe(false);
        expect(needsEmailVerification(null, true)).toBe(false);
    });
});

describe("the code", () => {
    it("is eight capitals from an alphabet without I or O, typed in any case", () => {
        expect(EMAIL_CODE_ALPHABET).not.toMatch(/[IO]/);
        expect(EMAIL_CODE_ALPHABET).toHaveLength(24);
        expect(normalizeEmailCode("sg8g-37fu y7")).toBe("SGGFUY");
        expect(normalizeEmailCode("abcdefghjklm")).toBe("ABCDEFGH");
        expect(normalizeEmailCode("aio bcd")).toBe("ABCD");
        expect(emailCodeComplete("ABCDEFGH")).toBe(true);
        expect(emailCodeComplete("ABCDEFG")).toBe(false);
        expect(emailCodeComplete("ABCDEFGI")).toBe(false);
    });
});

describe("the card", () => {
    it("sends to the address on file, then verifies with the same address and the code in capitals", async () => {
        backend.calls.length = 0;
        backend.answers = [
            { email: "ops@adx.in", expiresInSeconds: 600, resendAfterSeconds: 60, sendsRemaining: 2 },
            { id: "u1", email: "ops@adx.in", emailVerifiedAt: "2026-09-25T09:00:00.000Z" },
        ];
        const onVerified = vi.fn();
        const onSignOut = vi.fn();
        render(<VerifyEmailGate email="ops@adx.in" onVerified={onVerified} onSignOut={onSignOut} />);

        expect(screen.getByRole("heading", { name: /Prove the email on your account/ })).toBeInTheDocument();
        expect(screen.getByTestId("gate-email")).toHaveTextContent("ops@adx.in");

        fireEvent.click(screen.getByTestId("gate-send"));
        await waitFor(() => expect(screen.getByTestId("gate-code")).toBeInTheDocument());
        expect(backend.calls[0]).toEqual({ method: "POST", path: "/users/me/email/send-code", body: { email: "ops@adx.in" } });
        expect(screen.getByTestId("gate-expiry")).toHaveTextContent(/Expires in 10:00/);

        fireEvent.change(screen.getByTestId("gate-code"), { target: { value: "sg8g37fuy7" } });
        expect(screen.getByTestId("gate-code")).toHaveValue("SGGFUY");
        expect(screen.getByTestId("gate-verify")).toBeDisabled();

        fireEvent.change(screen.getByTestId("gate-code"), { target: { value: "abcdefgh" } });
        fireEvent.click(screen.getByTestId("gate-verify"));
        await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
        expect(backend.calls[1]).toEqual({ method: "POST", path: "/users/me/email/verify", body: { email: "ops@adx.in", code: "ABCDEFGH" } });

        fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
        expect(onSignOut).toHaveBeenCalledTimes(1);
    });

    it("lets the address be corrected before the code goes, and refuses to send to something that is not one", async () => {
        backend.calls.length = 0;
        backend.answers = [{ email: "priya@adx.in", expiresInSeconds: 600, resendAfterSeconds: 60, sendsRemaining: 2 }];
        render(<VerifyEmailGate email="wrong@adx.in" onVerified={vi.fn()} onSignOut={vi.fn()} />);

        fireEvent.click(screen.getByTestId("gate-change-email"));
        const input = screen.getByLabelText("Email on file");
        fireEvent.change(input, { target: { value: "not an address" } });
        expect(screen.getByTestId("gate-send")).toBeDisabled();

        fireEvent.change(input, { target: { value: "Priya@ADX.in" } });
        fireEvent.click(screen.getByTestId("gate-send"));
        await waitFor(() => expect(backend.calls).toHaveLength(1));
        expect(backend.calls[0].body).toEqual({ email: "priya@adx.in" });
        await waitFor(() => expect(screen.getByTestId("gate-email")).toHaveTextContent("priya@adx.in"));
    });

    it("starts open for editing when the account has no address at all", () => {
        render(<VerifyEmailGate email={null} onVerified={vi.fn()} onSignOut={vi.fn()} />);
        expect(screen.getByLabelText("Email on file")).toHaveValue("");
        expect(screen.getByTestId("gate-send")).toBeDisabled();
    });
});
