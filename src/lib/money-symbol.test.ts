import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { formatMoney } from "./format";

/**
 * The rupee sign belongs to the formatter, and to nobody else.
 *
 * `formatMoney` returns "₹1,450.00" — sign included. A screen that writes
 * its own ₹ in front of it draws "₹₹1,450.00", which is what the Priority
 * zones page did until 22 Sep ("₹₹200.00" on the default top-up, "₹₹0.00 of
 * ₹₹25,000.00" against the monthly cap), and the Leads map and a dispute's
 * credit line with it. Nothing typed catches that — both halves are strings —
 * so the source is read instead.
 *
 * What is still fine, and deliberately not matched: a field label that names
 * the unit ("Top-up per activation (₹)"), and `formatINR`, which formats a
 * whole-rupee *number* and carries its own sign through Intl.
 */

const CONSOLE_SRC = join(__dirname, "..");

/** Every `.ts`/`.tsx` under src, tests aside — a test may quote the doubled string to say what it guards against. */
function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
            out.push(...sourceFiles(path));
            continue;
        }
        if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
        out.push(path);
    }
    return out;
}

/** "₹{formatMoney(x)}" in JSX, and "₹${formatMoney(x)}" in a template string. */
const DOUBLED = /₹\s*(\{|\$\{)\s*formatMoney\b/;

describe("the rupee sign", () => {
    it("is the formatter's, and the formatter's alone", () => {
        expect(formatMoney("1450")).toBe("₹1,450.00");
        expect(formatMoney("-1450.50")).toBe("-₹1,450.50");
        expect(formatMoney(null)).toBe("—");
    });

    it("is never written in front of formatMoney anywhere in the console", () => {
        const offenders = sourceFiles(CONSOLE_SRC)
            .filter((path) => DOUBLED.test(readFileSync(path, "utf8")))
            .map((path) => path.slice(CONSOLE_SRC.length + 1).replace(/\\/g, "/"));
        expect(offenders).toEqual([]);
    });
});
