import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * AGE-1 (the owner, 29 Sep 2026): "You don't need to be over 18 to use ADX,
 * but you do need to be over 18 to place orders."
 *
 * Authorising a campaign on the advertiser's behalf is placing the
 * advertiser's order, so the API asks the advertiser's own person — a date
 * of birth on file, 18 or over — and answers 403 AGE_REQUIRED otherwise.
 * What this pins: the desk reads that as a toast carrying the server's
 * sentence and where the date is added, not a bare failure; the dialog
 * stays open and nothing is reported done.
 */

const { toast, authorize } = vi.hoisted(() => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
    authorize: vi.fn(),
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "usr_admin", name: "Ops" } }) }));
vi.mock("@/services/campaigns", () => ({ campaignService: { authorize } }));
vi.mock("@/services/settings", () => ({ settingsService: { get: vi.fn(async () => ({ finance: { opsAuthoriseThreshold: 500000 } })) } }));
vi.mock("@/services/users", () => ({ usersService: { list: vi.fn(async () => []) } }));

import { ApiError } from "@/lib/api-client";
import { AuthorizeDialog } from "./authorize-dialog";

const campaign = { id: "cmp_1", name: "Anita coffee, April", reference: "ADX-CMP-2026-482913", total: "34810.00" };

beforeEach(() => {
    vi.clearAllMocks();
});

describe("authorise on the advertiser's behalf — AGE_REQUIRED", () => {
    it("toasts the server's sentence and where the date of birth is added", async () => {
        const message = "Add the account holder's date of birth to place this order — they need to be 18 or over.";
        authorize.mockRejectedValueOnce(new ApiError(403, "AGE_REQUIRED", message, { reason: "MISSING", self: false }));
        const onDone = vi.fn();
        render(<AuthorizeDialog campaign={campaign} onOpenChange={vi.fn()} onDone={onDone} />);

        fireEvent.change(screen.getByLabelText(/Type the campaign reference to confirm/), { target: { value: "ADX-CMP-2026-482913" } });
        fireEvent.click(screen.getByRole("button", { name: /authorise/i }));

        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(authorize).toHaveBeenCalledWith("cmp_1", { confirm: "ADX-CMP-2026-482913" });
        expect(toast.error).toHaveBeenCalledWith("The advertiser can't place this order yet", {
            description: `${message} A date of birth is added from the advertiser's Edit details.`,
        });
        expect(onDone).not.toHaveBeenCalled();
        expect(toast.success).not.toHaveBeenCalled();
    });
});
