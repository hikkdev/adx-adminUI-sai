import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The desk's side of the verification layer — Cashfree Phase 2.
 *
 * What is pinned, on every KYC case page: the "Verification checks" panel
 * lists every provider call newest first — the provider, the check, its
 * status, whether the provider answered (BUSINESS) or could not (the
 * technical class), the code, the latency, the name score — with the
 * PII-minimised result collapsed and the sessions as a step list; "No
 * provider calls yet." when there are none. "Resend on backup" is offered
 * while the backup can be sent, disabled with the reason while it is
 * switched off, behind the owner's confirm, and toasts whether the person
 * was told. The Digio card shows "Cashfree" for a record the backup ran,
 * and "Digio couldn't be reached" — never PROVIDER_FAILED — with the resend
 * beside it. A desk restart whose failure carries `details.backup` offers
 * the resend in its toast. The line under the KYC tabs says each provider's
 * state in a word and links to the routing card.
 */

const { backend, toast, session } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn() };
    const session = { permissions: new Set<string>(["kyc.view", "kyc.edit"]) };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        attempts: null as unknown,
        resend: { session: { id: "vs_1" }, notified: true } as unknown,
        refusals: [] as { status: number; code: string; message: string; details?: unknown }[],
        reset() {
            this.calls = [];
            this.attempts = null;
            this.resend = { session: { id: "vs_1" }, notified: true };
            this.refusals = [];
        },
    };
    return { backend, toast, session };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/auth", () => {
    const value = () => ({ user: { id: "usr_admin", name: "Priya", roles: ["ADMIN"] }, loading: false, can: (permission: string) => session.permissions.has(permission) });
    return { useAuth: value, useOptionalAuth: value };
});

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const refuse = () => {
        const refusal = backend.refusals.shift();
        if (refusal) throw new actual.ApiError(refusal.status, refusal.code, refusal.message, refusal.details);
    };
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                backend.calls.push({ method: "GET", path });
                if (path.startsWith("/verification/attempts")) return backend.attempts;
                if (path === "/verification/health") return HEALTH;
                // The Digio card reads the provider switch off the integrations config.
                return { kyc: { clientId: null, clientSecret: null, baseUrl: null, kycProvider: "DIGIO" } };
            },
            post: async (path: string, body?: unknown) => {
                backend.calls.push({ method: "POST", path, body });
                refuse();
                if (path.includes("/resend-on-backup")) return backend.resend;
                return { kycId: "dg_2", validTill: "2026-10-02T00:00:00.000Z", digioStatus: "pending", notified: true };
            },
        },
    };
});

const HEALTH = {
    at: "2026-10-01T10:00:00.000Z",
    hostedKycBackup: "ON",
    breakerSettings: { failures: 5, windowMinutes: 10, cooldownMinutes: 5 },
    providers: [
        {
            name: "DIGIO",
            label: "Digio",
            configured: true,
            capabilities: ["HOSTED_KYC"],
            breaker: { state: "HALF_OPEN", failures: 2, openedAt: null, retryAt: null },
            last24h: { attempts: 12, technicalFailures: 1, successRate: 91.7, p95LatencyMs: 640 },
            failoversToday: 1,
        },
    ],
};

import { useApiResource } from "@/lib/use-api-resource";
import { PROVIDER_FAILED, type CaseAttempts } from "@/services/verification";
import { VerificationProvidersLine } from "@/components/adx/verification-providers";
import { DigioCard } from "./digio-card";
import { VerificationChecksPanel, backupStateOf, useCaseAttempts } from "./verification-checks-panel";

const attempt = (over: Record<string, unknown>) => ({
    id: "att_1",
    caseType: "PUBLISHER_KYC",
    caseId: "pub_1",
    sessionId: null,
    checkType: "HOSTED_KYC",
    provider: "DIGIO",
    providerLabel: "Digio",
    attemptNo: 1,
    verificationId: "att_1",
    status: "FAILED",
    errorClass: "TIMEOUT",
    failureCode: null,
    latencyMs: 15000,
    providerRef: null,
    nameMatchScore: null,
    result: null,
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
    ...over,
});

const attempts = (over: Partial<CaseAttempts> = {}): CaseAttempts =>
    ({
        attempts: [
            attempt({}),
            attempt({
                id: "att_2",
                checkType: "BANK_ACCOUNT",
                provider: "CASHFREE_SECURE_ID",
                providerLabel: "Cashfree Secure ID",
                status: "FAILED",
                errorClass: "BUSINESS",
                failureCode: "NAME_MISMATCH",
                latencyMs: 820,
                nameMatchScore: 42,
                result: { bankName: "HDFC Bank", accountStatus: "VALID", nameAtBank: "R•••• K••••" },
                createdAt: "2026-10-01T09:30:00.000Z",
            }),
        ],
        sessions: [
            {
                id: "vs_1",
                provider: "CASHFREE",
                caseType: "PUBLISHER_KYC",
                caseId: "pub_1",
                workflowKey: "PUBLISHER.INDIVIDUAL",
                status: "NEEDS_USER_ACTION",
                steps: [
                    { check: "DIGILOCKER", required: true, status: "VERIFIED", at: "2026-10-01T09:10:00.000Z", failureCode: null, triesLeft: 3 },
                    { check: "BANK_ACCOUNT", required: true, status: "FAILED", at: "2026-10-01T09:30:00.000Z", failureCode: "NAME_MISMATCH", triesLeft: 2 },
                ],
                expiresAt: "2026-10-03T09:00:00.000Z",
                createdAt: "2026-10-01T09:05:00.000Z",
                updatedAt: "2026-10-01T09:30:00.000Z",
            },
        ],
        backup: { setting: "ON", available: true },
        ...over,
    }) as CaseAttempts;

function Panel() {
    const checks = useCaseAttempts("PUBLISHER_KYC", "pub_1");
    return <VerificationChecksPanel caseType="PUBLISHER_KYC" caseId="pub_1" resource={checks} />;
}

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
    session.permissions = new Set(["kyc.view", "kyc.edit"]);
});

describe("the Verification checks panel", () => {
    it("lists every provider call newest first, telling an answer from a provider that could not answer", async () => {
        backend.attempts = attempts();
        render(<Panel />);
        const list = await screen.findByTestId("verification-attempts");
        expect(backend.calls[0]).toEqual({ method: "GET", path: "/verification/attempts?caseType=PUBLISHER_KYC&caseId=pub_1" });

        const rows = within(list).getAllByRole("listitem");
        expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual(["verification-attempt-att_2", "verification-attempt-att_1"]);

        const bank = rows[0]!;
        expect(bank).toHaveTextContent("Cashfree Secure ID");
        expect(bank).toHaveTextContent("Bank account");
        expect(bank).toHaveTextContent("Answered no");
        expect(bank).toHaveTextContent("NAME_MISMATCH");
        expect(bank).toHaveTextContent("820 ms");
        expect(bank).toHaveTextContent("Name score 42");
        // The result is collapsed, key by key, as the server minimised it.
        expect(within(bank).getByText("What the provider returned").closest("details")).not.toHaveAttribute("open");
        expect(within(bank).getByText("nameAtBank")).toBeInTheDocument();
        expect(within(bank).getByText("R•••• K••••")).toBeInTheDocument();

        const digio = rows[1]!;
        expect(within(digio).getByTestId("attempt-technical")).toHaveTextContent("Couldn't answer · TIMEOUT");
        expect(digio).toHaveTextContent("15.0 s");

        const steps = screen.getByTestId("verification-session-vs_1");
        expect(steps).toHaveTextContent("Waiting on the person");
        expect(steps).toHaveTextContent("DigiLocker");
        expect(steps).toHaveTextContent("Verified");
        expect(steps).toHaveTextContent("Failed");
    });

    it("says so when no provider was ever called", async () => {
        backend.attempts = attempts({ attempts: [], sessions: [] });
        render(<Panel />);
        expect(await screen.findByTestId("verification-checks-empty")).toHaveTextContent("No provider calls yet.");
    });
});

describe("Resend on backup", () => {
    it("asks first, sends, and says the person was told — then reads the panel again", async () => {
        backend.attempts = attempts();
        render(<Panel />);
        fireEvent.click(await screen.findByTestId("resend-on-backup"));
        expect(screen.getByText("Send this person ADX's own identity check? They'll get a notification to finish it in the app.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Sent — they've been notified."));
        expect(backend.calls).toContainEqual({ method: "POST", path: "/verification/cases/PUBLISHER_KYC/pub_1/resend-on-backup", body: {} });
        await waitFor(() => expect(backend.calls.filter((call) => call.path.startsWith("/verification/attempts"))).toHaveLength(2));
    });

    it("says to tell them yourself when they have no app account", async () => {
        backend.attempts = attempts();
        backend.resend = { session: { id: "vs_1" }, notified: false };
        render(<Panel />);
        fireEvent.click(await screen.findByTestId("resend-on-backup"));
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Sent — they have no app account yet, so tell them yourself."));
    });

    it("shows the server's sentence when the backup is refused", async () => {
        backend.attempts = attempts();
        backend.refusals.push({ status: 409, code: "BACKUP_NOT_AVAILABLE", message: "Say what kind of account this is first; the checks depend on it.", details: { reason: "ENTITY_TYPE_UNKNOWN" } });
        render(<Panel />);
        fireEvent.click(await screen.findByTestId("resend-on-backup"));
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("The backup was not sent", { description: "Say what kind of account this is first; the checks depend on it." }));
    });

    it("is disabled with the reason while the backup is switched off, and hidden without kyc.edit", async () => {
        backend.attempts = attempts({ backup: { setting: "OFF", available: false } });
        const { unmount } = render(<Panel />);
        const button = await screen.findByTestId("resend-on-backup");
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute("title", "The backup is switched off under Settings › Integrations › Verification routing.");
        unmount();

        session.permissions = new Set(["kyc.view"]);
        backend.attempts = attempts();
        render(<Panel />);
        await screen.findByTestId("verification-attempts");
        expect(screen.queryByTestId("resend-on-backup")).toBeNull();
    });
});

const digioCard = (digio: Parameters<typeof DigioCard>[0]["digio"], extra: Partial<Parameters<typeof DigioCard>[0]> = {}) => (
    <DigioCard
        party="Ravi Kumar"
        digio={digio}
        verified={false}
        imagesPurgedAt={null}
        onRestart={() => Promise.resolve({ notified: true })}
        onReviewManually={() => {}}
        manualReview={false}
        onChanged={() => {}}
        {...extra}
    />
);

function CardWithBackup({ digio }: { digio: Parameters<typeof DigioCard>[0]["digio"] }) {
    const checks = useApiResource<CaseAttempts | null>("test:attempts", async () => attempts());
    return digioCard(digio, { backup: backupStateOf("PUBLISHER_KYC", "pub_1", checks.data), onBackupSent: checks.reload });
}

describe("the provider on the Digio card", () => {
    it("shows Cashfree for a record the backup ran", async () => {
        render(digioCard({ provider: "CASHFREE", requestId: "cf_vs_1", referenceId: null, status: "pending", verifiedAt: null, message: null }));
        const card = screen.getByTestId("digio-card");
        expect(within(card).getByText("Cashfree")).toBeInTheDocument();
        expect(within(card).getByText("Waiting on the party")).toBeInTheDocument();
    });

    it("never prints PROVIDER_FAILED — it says Digio couldn't be reached, with the resend beside it", async () => {
        render(<CardWithBackup digio={{ requestId: null, referenceId: null, status: PROVIDER_FAILED, verifiedAt: null, message: null }} />);
        const card = screen.getByTestId("digio-card");
        expect(within(card).queryByText(PROVIDER_FAILED)).toBeNull();
        expect(within(card).getByText("Digio couldn't be reached")).toBeInTheDocument();
        const banner = screen.getByTestId("digio-provider-failed");
        fireEvent.click(await within(banner).findByTestId("resend-on-backup"));
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Sent — they've been notified."));
    });

    it("offers the resend in the toast when a desk restart's failure says the backup can be sent", async () => {
        const { ApiError } = await import("@/lib/api-client");
        const onRestart = vi.fn(() =>
            Promise.reject(
                new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "Digio is not answering right now", {
                    provider: "DIGIO",
                    reason: "PROVIDER_ERROR",
                    backup: { available: true, caseType: "PUBLISHER_KYC", caseId: "pub_1" },
                })
            )
        );
        render(digioCard({ requestId: "KID1", referenceId: null, status: "pending", verifiedAt: null, message: null }, { onRestart }));
        await waitFor(() => expect(screen.getByRole("button", { name: "Restart Digio" })).toBeEnabled());
        fireEvent.click(screen.getByRole("button", { name: "Restart Digio" }));
        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        const [message, options] = toast.error.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
        expect(message).toBe("Digio isn't answering right now. Try again in a few minutes.");
        expect(options.action.label).toBe("Resend on backup");

        options.action.onClick();
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Sent — they've been notified."));
        expect(backend.calls).toContainEqual({ method: "POST", path: "/verification/cases/PUBLISHER_KYC/pub_1/resend-on-backup", body: {} });
    });

    it("keeps the plain toast when the failure carries no backup", async () => {
        const { ApiError } = await import("@/lib/api-client");
        const onRestart = vi.fn(() => Promise.reject(new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "Digio is not answering right now", { provider: "DIGIO", reason: "PROVIDER_ERROR" })));
        render(digioCard({ requestId: "KID1", referenceId: null, status: "pending", verifiedAt: null, message: null }, { onRestart }));
        await waitFor(() => expect(screen.getByRole("button", { name: "Restart Digio" })).toBeEnabled());
        fireEvent.click(screen.getByRole("button", { name: "Restart Digio" }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Digio isn't answering right now. Try again in a few minutes."));
    });
});

describe("the Verification providers line under the KYC tabs", () => {
    it("says each provider and its state in a word, whether the backup is on, and links to the routing card", async () => {
        render(<VerificationProvidersLine />);
        const line = screen.getByTestId("verification-providers-line");
        const digio = await within(line).findByTestId("verification-provider-line-DIGIO");
        expect(digio).toHaveTextContent("Digio· trying again");
        expect(line).toHaveTextContent("Backup for KYC on");
        // One line, not the table: the 24 h figures stay on the routing card.
        expect(within(line).queryByTestId("verification-provider-rows")).not.toBeInTheDocument();
        expect(line).not.toHaveTextContent("91.7%");
        expect(within(line).getByRole("link", { name: "Verification routing →" })).toHaveAttribute("href", "/settings/integrations#verification-routing");
        expect(backend.calls.filter((call) => call.path === "/verification/health")).toHaveLength(1);
    });
});
