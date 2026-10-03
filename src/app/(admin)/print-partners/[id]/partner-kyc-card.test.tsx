import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

/**
 * The partner's KYC card and the entity type — Phase D (the owner, 1 Oct
 * 2026). The card heads its facts with what the shop verifies as: the
 * server's word for the type, and "Not chosen yet" while the account has
 * none (it is then asked at the Digio start).
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/print-partners/prt_1",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: "usr_admin", name: "Priya", roles: ["ADMIN"] }, loading: false, can: () => true }),
}));

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
            // No KYC record yet: the desk's read answers 404, which the card reads as "nothing recorded".
            get: async () => {
                throw new actual.ApiError(404, "NOT_FOUND", "No record");
            },
        },
    };
});

import type { PrintPartner } from "@/services/print-partners";
import { PartnerKycCard } from "./partner-kyc-card";

const shop = {
    id: "prt_1",
    displayId: "PRT-1209-2601",
    userId: "usr_prt",
    name: "Asha Prints",
    mobile: "+919845012345",
    panNumber: null,
    kycStatus: "PENDING",
    kyc: null,
    entityType: null,
    entityTypeStored: false,
} as unknown as PrintPartner;

const entityRow = () => within(screen.getByText("Entity type").closest("div")!);

describe("PartnerKycCard — the entity type", () => {
    it("reads Not chosen yet while the shop has none", () => {
        render(<PartnerKycCard partner={shop} activationRefusal={null} onChanged={() => {}} />);
        expect(entityRow().getByText("Not chosen yet")).toBeInTheDocument();
    });

    it("prints the type the shop verifies as", () => {
        render(<PartnerKycCard partner={{ ...shop, entityType: "LLP_PARTNERSHIP", entityTypeStored: true }} activationRefusal={null} onChanged={() => {}} />);
        expect(entityRow().getByText("LLP or partnership")).toBeInTheDocument();
    });
});
