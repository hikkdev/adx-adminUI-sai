import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * QR-11 — Settings › Brand & theme.
 *
 * Pinned: the header says what is live and whether the draft differs; the
 * colour section's buttons (the picker, the per-colour reset, the presets)
 * write the form, and the previews and the legibility checks answer to the
 * form before anything is saved; Save draft is `PUT /branding/draft` with
 * blank-means-DR 11 and refuses a non-hex; Publish shows the flagged
 * checks, sends the note, and re-reads the brand so the console recolours;
 * a logo upload lands on the draft as purpose BRANDING; the history lists
 * the releases with the live one marked and Restore republishes; and
 * without `settings.edit` every write is disabled.
 */

const { backend, auth } = vi.hoisted(() => ({
    backend: {
        view: null as unknown,
        releases: [] as Record<string, unknown>[],
        calls: [] as { method: string; path: string; body?: unknown }[],
        publishFails: null as string | null,
    },
    auth: { can: true },
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            get: async (path: string) => {
                backend.calls.push({ method: "GET", path });
                if (path.startsWith("/branding/releases")) return { rows: backend.releases, total: backend.releases.length, page: 1, pageSize: 50 };
                if (path === "/app/branding") return (backend.view as { live: unknown }).live;
                return backend.view;
            },
            post: async (path: string, body?: unknown) => {
                backend.calls.push({ method: "POST", path, body });
                if (path === "/upload") return { url: "https://cdn/brand/new.svg", id: "f1" };
                if (path === "/branding/publish" && backend.publishFails) throw new actual.ApiError(409, "NOTHING_TO_PUBLISH", backend.publishFails);
                return backend.view;
            },
            put: async (path: string, body?: unknown) => {
                backend.calls.push({ method: "PUT", path, body });
                return backend.view;
            },
            patch: async () => undefined,
            delete: async () => undefined,
        },
    };
});

vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ can: () => auth.can, user: { id: "usr_admin", name: "Admin One" } }),
}));

vi.mock("@/services/integrations", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/integrations")>();
    return { ...actual, integrationsReadApi: () => true };
});

// QR-12: the pixel size a slot reads before uploading — null is what an SVG answers.
const { imageSize } = vi.hoisted(() => ({ imageSize: { value: null as { width: number; height: number } | null } }));
vi.mock("./image-size", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./image-size")>();
    return { ...actual, readImageSize: async () => imageSize.value };
});

import { BrandProvider } from "@/components/adx/brand";
import { BRAND_FALLBACK, brandChecks, type BrandManagerView } from "@/services/branding";
import { BrandLoader } from "./brand-loader";
import { previewOf } from "./brand-view";

const dr11 = { ...BRAND_FALLBACK, version: "dr11" };

const draft = (over: Record<string, string | string[] | null> = {}) => ({
    platformName: null,
    tagline: null,
    primaryColor: null,
    deepColor: null,
    inkColor: null,
    groundColor: null,
    wordmarkUrl: null,
    wordmarkInverseUrl: null,
    markUrl: null,
    markInverseUrl: null,
    iconUrl: null,
    taglines: null,
    heroImageUrl: null,
    ogImageUrl: null,
    faviconUrl: null,
    ...over,
});

const view = (over: Partial<BrandManagerView> = {}): BrandManagerView => ({
    draft: draft(),
    draftBrand: dr11,
    live: dr11,
    release: null,
    dirty: false,
    checks: brandChecks(dr11),
    ...over,
});

const release = (number: number, over: Record<string, unknown> = {}) => ({
    number,
    version: `v${number}`,
    note: null,
    publishedAt: "2026-09-17T06:00:00.000Z",
    publishedBy: { id: "usr_admin", name: "Admin One" },
    platformName: "ADX",
    tagline: "Space that gets seen.",
    colours: { primaryColor: "#E40209", deepColor: "#BD2020", inkColor: "#0F0F0F", groundColor: "#F5F5F5" },
    wordmarkUrl: "/brand/adx-wordmark-red.svg",
    markUrl: "/brand/adx-mark-red.svg",
    live: false,
    ...over,
});

function mount() {
    return render(
        <BrandProvider>
            <BrandLoader />
        </BrandProvider>,
    );
}

const puts = () => backend.calls.filter((c) => c.method === "PUT" && c.path === "/branding/draft");

beforeEach(() => {
    backend.view = view();
    backend.releases = [];
    backend.calls.length = 0;
    backend.publishFails = null;
    auth.can = true;
    imageSize.value = null;
});

describe("the header", () => {
    it("says DR 11 is live and the draft matches until something is drafted", async () => {
        mount();
        await waitFor(() => expect(screen.getByTestId("brand-status")).toBeTruthy());
        expect(screen.getByTestId("brand-status").textContent).toContain("DR 11 as shipped");
        expect(screen.getByText("Draft matches what is live")).toBeTruthy();
        expect((screen.getByTestId("brand-publish-open") as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByTestId("brand-save-draft") as HTMLButtonElement).disabled).toBe(true);
    });

    it("names the live release and offers Publish when the draft differs", async () => {
        backend.view = view({
            draft: draft({ primaryColor: "#8D0B0C" }),
            draftBrand: { ...dr11, primaryColor: "#8D0B0C", version: "draft1" },
            release: release(3, { live: true, note: "Autumn" }),
            dirty: true,
        });
        mount();
        await waitFor(() => expect(screen.getByTestId("brand-status").textContent).toContain("release #3"));
        expect(screen.getByTestId("brand-status").textContent).toContain("Admin One");
        expect(screen.getByTestId("brand-status").textContent).toContain("Autumn");
        expect(screen.getByText("Draft has unpublished changes")).toBeTruthy();
        expect((screen.getByTestId("brand-publish-open") as HTMLButtonElement).disabled).toBe(false);
    });
});

describe("the colours", () => {
    it("the picker, the presets and the reset write the form; the previews and the checks follow before any save", async () => {
        mount();
        await waitFor(() => expect(screen.getByTestId("brand-presets")).toBeTruthy());

        // The preview draws DR 11 to start.
        expect(screen.getByTestId("preview-phone-button").getAttribute("style")).toContain("rgb(228, 2, 9)");
        expect(screen.getByTestId("brand-check-primary-on-ground").getAttribute("data-level")).toBe("ok");

        // The DR 09 preset.
        fireEvent.click(screen.getByTestId("brand-preset-dr09"));
        expect((screen.getByLabelText("Primary colour") as HTMLInputElement).value).toBe("#8D0B0C");
        expect(screen.getByTestId("preview-phone-button").getAttribute("style")).toContain("rgb(141, 11, 12)");
        expect(screen.getByTestId("preview-console-button").getAttribute("style")).toContain("rgb(141, 11, 12)");
        expect(screen.getByText("Unsaved edits")).toBeTruthy();
        expect(puts()).toHaveLength(0);

        // The picker on the swatch.
        fireEvent.change(screen.getByTestId("brand-pick-primaryColor"), { target: { value: "#f7c6c7" } });
        expect((screen.getByLabelText("Primary colour") as HTMLInputElement).value).toBe("#F7C6C7");
        expect(screen.getByTestId("brand-check-primary-on-ground").getAttribute("data-level")).toBe("fail");

        // The per-colour reset back to DR 11.
        fireEvent.click(screen.getByTestId("brand-reset-primaryColor"));
        expect((screen.getByLabelText("Primary colour") as HTMLInputElement).value).toBe("");
        expect(screen.getByTestId("brand-check-primary-on-ground").getAttribute("data-level")).toBe("ok");
        expect((screen.getByTestId("brand-reset-primaryColor") as HTMLButtonElement).disabled).toBe(true);

        // "Deep as primary" takes the effective deep colour.
        fireEvent.click(screen.getByTestId("brand-preset-deep"));
        expect((screen.getByLabelText("Primary colour") as HTMLInputElement).value).toBe("#BD2020");

        // The DR 11 set clears all four.
        fireEvent.change(screen.getByLabelText("Ink colour"), { target: { value: "#333333" } });
        fireEvent.click(screen.getByTestId("brand-preset-dr11"));
        for (const label of ["Primary colour", "Deep colour", "Ink colour", "Ground colour"]) {
            expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe("");
        }
    });

    it("previewOf lays the form over the draft and keeps an invalid partial as it was", () => {
        const base = { ...dr11, primaryColor: "#8D0B0C" };
        const form = {
            platformName: "",
            tagline: " Own it ",
            colours: { primaryColor: "#12", deepColor: "", inkColor: "#111111", groundColor: "" },
            taglines: "One\n\nTwo ",
            consoleTitle: " ADX Ops ",
            siteTitle: "",
            siteDescription: "Short.",
        };
        const p = previewOf(base, form);
        expect(p.primaryColor).toBe("#8D0B0C");
        expect(p.deepColor).toBe("#BD2020");
        expect(p.inkColor).toBe("#111111");
        expect(p.tagline).toBe("Own it");
        expect(p.website.taglines).toEqual(["One", "Two"]);
        expect(p.onPrimaryColor).toBe("#FFFFFF");
        // QR-12: the per-surface words ride along, DR 11's where blank.
        expect(p.console.title).toBe("ADX Ops");
        expect(p.website.title).toBe(BRAND_FALLBACK.website.title);
        expect(p.website.description).toBe("Short.");
    });
});

describe("saving and publishing", () => {
    it("saves the draft with blank-means-DR 11, and refuses a non-hex", async () => {
        mount();
        await waitFor(() => expect(screen.getByLabelText("Tagline")).toBeTruthy());
        fireEvent.change(screen.getByLabelText("Tagline"), { target: { value: "Real world. Real reach." } });
        fireEvent.change(screen.getByLabelText("Primary colour"), { target: { value: "red" } });
        fireEvent.click(screen.getByTestId("brand-save-draft"));
        expect(puts()).toHaveLength(0);

        fireEvent.change(screen.getByLabelText("Primary colour"), { target: { value: "#8D0B0C" } });
        fireEvent.change(screen.getByLabelText("Website taglines"), { target: { value: "Own the city.\nReal world." } });
        fireEvent.change(screen.getByLabelText("Console title"), { target: { value: " ADX Ops " } });
        fireEvent.click(screen.getByTestId("brand-save-draft"));
        await waitFor(() => expect(puts()).toHaveLength(1));
        expect(puts()[0]!.body).toEqual({
            platformName: null,
            tagline: "Real world. Real reach.",
            primaryColor: "#8D0B0C",
            deepColor: null,
            inkColor: null,
            groundColor: null,
            taglines: ["Own the city.", "Real world."],
            consoleTitle: "ADX Ops",
            siteTitle: null,
            siteDescription: null,
        });
        // The page re-reads after the save (a tick after the PUT resolves — so waited for, not asserted flat).
        await waitFor(() => expect(backend.calls.filter((c) => c.method === "GET" && c.path === "/branding").length).toBe(2));
    });

    it("publish shows the flagged checks, sends the note, and re-reads the brand", async () => {
        const pastel = { ...dr11, primaryColor: "#F7C6C7", version: "pastel" };
        backend.view = view({ draft: draft({ primaryColor: "#F7C6C7" }), draftBrand: pastel, dirty: true, checks: brandChecks(pastel) });
        mount();
        await waitFor(() => expect((screen.getByTestId("brand-publish-open") as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByTestId("brand-publish-open"));
        const warnings = await screen.findByTestId("brand-publish-warnings");
        expect(warnings.textContent).toContain("Links and icons on the page");
        expect(screen.getByTestId("brand-publish-confirm").textContent).toBe("Publish anyway");

        fireEvent.change(screen.getByLabelText("Release note"), { target: { value: "Pastel trial" } });
        backend.view = view({ draftBrand: pastel, live: pastel, release: release(1, { live: true, note: "Pastel trial" }), dirty: false });
        fireEvent.click(screen.getByTestId("brand-publish-confirm"));
        await waitFor(() => expect(backend.calls).toContainEqual({ method: "POST", path: "/branding/publish", body: { note: "Pastel trial" } }));
        // The console's own brand is re-read so it recolours at once.
        await waitFor(() => expect(backend.calls.filter((c) => c.path === "/app/branding").length).toBeGreaterThanOrEqual(2));
        await waitFor(() => expect(screen.getByTestId("brand-status").textContent).toContain("release #1"));
    });

    it("says why a publish was refused", async () => {
        backend.view = view({ dirty: true, draftBrand: { ...dr11, version: "x" } });
        backend.publishFails = "The draft is what is live already — change something first.";
        mount();
        await waitFor(() => expect((screen.getByTestId("brand-publish-open") as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByTestId("brand-publish-open"));
        fireEvent.click(await screen.findByTestId("brand-publish-confirm"));
        await waitFor(() => expect(backend.calls.some((c) => c.path === "/branding/publish")).toBe(true));
        // The dialog stays; nothing was re-read as published.
        expect(screen.getByTestId("brand-publish-confirm")).toBeTruthy();
    });
});

describe("the files", () => {
    it("uploads a logo as BRANDING and lands its URL on the draft", async () => {
        mount();
        await waitFor(() => expect(screen.getByLabelText("Replace the wordmark")).toBeTruthy());
        const input = screen.getByLabelText("Replace the wordmark") as HTMLInputElement;
        fireEvent.change(input, { target: { files: [new File(["<svg/>"], "wordmark.svg", { type: "image/svg+xml" })] } });
        await waitFor(() => expect(puts()).toHaveLength(1));
        const upload = backend.calls.find((c) => c.method === "POST" && c.path === "/upload");
        expect((upload!.body as FormData).get("purpose")).toBe("BRANDING");
        expect(puts()[0]!.body).toEqual({ wordmarkUrl: "https://cdn/brand/new.svg" });
    });

    it("the website kit's images upload the same way, and Back to DR 11 clears one", async () => {
        backend.view = view({ draft: draft({ heroImageUrl: "https://cdn/hero.jpg" }), draftBrand: { ...dr11, website: { ...dr11.website, heroImageUrl: "https://cdn/hero.jpg" } } });
        mount();
        await waitFor(() => expect(screen.getByTestId("brand-logo-heroImageUrl")).toBeTruthy());
        const slot = within(screen.getByTestId("brand-logo-heroImageUrl"));
        fireEvent.click(slot.getByText("Back to DR 11"));
        await waitFor(() => expect(puts()).toHaveLength(1));
        expect(puts()[0]!.body).toEqual({ heroImageUrl: null });
    });
});

describe("the sizes (QR-12)", () => {
    it("refuses a raster file that is not the size its slot needs, before anything uploads", async () => {
        mount();
        await waitFor(() => expect(screen.getByLabelText("Replace the app icon (launcher)")).toBeTruthy());
        const input = screen.getByLabelText("Replace the app icon (launcher)") as HTMLInputElement;
        const png = () => new File(["png"], "icon.png", { type: "image/png" });

        imageSize.value = { width: 512, height: 512 };
        fireEvent.change(input, { target: { files: [png()] } });
        await new Promise((r) => setTimeout(r, 20));
        expect(backend.calls.some((c) => c.path === "/upload")).toBe(false);
        expect(puts()).toHaveLength(0);

        imageSize.value = { width: 1024, height: 1024 };
        fireEvent.change(input, { target: { files: [png()] } });
        await waitFor(() => expect(puts()).toHaveLength(1));
        expect(puts()[0]!.body).toEqual({ appIconUrl: "https://cdn/brand/new.svg" });

        // The share card must be exactly 1200 × 630.
        imageSize.value = { width: 1200, height: 628 };
        fireEvent.change(screen.getByLabelText("Replace the share card"), { target: { files: [png()] } });
        await new Promise((r) => setTimeout(r, 20));
        expect(puts()).toHaveLength(1);
    });

    it("lays the page out as shared identity, apps, admin panel and website, each with its spec and what it draws", async () => {
        mount();
        await waitFor(() => expect(screen.getByTestId("brand-section-shared")).toBeTruthy());
        for (const id of ["brand-section-apps", "brand-section-console", "brand-section-website"]) expect(screen.getByTestId(id)).toBeTruthy();
        // The shared logo files live in the shared section; the app icon in Apps; the kit in Website.
        expect(within(screen.getByTestId("brand-section-shared")).getByTestId("brand-logo-wordmarkUrl")).toBeTruthy();
        expect(within(screen.getByTestId("brand-section-apps")).getByTestId("brand-logo-appIconUrl")).toBeTruthy();
        expect(within(screen.getByTestId("brand-section-website")).getByTestId("brand-logo-ogImageUrl")).toBeTruthy();
        // The instructions: size, format, proportions and where it is drawn.
        expect(screen.getByTestId("brand-spec-appIconUrl").textContent).toContain("1024 × 1024");
        expect(screen.getByTestId("brand-spec-wordmarkUrl").textContent).toContain("2.71 : 1");
        expect(screen.getByTestId("brand-spec-wordmarkUrl").textContent).toContain("Admin panel:");
        expect(screen.getByTestId("brand-drawn-admin-panel").textContent).toContain("header 18 px");
        expect(screen.getByTestId("brand-drawn-website").textContent).toContain("Share card");
        // Each surface carries its own preview.
        expect(within(screen.getByTestId("brand-section-apps")).getByTestId("preview-phone")).toBeTruthy();
        expect(within(screen.getByTestId("brand-section-console")).getByTestId("preview-console")).toBeTruthy();
        expect(within(screen.getByTestId("brand-section-website")).getByTestId("preview-website")).toBeTruthy();
    });
});

describe("the history", () => {
    it("lists the releases with the live one marked, and Restore republishes an old one", async () => {
        backend.view = view({ release: release(2, { live: true }) });
        backend.releases = [release(2, { live: true }), release(1, { note: "First cut", colours: { primaryColor: "#8D0B0C", deepColor: "#BD2020", inkColor: "#0F0F0F", groundColor: "#F5F5F5" } })];
        mount();
        await waitFor(() => expect(screen.getByTestId("brand-history-open")).toBeTruthy());
        fireEvent.click(screen.getByTestId("brand-history-open"));
        const two = await screen.findByTestId("brand-release-2");
        expect(within(two).getByText("Live")).toBeTruthy();
        expect(within(two).queryByTestId("brand-restore-2")).toBeNull();
        const one = screen.getByTestId("brand-release-1");
        expect(one.textContent).toContain("First cut");

        fireEvent.click(screen.getByTestId("brand-restore-1"));
        fireEvent.click(await screen.findByTestId("brand-restore-confirm"));
        await waitFor(() => expect(backend.calls).toContainEqual({ method: "POST", path: "/branding/releases/1/restore", body: {} }));
        // The brand and the history are re-read.
        await waitFor(() => expect(backend.calls.filter((c) => c.path.startsWith("/branding/releases?")).length).toBe(2));
    });
});

describe("without settings.edit", () => {
    it("every write is disabled and the picker is inert", async () => {
        auth.can = false;
        backend.view = view({ dirty: true, draftBrand: { ...dr11, version: "y" } });
        mount();
        await waitFor(() => expect(screen.getByTestId("brand-presets")).toBeTruthy());
        expect((screen.getByTestId("brand-publish-open") as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByTestId("brand-preset-dr09") as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByLabelText("Primary colour") as HTMLInputElement).disabled).toBe(true);
        expect((screen.getByLabelText("Pick the primary colour") as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByLabelText("Replace the wordmark") as HTMLInputElement).disabled).toBe(true);
    });
});
