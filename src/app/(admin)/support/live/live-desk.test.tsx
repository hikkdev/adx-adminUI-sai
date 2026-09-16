import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Presence } from "@/lib/use-presence";
import type { LiveInboxPage, LiveInboxRow } from "@/services/live-chat";

/**
 * The desk's list — I4-C.
 *
 * Two things the row says now that it did not before. The plan behind the
 * chat is drawn from the inbox contract (`plan: { name, reason }`) with the
 * reason as the tooltip, and an excluded tier is told apart. And the two
 * facets above the list are independent toggles that report the pair, so
 * the loader can put both in the URL the way every other desk does.
 */

vi.mock("./chat-pane", () => ({
    ChatPane: ({ row }: { row: LiveInboxRow }) => <div data-testid="chat-pane">{row.id}</div>,
}));

import { LiveDesk } from "./live-desk";

const row = (over: Partial<LiveInboxRow> & Pick<LiveInboxRow, "id">): LiveInboxRow => ({
    displayId: `TKT-${over.id}`,
    title: "Help",
    requester: { userId: `usr_${over.id}`, name: `Requester ${over.id}` },
    assignedAdmin: null,
    lastMessageAt: null,
    lastMessage: null,
    waitingSince: null,
    firstResponseAt: null,
    firstResponseBreached: false,
    unread: 0,
    createdAt: "2026-09-14T10:00:00.000Z",
    plan: null,
    ...over,
});

const presence: Presence = {
    online: true,
    operators: [{ userId: "usr_admin", name: "Priya Rao", openChats: 1 }],
    myOpenChats: 1,
    loading: false,
    busy: false,
    error: null,
    available: true,
    stale: false,
    lastReadAt: Date.now(),
    setOnline: async () => undefined,
    reload: () => undefined,
};

const page = (items: LiveInboxRow[]): LiveInboxPage => ({
    items,
    total: items.length,
    page: 1,
    pageSize: 50,
    firstResponseTargetSec: 60,
});

const renderDesk = (over: Partial<ComponentProps<typeof LiveDesk>> = {}) => {
    const onFacetsChange = vi.fn();
    render(
        <LiveDesk
            page={page([
                row({ id: "a", plan: { name: "Growth", reason: "PUBLISHER_SUBSCRIPTION" } }),
                row({ id: "b", plan: { name: "Starter", reason: "PLAN_EXCLUDED" } }),
                row({ id: "c" }),
            ])}
            presence={presence}
            canned={[]}
            lastEvent={null}
            facets={{ mine: false, unassigned: false }}
            onFacetsChange={onFacetsChange}
            onChanged={() => undefined}
            {...over}
        />,
    );
    return { onFacetsChange };
};

describe("the live desk's rows", () => {
    it("draws the plan from the row with its reason as the tooltip, and nothing when there is none", () => {
        renderDesk();
        const badges = screen.getAllByTestId("plan-badge");
        expect(badges).toHaveLength(2);
        const growth = badges.find((badge) => badge.textContent === "Growth");
        expect(growth).toHaveAttribute("title", expect.stringMatching(/publisher subscription/i));
        const starter = badges.find((badge) => badge.textContent === "Starter");
        expect(starter).toHaveAttribute("title", expect.stringMatching(/leaves live chat out/i));
        // The row with no plan carries no badge — there is nothing to say.
        const rowC = screen.getByText("Requester c").closest("button") as HTMLElement;
        expect(within(rowC).queryByTestId("plan-badge")).toBeNull();
    });
});

describe("the inbox's two facets", () => {
    it("reports the pair with the one that was clicked flipped", () => {
        const { onFacetsChange } = renderDesk();
        fireEvent.click(screen.getByRole("button", { name: "Mine" }));
        expect(onFacetsChange).toHaveBeenLastCalledWith({ mine: true, unassigned: false });
        fireEvent.click(screen.getByRole("button", { name: "Unassigned" }));
        expect(onFacetsChange).toHaveBeenLastCalledWith({ mine: false, unassigned: true });
    });

    it("shows which facets are on, and turns one off again from the same toggle", () => {
        const { onFacetsChange } = renderDesk({ facets: { mine: true, unassigned: true } });
        expect(screen.getByRole("button", { name: "Mine" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "Unassigned" })).toHaveAttribute("aria-pressed", "true");
        fireEvent.click(screen.getByRole("button", { name: "Mine" }));
        expect(onFacetsChange).toHaveBeenLastCalledWith({ mine: false, unassigned: true });
    });

    it("says an empty list under a facet is the filter's doing, not an empty desk", () => {
        renderDesk({ page: page([]), facets: { mine: true, unassigned: false } });
        expect(screen.getByText("Nothing under this filter")).toBeInTheDocument();
    });
});

describe("the presence switch", () => {
    it("says how old a stale roster is and keeps the switch where it was", () => {
        renderDesk({ presence: { ...presence, stale: true, lastReadAt: Date.now() - 42_000, error: "down" } });
        expect(screen.getByTestId("presence-stale")).toHaveTextContent(/Roster last read 4\ds ago/);
        expect(screen.getByRole("switch", { name: "Online at the live desk" })).toBeChecked();
    });
});
