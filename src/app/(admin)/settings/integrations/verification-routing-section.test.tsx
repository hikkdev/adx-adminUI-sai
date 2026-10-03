import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The verification routing card — Cashfree Phase 2.
 *
 * What is pinned: the providers' health heads the card; the KYC backup is
 * a switch with the owner's sentence; who answers each check offers only
 * the providers that can answer it, never the primary as a fallback, and
 * "Reset" sends null for that check alone; the breaker, the name match and
 * the UPI check save as typed (the UPI line is the owner's decision); the
 * steps per account type are edited in order and reset to the default with
 * null; a draft the server would refuse cannot be saved; and the PUT is
 * the strict per-key patch, nothing that did not move.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn() };
    const backend = {
        puts: [] as { section: string; patch: Record<string, unknown> }[],
        gets: [] as string[],
        reset() {
            this.puts = [];
            this.gets = [];
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
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.gets.push(path);
                return {
                    at: "2026-10-01T10:00:00.000Z",
                    hostedKycBackup: "OFF",
                    breakerSettings: { failures: 5, windowMinutes: 10, cooldownMinutes: 5 },
                    providers: [
                        {
                            name: "DIGIO",
                            label: "Digio",
                            configured: true,
                            capabilities: ["HOSTED_KYC"],
                            breaker: { state: "OPEN", failures: 5, openedAt: "2026-10-01T09:58:00.000Z", retryAt: "2026-10-01T10:03:00.000Z" },
                            last24h: { attempts: 40, technicalFailures: 6, successRate: 85, p95LatencyMs: 2400 },
                            failoversToday: 3,
                        },
                        {
                            name: "CASHFREE_SECURE_ID",
                            label: "Cashfree Secure ID",
                            configured: false,
                            capabilities: [],
                            breaker: { state: "CLOSED", failures: 0, openedAt: null, retryAt: null },
                            last24h: { attempts: 0, technicalFailures: 0, successRate: null, p95LatencyMs: null },
                            failoversToday: 0,
                        },
                    ],
                };
            },
            put: async (_path: string, body: { section: string; patch: Record<string, unknown> }) => {
                backend.puts.push(body);
                return { message: "Saved" };
            },
        },
    };
});

import type { VerificationRoutingSettings } from "@/services/verification";
import { BACKUP_SENTENCE, VerificationRoutingSection } from "./verification-routing-section";

const ALL = ["PAN", "BANK_ACCOUNT", "UPI_VPA", "GSTIN", "VEHICLE_RC", "DRIVING_LICENCE", "FACE_LIVENESS", "FACE_MATCH", "NAME_MATCH", "DIGILOCKER", "HOSTED_KYC"] as const;

const stored = (): VerificationRoutingSettings => ({
    checks: Object.fromEntries(
        ALL.map((check) => [check, check === "HOSTED_KYC" ? { primary: "DIGIO", fallbacks: ["CASHFREE_SECURE_ID"] } : { primary: "CASHFREE_SECURE_ID", fallbacks: [] }])
    ) as VerificationRoutingSettings["checks"],
    breaker: { failures: 5, windowMinutes: 10, cooldownMinutes: 5 },
    composites: {
        AGENT: [
            { step: "DIGILOCKER", required: true },
            { step: "FACE_LIVENESS", required: true },
            { step: "FACE_MATCH", required: true },
        ],
        "PUBLISHER.INDIVIDUAL": [{ step: "DIGILOCKER", required: true }],
    },
    nameMatchMin: 80,
    upiCheck: "VPA_LOOKUP",
    hostedKycBackup: "OFF",
    catalogue: {
        checks: [...ALL],
        providers: [
            { name: "DIGIO", label: "Digio", capabilities: ["HOSTED_KYC", "UPI_VPA"] },
            { name: "CASHFREE_SECURE_ID", label: "Cashfree Secure ID", capabilities: [...ALL] },
        ],
        steps: ["DIGILOCKER", "FACE_LIVENESS", "FACE_MATCH", "DRIVING_LICENCE", "VEHICLE_RC", "PAN", "GSTIN", "PAPERS", "BANK_ACCOUNT", "NAME_MATCH"],
        upiChecks: ["VPA_LOOKUP", "PENNY_DROP", "REVERSE_PENNY_DROP", "NONE"],
    },
});

const WORKFLOWS = [
    { key: "AGENT", label: "Agent (field and sales)", templateId: "KTP2610010306408243IR71R3AROTQNN", source: "DEFAULT" as const },
    { key: "PUBLISHER.INDIVIDUAL", label: "Publisher · Individual", templateId: "KTP261001040743600LJTDRKKQJX52I7", source: "DEFAULT" as const },
];

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
});

async function pick(trigger: HTMLElement, option: string) {
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: option }));
}

const mount = (onChanged = vi.fn()) => {
    render(<VerificationRoutingSection stored={stored()} workflows={WORKFLOWS} onChanged={onChanged} />);
    return onChanged;
};
const save = () => screen.getByRole("button", { name: "Save routing" });

describe("the routing card (a server without the defaults: every row offers Reset)", () => {
    it("heads with the providers' health — configured, breaker, 24 h success, p95, failovers", async () => {
        mount();
        const digio = await screen.findByTestId("verification-provider-DIGIO");
        expect(backend.gets).toContain("/verification/health");
        expect(digio).toHaveTextContent("Configured");
        expect(digio).toHaveTextContent("Left alone");
        expect(digio).toHaveTextContent("85%");
        expect(digio).toHaveTextContent("2.4 s");
        expect(digio).toHaveTextContent("3");
        expect(screen.getByTestId("verification-provider-CASHFREE_SECURE_ID")).toHaveTextContent("Not configured");
    });

    it("switches the KYC backup on with the owner's sentence beside it, sending that field alone", async () => {
        const onChanged = mount();
        expect(screen.getByText(BACKUP_SENTENCE)).toBeInTheDocument();
        expect(save()).toBeDisabled();
        fireEvent.click(screen.getByRole("switch", { name: "Backup for KYC" }));
        fireEvent.click(save());
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.puts).toEqual([{ section: "verificationRouting", patch: { hostedKycBackup: "ON" } }]);
        expect(toast.success).toHaveBeenCalledWith("Verification routing saved", expect.anything());
    });

    it("offers only the providers that can answer a check, never the primary as a fallback, and resets one row with null", async () => {
        mount();
        // PAN: only Cashfree can answer it, so Digio is never offered.
        const pan = screen.getByTestId("routing-check-PAN");
        fireEvent.keyDown(within(pan).getByRole("combobox", { name: "PAN primary" }), { key: "ArrowDown" });
        expect(await screen.findByRole("option", { name: "Cashfree Secure ID" })).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: "Digio" })).toBeNull();
        fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });

        // Hosted KYC: Digio primary; the fallback offers Cashfree and None, never Digio.
        const hosted = screen.getByTestId("routing-check-HOSTED_KYC");
        fireEvent.keyDown(within(hosted).getByRole("combobox", { name: "Hosted KYC fallback 1" }), { key: "ArrowDown" });
        const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
        expect(options).toEqual(["None", "Cashfree Secure ID"]);
        fireEvent.click(screen.getByRole("option", { name: "None" }));

        fireEvent.click(within(pan).getByRole("button", { name: "Reset PAN" }));
        expect(within(screen.getByTestId("routing-check-PAN")).getByText("Back to the default on save.")).toBeInTheDocument();
        fireEvent.click(save());
        await waitFor(() => expect(backend.puts).toHaveLength(1));
        expect(backend.puts[0]!.patch).toEqual({ checks: { HOSTED_KYC: { primary: "DIGIO", fallbacks: [] }, PAN: null } });
    });

    it("offers Digio's UPI lookup first and describes the choice in one line", async () => {
        mount();
        const upi = screen.getByRole("combobox", { name: "UPI payout IDs" });
        expect(upi).toHaveTextContent("Digio UPI lookup (recommended)");
        expect(screen.getByTestId("routing-upi-description")).toHaveTextContent("Looks the UPI ID up with Digio: active or not, and the name on the account. No money moves.");
        fireEvent.keyDown(upi, { key: "ArrowDown" });
        const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
        expect(options).toEqual([
            "Digio UPI lookup (recommended)",
            "Cashfree ₹1 UPI transaction (needs the person's consent)",
            "Reverse penny drop (the person pays ₹1)",
            "Don't check UPI IDs",
        ]);
        fireEvent.click(screen.getByRole("option", { name: "Don't check UPI IDs" }));
        expect(screen.getByTestId("routing-upi-description")).toHaveTextContent("UPI payout methods are only verified by hand.");
    });

    it("saves the breaker, the name match and the UPI check", async () => {
        mount();
        fireEvent.change(screen.getByLabelText("Failures"), { target: { value: "3" } });
        fireEvent.change(screen.getByLabelText("Minimum score (0–100)"), { target: { value: "85" } });
        await pick(screen.getByRole("combobox", { name: "UPI payout IDs" }), "Reverse penny drop (the person pays ₹1)");
        fireEvent.click(save());
        await waitFor(() => expect(backend.puts).toHaveLength(1));
        expect(backend.puts[0]!.patch).toEqual({ breaker: { failures: 3 }, nameMatchMin: 85, upiCheck: "REVERSE_PENNY_DROP" });
    });

    it("refuses a draft the server would refuse", async () => {
        mount();
        fireEvent.change(screen.getByLabelText("Minimum score (0–100)"), { target: { value: "120" } });
        expect(await screen.findByTestId("routing-problem")).toHaveTextContent("The name match minimum is 0 to 100.");
        expect(save()).toBeDisabled();
    });
});

describe("the steps per account type", () => {
    it("lists each workflow by its label, edits its steps in order, and sends the whole list", async () => {
        mount();
        const agent = screen.getByTestId("routing-composite-AGENT");
        expect(agent).toHaveTextContent("Agent (field and sales)");
        expect(agent).toHaveTextContent("DigiLocker · Face liveness · Face match");

        fireEvent.click(within(agent).getByRole("button", { name: "Move Face match up" }));
        fireEvent.click(within(agent).getByRole("switch", { name: "Face liveness required for Agent (field and sales)" }));
        fireEvent.click(within(agent).getByRole("button", { name: "Remove DigiLocker from Agent (field and sales)" }));
        await pick(within(agent).getByRole("combobox", { name: "Add a step to Agent (field and sales)" }), "Bank account");

        fireEvent.click(save());
        await waitFor(() => expect(backend.puts).toHaveLength(1));
        expect(backend.puts[0]!.patch).toEqual({
            composites: {
                AGENT: [
                    { step: "FACE_MATCH", required: true },
                    { step: "FACE_LIVENESS", required: false },
                    { step: "BANK_ACCOUNT", required: true },
                ],
            },
        });
    });

    it("resets one workflow to the default with null, and will not save an empty list", async () => {
        mount();
        const publisher = screen.getByTestId("routing-composite-PUBLISHER.INDIVIDUAL");
        fireEvent.click(within(publisher).getByRole("button", { name: "Remove DigiLocker from Publisher · Individual" }));
        expect(await screen.findByTestId("routing-problem")).toHaveTextContent("Keep at least one step, or reset to the default.");
        expect(save()).toBeDisabled();

        fireEvent.click(within(publisher).getByRole("button", { name: "Reset Publisher · Individual to default" }));
        expect(within(publisher).getByText("Goes back to the default steps on save.")).toBeInTheDocument();
        fireEvent.click(save());
        await waitFor(() => expect(backend.puts).toHaveLength(1));
        expect(backend.puts[0]!.patch).toEqual({ composites: { "PUBLISHER.INDIVIDUAL": null } });
    });
});

/** The defaults a reset restores, as `verificationRouting.defaults` carries them — the owner's decisions of 1 Oct 2026. */
const withDefaults = (): VerificationRoutingSettings => {
    const base = stored();
    const defaults = {
        checks: JSON.parse(JSON.stringify(base.checks)) as VerificationRoutingSettings["checks"],
        breaker: { failures: 5, windowMinutes: 10, cooldownMinutes: 5 },
        composites: {
            AGENT: [
                { step: "DIGILOCKER" as const, required: true },
                { step: "FACE_LIVENESS" as const, required: true },
                { step: "FACE_MATCH" as const, required: true },
                { step: "BANK_ACCOUNT" as const, required: true },
            ],
            "PUBLISHER.INDIVIDUAL": [{ step: "DIGILOCKER" as const, required: true }],
        },
        nameMatchMin: 80,
    };
    // In force: hosted KYC turned round, the breaker tightened, the agent's bank step dropped — three overrides.
    base.checks.HOSTED_KYC = { primary: "CASHFREE_SECURE_ID", fallbacks: ["DIGIO"] };
    base.breaker = { failures: 3, windowMinutes: 10, cooldownMinutes: 5 };
    return { ...base, defaults };
};

describe("the routing card against the defaults", () => {
    const mountDefaults = () => render(<VerificationRoutingSection stored={withDefaults()} workflows={WORKFLOWS} onChanged={vi.fn()} />);

    it("marks only the rows that differ from the default as Changed, and offers Reset on those alone", () => {
        mountDefaults();
        const hosted = screen.getByTestId("routing-check-HOSTED_KYC");
        expect(within(hosted).getByText("Changed")).toBeInTheDocument();
        expect(within(hosted).getByRole("button", { name: "Reset Hosted KYC" })).toBeInTheDocument();

        const pan = screen.getByTestId("routing-check-PAN");
        expect(within(pan).queryByText("Changed")).toBeNull();
        expect(within(pan).queryByRole("button", { name: "Reset PAN" })).toBeNull();

        const agent = screen.getByTestId("routing-composite-AGENT");
        expect(within(agent).getByText("Changed")).toBeInTheDocument();
        expect(within(agent).getByRole("button", { name: "Reset Agent (field and sales) to default" })).toBeInTheDocument();
        const publisher = screen.getByTestId("routing-composite-PUBLISHER.INDIVIDUAL");
        expect(within(publisher).queryByText("Changed")).toBeNull();
        expect(within(publisher).queryByRole("button", { name: "Reset Publisher · Individual to default" })).toBeNull();

        expect(screen.getByTestId("routing-breaker-changed")).toBeInTheDocument();
        expect(screen.queryByTestId("routing-name-match-changed")).toBeNull();
    });

    it("shows the default itself after a reset, and sends null for that row", async () => {
        mountDefaults();
        fireEvent.click(within(screen.getByTestId("routing-check-HOSTED_KYC")).getByRole("button", { name: "Reset Hosted KYC" }));
        expect(screen.getByTestId("routing-check-HOSTED_KYC-default")).toHaveTextContent("Default: Digio → Cashfree Secure ID");

        const agent = screen.getByTestId("routing-composite-AGENT");
        fireEvent.click(within(agent).getByRole("button", { name: "Reset Agent (field and sales) to default" }));
        expect(screen.getByTestId("routing-composite-AGENT-default")).toHaveTextContent("Back to the default on save: DigiLocker · Face liveness · Face match · Bank account.");
        expect(agent).toHaveTextContent("Default: DigiLocker · Face liveness · Face match · Bank account");

        fireEvent.click(screen.getByRole("button", { name: "Reset the breaker" }));
        expect(screen.getByLabelText("Failures")).toHaveValue(5);
        expect(screen.queryByTestId("routing-breaker-changed")).toBeNull();

        fireEvent.click(save());
        await waitFor(() => expect(backend.puts).toHaveLength(1));
        expect(backend.puts[0]!.patch).toEqual({ checks: { HOSTED_KYC: null }, composites: { AGENT: null }, breaker: { failures: 5 } });
    });

    it("marks a row Changed the moment it is edited away from its default", async () => {
        mountDefaults();
        const pan = screen.getByTestId("routing-check-PAN");
        expect(within(pan).queryByText("Changed")).toBeNull();
        fireEvent.change(screen.getByLabelText("Minimum score (0–100)"), { target: { value: "90" } });
        expect(screen.getByTestId("routing-name-match-changed")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Reset the name match" }));
        expect(screen.getByLabelText("Minimum score (0–100)")).toHaveValue(80);
    });
});
