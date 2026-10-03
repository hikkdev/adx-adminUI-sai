import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The one click — N3-C (the owner, 14 Sep 2026: "ADX Admin/Super Admin
 * and other people who'll be granted authority should be able to send a
 * Digio KYC request to the user with click of a button").
 *
 * What is pinned: every row whose state is not VERIFIED carries "Send
 * Digio request", which posts to the party's request route with NO body
 * (the server defaults the channel to DIGIO) and toasts the outcome; the
 * button is drawn only for an operator holding `kyc.edit`; an awaiting-
 * documents row offers the manual ask and Record at the desk behind the
 * menu and no case to open; a requested row says when and by whom and
 * puts Resend behind a confirm; a verified row offers only the case. The
 * advertiser's one click goes over the PROFILE id.
 *
 * Phase D (1 Oct 2026): a click answered 409 `ENTITY_TYPE_REQUIRED` opens
 * the picker with the server's options and goes again with the chosen
 * `{ entityType }`; Digio's own failures are said in the owner's words,
 * and the provider switch's 503 still points at the manual ask.
 */

const session = vi.hoisted(() => ({ permissions: new Set<string>(["kyc.edit"]) }));

vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: "usr_admin", name: "Priya", roles: ["ADMIN"] }, loading: false, can: (permission: string) => session.permissions.has(permission) }),
}));

const backend = vi.hoisted(() => ({
    posts: [] as { path: string; body: unknown }[],
    /** Phase D: what the next posts are refused with, in order; a post with none left succeeds. */
    refusals: [] as { status: number; code: string; message: string; details?: unknown }[],
    reset() {
        this.posts = [];
        this.refusals = [];
    },
    async post(path: string, body?: unknown) {
        this.posts.push({ path, body });
        const refusal = this.refusals.shift();
        if (refusal) {
            const { ApiError } = await import("@/lib/api-client");
            throw new ApiError(refusal.status, refusal.code, refusal.message, refusal.details);
        }
        return { kyc: { id: "k1" }, digio: { kycId: "dg_1", validTill: "2026-09-16T00:00:00.000Z" }, notified: false };
    },
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return { ...actual, api: { ...actual.api, post: (path: string, body?: unknown) => backend.post(path, body) } };
});

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/kyc",
    useSearchParams: () => new URLSearchParams(),
}));

import { advertiserKycService } from "@/services/advertiser-kyc";
import { agentKycService } from "@/services/agent-kyc";
import { kycService } from "@/services/kyc";
import type { KycRequest } from "@/types";
import { KycRowActions, type KycRowActionsProps } from "./kyc-row-actions";

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
    session.permissions = new Set(["kyc.edit"]);
});

const asked: KycRequest = { at: "2026-09-14T10:00:00.000Z", by: { id: "usr_priya", name: "Priya" }, channel: "DIGIO", open: true };

/** Radix opens a dropdown on pointer-down or the keyboard; jsdom has no pointer events, so the keyboard it is. */
function openMenu() {
    fireEvent.keyDown(screen.getByRole("button", { name: "More KYC actions" }), { key: "ArrowDown" });
}

function draw(over: Partial<KycRowActionsProps> = {}) {
    const onChanged = vi.fn();
    const onRecord = vi.fn();
    render(
        <KycRowActions
            state="AWAITING_DOCUMENTS"
            party="Sharma Hoardings"
            hasAccount={false}
            contact="+919845012345"
            request={null}
            caseHref="/kyc/pub_1"
            onDigio={() => kycService.requestDigio("pub_1")}
            onRequest={(channel, note) => kycService.request("pub_1", channel, note)}
            onRecord={onRecord}
            onChanged={onChanged}
            {...over}
        />
    );
    return { onChanged, onRecord };
}

describe("KycRowActions — the one click", () => {
    it("posts to the party's request route with no body, and re-reads the queue", async () => {
        const { onChanged } = draw();
        fireEvent.click(screen.getByRole("button", { name: "Send Digio request" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.posts).toEqual([{ path: "/publishers/kyc-queue/pub_1/request", body: undefined }]);
    });

    it("is hidden without kyc.edit — the route refuses anyone else, so the console does not offer it", () => {
        session.permissions = new Set();
        draw();
        expect(screen.queryByRole("button", { name: "Send Digio request" })).not.toBeInTheDocument();
        // Record at the desk is still there: the desk's PUT is ADMIN's, not the edit tier's.
        openMenu();
        expect(screen.getByRole("menuitem", { name: "Record at the desk" })).toBeInTheDocument();
        expect(screen.queryByRole("menuitem", { name: "Request manual upload" })).not.toBeInTheDocument();
    });

    it("an advertiser's click goes over the PROFILE id, and an agent's over the agent id", async () => {
        draw({ onDigio: () => advertiserKycService.requestDigio("adv_profile_1") });
        fireEvent.click(screen.getByRole("button", { name: "Send Digio request" }));
        await waitFor(() => expect(backend.posts).toHaveLength(1));
        expect(backend.posts[0]).toEqual({ path: "/advertiser-kyc/adv_profile_1/request", body: undefined });

        backend.reset();
        draw({ onDigio: () => agentKycService.requestDigio("agt_1") });
        fireEvent.click(screen.getAllByRole("button", { name: "Send Digio request" })[1]);
        await waitFor(() => expect(backend.posts).toHaveLength(1));
        expect(backend.posts[0]).toEqual({ path: "/agent-kyc/agt_1/request", body: undefined });
    });
});

describe("KycRowActions — the entity type (Phase D)", () => {
    const options = [
        { value: "INDIVIDUAL", label: "Individual" },
        { value: "SOLE_PROPRIETOR", label: "Sole proprietor" },
        { value: "COMPANY", label: "Company" },
    ];
    const required = { status: 409, code: "ENTITY_TYPE_REQUIRED", message: "Say who the account is for.", details: { party: "PUBLISHER", options } };

    it("on 409 ENTITY_TYPE_REQUIRED opens the picker with the server's options, and sends the click again with the chosen type", async () => {
        backend.refusals = [required];
        const { onChanged } = draw({ onDigio: (entityType) => kycService.requestDigio("pub_1", entityType) });
        fireEvent.click(screen.getByRole("button", { name: "Send Digio request" }));

        const picker = await screen.findByTestId("entity-type-picker");
        expect(within(picker).getByRole("heading", { name: "Who is this account for?" })).toBeInTheDocument();
        expect(within(picker).getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toEqual(["INDIVIDUAL", "SOLE_PROPRIETOR", "COMPANY"]);
        expect(picker).toHaveTextContent("This decides which documents the check asks for. Pick the one their PAN is registered as.");
        // Nothing was stored or sent: no toast, no re-read, and the button waits for a choice.
        expect(onChanged).not.toHaveBeenCalled();
        expect(toast.error).not.toHaveBeenCalled();
        const go = within(picker).getByRole("button", { name: "Continue to verification" });
        expect(go).toBeDisabled();

        fireEvent.click(within(picker).getByRole("radio", { name: "Company" }));
        fireEvent.click(go);
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.posts).toEqual([
            { path: "/publishers/kyc-queue/pub_1/request", body: undefined },
            { path: "/publishers/kyc-queue/pub_1/request", body: { entityType: "COMPANY" } },
        ]);
        expect(toast.success).toHaveBeenCalledWith("Digio request sent to Sharma Hoardings", expect.anything());
        expect(screen.queryByTestId("entity-type-picker")).not.toBeInTheDocument();
    });

    it("an advertiser's and a print partner's picker resend over their own routes; Cancel sends nothing", async () => {
        backend.refusals = [{ ...required, details: { party: "ADVERTISER", options } }];
        draw({ onDigio: (entityType) => advertiserKycService.requestDigio("adv_profile_1", entityType) });
        fireEvent.click(screen.getByRole("button", { name: "Send Digio request" }));
        const picker = await screen.findByTestId("entity-type-picker");
        fireEvent.click(within(picker).getByRole("radio", { name: "Sole proprietor" }));
        fireEvent.click(within(picker).getByRole("button", { name: "Continue to verification" }));
        await waitFor(() => expect(backend.posts).toHaveLength(2));
        expect(backend.posts[1]).toEqual({ path: "/advertiser-kyc/adv_profile_1/request", body: { entityType: "SOLE_PROPRIETOR" } });

        backend.reset();
        backend.refusals = [required];
        draw({ onDigio: (entityType) => kycService.requestDigio("pub_2", entityType) });
        fireEvent.click(screen.getAllByRole("button", { name: "Send Digio request" }).at(-1)!);
        const second = await screen.findByTestId("entity-type-picker");
        fireEvent.click(within(second).getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByTestId("entity-type-picker")).not.toBeInTheDocument());
        expect(backend.posts).toHaveLength(1);
    });

    it("says Digio's own failures in the owner's words, and keeps the switch's 503 pointing at the manual ask", async () => {
        backend.refusals = [{ status: 503, code: "KYC_PROVIDER_UNAVAILABLE", message: "Digio did not answer", details: { provider: "DIGIO", reason: "PROVIDER_ERROR" } }];
        draw();
        fireEvent.click(screen.getByRole("button", { name: "Send Digio request" }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Digio isn't answering right now. Try again in a few minutes."));

        for (const refusal of [
            { status: 502, code: "KYC_PROVIDER_REFUSED", message: "Digio refused", details: { provider: "DIGIO", status: 404, code: "TEMPLATE_NOT_FOUND" } },
            { status: 503, code: "KYC_PROVIDER_UNAVAILABLE", message: "No template", details: { provider: "DIGIO", reason: "NO_TEMPLATE" } },
        ]) {
            toast.error.mockReset();
            backend.refusals = [refusal];
            fireEvent.click(screen.getByRole("button", { name: "Send Digio request" }));
            await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Online verification isn't available for this account type yet. Please contact ADX support."));
        }

        toast.error.mockReset();
        backend.refusals = [{ status: 503, code: "KYC_PROVIDER_UNAVAILABLE", message: "Digio is off", details: { provider: "MANUAL", retryAfter: 300 } }];
        fireEvent.click(screen.getByRole("button", { name: "Send Digio request" }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Digio is not available right now", { description: "Ask for the documents by hand instead — Request manual upload." }));
    });

    it("an agent's click is unchanged: no body, no picker", async () => {
        const { onChanged } = draw({ onDigio: () => agentKycService.requestDigio("agt_1") });
        fireEvent.click(screen.getByRole("button", { name: "Send Digio request" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.posts).toEqual([{ path: "/agent-kyc/agt_1/request", body: undefined }]);
        expect(screen.queryByTestId("entity-type-picker")).not.toBeInTheDocument();
    });
});

describe("KycRowActions — by state", () => {
    it("awaiting documents: Send Digio request, and the manual ask and Record at the desk behind the menu; no case to open", () => {
        const { onRecord } = draw({ caseHref: null });
        expect(screen.getByRole("button", { name: "Send Digio request" })).toBeInTheDocument();
        expect(screen.queryByText("Open the case")).not.toBeInTheDocument();
        expect(screen.queryByTestId("kyc-requested-on")).not.toBeInTheDocument();

        openMenu();
        expect(screen.getByRole("menuitem", { name: "Request manual upload" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("menuitem", { name: "Record at the desk" }));
        expect(onRecord).toHaveBeenCalled();
    });

    it("the manual ask opens the note dialog on the manual channel and says no ADX notice goes to a party with no app account", () => {
        draw({ caseHref: null });
        openMenu();
        fireEvent.click(screen.getByRole("menuitem", { name: "Request manual upload" }));
        expect(screen.getByRole("radio", { name: /Manual — upload on the phone/ })).toBeChecked();
        expect(screen.getByTestId("no-account-line")).toHaveTextContent("No app account");
        expect(screen.getByTestId("no-account-line")).toHaveTextContent("ADX notices are not sent");
        fireEvent.click(screen.getByRole("radio", { name: /Digio link/ }));
        expect(screen.getByTestId("no-account-line")).toHaveTextContent("the Digio link goes to +919845012345");
    });

    it("requested: says when and by whom in place of the button, with Resend behind a confirm that posts the same click", async () => {
        const { onChanged } = draw({ state: "REQUESTED", request: asked, caseHref: null });
        expect(screen.queryByRole("button", { name: "Send Digio request" })).not.toBeInTheDocument();
        expect(screen.getByTestId("kyc-requested-on")).toHaveTextContent(/Requested on 14 Sept? 2026 by Priya/);

        fireEvent.click(screen.getByRole("button", { name: "Resend" }));
        // Nothing sent yet: the confirm is up, naming who asked and that no ADX notice goes to a party with no account.
        expect(backend.posts).toHaveLength(0);
        expect(screen.getByRole("alertdialog")).toHaveTextContent(/asked on 14 Sept? 2026 by Priya/);
        expect(screen.getByRole("alertdialog")).toHaveTextContent("no ADX notice is sent");
        fireEvent.click(screen.getAllByRole("button", { name: "Resend" }).at(-1)!);
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.posts).toEqual([{ path: "/publishers/kyc-queue/pub_1/request", body: undefined }]);
    });

    it("pending: Open the case beside the request; verified: the case alone", () => {
        draw({ state: "PENDING", caseHref: "/kyc/pub_1" });
        expect(screen.getByTestId("kyc-open-case")).toHaveAttribute("href", "/kyc/pub_1");
        expect(screen.getByRole("button", { name: "Send Digio request" })).toBeInTheDocument();
    });

    it("verified: nothing to ask for, only the case", () => {
        draw({ state: "VERIFIED", caseHref: "/kyc/pub_1" });
        expect(screen.getByTestId("kyc-open-case")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Send Digio request" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "More KYC actions" })).not.toBeInTheDocument();
    });
});

/**
 * 2 Oct 2026 (the account lifecycle): a closed account, one suspended from
 * new work, a deactivated one and an agent who left cannot be asked for
 * KYC — the asks are drawn disabled with the reason, and the server's 409
 * `ACCOUNT_CLOSED` / `ACCOUNT_SUSPENDED` (an account that changed under the
 * row) is said in its own sentence and the queue read again.
 */
describe("KycRowActions — an inactive account", () => {
    it.each([
        ["CLOSED", /closed/i],
        ["SUSPENDED", /suspended from new work/i],
        ["DEACTIVATED", /deactivated/i],
        ["EXITED", /left ADX/i],
    ] as const)("%s: the one click and the manual ask are disabled, with the reason", (accountState, reason) => {
        draw({ accountState });
        const button = screen.getByRole("button", { name: "Send Digio request" });
        expect(button).toBeDisabled();
        expect(button.parentElement).toHaveAttribute("title", expect.stringMatching(reason));
        expect(screen.getByTestId("kyc-request-blocked")).toHaveTextContent(reason);
        openMenu();
        expect(screen.getByRole("menuitem", { name: "Request manual upload" })).toHaveAttribute("data-disabled");
        // Record at the desk is not an ask of the party, and stays.
        expect(screen.getByRole("menuitem", { name: "Record at the desk" })).not.toHaveAttribute("data-disabled");
    });

    it("a suspension without BLOCK_NEW, a working account, and an off-roster shop leave the asks open", () => {
        draw({ accountState: "SUSPENDED", suspensionScopes: ["FREEZE_WALLET"] });
        draw({ accountState: "ACTIVE" });
        draw({ accountState: "DEACTIVATED", deactivationBlocksNew: false });
        for (const button of screen.getAllByRole("button", { name: "Send Digio request" })) expect(button).toBeEnabled();
        expect(screen.queryByTestId("kyc-request-blocked")).toBeNull();
    });

    it("a requested row's Resend is disabled too", () => {
        draw({ state: "REQUESTED", request: asked, accountState: "CLOSED" });
        expect(screen.getByRole("button", { name: "Resend" })).toBeDisabled();
    });

    it("the server's 409 ACCOUNT_CLOSED / ACCOUNT_SUSPENDED is said in its own words, and the queue read again", async () => {
        backend.refusals = [{ status: 409, code: "ACCOUNT_SUSPENDED", message: "This account is suspended from new work, so KYC can't be requested." }];
        const { onChanged } = draw();
        fireEvent.click(screen.getByRole("button", { name: "Send Digio request" }));
        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(toast.error).toHaveBeenCalledWith("Can't ask Sharma Hoardings for KYC", { description: "This account is suspended from new work, so KYC can't be requested." });
        expect(onChanged).toHaveBeenCalled();
    });
});
