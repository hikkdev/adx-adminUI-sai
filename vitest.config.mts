import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * A test runner for the console.
 *
 * There was none, which is why the advertiser domain is still on fixtures: the
 * rule in `src/lib/api-config.ts` is that a domain flips to live only once every
 * screen showing its records reads from the API, and the failure mode of getting
 * that half-right — a fixture id handed to a live endpoint, 404 on every row — is
 * exactly the kind of thing a test catches and a click-through does not.
 *
 * Deliberately without `@vitejs/plugin-react`. Its current major pulls Babel 8
 * while this project is on Babel 7, and the plugin exists for Fast Refresh,
 * which no test uses. Vitest's own transform compiles the JSX instead, with the
 * automatic runtime the app already targets.
 *
 * The `.mts` extension is load-bearing: this file is ESM, and the nearest
 * package.json has no `"type": "module"`, so a `.ts` config is loaded as
 * CommonJS and warns on every run.
 */
export default defineConfig({
    // Vitest 5 transforms with oxc, not esbuild — setting the esbuild option
    // here is accepted and then ignored, which is the kind of configuration that
    // looks like it works until a `.tsx` file fails to compile.
    oxc: { jsx: { runtime: "automatic" } },
    resolve: {
        alias: {
            // Mirrors the `@/*` path in tsconfig.json. Vitest does not read
            // tsconfig paths on its own, and without this every import in a
            // component under test fails to resolve.
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./vitest.setup.ts"],
        include: ["src/**/*.test.{ts,tsx}"],
        // The Next build output and node_modules are not tests, and scanning
        // them makes a two-second run take twenty.
        exclude: ["node_modules/**", ".next/**"],
        /*
         * Vitest's default is five seconds, which is ample for one file and
         * not for 179 of them: a jsdom is created per file and the run spends
         * ~40% of its time doing that, so under a full-suite load the heaviest
         * screens (the listing creator's pin picker, the employees overview)
         * drift past five seconds and fail as timeouts — a different file each
         * run, which is the signature of load rather than of a broken test.
         * Fifteen seconds is the same answer the two phone suites already
         * carry (`jest.setTimeout(20_000)` on the deep ones) and it keeps a
         * genuinely hung test from hanging the run.
         */
        testTimeout: 15_000,
    },
});
