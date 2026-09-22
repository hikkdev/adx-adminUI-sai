import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * DR 05 — the leaderboard, from the desk.
 *
 * No DR 10 frame draws this; the console's own list idiom stands in. What
 * this pins is decision 9 on the screen: the podium prints its three
 * figures, nobody below it has one and the caption says so, and a cohort
 * under the floor is an honest sentence with the size and the minimum in
 * it rather than an empty table.
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/growth/leaderboard",
    useSearchParams: () => new URLSearchParams(),
}));

import type { LeaderboardView as Board } from "@/services/growth";
import { LeaderboardBoard, LeaderboardControls } from "./leaderboard-view";

const board = (over: Partial<Board> = {}): Board => ({
    period: "WEEK",
    cohort: { city: "Bengaluru", size: 14, minimum: 10, enough: true },
    me: null,
    top: [
        { rank: 1, agentId: "a1", name: "Asha Rao", locality: "Jayanagar", you: false, earnings: "12000.00", fromLeads: "1200.00", conversions: 4 },
        { rank: 2, agentId: "a2", name: "Bala Iyer", locality: null, you: false, earnings: "9000.50", fromLeads: "0.00", conversions: 0 },
        { rank: 3, agentId: "a3", name: "Charu Menon", locality: "Indiranagar", you: false, earnings: "8500.00", fromLeads: "0.00", conversions: 1 },
    ],
    window: [
        { rank: 4, agentId: "a4", name: "Dev Kumar", locality: "HSR Layout", you: false, conversions: 2 },
        { rank: 5, agentId: "a5", name: "Esha Nair", locality: null, you: false, conversions: 0 },
    ],
    around: [],
    prize: null,
    ...over,
});

describe("the board", () => {
    it("prints the podium's three figures from their decimal strings, paise included", () => {
        render(<LeaderboardBoard board={board()} />);
        const podium = within(screen.getByTestId("leaderboard-podium"));
        expect(podium.getByText("₹12,000.00")).toBeInTheDocument();
        expect(podium.getByText("₹9,000.50")).toBeInTheDocument();
        expect(podium.getByText("₹8,500.00")).toBeInTheDocument();
        expect(podium.getByText("Asha Rao")).toBeInTheDocument();
        expect(podium.getByText("Jayanagar")).toBeInTheDocument();
    });

    it("lists everyone below the podium by rank, name and locality, with no figure, and says why", () => {
        render(<LeaderboardBoard board={board()} />);
        const table = within(screen.getByTestId("leaderboard-window"));
        expect(table.getByText("Dev Kumar")).toBeInTheDocument();
        expect(table.getByText("HSR Layout")).toBeInTheDocument();
        expect(table.getByText("Esha Nair")).toBeInTheDocument();
        expect(table.queryByText(/₹/)).not.toBeInTheDocument();
        expect(screen.getByText(/sends no figures below the podium/)).toBeInTheDocument();
    });

    it("LH8: prints the hunt's share under each podium figure, and only a count of conversions below it", () => {
        render(<LeaderboardBoard board={board()} />);
        expect(screen.getByTestId("leaderboard-from-leads-1")).toHaveTextContent("₹1,200.00 from leads · 4 conversions");
        expect(screen.getByTestId("leaderboard-from-leads-2")).toHaveTextContent("Nothing from leads yet");
        expect(screen.getByTestId("leaderboard-from-leads-3")).toHaveTextContent("1 conversion");
        const table = within(screen.getByTestId("leaderboard-window"));
        expect(table.getByText("From leads")).toBeInTheDocument();
        expect(table.getByText("2 conversions")).toBeInTheDocument();
        // Still no money below the podium.
        expect(table.queryByText(/₹/)).not.toBeInTheDocument();
    });

    it("links each agent to their page", () => {
        render(<LeaderboardBoard board={board()} />);
        expect(screen.getByRole("link", { name: /Asha Rao/ })).toHaveAttribute("href", "/agents/a1");
        expect(screen.getByRole("link", { name: /Dev Kumar/ })).toHaveAttribute("href", "/agents/a4");
    });

    it("says honestly why there is no board under the floor, with the size and the minimum", () => {
        render(
            <LeaderboardBoard
                board={board({ cohort: { city: "Pune", size: 4, minimum: 10, enough: false }, top: [], window: [] })}
            />,
        );
        expect(screen.getByText("Not enough agents in Pune for a board yet — 4 on the roster, 10 needed.")).toBeInTheDocument();
        expect(screen.queryByTestId("leaderboard-podium")).not.toBeInTheDocument();
    });

    it("draws no prize: nothing pays one", () => {
        render(<LeaderboardBoard board={board()} />);
        expect(screen.queryByText(/prize/i)).not.toBeInTheDocument();
    });
});

describe("the controls", () => {
    it("asks for a city before it asks the server, and hands the typed city up on submit", () => {
        const onCityChange = vi.fn();
        const onPeriodChange = vi.fn();
        render(<LeaderboardControls city="" period="WEEK" onCityChange={onCityChange} onPeriodChange={onPeriodChange} />);
        expect(screen.getByText(/Choose a city/)).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText("City"), { target: { value: " Bengaluru " } });
        fireEvent.click(screen.getByRole("button", { name: "Show board" }));
        expect(onCityChange).toHaveBeenCalledWith("Bengaluru");

        fireEvent.click(screen.getByRole("tab", { name: "This month" }));
        expect(onPeriodChange).toHaveBeenCalledWith("MONTH");
    });
});
