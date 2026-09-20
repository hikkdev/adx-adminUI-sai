import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * N3-C (the owner, 14 Sep 2026): "Why is there a separate Activation
 * section for publishers and then Demand section for advertisers? Why
 * couldn't these sections be merged into their respective parent
 * sections?" — they are funnel dashboards, and they are tabs now.
 *
 * What is pinned: the rail no longer lists Activation or Demand as rows of
 * their own; the two funnels are children of Publishers and Advertisers
 * (so ⌘K still reaches them); and each section's SubNav draws the
 * overview (package O-C — the section's root), the directory, the
 * activation funnel (and, for publishers, the import), with the current
 * page marked.
 */

const location = vi.hoisted(() => ({ pathname: "/publishers/activation" }));

vi.mock("next/navigation", () => ({
    usePathname: () => location.pathname,
}));

import { allNavItems, navigation } from "@/config/navigation";
import { AdvertisersNav } from "../advertisers/advertisers-nav";
import { PublishersNav } from "./publishers-nav";

describe("the rail after the fold", () => {
    it("lists Publishers and Advertisers once each, and neither Activation nor Demand as rows", () => {
        const marketplace = navigation.find((section) => section.id === "marketplace")!;
        const rows = marketplace.items.map((item) => item.title);
        expect(rows).not.toContain("Activation");
        expect(rows).not.toContain("Demand");
        expect(marketplace.items.map((item) => item.href)).not.toContain("/publishers/activation");
        expect(marketplace.items.map((item) => item.href)).not.toContain("/advertisers/activation");
        expect(rows.filter((title) => title === "Publishers" || title === "Advertisers")).toEqual(["Publishers", "Advertisers"]);
    });

    it("keeps both funnels reachable as children, so the command palette still finds them", () => {
        const publishers = navigation.flatMap((section) => section.items).find((item) => item.href === "/publishers")!;
        const advertisers = navigation.flatMap((section) => section.items).find((item) => item.href === "/advertisers")!;
        expect(publishers.children?.map((child) => child.href)).toEqual(["/publishers/directory", "/publishers/activation", "/publishers/import"]);
        expect(advertisers.children?.map((child) => child.href)).toEqual(["/advertisers/directory", "/advertisers/activation", "/advertisers/import"]);
        expect(allNavItems.map((item) => item.href)).toEqual(
            expect.arrayContaining(["/publishers/directory", "/publishers/activation", "/advertisers/directory", "/advertisers/activation", "/publishers/import"]),
        );
        // The parent's own href — the overview now — is offered once.
        expect(allNavItems.filter((item) => item.href === "/publishers")).toHaveLength(1);
    });
});

describe("the two SubNavs", () => {
    it("PublishersNav: Overview | Directory | Activation funnel | Import | Onboarding board, the current page marked", () => {
        location.pathname = "/publishers/activation";
        render(<PublishersNav />);
        const links = screen.getAllByRole("link");
        expect(links.map((link) => `${link.textContent}→${link.getAttribute("href")}`)).toEqual([
            "Overview→/publishers",
            "Directory→/publishers/directory",
            "Activation funnel→/publishers/activation",
            "Import→/publishers/import", "Onboarding board→/settings/reports/onboarding-board",
        ]);
        expect(screen.getByRole("link", { name: "Activation funnel" })).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
        expect(screen.getByRole("link", { name: "Directory" })).not.toHaveAttribute("aria-current");
    });

    it("AdvertisersNav: Overview | Directory | Activation funnel | Import (S-C), the overview exact so the others do not light it", () => {
        location.pathname = "/advertisers";
        render(<AdvertisersNav />);
        expect(screen.getAllByRole("link").map((link) => `${link.textContent}→${link.getAttribute("href")}`)).toEqual([
            "Overview→/advertisers",
            "Directory→/advertisers/directory",
            "Activation funnel→/advertisers/activation",
            "Import→/advertisers/import",
        ]);
        expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("link", { name: "Directory" })).not.toHaveAttribute("aria-current");
        expect(screen.getByRole("link", { name: "Activation funnel" })).not.toHaveAttribute("aria-current");
    });
});
