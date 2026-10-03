import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * The Cashfree Secure ID card — Cashfree Phase 2.
 *
 * What is pinned: the card says configured / where the keys come from /
 * sandbox or live / the signing mode / the fingerprint, never a key; the
 * secret and the PEM are write-only (blank keeps, so an untouched form
 * cannot save); "Remove the public key" sends `publicKey: null`; a 400's
 * person-facing sentence is shown as it stands; and a production server
 * without an encryption key is answered in the owner's words.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn() };
    const backend = {
        puts: [] as { section: string; patch: Record<string, unknown> }[],
        failure: null as Error | null,
        reset() {
            this.puts = [];
            this.failure = null;
        },
    };
    return { backend, toast };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            ...actual.api,
            put: async (_path: string, body: { section: string; patch: Record<string, unknown> }) => {
                backend.puts.push(body);
                if (backend.failure) throw backend.failure;
                return { message: "Saved" };
            },
        },
    };
});

import { ApiError } from "@/lib/api-client";
import type { SecureIdSettings } from "@/services/verification";
import { SecureIdSection } from "./secure-id-section";

const stored = (over: Partial<SecureIdSettings> = {}): SecureIdSettings => ({
    clientId: "CF10001",
    clientSecret: "••••1234",
    publicKey: "••••",
    publicKeyFingerprint: "0123456789abcdef",
    testMode: true,
    configured: true,
    signing: "PUBLIC_KEY",
    baseUrl: "https://sandbox.cashfree.com/verification",
    source: "SETTINGS",
    ...over,
});

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
});

const save = () => screen.getByRole("button", { name: "Save Secure ID" });

describe("the Secure ID card", () => {
    it("is labelled as the backup to Digio and says what the wire is, never a key", () => {
        render(<SecureIdSection stored={stored()} onChanged={() => {}} />);
        expect(screen.getByText("Cashfree Secure ID")).toBeInTheDocument();
        expect(screen.getByText("Identity, bank and business checks — the backup to Digio.")).toBeInTheDocument();
        expect(screen.getByText("Configured")).toBeInTheDocument();
        expect(screen.getByText("Keys from Settings")).toBeInTheDocument();
        expect(screen.getByText("Sandbox")).toBeInTheDocument();
        expect(screen.getByText("Signed with the public key")).toBeInTheDocument();
        expect(screen.getByTestId("secure-id-fingerprint")).toHaveTextContent("0123456789abcdef");
        // Write-only: the masked secret is a placeholder, never a value; the PEM field starts empty.
        expect(screen.getByLabelText("Client secret")).toHaveValue("");
        expect(screen.getByLabelText("Public key (PEM)")).toHaveValue("");
        expect(save()).toBeDisabled();
    });

    it("says an unconfigured account on the environment's keys, live and on IP whitelisting", () => {
        render(<SecureIdSection stored={stored({ configured: false, source: "ENV", testMode: false, signing: "IP_WHITELIST", publicKey: null, publicKeyFingerprint: null })} onChanged={() => {}} />);
        expect(screen.getByText("Not configured")).toBeInTheDocument();
        expect(screen.getByText("Keys from the server's environment")).toBeInTheDocument();
        expect(screen.getByText("Live")).toBeInTheDocument();
        expect(screen.getByText("IP whitelisting")).toBeInTheDocument();
        expect(screen.getByTestId("secure-id-fingerprint")).toHaveTextContent("No public key loaded");
        expect(screen.queryByRole("button", { name: "Remove the public key" })).toBeNull();
    });

    it("saves only what was typed, and the toast says so", async () => {
        const onChanged = vi.fn();
        render(<SecureIdSection stored={stored()} onChanged={onChanged} />);
        fireEvent.change(screen.getByLabelText("Client secret"), { target: { value: "cfsk_new" } });
        fireEvent.click(screen.getByRole("switch"));
        fireEvent.click(save());
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.puts).toEqual([{ section: "secureId", patch: { clientSecret: "cfsk_new", testMode: false } }]);
        expect(toast.success).toHaveBeenCalledWith("Cashfree Secure ID saved", expect.anything());
    });

    it("removes the public key with null", async () => {
        render(<SecureIdSection stored={stored()} onChanged={() => {}} />);
        fireEvent.click(screen.getByRole("button", { name: "Remove the public key" }));
        fireEvent.click(save());
        await waitFor(() => expect(backend.puts).toHaveLength(1));
        expect(backend.puts[0]).toEqual({ section: "secureId", patch: { publicKey: null } });
    });

    it("shows a 400's own sentence, and the encryption key's 503 in the owner's words", async () => {
        backend.failure = new ApiError(400, "VALIDATION_ERROR", "Invalid patch", { fieldErrors: { publicKey: ["The public key is not an RSA public key in PEM form"] } });
        render(<SecureIdSection stored={stored()} onChanged={() => {}} />);
        fireEvent.change(screen.getByLabelText("Public key (PEM)"), { target: { value: "not a key" } });
        fireEvent.click(save());
        expect(await screen.findByTestId("secure-id-error")).toHaveTextContent("The public key is not an RSA public key in PEM form");

        backend.failure = new ApiError(503, "ENCRYPTION_KEY_MISSING", "No encryption key");
        fireEvent.click(save());
        await waitFor(() => expect(screen.getByTestId("secure-id-error")).toHaveTextContent("Set INTEGRATIONS_ENCRYPTION_KEY on the server before saving keys."));
    });

    it("says so when the backend carries no Secure ID section", () => {
        render(<SecureIdSection stored={undefined} onChanged={() => {}} />);
        expect(screen.getByTestId("secure-id-absent")).toBeInTheDocument();
    });
});
