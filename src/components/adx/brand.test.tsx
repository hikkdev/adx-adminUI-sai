import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * QR-9 — the brand on the console; QR-11 — what is written on the primary
 * rides into the theme too.
 *
 * Pinned: before the read answers the console draws DR 11 from its bundled
 * files; once it answers, the wordmark and the mark are the brand's URLs and
 * the primary colour (and its foreground) are written to the theme's CSS
 * variables as HSL triples; a read that fails leaves DR 11. The Settings
 * page that edits the brand has its own suite under settings/brand.
 */

const { backend } = vi.hoisted(() => ({
    backend: {
        brand: null as Record<string, unknown> | null,
        fail: false,
        calls: [] as { method: string; path: string; body?: unknown }[],
    },
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            get: async (path: string) => {
                backend.calls.push({ method: "GET", path });
                if (backend.fail) throw new actual.ApiError(500, "INTERNAL", "down");
                return backend.brand;
            },
            post: async () => undefined,
            put: async () => undefined,
            patch: async () => undefined,
            delete: async () => undefined,
        },
    };
});

import { BrandProvider, Mark, Wordmark, brandCssVariables, useBrand } from "./brand";
import { BRAND_FALLBACK, hexToHslTriple } from "@/services/branding";

const served = {
    ...BRAND_FALLBACK,
    tagline: "Own the city.",
    primaryColor: "#F5D400",
    onPrimaryColor: "#0F0F0F",
    wordmarkUrl: "https://api/brand/adx-wordmark-red.svg",
    wordmarkInverseUrl: "https://api/brand/adx-wordmark-white.svg",
    markUrl: "https://api/brand/adx-mark-red.svg",
    markInverseUrl: "https://api/brand/adx-mark-white.svg",
    iconUrl: "https://api/brand/adx-icon-tile.svg",
    defaults: ["platformName"],
    version: "abc12345",
};

beforeEach(() => {
    backend.brand = served;
    backend.fail = false;
    backend.calls.length = 0;
    document.documentElement.style.removeProperty("--primary");
    document.documentElement.style.removeProperty("--primary-foreground");
});

describe("the colour maths", () => {
    it("turns #RRGGBB into the H S% L% triple the theme reads, with the foreground beside it", () => {
        expect(hexToHslTriple("#E40209")).toBe("358.1 98.3% 45.1%");
        expect(hexToHslTriple("#ffffff")).toBe("0 0% 100%");
        expect(hexToHslTriple("red")).toBeNull();
        expect(brandCssVariables({ primaryColor: "#E40209" })).toEqual({ "--primary": "358.1 98.3% 45.1%", "--ring": "358.1 98.3% 45.1%" });
        expect(brandCssVariables({ primaryColor: "#E40209", onPrimaryColor: "#FFFFFF" })).toEqual({
            "--primary": "358.1 98.3% 45.1%",
            "--ring": "358.1 98.3% 45.1%",
            "--primary-foreground": "0 0% 100%",
        });
        expect(brandCssVariables({ primaryColor: "nope" })).toEqual({});
    });
});

function Probe() {
    const { brand } = useBrand();
    return <span data-testid="probe">{`${brand.platformName}|${brand.primaryColor}|${brand.version}`}</span>;
}

describe("BrandProvider", () => {
    it("draws DR 11 first, then the served brand, and paints the primary colour and its foreground", async () => {
        render(
            <BrandProvider>
                <Probe />
                <Wordmark height={18} />
                <Mark size={16} inverse />
            </BrandProvider>,
        );
        expect(screen.getByTestId("probe").textContent).toBe("ADX|#E40209|bundled");
        expect(screen.getByTestId("brand-wordmark").getAttribute("src")).toBe("/brand/adx-wordmark-red.svg");
        // A loaded worker can take longer than waitFor's default second to hand the read back.
        await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("ADX|#F5D400|abc12345"), { timeout: 4000 });
        expect(screen.getByTestId("brand-wordmark").getAttribute("src")).toBe("https://api/brand/adx-wordmark-red.svg");
        expect(screen.getByTestId("brand-mark").getAttribute("src")).toBe("https://api/brand/adx-mark-white.svg");
        expect(document.documentElement.style.getPropertyValue("--primary")).toBe(hexToHslTriple("#F5D400"));
        // A pale primary: the ink is written on it, and the theme's foreground follows.
        expect(document.documentElement.style.getPropertyValue("--primary-foreground")).toBe(hexToHslTriple("#0F0F0F"));
        expect(backend.calls[0]).toEqual({ method: "GET", path: "/app/branding" });
    });

    it("QR-12: swaps the tab title's static suffix for the brand's console title, and leaves a title that is not the console's alone", async () => {
        backend.brand = { ...served, console: { title: "ADX Ops" } };
        document.title = "Listings · ADX Admin";
        render(
            <BrandProvider>
                <Probe />
            </BrandProvider>,
        );
        await waitFor(() => expect(document.title).toBe("Listings · ADX Ops"), { timeout: 4000 });
        // Next writes the static suffix again on navigation; the provider follows.
        document.title = "Campaigns · ADX Admin";
        await waitFor(() => expect(document.title).toBe("Campaigns · ADX Ops"));
        document.title = "Something else entirely";
        await new Promise((r) => setTimeout(r, 20));
        expect(document.title).toBe("Something else entirely");
    });

    it("keeps DR 11 when the read fails", async () => {
        backend.fail = true;
        render(
            <BrandProvider>
                <Probe />
            </BrandProvider>,
        );
        await waitFor(() => expect(backend.calls.length).toBe(1));
        expect(screen.getByTestId("probe").textContent).toBe("ADX|#E40209|bundled");
        expect(document.documentElement.style.getPropertyValue("--primary")).toBe(hexToHslTriple("#E40209"));
        expect(document.documentElement.style.getPropertyValue("--primary-foreground")).toBe(hexToHslTriple("#FFFFFF"));
    });
});
