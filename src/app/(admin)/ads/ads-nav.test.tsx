import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * AS-1: the Ads & sponsored tab bar. Overview is the root and exact, so the
 * four tabs beneath it do not light it too.
 */

const location = { pathname: "/ads" };
vi.mock("next/navigation", () => ({ usePathname: () => location.pathname }));

import { AdsNav } from "./ads-nav";

beforeEach(() => {
    location.pathname = "/ads";
});

const tabs = () => screen.getAllByRole("link").map((link) => `${link.textContent}→${link.getAttribute("href")}`);
const active = () =>
    screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page")
        .map((link) => link.textContent);

describe("the Ads & sponsored tab bar", () => {
    it("offers the overview, the queue, the ads, the sponsored listings and the price lists", () => {
        render(<AdsNav />);
        expect(tabs()).toEqual([
            "Overview→/ads",
            "Review queue→/ads/review",
            "Display ads→/ads/display",
            "Sponsored listings→/ads/sponsored",
            "Slots & pricing→/ads/slots",
        ]);
    });

    it("marks only Overview at the root", () => {
        render(<AdsNav />);
        expect(active()).toEqual(["Overview"]);
    });

    it("marks only the tab the operator is on", () => {
        location.pathname = "/ads/slots";
        render(<AdsNav />);
        expect(active()).toEqual(["Slots & pricing"]);
    });
});
