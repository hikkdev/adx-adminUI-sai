import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Delete, for an account with no history — 2 Oct 2026 (the owner: "there's
 * no deletion option").
 *
 * What is pinned: "Delete account" is offered only when `GET
 * /users/:id/deletable` says so — not for an account with history, not
 * when the read fails, not for a closed account (which is not even asked
 * about); the confirm says the owner's sentence; confirming sends `DELETE
 * /users/:id`, toasts and goes back to the directory; a 409 (history
 * appeared since) names the blockers and points at Close account. A party
 * page gets the same through `AccountClosure`, and the Reinstate button is
 * gone from a closed account.
 */

const backend = vi.hoisted(() => ({
    gets: [] as string[],
    deletes: [] as string[],
    deletable: { deletable: true, blockers: [] } as unknown,
    readFails: false,
    deleteRefusal: null as null | { status: number; code: string; message: string; details?: unknown },
    reset() {
        this.gets = [];
        this.deletes = [];
        this.deletable = { deletable: true, blockers: [] };
        this.readFails = false;
        this.deleteRefusal = null;
    },
}));

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/publishers/pub_1",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const get = async (path: string) => {
        backend.gets.push(path);
        if (path.endsWith("/deletable")) {
            if (backend.readFails) throw new actual.ApiError(500, "INTERNAL", "boom");
            return backend.deletable;
        }
        return { id: "usr_1", name: "Sharma", mobile: "+919845012345", closedAt: null, closeReason: null };
    };
    const del = async (path: string) => {
        backend.deletes.push(path);
        if (backend.deleteRefusal) {
            const refusal = backend.deleteRefusal;
            throw new actual.ApiError(refusal.status, refusal.code, refusal.message, refusal.details);
        }
        return { message: "Deleted" };
    };
    return { ...actual, api: { ...actual.api, get, delete: del } };
});

import { AccountClosure } from "@/components/adx/account-closure";
import { DeleteAccountButton, useDeleteAccount } from "@/components/adx/delete-account";
import { SuspensionActions } from "@/components/adx/suspend-dialog";

function Harness({ closed = false }: { closed?: boolean }) {
    const slot = useDeleteAccount({ userId: "usr_1", name: "Sharma Hoardings", directoryHref: "/publishers/directory", closed });
    return (
        <>
            <DeleteAccountButton slot={slot} />
            {slot.dialog}
        </>
    );
}

beforeEach(() => {
    backend.reset();
    router.push.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
});

describe("Delete account", () => {
    it("is offered when the server says the account has no history, confirms in the owner's words, deletes and goes back to the directory", async () => {
        render(<Harness />);
        const button = await screen.findByRole("button", { name: "Delete account" });
        expect(backend.gets).toEqual(["/users/usr_1/deletable"]);
        fireEvent.click(button);
        expect(await screen.findByText("Delete Sharma Hoardings permanently?")).toBeInTheDocument();
        expect(screen.getByText("This account has no history, so nothing else is affected. This can't be undone.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
        await waitFor(() => expect(router.push).toHaveBeenCalledWith("/publishers/directory"));
        expect(backend.deletes).toEqual(["/users/usr_1"]);
        expect(toast.success).toHaveBeenCalledWith("Sharma Hoardings deleted", expect.anything());
    });

    it("is hidden for an account with history, and when the read fails", async () => {
        backend.deletable = { deletable: false, blockers: [{ kind: "BOOKINGS", label: "bookings", count: 3 }] };
        const { unmount } = render(<Harness />);
        await waitFor(() => expect(backend.gets).toHaveLength(1));
        expect(screen.queryByRole("button", { name: "Delete account" })).toBeNull();
        unmount();

        backend.reset();
        backend.readFails = true;
        render(<Harness />);
        await waitFor(() => expect(backend.gets).toHaveLength(1));
        expect(screen.queryByRole("button", { name: "Delete account" })).toBeNull();
    });

    it("asks nothing about a closed account and offers nothing", async () => {
        render(<Harness closed />);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(backend.gets).toEqual([]);
        expect(screen.queryByRole("button", { name: "Delete account" })).toBeNull();
    });

    it("on a 409 (history appeared since) names the blockers and points at Close account", async () => {
        backend.deleteRefusal = {
            status: 409,
            code: "USER_HAS_HISTORY",
            message: "This account has history.",
            details: { blockers: [{ kind: "BOOKINGS", label: "bookings", count: 2 }, { kind: "WALLET", label: "wallet", count: 1 }] },
        };
        render(<Harness />);
        fireEvent.click(await screen.findByRole("button", { name: "Delete account" }));
        fireEvent.click(await screen.findByRole("button", { name: "Delete account" }));
        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(toast.error).toHaveBeenCalledWith("Can't delete Sharma Hoardings", {
            description: "The account has history now: 2 bookings, 1 wallet. Close the account instead.",
        });
        expect(router.push).not.toHaveBeenCalled();
    });

    it("reaches a party page through AccountClosure's slot, beside Close account", async () => {
        render(
            <AccountClosure userId="usr_1" name="Sharma Hoardings" closed={{ closedAt: null, closeReason: null }} directoryHref="/publishers/directory">
                {(slot) => (
                    <>
                        {slot.requestClose && <button type="button">Close account</button>}
                        {slot.requestDelete && (
                            <button type="button" onClick={slot.requestDelete}>
                                Delete it
                            </button>
                        )}
                    </>
                )}
            </AccountClosure>,
        );
        expect(screen.getByRole("button", { name: "Close account" })).toBeInTheDocument();
        fireEvent.click(await screen.findByRole("button", { name: "Delete it" }));
        expect(await screen.findByText("Delete Sharma Hoardings permanently?")).toBeInTheDocument();
    });
});

describe("Reinstate on a closed account", () => {
    it("is hidden — the page's banner says the account is closed for good", () => {
        const props = { partyType: "PUBLISHER" as const, partyId: "pub_1", partyName: "Sharma Hoardings", current: ["BLOCK_NEW" as const], onDone: () => {} };
        const { unmount } = render(<SuspensionActions {...props} />);
        expect(screen.getByRole("button", { name: "Reinstate" })).toBeInTheDocument();
        unmount();
        render(<SuspensionActions {...props} closed />);
        expect(screen.queryByRole("button", { name: "Reinstate" })).toBeNull();
    });
});
