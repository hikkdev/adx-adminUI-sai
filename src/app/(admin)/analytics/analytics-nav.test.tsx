import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * The Analytics tab bar (the owner, 24 September 2026).
 *
 * Two things are pinned here because both were bugs waiting to happen.
 *
 * The first is that the board has a door at all. Before the move, the one
 * visible link to it was a tab on Publishers that navigated out of that
 * section; deleting that tab without adding this one would have left the
 * page reachable only by typing its URL, which is the burial that moving
 * Reports out of Settings was meant to end.
 *
 * The second is the active state. The board's route is nested under the
 * report catalogue's, and the SubNav underlines a tab whose href is a prefix
 * of the path, so without `exact` on Reports both tabs light up on the
 * board's own page.
 */

const location = { pathname: "/analytics" };
vi.mock("next/navigation", () => ({ usePathname: () => location.pathname }));

import { AnalyticsNav } from "./analytics-nav";

beforeEach(() => {
    location.pathname = "/analytics";
});

/** The tabs as they render, "label→href". */
const tabs = () => screen.getAllByRole("link").map((link) => `${link.textContent}→${link.getAttribute("href")}`);

/** The labels of every tab currently underlined. */
const active = () =>
    screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page")
        .map((link) => link.textContent);

describe("the Analytics tab bar", () => {
    it("offers the overview, Explore, the report catalogue and the leaderboards", () => {
        render(<AnalyticsNav />);
        expect(tabs()).toEqual([
            "Overview→/analytics",
            "Explore→/analytics/explore",
            "Reports→/analytics/reports",
            "Leaderboards→/analytics/leaderboards",
        ]);
    });

    it("marks only Explore on Explore", () => {
        location.pathname = "/analytics/explore";
        render(<AnalyticsNav />);
        expect(active()).toEqual(["Explore"]);
    });

    it("marks only the overview at the section root", () => {
        render(<AnalyticsNav />);
        expect(active()).toEqual(["Overview"]);
    });

    it("marks only the catalogue on the catalogue", () => {
        location.pathname = "/analytics/reports";
        render(<AnalyticsNav />);
        expect(active()).toEqual(["Reports"]);
    });

    it("marks only Leaderboards on the onboarding board", () => {
        location.pathname = "/analytics/leaderboards";
        render(<AnalyticsNav />);
        expect(active()).toEqual(["Leaderboards"]);
    });

    /* AN-8: the agent board sits under the leaderboards route, so the tab
       still lights there — the prefix match is wanted this time. */
    it("marks Leaderboards on the agent board beneath it", () => {
        location.pathname = "/analytics/leaderboards/agents";
        render(<AnalyticsNav />);
        expect(active()).toEqual(["Leaderboards"]);
    });
});
