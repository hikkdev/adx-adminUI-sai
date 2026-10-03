import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Finance › Payout methods: "Check UPI ID" (2 Oct 2026).
 *
 * What is pinned: a UPI method has a "Check UPI ID" action beside Reject and
 * Verify (a bank account does not); it sends the desk's check to the
 * verify door (`via: PENNY_DROP`, which the backend runs as Digio's VPA
 * lookup); a live, matching ID says so with the name at the bank and the
 * score and reloads the queue; Not found and Name doesn't match stay on the
 * card with the name, the score and the backend's sentence; a 503 says it
 * could not check; the old UPI_CHECK_NOT_CONFIGURED sentence stays for the
 * NONE setting; and the queue flags a method whose last check went wrong.
 */

const { toast, finance } = vi.hoisted(() => ({
    toast: { success: vi.fn(), error: vi.fn() },
    finance: { checkUpiMethod: vi.fn(), verifyPayoutMethod: vi.fn(), rejectPayoutMethod: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/services/finance", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/finance")>();
    return { ...actual, financeService: { ...actual.financeService, ...finance } };
});

import { ApiError } from "@/lib/api-client";
import type { PayoutMethod, PayoutMethodCheck } from "@/services/finance";
import { PayoutMethodsView } from "./payout-methods-view";

const upi = (over: Partial<PayoutMethod> = {}): PayoutMethod => ({
    id: "pm_upi",
    type: "UPI",
    accountHolder: "Asha Rao",
    bankName: null,
    accountNumberMasked: null,
    ifscCode: null,
    upiVpa: "asha.rao@okhdfc",
    isDefault: true,
    status: "PENDING_VERIFICATION",
    verifiedVia: null,
    verifiedAt: null,
    nameMatchPct: null,
    rejectionReason: null,
    createdAt: "2026-10-01T09:00:00.000Z",
    check: null,
    ...over,
});
const bank = (): PayoutMethod => ({ ...upi(), id: "pm_bank", type: "BANK", upiVpa: null, bankName: "HDFC Bank", accountNumberMasked: "•••• 4417", ifscCode: "HDFC0001234" });

const check = (over: Partial<PayoutMethodCheck> = {}): PayoutMethodCheck => ({
    check: "UPI_VPA",
    outcome: "VERIFIED",
    provider: "DIGIO",
    providerLabel: "Digio",
    nameAtBank: "ASHA RAO",
    nameMatchScore: 96,
    failureCode: null,
    message: "The UPI ID is live and its name matches.",
    checkedAt: "2026-10-02T10:00:00.000Z",
    ...over,
});

const mount = (methods: PayoutMethod[], onChanged = vi.fn()) => {
    render(<PayoutMethodsView methods={methods} rails={[]} onChanged={onChanged} />);
    return onChanged;
};
const checkButton = () => screen.getByRole("button", { name: "Check UPI ID" });

beforeEach(() => {
    vi.clearAllMocks();
});

describe("Check UPI ID", () => {
    it("sits with the actions on a UPI method only", () => {
        mount([bank()]);
        expect(screen.queryByRole("button", { name: "Check UPI ID" })).toBeNull();
        expect(screen.getByRole("button", { name: "Verify" })).toBeInTheDocument();
    });

    it("verifies a live, matching UPI ID and says whose it is", async () => {
        finance.checkUpiMethod.mockResolvedValueOnce({ ...upi({ status: "VERIFIED", verifiedVia: "NAME_LOOKUP" }), check: check() });
        const onChanged = mount([upi()]);
        fireEvent.click(checkButton());
        await waitFor(() => expect(finance.checkUpiMethod).toHaveBeenCalledWith("pm_upi"));
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("asha.rao@okhdfc verified", { description: "Name at the bank: ASHA RAO · match 96/100." }));
        expect(onChanged).toHaveBeenCalled();
        const result = screen.getByTestId("upi-check-result");
        expect(within(result).getByText("Verified")).toBeInTheDocument();
        expect(within(result).getByText("ASHA RAO")).toBeInTheDocument();
        expect(within(result).getByText("96 / 100")).toBeInTheDocument();
    });

    it("keeps Not found and Name doesn't match on the card, with the name, the score and the reason", async () => {
        finance.checkUpiMethod.mockRejectedValueOnce(
            new ApiError(409, "VERIFICATION_UNAVAILABLE", "The name on this UPI ID (RAVI KUMAR) does not match the account holder — a match of 35 out of 100.", {
                code: "NAME_MISMATCH",
                check: check({ outcome: "NAME_MISMATCH", nameAtBank: "RAVI KUMAR", nameMatchScore: 35, failureCode: "NAME_MISMATCH", message: "The name on this UPI ID (RAVI KUMAR) does not match the account holder — a match of 35 out of 100." }),
            })
        );
        const onChanged = mount([upi()]);
        fireEvent.click(checkButton());
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Name doesn't match", { description: expect.stringContaining("RAVI KUMAR") }));
        const result = screen.getByTestId("upi-check-result");
        expect(within(result).getByText("Name doesn't match")).toBeInTheDocument();
        expect(within(result).getByText("RAVI KUMAR")).toBeInTheDocument();
        expect(within(result).getByText("35 / 100")).toBeInTheDocument();
        expect(onChanged).not.toHaveBeenCalled();

        finance.checkUpiMethod.mockRejectedValueOnce(
            new ApiError(409, "VERIFICATION_UNAVAILABLE", "This UPI ID is not active, or does not exist.", {
                code: "NOT_FOUND",
                check: check({ outcome: "NOT_FOUND", nameAtBank: null, nameMatchScore: null, failureCode: "VPA_NOT_FOUND", message: "This UPI ID is not active, or does not exist." }),
            })
        );
        fireEvent.click(checkButton());
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Not found", { description: "This UPI ID is not active, or does not exist." }));
        expect(within(screen.getByTestId("upi-check-result")).getByText("Not found")).toBeInTheDocument();
    });

    it("says it could not check on a 503, and keeps the old sentence when no UPI check is chosen", async () => {
        finance.checkUpiMethod.mockRejectedValueOnce(
            new ApiError(503, "VERIFICATION_UNAVAILABLE", "This UPI ID could not be checked just now. Try again in a few minutes, or verify it by hand.", {
                code: "UNAVAILABLE",
                check: check({ outcome: "UNAVAILABLE", nameAtBank: null, nameMatchScore: null, failureCode: "HTTP_5XX", message: "This UPI ID could not be checked just now. Try again in a few minutes, or verify it by hand." }),
            })
        );
        mount([upi()]);
        fireEvent.click(checkButton());
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't check", { description: expect.stringMatching(/could not be checked just now/) }));

        finance.checkUpiMethod.mockRejectedValueOnce(new ApiError(409, "UPI_CHECK_NOT_CONFIGURED", "x", { upiCheck: "NONE", reason: "NOT_CHOSEN" }));
        fireEvent.click(checkButton());
        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith("UPI ID not checked", {
                description: "UPI IDs can't be checked from the desk yet — not until a UPI check is chosen in Settings › Integrations › Verification routing.",
            })
        );
    });

    it("flags a method in the queue whose last check went wrong — the check run when the person added it included", () => {
        mount([upi({ id: "pm_flagged", check: check({ outcome: "NOT_FOUND", nameAtBank: null, nameMatchScore: null }) }), upi({ id: "pm_clean", upiVpa: "ok@upi" })]);
        const queue = screen.getAllByRole("listitem");
        expect(within(queue[0]!).getByText("Not found")).toBeInTheDocument();
        expect(within(queue[1]!).queryByText("Not found")).toBeNull();
        // The first method is selected: its last check shows on the card.
        expect(within(screen.getByTestId("upi-check-result")).getByText("No name to match")).toBeInTheDocument();
    });
});
