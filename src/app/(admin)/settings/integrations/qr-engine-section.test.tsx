import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { QrEngineSettings, QrEngineTest } from "@/services/integrations";

/**
 * QR-1 — the QR engine card.
 *
 * What this pins: the switch writes `PUT /integrations { section:
 * 'qrEngine', patch: { provider } }` and nothing else; under Local the
 * GenQR fields are absent and the sentence says codes are drawn here;
 * under GenQR the host, key and short origin save as one patch with a
 * blank key left off, the style saves as its own `{ style }` patch with a
 * cleared field as null, and "Test connection" posts
 * `POST /integrations/qr-engine/test` and prints the verdict — the
 * account, the scopes the key lacks, the origin mismatch — disabled with
 * the reason until the host and key are on file. A backend older than the
 * field gets a card that says so.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        answer: {} as unknown,
        failure: null as Error | null,
        reset() {
            this.calls = [];
            this.answer = {};
            this.failure = null;
        },
    };
    return { backend, toast };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (backend.failure) throw backend.failure;
        return backend.answer;
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

import { GENQR_SENTENCE, LOCAL_SENTENCE, QrEngineSection } from "./qr-engine-section";

const local = (over: Partial<QrEngineSettings> = {}): QrEngineSettings => ({
    provider: "LOCAL",
    baseUrl: null,
    apiKey: null,
    shortBaseUrl: null,
    style: {},
    hostsDynamic: false,
    ...over,
});

const genqr = (over: Partial<QrEngineSettings> = {}): QrEngineSettings => ({
    provider: "GENQR",
    baseUrl: "https://genqr.example",
    apiKey: "••••9876",
    shortBaseUrl: "https://go.adx.example",
    style: { foregroundColor: "#213333", dotStyle: "rounded", frameCaption: "Scan me" },
    hostsDynamic: true,
    ...over,
});

const verdict = (over: Partial<QrEngineTest> = {}): QrEngineTest => ({
    engine: "GENQR",
    configured: true,
    reachable: true,
    authorized: true,
    status: 200,
    message: "GenQR answered as ops@adx.example on the Enterprise plan.",
    account: { email: "ops@adx.example", plan: "Enterprise", apiAccess: true, scope: "*", redirectBase: "https://go.adx.example" },
    scopesMissing: [],
    shortBaseMatches: true,
    ...over,
});

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
});

describe("the switch", () => {
    it("writes the provider alone and re-reads", async () => {
        const onChanged = vi.fn();
        render(<QrEngineSection stored={local()} onChanged={onChanged} />);

        const group = screen.getByRole("radiogroup", { name: "QR engine" });
        expect(within(group).getByRole("radio", { name: "Local (house style)" })).toHaveAttribute("aria-checked", "true");
        expect(screen.getByText(LOCAL_SENTENCE)).toBeInTheDocument();
        expect(screen.queryByLabelText("GenQR base URL")).not.toBeInTheDocument();

        fireEvent.click(within(group).getByRole("radio", { name: "GenQR" }));

        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toEqual([{ method: "PUT", path: "/integrations", body: { section: "qrEngine", patch: { provider: "GENQR" } } }]);
        expect(toast.success).toHaveBeenCalledWith("Codes go through GenQR", expect.anything());
    });

    it("does nothing when the engine in force is clicked again", () => {
        render(<QrEngineSection stored={local()} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("radio", { name: "Local (house style)" }));
        expect(backend.calls).toEqual([]);
    });

    it("a backend older than the field gets a card that says so", () => {
        render(<QrEngineSection stored={undefined} onChanged={vi.fn()} />);
        expect(screen.getByText("Not reported")).toBeInTheDocument();
        expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    });
});

describe("under GenQR", () => {
    it("shows the sentence, the connection and the badge, with the key masked", () => {
        render(<QrEngineSection stored={genqr()} onChanged={vi.fn()} />);
        expect(screen.getByText(GENQR_SENTENCE)).toBeInTheDocument();
        expect(screen.getByText("GenQR connected")).toBeInTheDocument();
        expect(screen.getByLabelText("GenQR base URL")).toHaveValue("https://genqr.example");
        expect(screen.getByLabelText("API key")).toHaveValue("");
        expect(screen.getByLabelText("API key")).toHaveAttribute("placeholder", "••••9876");
        expect(screen.getByLabelText("Short origin printed on hoardings")).toHaveValue("https://go.adx.example");
    });

    it("warns when GenQR is chosen but has no credentials, and the test is disabled with the reason", () => {
        render(<QrEngineSection stored={genqr({ apiKey: null, hostsDynamic: false })} onChanged={vi.fn()} />);
        expect(screen.getByText("GenQR — not configured")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Test connection" })).toBeDisabled();
        expect(screen.getByText("Set the GenQR API key first.")).toBeInTheDocument();
    });

    it("saves the host, a typed key and the short origin as one patch; a blank key is left off", async () => {
        const onChanged = vi.fn();
        render(<QrEngineSection stored={genqr()} onChanged={onChanged} />);
        const save = screen.getByRole("button", { name: "Save connection" });
        expect(save).toBeDisabled();

        fireEvent.change(screen.getByLabelText("Short origin printed on hoardings"), { target: { value: "https://go2.adx.example" } });
        expect(save).toBeEnabled();
        fireEvent.click(save);

        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toEqual([
            { method: "PUT", path: "/integrations", body: { section: "qrEngine", patch: { shortBaseUrl: "https://go2.adx.example" } } },
        ]);
    });

    it("a typed key travels; clearing the short origin sends null", async () => {
        const onChanged = vi.fn();
        render(<QrEngineSection stored={genqr()} onChanged={onChanged} />);
        fireEvent.change(screen.getByLabelText("API key"), { target: { value: "gqr_newkey" } });
        fireEvent.change(screen.getByLabelText("Short origin printed on hoardings"), { target: { value: "" } });
        fireEvent.click(screen.getByRole("button", { name: "Save connection" }));

        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls[0]).toEqual({
            method: "PUT",
            path: "/integrations",
            body: { section: "qrEngine", patch: { apiKey: "gqr_newkey", shortBaseUrl: null } },
        });
    });

    it("saves the style as its own patch, a cleared field as null, and refuses a bad colour", async () => {
        const onChanged = vi.fn();
        render(<QrEngineSection stored={genqr()} onChanged={onChanged} />);
        const save = screen.getByRole("button", { name: "Save style" });
        expect(save).toBeDisabled();

        fireEvent.change(screen.getByLabelText("Foreground"), { target: { value: "teal" } });
        expect(screen.getByText("Use #rrggbb")).toBeInTheDocument();
        expect(save).toBeDisabled();

        fireEvent.change(screen.getByLabelText("Foreground"), { target: { value: "#112233" } });
        fireEvent.change(screen.getByLabelText("Caption"), { target: { value: "" } });
        expect(save).toBeEnabled();
        fireEvent.click(save);

        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toEqual([
            { method: "PUT", path: "/integrations", body: { section: "qrEngine", patch: { style: { foregroundColor: "#112233", frameCaption: null } } } },
        ]);
    });
});

describe("the test", () => {
    it("posts the test and prints a clean verdict", async () => {
        backend.answer = verdict();
        render(<QrEngineSection stored={genqr()} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

        const card = await screen.findByTestId("qr-engine-verdict");
        expect(backend.calls).toEqual([{ method: "POST", path: "/integrations/qr-engine/test", body: {} }]);
        expect(within(card).getByText("Connected")).toBeInTheDocument();
        expect(within(card).getByText("ops@adx.example")).toBeInTheDocument();
        expect(within(card).getByText("Enterprise")).toBeInTheDocument();
        expect(within(card).getByText("HTTP 200")).toBeInTheDocument();
    });

    it("prints the gaps: missing scopes and a printed origin that does not match", async () => {
        backend.answer = verdict({
            message: "GenQR answered, but the key lacks analytics:read, render; GenQR prints https://genqr.example but ADX expects https://go.adx.example.",
            account: { email: "ops@adx.example", plan: "Enterprise", apiAccess: true, scope: "qrcodes:read,qrcodes:write", redirectBase: "https://genqr.example" },
            scopesMissing: ["analytics:read", "render"],
            shortBaseMatches: false,
        });
        render(<QrEngineSection stored={genqr()} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

        const card = await screen.findByTestId("qr-engine-verdict");
        expect(within(card).getByText("Connected, with gaps")).toBeInTheDocument();
        expect(within(card).getByText("analytics:read, render")).toBeInTheDocument();
        expect(within(card).getByText("https://genqr.example")).toBeInTheDocument();
    });

    it("a refused key is printed as refused with GenQR's sentence", async () => {
        backend.answer = verdict({ authorized: false, status: 401, message: 'GenQR refused the key: invalid, revoked or expired. GenQR said: "Invalid or revoked API key."', account: null });
        render(<QrEngineSection stored={genqr()} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

        const card = await screen.findByTestId("qr-engine-verdict");
        expect(within(card).getByText("Refused")).toBeInTheDocument();
        expect(within(card).getByText(/Invalid or revoked API key/)).toBeInTheDocument();
    });

    it("a transport failure is a toast, not a verdict", async () => {
        backend.failure = new Error("Network down");
        render(<QrEngineSection stored={genqr()} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Network down"));
        expect(screen.queryByTestId("qr-engine-verdict")).not.toBeInTheDocument();
    });
});
