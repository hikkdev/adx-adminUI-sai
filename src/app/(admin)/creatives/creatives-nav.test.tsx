import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * CR-1: the Creatives tab bar. Review is the root and exact, so the three
 * tabs beneath it do not light it too; the detail page beneath the root
 * lights nothing, which is right for a page that is not a tab.
 */

const location = { pathname: "/creatives" };
vi.mock("next/navigation", () => ({ usePathname: () => location.pathname }));

import { CreativesNav } from "./creatives-nav";

beforeEach(() => {
    location.pathname = "/creatives";
});

const tabs = () => screen.getAllByRole("link").map((link) => `${link.textContent}→${link.getAttribute("href")}`);
const active = () =>
    screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page")
        .map((link) => link.textContent);

describe("the Creatives tab bar", () => {
    it("offers review, design requests, awaiting advertiser and print-ready", () => {
        render(<CreativesNav />);
        expect(tabs()).toEqual([
            "Review→/creatives",
            "Design requests→/creatives/design-requests",
            "Awaiting advertiser→/creatives/awaiting-advertiser",
            "Print-ready→/creatives/print-ready",
        ]);
    });

    it("marks only Review at the root", () => {
        render(<CreativesNav />);
        expect(active()).toEqual(["Review"]);
    });

    it("marks only the tab the operator is on", () => {
        location.pathname = "/creatives/design-requests";
        render(<CreativesNav />);
        expect(active()).toEqual(["Design requests"]);
    });

    it("marks nothing on an artwork's own page", () => {
        location.pathname = "/creatives/crt_1";
        render(<CreativesNav />);
        expect(active()).toEqual([]);
    });
});
