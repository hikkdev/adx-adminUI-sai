import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * OM-1: the Orders tab bar — three views of one list, exactly one lit.
 */

const location = { pathname: "/orders" };
vi.mock("next/navigation", () => ({ usePathname: () => location.pathname }));

import { OrdersNav } from "./orders-nav";

beforeEach(() => {
    location.pathname = "/orders";
});

const tabs = () => screen.getAllByRole("link").map((link) => `${link.textContent}→${link.getAttribute("href")}`);
const active = () =>
    screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page")
        .map((link) => link.textContent);

describe("the Orders tab bar", () => {
    it("offers the list, the calendar, the pipeline and the fraud review", () => {
        render(<OrdersNav />);
        expect(tabs()).toEqual(["List→/orders", "Calendar→/orders/calendar", "Pipeline→/orders/pipeline", "Fraud review→/orders/fraud-review"]);
    });

    it("marks only the fraud review on its own tab", () => {
        location.pathname = "/orders/fraud-review";
        render(<OrdersNav />);
        expect(active()).toEqual(["Fraud review"]);
    });

    it("marks only the list at the root", () => {
        render(<OrdersNav />);
        expect(active()).toEqual(["List"]);
    });

    it("marks only the view the operator is on", () => {
        location.pathname = "/orders/calendar";
        render(<OrdersNav />);
        expect(active()).toEqual(["Calendar"]);
    });

    it("marks nothing on an order's own page", () => {
        location.pathname = "/orders/ord_1";
        render(<OrdersNav />);
        expect(active()).toEqual([]);
    });
});
