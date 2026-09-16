import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Lot K2 — the operator's own authenticator app.
 *
 * What this pins: opening the setup asks the server for a secret and draws
 * the QR it answered; Confirm posts the six digits as typed (spacing
 * dropped); the ten recovery codes then show once, Done stays off until
 * the operator says they are saved, and the dialog will not close over
 * unsaved codes; a must-enrol session's fresh access token is stored the
 * moment confirm answers it. Turn off posts the app's code, or a recovery
 * code under the switch.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        reset() {
            this.calls = [];
        },
    };
    return { backend, toast };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

const CODES = ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ", "23456789", "AB23CD45", "EF67GH89", "JK23LM45", "NP67QR89", "ST23UV45", "WX67YZ89"];

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (path === "/auth/2fa/totp/enrol") {
            return { secret: "JBSWY3DPEHPK3PXP", otpauthUri: "otpauth://totp/ADX:me?secret=JBSWY3DPEHPK3PXP", qrSvg: "data:image/svg+xml;base64,PHN2Zy8+", expiresInSeconds: 600 };
        }
        if (path === "/auth/2fa/totp/confirm") return { enrolledAt: "2026-09-14T10:00:00.000Z", recoveryCodes: CODES, accessToken: "fresh-token" };
        if (path === "/auth/2fa/recovery-codes/regenerate") return { recoveryCodes: CODES };
        return { message: "Authenticator app removed", disabled: true };
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
            put: (path: string, body?: unknown) => wrap("PUT", path, body),
            delete: (path: string) => wrap("DELETE", path),
        },
    };
});

import type { TwoFactorStatus } from "@/services/two-factor";
import { AuthenticatorCard, EnrolDialog } from "./authenticator-card";

const status = (over: Partial<TwoFactorStatus["authenticator"]> = {}, policy: Partial<TwoFactorStatus["policy"]> = {}): TwoFactorStatus => ({
    methods: ["SMS", "EMAIL"],
    authenticator: { enrolled: false, enrolledAt: null, recoveryCodesLeft: 0, ...over },
    policy: { authenticatorRequired: false, smsAllowedWhenEnrolled: true, ...policy },
    mustEnrolAuthenticator: false,
});

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    window.localStorage.clear();
});

describe("EnrolDialog", () => {
    it("asks for a secret, posts the confirmed code, and gates Done on the codes being saved", async () => {
        const onEnrolled = vi.fn();
        const onOpenChange = vi.fn();
        render(<EnrolDialog open onOpenChange={onOpenChange} onEnrolled={onEnrolled} />);

        /* The secret is asked for as the dialog opens, and the QR it answered is drawn. */
        await waitFor(() => expect(backend.calls).toEqual([{ method: "POST", path: "/auth/2fa/totp/enrol", body: undefined }]));
        const qr = await screen.findByRole("img", { name: /qr code/i });
        expect(qr).toHaveAttribute("src", "data:image/svg+xml;base64,PHN2Zy8+");

        /* The key sits under a reveal. */
        expect(screen.queryByTestId("totp-secret")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /show the key/i }));
        expect(screen.getByTestId("totp-secret")).toHaveTextContent("JBSW Y3DP EHPK 3PXP");

        /* Six digits, the space the operator typed dropped; Confirm is off until they are all there. */
        const code = screen.getByLabelText(/code from the app/i);
        fireEvent.change(code, { target: { value: "123 45" } });
        expect(screen.getByRole("button", { name: /^confirm$/i })).toBeDisabled();
        fireEvent.change(code, { target: { value: "123 456" } });
        fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

        await waitFor(() => expect(backend.calls.at(-1)).toEqual({ method: "POST", path: "/auth/2fa/totp/confirm", body: { code: "123456" } }));

        /* The codes show once, formatted; the must-enrol session's fresh token is already stored. */
        const list = await screen.findByTestId("recovery-codes");
        expect(list.querySelectorAll("li")).toHaveLength(10);
        expect(list).toHaveTextContent("ABCD-EFGH");
        expect(window.localStorage.getItem("adx.accessToken")).toBe("fresh-token");

        /* Done is gated on the acknowledgement; closing over unsaved codes is refused. */
        const done = screen.getByRole("button", { name: /^done$/i });
        expect(done).toBeDisabled();
        fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
        expect(onOpenChange).not.toHaveBeenCalledWith(false);

        fireEvent.click(screen.getByRole("checkbox", { name: /i have saved these codes/i }));
        expect(done).not.toBeDisabled();
        fireEvent.click(done);

        expect(onEnrolled).toHaveBeenCalledTimes(1);
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(toast.success).toHaveBeenCalledWith("Authenticator app set up", expect.anything());
    });
});

describe("AuthenticatorCard", () => {
    it("offers Set up while nothing is enrolled, and says why when the session is held to it", () => {
        render(<AuthenticatorCard status={{ ...status(), mustEnrolAuthenticator: true }} onChanged={() => {}} />);
        expect(screen.getByRole("button", { name: /set up/i })).toBeInTheDocument();
        expect(screen.getByTestId("authenticator-detail")).toHaveTextContent(/nothing else in the console opens/i);
    });

    it("says when it was enrolled and how many codes are left, warning when low, and turns off with a recovery code", async () => {
        const onChanged = vi.fn();
        render(
            <AuthenticatorCard
                status={status({ enrolled: true, enrolledAt: "2026-09-01T00:00:00.000Z", recoveryCodesLeft: 2 }, { smsAllowedWhenEnrolled: false })}
                onChanged={onChanged}
            />,
        );
        expect(screen.getByText(/enrolled on 1 Sept 2026/i)).toBeInTheDocument();
        expect(screen.getByTestId("authenticator-detail")).toHaveTextContent("2 of 10 recovery codes left");
        expect(screen.getByTestId("authenticator-detail")).toHaveTextContent(/SMS and email codes are not offered/i);
        expect(screen.getByRole("status")).toHaveTextContent(/running low/i);

        fireEvent.click(screen.getByRole("button", { name: /turn off/i }));
        const dialog = await screen.findByRole("dialog");
        fireEvent.click(within(dialog).getByRole("switch", { name: /use a recovery code/i }));
        fireEvent.change(within(dialog).getByLabelText(/^recovery code$/i), { target: { value: "abcd-efgh" } });
        fireEvent.click(within(dialog).getByRole("button", { name: /^turn off$/i }));

        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toEqual([{ method: "POST", path: "/auth/2fa/totp/disable", body: { recoveryCode: "ABCDEFGH" } }]);
    });

    it("regenerates behind the app's code and gates Done on the new set being saved", async () => {
        const onChanged = vi.fn();
        render(<AuthenticatorCard status={status({ enrolled: true, enrolledAt: "2026-09-01T00:00:00.000Z", recoveryCodesLeft: 9 })} onChanged={onChanged} />);

        fireEvent.click(screen.getByRole("button", { name: /regenerate codes/i }));
        fireEvent.change(await screen.findByLabelText(/code from your app/i), { target: { value: "654321" } });
        fireEvent.click(screen.getByRole("button", { name: /^regenerate$/i }));

        await waitFor(() => expect(backend.calls).toEqual([{ method: "POST", path: "/auth/2fa/recovery-codes/regenerate", body: { code: "654321" } }]));
        const done = await screen.findByRole("button", { name: /^done$/i });
        expect(done).toBeDisabled();
        fireEvent.click(screen.getByRole("checkbox", { name: /i have saved these codes/i }));
        fireEvent.click(done);
        expect(onChanged).toHaveBeenCalledTimes(1);
    });
});
