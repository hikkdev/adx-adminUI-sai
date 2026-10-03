import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

/**
 * 2 Oct 2026 (the owner: "I don't see a lot of users here reflected in the
 * user list as if they're not linked at all"). Pinned: a party page names
 * who signs in, with their ADX-… id, linked to their account under Users; a
 * party nobody signs in for carries the muted "No app account", on its page
 * and beside its name on its KYC queue row.
 */

import { DataTable } from "@/components/adx/data-table";
import { kycQueueColumns, type KycQueueSpec } from "@/app/(admin)/kyc/_shared/kyc-queue-columns";
import { NoAppAccount, SignsInAs, personNameOf } from "./app-account";

describe("Signs in as", () => {
    it("names the person and their id, linked to their account", () => {
        render(<SignsInAs userId="usr_1" name={personNameOf({ firstName: "Vikram", lastName: "Rao" })} displayId="ADX-0210-2601" />);
        const link = screen.getByTestId("signs-in-as");
        expect(link).toHaveTextContent("Vikram Rao · ADX-0210-2601");
        expect(link).toHaveAttribute("href", "/users/usr_1");
    });

    it("says what it can when the name or the id is not held", () => {
        const { rerender } = render(<SignsInAs userId="usr_1" name={personNameOf({ firstName: null, lastName: null })} displayId="ADX-1" />);
        expect(screen.getByTestId("signs-in-as")).toHaveTextContent(/^ADX-1$/);
        rerender(<SignsInAs userId="usr_1" name={null} displayId={null} />);
        expect(screen.getByTestId("signs-in-as")).toHaveTextContent("Their account");
    });

    it("is the muted marker when no login backs the party", () => {
        render(<SignsInAs userId={null} name="Bright Dental Clinics" displayId={null} />);
        expect(screen.queryByTestId("signs-in-as")).toBeNull();
        const marker = screen.getByTestId("no-app-account");
        expect(marker).toHaveTextContent("No app account");
        expect(marker).toHaveClass("text-muted-foreground");
    });
});

describe("the KYC queue row", () => {
    type Row = { id: string; name: string; userId: string | null };
    const spec: KycQueueSpec<Row> = {
        noun: "Advertiser",
        name: (row) => row.name,
        line: () => "",
        noAppAccount: (row) => row.userId === null,
        method: () => null,
        submitted: () => null,
        arrivedAt: () => null,
        request: () => null,
        recorded: () => null,
        hasRecord: () => false,
        state: () => "AWAITING_DOCUMENTS",
        actions: () => null,
    };

    it("marks the party with no login beside its name, and only that one", () => {
        render(
            <DataTable
                columns={kycQueueColumns(spec, null)}
                data={[
                    { id: "a", name: "Pixel Ads Agency", userId: null },
                    { id: "b", name: "Metro Transit Ads", userId: "usr_2" },
                ]}
            />,
        );
        const rows = within(screen.getByRole("table")).getAllByRole("row");
        const row = (name: string) => rows.find((candidate) => within(candidate).queryByText(name))!;
        expect(within(row("Pixel Ads Agency")).getByTestId("no-app-account")).toBeInTheDocument();
        expect(within(row("Metro Transit Ads")).queryByTestId("no-app-account")).toBeNull();
        expect(NoAppAccount).toBeTypeOf("function");
    });
});
