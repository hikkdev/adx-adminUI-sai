import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * The overview kit — package O-C.
 *
 * What is pinned: the window picker writes the window into the URL (a
 * preset as `?window=`, Custom with its two days, the city as `?city=`,
 * the default as nothing) and leaves the rest of the query alone; a tile
 * prints its movement against the previous window with the arrow and the
 * previous value on hover, and a state figure says "as of now" instead;
 * the KYC mix's segments lead to the section's queue with the state chip
 * preselected.
 */

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), search: "", pathname: "/publishers" }));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: router.push, replace: router.replace, refresh: vi.fn() }),
    usePathname: () => router.pathname,
    useSearchParams: () => new URLSearchParams(router.search),
}));

/* The hook reads today off the clock; the harness pins it to TODAY so the default window never drifts with the calendar. */
vi.mock("@/services/overview", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/overview")>();
    return { ...actual, todayIST: () => "2026-09-15" };
});

/* V-C: the city filter is the shared combobox over GET /geo/cities; the list is only asked for once the field is focused. */
vi.mock("@/services/geo", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/geo")>();
    return {
        ...actual,
        geoReadsApi: () => true,
        geoService: { ...actual.geoService, cities: async () => ({ items: [], total: 0, page: 1, pageSize: 20, counts: {} }) },
    };
});

import { kycMixItems } from "@/services/section-overviews";
import { MixBar } from "./mix-bar";
import { CountTile, MoneyTile } from "./stat-tile";
import { useOverviewWindow } from "./use-overview-window";
import { WindowPicker } from "./window-picker";

beforeEach(() => {
    router.replace.mockReset();
    router.search = "";
    router.pathname = "/publishers";
});

const TODAY = "2026-09-15";

/** The picker over the URL hook, the way every overview mounts it. */
function Harness({ cityFilter = true }: { cityFilter?: boolean }) {
    const [window, setWindow] = useOverviewWindow();
    return (
        <>
            <WindowPicker window={window} onChange={setWindow} today={TODAY} cityFilter={cityFilter} />
            <output data-testid="window">{`${window.preset} ${window.from}..${window.to} city=${window.city || "-"}`}</output>
            {/* The presets and the custom days, without opening a Radix menu in jsdom. */}
            <button type="button" onClick={() => setWindow({ preset: "7D", from: "2026-09-09", to: TODAY, city: window.city })}>
                seven
            </button>
            <button type="button" onClick={() => setWindow({ preset: "CUSTOM", from: "2026-07-01", to: "2026-07-31", city: window.city })}>
                july
            </button>
            <button type="button" onClick={() => setWindow({ ...window, city: "Pune" })}>
                pune
            </button>
            <button type="button" onClick={() => setWindow({ preset: "30D", from: "2026-08-17", to: TODAY, city: "" })}>
                reset
            </button>
        </>
    );
}

describe("the window picker's URL", () => {
    it("reads the default from an empty URL and writes a preset as ?window=", () => {
        render(<Harness />);
        expect(screen.getByTestId("window")).toHaveTextContent("30D 2026-08-17..2026-09-15 city=-");
        expect(screen.getByRole("button", { name: "Window" })).toHaveTextContent("Last 30 days");
        fireEvent.click(screen.getByRole("button", { name: "seven" }));
        expect(router.replace).toHaveBeenLastCalledWith("/publishers?window=7D");
    });

    it("writes Custom with its two days, a city as ?city=, and the default as the bare path", () => {
        render(<Harness />);
        fireEvent.click(screen.getByRole("button", { name: "july" }));
        expect(router.replace).toHaveBeenLastCalledWith("/publishers?window=CUSTOM&from=2026-07-01&to=2026-07-31");
        fireEvent.click(screen.getByRole("button", { name: "pune" }));
        expect(router.replace).toHaveBeenLastCalledWith("/publishers?city=Pune");
        fireEvent.click(screen.getByRole("button", { name: "reset" }));
        expect(router.replace).toHaveBeenLastCalledWith("/publishers");
    });

    it("reads the window back off the URL and leaves the rest of the query alone", () => {
        router.pathname = "/agents";
        router.search = "window=CUSTOM&from=2026-07-01&to=2026-07-31&city=Bengaluru&tab=x";
        render(<Harness />);
        expect(screen.getByTestId("window")).toHaveTextContent("CUSTOM 2026-07-01..2026-07-31 city=Bengaluru");
        expect(screen.getByRole("button", { name: "Window" })).toHaveTextContent("1 Jul 2026 – 31 Jul 2026");
        /* Custom shows its two date inputs. */
        expect(screen.getByLabelText("From")).toHaveValue("2026-07-01");
        expect(screen.getByLabelText("To")).toHaveValue("2026-07-31");
        fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-08-15" } });
        expect(router.replace).toHaveBeenLastCalledWith("/agents?tab=x&window=CUSTOM&from=2026-07-01&to=2026-08-15&city=Bengaluru");
    });

    it("offers the city field only where the section's read takes a city, and reads the city in force off the URL", async () => {
        const { unmount } = render(<Harness cityFilter={false} />);
        expect(screen.queryByLabelText("City")).toBeNull();
        unmount();
        router.search = "city=Bengaluru";
        render(<Harness />);
        await waitFor(() => expect(screen.getByLabelText("City")).toHaveValue("Bengaluru"));
        /* Free text still reaches the URL — a spelling a party typed is a filter too. */
        fireEvent.change(screen.getByLabelText("City"), { target: { value: "Pune" } });
        expect(router.replace).toHaveBeenLastCalledWith("/publishers?city=Pune");
    });
});

describe("a tile's delta", () => {
    it("prints the signed movement with the arrow and the previous value on hover", () => {
        render(<CountTile label="New in window" figure={{ value: 12, previous: 9, delta: 3 }} hint="signed up" />);
        const delta = screen.getByTestId("stat-delta");
        expect(delta).toHaveTextContent("+3");
        expect(delta).toHaveAttribute("title", "9 in the previous window");
        expect(delta.className).toContain("text-success");
        expect(delta.querySelector("svg")).not.toBeNull();
        expect(screen.getByText("vs previous")).toBeInTheDocument();
        expect(screen.getByText("· signed up")).toBeInTheDocument();
    });

    it("a fall is red, a state figure has no delta and says as of now", () => {
        const { unmount } = render(<CountTile label="Active" figure={{ value: 4, previous: 9, delta: -5 }} />);
        expect(screen.getByTestId("stat-delta")).toHaveTextContent("-5");
        expect(screen.getByTestId("stat-delta").className).toContain("text-danger");
        unmount();
        render(<CountTile label="Suspended" figure={{ value: 2, previous: null, delta: null }} />);
        expect(screen.queryByTestId("stat-delta")).toBeNull();
        expect(screen.getByText("as of now")).toBeInTheDocument();
    });

    it("a money tile prints the string the API sent and moves by the share of the previous window", () => {
        render(<MoneyTile label="Earnings" figure={{ value: "1250.50", previous: "1000.00", delta: "250.50" }} />);
        expect(screen.getByText("₹1,250.50")).toBeInTheDocument();
        expect(screen.getByTestId("stat-delta")).toHaveTextContent("+25.1%");
        expect(screen.getByTestId("stat-delta")).toHaveAttribute("title", "₹1,000.00 in the previous window");
    });
});

describe("the KYC mix", () => {
    it("each segment links to the section's queue with the state chip preselected", () => {
        render(<MixBar title="KYC by state" items={kycMixItems({ awaitingDocuments: 3, requested: 1, pending: 4, needsInfo: 0, rejected: 2, verified: 40 }, "/kyc/print-partners")} />);
        expect(screen.getByRole("link", { name: "Pending review" })).toHaveAttribute("href", "/kyc/print-partners?state=pending");
        expect(screen.getByRole("link", { name: "Awaiting documents" })).toHaveAttribute("href", "/kyc/print-partners?state=awaiting_documents");
        expect(screen.getByRole("link", { name: "Verified" })).toHaveAttribute("href", "/kyc/print-partners?state=verified");
        /* An empty state is listed, with its share, but takes no width on the bar. */
        expect(screen.getByText("Needs info")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: /KYC by state/ }).children).toHaveLength(5);
    });

    it("an empty mix says so rather than drawing a bar of nothing", () => {
        render(<MixBar title="By role" items={[{ key: "a", label: "A", count: 0, href: null, tone: "info" }]} emptyMessage="No roles granted." />);
        expect(screen.getByText("No roles granted.")).toBeInTheDocument();
        expect(screen.queryByRole("img")).toBeNull();
    });
});
