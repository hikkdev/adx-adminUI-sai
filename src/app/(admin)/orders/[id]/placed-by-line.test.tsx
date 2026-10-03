import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * PB-1 (the owner, 2 Oct 2026): the order page's header says who placed the
 * order and when — "Placed by Rao Sweets (Asha Rao) on 2 Oct, 3:45 pm" — the
 * business opening the advertiser and the person opening the user.
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/orders/ord_1",
    useSearchParams: () => new URLSearchParams(),
}));

import { formatDateTime } from "@/lib/format";
import { PlacedByLine } from "./order-detail";

const AT = "2026-10-02T15:45:00+05:30";

describe("the order header's Placed by line", () => {
    it("names the business and the person, each a link, and the date and time", () => {
        render(
            <PlacedByLine
                order={{
                    createdAt: AT,
                    placedBy: {
                        userId: "usr_asha",
                        name: "Asha Rao",
                        displayId: "ADX-0210-2601",
                        business: { id: "adv_rao", name: "Rao Sweets", displayId: "ADV-0210-2601" },
                    },
                }}
            />,
        );
        expect(screen.getByTestId("order-placed-by-line")).toHaveTextContent(`Placed by Rao Sweets (Asha Rao) on ${formatDateTime(AT)}`);
        expect(screen.getByRole("link", { name: "Rao Sweets" })).toHaveAttribute("href", "/advertisers/adv_rao");
        expect(screen.getByRole("link", { name: "Asha Rao" })).toHaveAttribute("href", "/users/usr_asha");
    });

    it("leads with the person and their ADX- id when the login holds no business", () => {
        render(<PlacedByLine order={{ createdAt: AT, placedBy: { userId: "usr_vik", name: "Vikram Shah", displayId: "ADX-0210-2602", business: null } }} />);
        expect(screen.getByTestId("order-placed-by-line")).toHaveTextContent(`Placed by Vikram Shah ADX-0210-2602 on ${formatDateTime(AT)}`);
        expect(screen.getByRole("link", { name: "Vikram Shah" })).toHaveAttribute("href", "/users/usr_vik");
    });

    it("still says when, for a read that does not carry who", () => {
        render(<PlacedByLine order={{ createdAt: AT, placedBy: null }} />);
        expect(screen.getByTestId("order-placed-by-line")).toHaveTextContent(`Placed on ${formatDateTime(AT)}`);
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
});
