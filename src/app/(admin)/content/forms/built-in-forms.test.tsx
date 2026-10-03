import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

/**
 * Forms › Built into the platform (FM-2, 28 Sep 2026): the owner asked why
 * Forms was empty when the platform has forms. Below the table — and below
 * the empty state, where the question was asked — the fixed forms are
 * listed with a link to the desk that manages each, and one line says why
 * they live there.
 */

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ can: () => true, user: null }) }));

import type { FormRow } from "@/services/forms";
import { BUILT_IN_FORMS, FormsView } from "./forms-view";

const EXPLANATION = "These create a listing, a verification, a job, a ticket or a lead directly, so they are managed where that record lives — Forms holds the questions you write yourself.";

const form: FormRow = {
    id: "frm_1",
    key: "contact-adx",
    title: "Contact ADX",
    destination: "SUPPORT",
    leadSide: null,
    audience: "PUBLIC",
    archivedAt: null,
    updatedAt: "2026-09-28T00:00:00.000Z",
    live: null,
    draft: { number: 1, updatedAt: "2026-09-28T00:00:00.000Z" },
    submissionsNew: 0,
};

const links = () =>
    within(screen.getByTestId("built-in-forms"))
        .getAllByRole("link")
        .map((link) => `${link.textContent}→${link.getAttribute("href")}`);

describe("the platform's own forms", () => {
    it("lists each with a link to where it is managed, under one line saying why", () => {
        render(<FormsView forms={[form]} onChanged={vi.fn()} />);
        expect(screen.getByRole("heading", { name: "Built into the platform" })).toBeInTheDocument();
        expect(screen.getByText(EXPLANATION)).toBeInTheDocument();
        expect(links()).toEqual([
            "Flow Editor→/flows/listing",
            "Flow Editor→/flows/onboarding",
            "Flow Editor→/flows/agent-job",
            "Flow Editor→/flows/employee-intake",
            "Flow Editor→/flows/lead-landing",
            "Leads › Sources→/leads/sources",
            "Print partners › Directory, the Applications filter→/print-partners/directory",
            "Support→/support",
            "Creatives › Design requests→/creatives/design-requests",
        ]);
        const list = within(screen.getByTestId("built-in-forms"));
        for (const name of ["Listing wizard", "Onboarding", "Agent job checklist", "Employee intake", "Invite landing", "Referral form", "Print-partner applications", "Support tickets", "Design requests", "Landing-page enquiry form"]) {
            expect(list.getByText(name)).toBeInTheDocument();
        }
        expect(list.getByText(/adx\.in\/j\/r\/<code>/)).toBeInTheDocument();
    });

    it("names the advertiser's landing-page form as theirs, with no desk to link to", () => {
        render(<FormsView forms={[form]} onChanged={vi.fn()} />);
        const row = screen.getByText("Landing-page enquiry form").closest("li")!;
        expect(within(row).getByText("Managed by the advertiser on their campaign")).toBeInTheDocument();
        expect(within(row).queryByRole("link")).toBeNull();
        expect(BUILT_IN_FORMS.filter((entry) => entry.href === null).map((entry) => entry.name)).toEqual(["Landing-page enquiry form"]);
    });

    it("shows below the empty state too — where the question was asked", () => {
        render(<FormsView forms={[]} onChanged={vi.fn()} />);
        expect(screen.getByText("No forms yet")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Built into the platform" })).toBeInTheDocument();
        expect(links()).toHaveLength(9);
    });
});
