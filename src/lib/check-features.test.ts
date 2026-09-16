import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkFeatures, pagesUnder } from "../../scripts/check-features.mjs";

/**
 * `scripts/check-features.mjs` — the console's manifest check (CG5, answer
 * 144). It runs under `npm run lint`, so what it fails on is what a build
 * fails on: a `page.tsx` under no declared path, a declared path over no
 * page, a key that is not `<area>.<capability>`, a path two keys claim,
 * and a manifest for the wrong surface.
 */

const ok = { surface: "CONSOLE", features: { "console.overview": { paths: ["dashboard"] }, "system.feature-flags": { paths: ["settings/flags"] } } };

describe("checkFeatures", () => {
    it("passes when every page is under a declared path and every path has a page", () => {
        const result = checkFeatures(["dashboard", "settings/flags"], ok);
        expect(result).toEqual({ problems: [], pages: 2, paths: 2, features: 2 });
    });

    it("fails when a page.tsx has no manifest entry, naming the file", () => {
        const { problems } = checkFeatures(["dashboard", "settings/flags", "settings/exports"], ok);
        expect(problems).toEqual([expect.stringContaining("src/app/(admin)/settings/exports/page.tsx belongs to no feature")]);
    });

    it("the longest declared path wins, so a root prefix is the net under finer keys", () => {
        const manifest = {
            surface: "CONSOLE",
            features: { "system.platform-settings": { paths: ["settings"] }, "system.feature-flags": { paths: ["settings/flags"] } },
        };
        expect(checkFeatures(["settings", "settings/flags", "settings/exports"], manifest).problems).toEqual([]);
    });

    it("fails when a declared path has no page — the screen moved, or the manifest is stale", () => {
        const { problems } = checkFeatures(["dashboard"], ok);
        expect(problems).toEqual([expect.stringContaining('"system.feature-flags" names "settings/flags", which has no page')]);
    });

    it("fails on a key that is not <area>.<capability>, an entry with no paths, and the wrong surface", () => {
        const { problems } = checkFeatures(["dashboard"], {
            surface: "APP_USER",
            features: { Overview: { paths: ["dashboard"] }, "console.empty": { paths: [] } },
        });
        expect(problems).toEqual([
            "surface must be CONSOLE, found APP_USER",
            '"Overview" is not <area>.<capability>',
            '"console.empty" names no paths',
        ]);
    });

    it("fails when two keys claim the same path", () => {
        const { problems } = checkFeatures(["dashboard"], {
            surface: "CONSOLE",
            features: { "console.overview": { paths: ["dashboard"] }, "console.home": { paths: ["dashboard"] } },
        });
        expect(problems).toEqual([expect.stringContaining('"dashboard" is named by both')]);
    });
});

describe("pagesUnder", () => {
    let dir: string | null = null;
    afterEach(() => {
        if (dir) rmSync(dir, { recursive: true, force: true });
        dir = null;
    });

    it("finds every page.tsx as a /-joined path, whatever the platform's separator", () => {
        dir = mkdtempSync(join(tmpdir(), "adx-check-features-"));
        for (const page of ["dashboard", "settings/flags", "listings/[id]"]) {
            mkdirSync(join(dir, page), { recursive: true });
            writeFileSync(join(dir, page, "page.tsx"), "export default function Page() { return null; }\n");
        }
        mkdirSync(join(dir, "settings/_removed"), { recursive: true });
        writeFileSync(join(dir, "settings/_removed", "view.tsx"), "");
        expect(pagesUnder(dir)).toEqual(["dashboard", "listings/[id]", "settings/flags"]);
    });
});

describe("the shipped manifest", () => {
    it("covers every page under src/app/(admin) today", async () => {
        const admin = join(process.cwd(), "src", "app", "(admin)");
        const manifest = (await import("../../features.manifest.json")).default;
        expect(checkFeatures(pagesUnder(admin), manifest).problems).toEqual([]);
    });
});
