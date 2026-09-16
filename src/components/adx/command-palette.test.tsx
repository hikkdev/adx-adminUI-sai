import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * ⌘K reaches the claims desk (Lot Q's last line, closed in R-C): the
 * Listings entry carries Claims as a child, so `allNavItems` offers
 * `/listings/claims` and picking it pushes the route.
 */

const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/services/search", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/search")>();
    return { ...actual, searchService: { ...actual.searchService, readsApi: () => false, records: async () => [] } };
});

import { allNavItems, navigation } from "@/config/navigation";
import { CommandPalette } from "./command-palette";

describe("the command palette and the claims desk", () => {
    it("Listings carries Claims as a child, so the flattened list reaches /listings/claims once", () => {
        const listings = navigation.flatMap((section) => section.items).find((item) => item.href === "/listings")!;
        /* Package U added the Import child beside Claims. */
        expect(listings.children?.map((child) => child.href)).toEqual(["/listings/claims", "/listings/import"]);
        expect(allNavItems.filter((item) => item.href === "/listings/claims")).toHaveLength(1);
        expect(allNavItems.find((item) => item.href === "/listings/claims")?.title).toBe("Claims");
    });

    it("typing 'claims' offers the desk under Go to, and picking it pushes /listings/claims", () => {
        push.mockReset();
        const onOpenChange = vi.fn();
        render(<CommandPalette open onOpenChange={onOpenChange} />);

        fireEvent.change(screen.getByPlaceholderText("Search pages, publishers, campaigns…"), { target: { value: "claims" } });

        const row = screen.getByRole("option", { name: "Claims" });
        fireEvent.click(row);

        expect(push).toHaveBeenCalledWith("/listings/claims");
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });
});
