import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * QR-14 — the onboarding board on screen.
 *
 * Pinned: the team is ranked with their role, the doors and the milestones;
 * organic sits apart, unranked; the header sums the window; changing the
 * window preset, the door or the role asks for a new read; a custom
 * from/to applies as one query; and an empty window says so.
 */

import { BoardView } from "./board-view";
import type { OnboardingBoard } from "@/services/reports";

const board: OnboardingBoard = {
    window: { from: "2026-08-18", to: "2026-09-17", label: "2026-08-18 → 2026-09-17" },
    rows: [
        { rank: 1, actorId: "usr_ops", actorName: "Asha Rao", actorRole: "Ops manager", via: { SELF: 0, AGENT: 0, QR: 0, DESK: 7, IMPORT: 2 }, publishers: 8, advertisers: 1, onboarded: 9, completed: 6, liveWithin7d: 3, verified: 2, firstBooking: 1 },
        { rank: 2, actorId: "usr_agent", actorName: "Ravi Agent", actorRole: "Agent", via: { SELF: 0, AGENT: 2, QR: 3, DESK: 0, IMPORT: 0 }, publishers: 5, advertisers: 0, onboarded: 5, completed: 4, liveWithin7d: 2, verified: 3, firstBooking: 0 },
        { rank: null, actorId: null, actorName: null, actorRole: null, via: { SELF: 4, AGENT: 0, QR: 0, DESK: 0, IMPORT: 0 }, publishers: 3, advertisers: 1, onboarded: 4, completed: 2, liveWithin7d: 1, verified: 0, firstBooking: 0 },
    ],
};

describe("BoardView", () => {
    it("ranks the team with role, doors and milestones, and keeps organic apart", () => {
        render(<BoardView board={board} query={{ preset: "last30" }} onQuery={() => undefined} />);
        expect(screen.getByTestId("board-window").textContent).toBe("2026-08-18 → 2026-09-17 · 18 onboarded — 14 by the team, 4 organic");
        const asha = within(screen.getByTestId("board-row-usr_ops"));
        expect(asha.getAllByRole("cell")[0]!.textContent).toBe("1");
        expect(asha.getByText("Asha Rao")).toBeTruthy();
        expect(asha.getByText("Ops manager")).toBeTruthy();
        expect(asha.getByText("Desk 7")).toBeTruthy();
        expect(asha.getByText("Import 2")).toBeTruthy();
        expect(asha.getByText("67%")).toBeTruthy();
        const ravi = within(screen.getByTestId("board-row-usr_agent"));
        expect(ravi.getByText("Agent (QR scan) 3")).toBeTruthy();
        // Organic is its own card, not in the ranked table.
        expect(within(screen.getByTestId("board-table")).queryByTestId("board-row-organic")).toBeNull();
        expect(within(screen.getByTestId("board-organic")).getByText("Organic (self-serve)")).toBeTruthy();
        expect(within(screen.getByTestId("board-organic")).getAllByRole("cell")[0]!.textContent).toBe("—");
    });

    it("asks for a new read when the window, the door or the role changes, and applies a custom window as one query", () => {
        const onQuery = vi.fn();
        render(<BoardView board={board} query={{ preset: "last30" }} onQuery={onQuery} />);
        fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-01" } });
        fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-09-17" } });
        fireEvent.click(screen.getByTestId("board-apply-window"));
        expect(onQuery).toHaveBeenLastCalledWith({ from: "2026-09-01", to: "2026-09-17" });
        fireEvent.change(screen.getByLabelText("Role"), { target: { value: " Ops manager " } });
        fireEvent.blur(screen.getByLabelText("Role"));
        expect(onQuery).toHaveBeenLastCalledWith({ preset: "last30", role: "Ops manager" });
    });

    it("says when nobody on the team onboarded anyone", () => {
        render(<BoardView board={{ ...board, rows: [board.rows[2]!] }} query={{ preset: "today" }} onQuery={() => undefined} />);
        expect(screen.getByTestId("board-empty")).toBeTruthy();
        expect(screen.getByTestId("board-window").textContent).toContain("4 onboarded — 0 by the team, 4 organic");
    });
});
