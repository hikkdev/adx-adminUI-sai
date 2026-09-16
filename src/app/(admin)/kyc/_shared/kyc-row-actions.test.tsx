import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

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
 */

const session = vi.hoisted(() => ({ permissions: new Set<string>(["kyc.edit"]) }));

vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: "usr_admin", name: "Priya", roles: ["ADMIN"] }, loading: false, can: (permission: string) => session.permissions.has(permission) }),
}));

const backend = vi.hoisted(() => ({
    posts: [] as { path: string; body: unknown }[],
    reset() {
        this.posts = [];
    },
    async post(path: string, body?: unknown) {
        this.posts.push({ path, body });
        return { kyc: { id: "k1" }, digio: { kycId: "dg_1", validTill: "2026-09-16T00:00:00.000Z" }, notified: false };
    },
}));

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
