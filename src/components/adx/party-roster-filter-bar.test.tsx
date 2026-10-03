import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";

/**
 * 29 Sep 2026 — the party rosters' one filter bar. What is pinned: the same
 * five filters in the same order on every desk — Search, Door, KYC state,
 * Type, City — with Type left out for a party that has none; the selects
 * reach the read at once, the typed text and city once they settle; and
 * Clear appears only while something is set.
 */

vi.mock("@/services/geo", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/geo")>();
    return { ...actual, geoReadsApi: () => false };
});

import { PartyRosterFilterBar, usePartyRosterFilters, type PartyRosterFilterSpec } from "@/components/adx/party-roster-filter-bar";
import { EMPTY_ROSTER_FILTERS, ONBOARDING_DOOR_OPTIONS, PRINT_PARTNER_DOOR_OPTIONS, ROSTER_ANY } from "@/services/party-roster";
import { accountStatusOptions } from "@/services/account-state";

const withType: PartyRosterFilterSpec = {
    searchPlaceholder: "Search name, ID, phone, email, city",
    doors: ONBOARDING_DOOR_OPTIONS,
    types: [
        { value: "INDIVIDUAL", label: "Individual" },
        { value: "BUSINESS", label: "Business" },
    ],
    idPrefix: "test",
};
const withoutType: PartyRosterFilterSpec = { ...withType, doors: PRINT_PARTNER_DOOR_OPTIONS, types: undefined };

function Harness({ spec }: { spec: PartyRosterFilterSpec }) {
    const state = usePartyRosterFilters();
    return (
        <>
            <PartyRosterFilterBar spec={spec} state={state} />
            <output data-testid="key">{state.key}</output>
        </>
    );
}

/** The bar's labelled controls, in document order — the text fields and the select triggers. */
const controls = () =>
    Array.from(screen.getByTestId("party-roster-filters").querySelectorAll("input[aria-label], button[aria-label]")).map((element) => element.getAttribute("aria-label"));

afterEach(() => vi.useRealTimers());

describe("the party rosters' filter bar", () => {
    it("draws the five filters in the one order", () => {
        render(<Harness spec={withType} />);
        expect(controls()).toEqual(["Search", "Onboarded via", "KYC state", "Type", "City"]);
    });

    it("leaves Type out for a party that has none, and nothing else", () => {
        render(<Harness spec={withoutType} />);
        expect(controls()).toEqual(["Search", "Onboarded via", "KYC state", "City"]);
    });

    it("sends a select at once and the typed text once it settles; Clear resets all", () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => usePartyRosterFilters());
        act(() => result.current.set({ door: "DESK", kycState: "NEEDS_INFO", type: "BUSINESS" }));
        expect(result.current.query).toEqual({ onboardedVia: "DESK", kycState: "NEEDS_INFO", type: "BUSINESS" });

        act(() => result.current.set({ q: "suraj", city: { text: "Bengaluru", slug: "bengaluru" } }));
        expect(result.current.query.q).toBeUndefined();
        act(() => {
            vi.advanceTimersByTime(300);
        });
        expect(result.current.query).toEqual({ q: "suraj", onboardedVia: "DESK", kycState: "NEEDS_INFO", type: "BUSINESS", city: "bengaluru" });
        expect(result.current.key).toBe("q=suraj&onboardedVia=DESK&kycState=NEEDS_INFO&type=BUSINESS&city=bengaluru");

        act(() => result.current.clear());
        act(() => {
            vi.advanceTimersByTime(300);
        });
        expect(result.current.query).toEqual({});
    });

    it("offers Clear only while a filter is set", () => {
        render(<Harness spec={withType} />);
        expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
        fireEvent.change(screen.getByRole("textbox", { name: "Search" }), { target: { value: "suraj" } });
        fireEvent.click(screen.getByRole("button", { name: /clear/i }));
        expect(screen.getByRole("textbox", { name: "Search" })).toHaveValue("");
    });
});

/**
 * 2 Oct 2026 (the account lifecycle): the Status select on the publisher,
 * advertiser and agent rosters — after the five, the same trigger as the
 * others, Active by default; each option with the server's count and its
 * one line; Left only on the agents' desk; Clear goes back to Active.
 */
const withStatus: PartyRosterFilterSpec = { ...withType, statuses: accountStatusOptions(false) };

function StatusHarness({ spec, counts }: { spec: PartyRosterFilterSpec; counts?: Record<string, number> }) {
    const state = usePartyRosterFilters({ status: "ACTIVE" });
    return (
        <>
            <PartyRosterFilterBar spec={spec} state={state} statusCounts={counts} />
            <output data-testid="key">{state.key}</output>
        </>
    );
}

async function pick(label: string, option: RegExp) {
    fireEvent.keyDown(screen.getByRole("combobox", { name: label }), { key: "ArrowDown" });
    fireEvent.keyDown(await screen.findByRole("option", { name: option }), { key: "Enter" });
}

describe("the Status select", () => {
    it("sits after the five, starts on Active with its count, and is sent as `status`", () => {
        render(<StatusHarness spec={withStatus} counts={{ ACTIVE: 40, SUSPENDED: 2, CLOSED: 1, ALL: 44 }} />);
        expect(controls()).toEqual(["Search", "Onboarded via", "KYC state", "Type", "City", "Status"]);
        expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Active · 40");
        expect(screen.getByTestId("key")).toHaveTextContent("status=ACTIVE");
        // Active is the default, not a filter to clear.
        expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
    });

    it("offers each state with its count and its one line; a pick goes to the read, and Clear goes back to Active", async () => {
        render(<StatusHarness spec={withStatus} counts={{ ACTIVE: 40, SUSPENDED: 2, CLOSED: 1, ALL: 44 }} />);
        fireEvent.keyDown(screen.getByRole("combobox", { name: "Status" }), { key: "ArrowDown" });
        const options = await screen.findAllByRole("option");
        expect(options.map((option) => option.textContent)).toEqual([
            expect.stringMatching(/^Active40Working normally\./),
            expect.stringMatching(/^Suspended2Paused for now/),
            expect.stringMatching(/^DeactivatedSwitched off by the desk/),
            expect.stringMatching(/^Closed1Closed for good/),
            expect.stringMatching(/^Everyone44Every account/),
        ]);
        fireEvent.keyDown(screen.getByRole("option", { name: /^Closed/ }), { key: "Enter" });
        expect(screen.getByTestId("key")).toHaveTextContent("status=CLOSED");
        expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Closed · 1");

        fireEvent.click(screen.getByRole("button", { name: /clear/i }));
        expect(screen.getByTestId("key")).toHaveTextContent("status=ACTIVE");
    });

    it("offers Left on the agents' desk only, and draws no counts the server did not send", async () => {
        render(<StatusHarness spec={{ ...withType, statuses: accountStatusOptions(true) }} />);
        expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent(/^Active$/);
        await pick("Status", /^Left/);
        expect(screen.getByTestId("key")).toHaveTextContent("status=EXITED");
    });

    it("is not drawn on a desk whose spec names no states", () => {
        render(<Harness spec={withoutType} />);
        expect(screen.queryByRole("combobox", { name: "Status" })).toBeNull();
    });
});

/**
 * 2 Oct 2026 (the owner: "again 3 different variations"): one order on
 * every directory — Search · Every door · Every KYC state · [the party's
 * own facet] · Any city · Status. A party with no type (the print
 * partners) draws its own facet in Type's slot, as the same select, and
 * Clear puts it back to "Any …" with the rest.
 */
const APP_STATES = [
    { value: "ACTIVE", label: "Signed in" },
    { value: "APPLIED", label: "Applied from the app" },
];

function FacetHarness({ initial = ROSTER_ANY }: { initial?: string }) {
    const state = usePartyRosterFilters({ status: "ACTIVE" });
    const [value, setValue] = React.useState(initial);
    return (
        <>
            <PartyRosterFilterBar
                spec={{ ...withoutType, statuses: accountStatusOptions(false) }}
                state={state}
                facet={{ label: "App state", all: "Any app state", value, options: APP_STATES, onChange: setValue }}
            />
            <output data-testid="facet">{value}</output>
        </>
    );
}

describe("the party's own facet", () => {
    it("sits in Type's slot — after KYC state, before City and Status", () => {
        render(<FacetHarness />);
        expect(controls()).toEqual(["Search", "Onboarded via", "KYC state", "App state", "City", "Status"]);
        expect(screen.getByRole("combobox", { name: "App state" })).toHaveTextContent("Any app state");
    });

    it("draws Type, not the facet, for a party that has a type — one select per slot", () => {
        render(
            <PartyRosterFilterBar
                spec={{ ...withType, statuses: accountStatusOptions(false) }}
                state={{ filters: { ...EMPTY_ROSTER_FILTERS, status: "ACTIVE" }, set: () => undefined, clear: () => undefined, query: {}, key: "" }}
                facet={{ label: "App state", all: "Any app state", value: ROSTER_ANY, options: APP_STATES, onChange: () => undefined }}
            />,
        );
        expect(controls()).toEqual(["Search", "Onboarded via", "KYC state", "Type", "City", "Status"]);
    });

    it("hands a pick to the desk, offers Clear while it is set, and Clear puts it back", async () => {
        render(<FacetHarness />);
        expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
        await pick("App state", /^Applied from the app$/);
        expect(screen.getByTestId("facet")).toHaveTextContent("APPLIED");
        fireEvent.click(screen.getByRole("button", { name: /clear/i }));
        expect(screen.getByTestId("facet")).toHaveTextContent(ROSTER_ANY);
    });
});
