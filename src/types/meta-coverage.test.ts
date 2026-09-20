import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { KNOWN_DEBT, SCHEMA_PATH, parseEnums } from "../../scripts/check-contract.mjs";

/**
 * R-C: the six Lot Q debts closed at the source, pinned against the enum
 * list the contract check itself reads (`prisma/schema.prisma` in the
 * sibling backend). Each record below is walked value by value: every
 * enum value has a label and a tone, and no key is left over — so a value
 * the backend grows fails here, not in a badge that reads `undefined`.
 *
 * The check-contract script covers the same ground over the source text;
 * this reads the records as compiled, so a key the regexes could miss
 * (a spread, a computed key) is still counted. Skipped, not failed, when
 * the backend is not checked out beside the console.
 */

import { KYC_CASE_STATUS_META, PARTY_LABELS, PARTY_ORDER, VERIFICATION_REVIEW_META, WALLET_ENTRY_META } from "@/types";
import { ACCOUNT_ACTIVITY_KIND_LABEL } from "@/services/publishers";

const schemaFile = join(process.cwd(), SCHEMA_PATH);
const present = existsSync(schemaFile);
const enums = present ? parseEnums(readFileSync(schemaFile, "utf8")) : new Map<string, string[]>();
const run = present ? it : it.skip;

const TONES = new Set(["success", "warning", "danger", "info", "neutral"]);

function values(name: string): string[] {
    const list = enums.get(name);
    if (!list) throw new Error(`schema.prisma defines no enum ${name}`);
    return list;
}

function coversWhole(record: Record<string, unknown>, enumName: string) {
    const expected = values(enumName);
    expect([...Object.keys(record)].sort()).toEqual([...expected].sort());
    for (const value of expected) {
        const entry = record[value];
        expect(entry, `${enumName}.${value}`).toBeDefined();
        if (typeof entry === "object" && entry !== null) {
            const meta = entry as { label?: unknown; tone?: unknown };
            expect(typeof meta.label, `${enumName}.${value}.label`).toBe("string");
            expect((meta.label as string).length).toBeGreaterThan(0);
            expect(TONES.has(meta.tone as string), `${enumName}.${value}.tone = ${String(meta.tone)}`).toBe(true);
        } else {
            expect(typeof entry).toBe("string");
            expect((entry as string).length).toBeGreaterThan(0);
        }
    }
}

describe("the *_META / *_LABEL records closed in R-C, against the backend's enums", () => {
    run("KYC_CASE_STATUS_META is keyed on KycStatus whole — the lowercase case vocabulary is gone", () => {
        coversWhole(KYC_CASE_STATUS_META, "KycStatus");
        expect(KYC_CASE_STATUS_META.PENDING.label).toBe("Awaiting review");
        expect(KYC_CASE_STATUS_META.VERIFIED.tone).toBe("success");
        expect(KYC_CASE_STATUS_META.REJECTED.tone).toBe("danger");
    });

    run("PARTY_LABELS names all eighteen series of PartyType, and PARTY_ORDER lists each once", () => {
        coversWhole(PARTY_LABELS, "PartyType");
        expect([...PARTY_ORDER].sort()).toEqual([...values("PartyType")].sort());
        expect(new Set(PARTY_ORDER).size).toBe(PARTY_ORDER.length);
    });

    run("WALLET_ENTRY_META covers WalletEntryType whole, the earning side with the right tones", () => {
        coversWhole(WALLET_ENTRY_META, "WalletEntryType");
        expect(WALLET_ENTRY_META.EARNING.tone).toBe("success");
        expect(WALLET_ENTRY_META.PENALTY.tone).toBe("danger");
        expect(WALLET_ENTRY_META.EXPIRY.tone).toBe("warning");
        expect(WALLET_ENTRY_META.PACKAGE_DEBIT.label).toBe("Package");
    });

    run("VERIFICATION_REVIEW_META speaks the wire's ACCEPTED, never APPROVED", () => {
        coversWhole(VERIFICATION_REVIEW_META, "VerificationStatus");
        expect(VERIFICATION_REVIEW_META.ACCEPTED.tone).toBe("success");
        expect("APPROVED" in VERIFICATION_REVIEW_META).toBe(false);
    });

    run("ACCOUNT_ACTIVITY_KIND_LABEL names the five kinds of AccountActivityKind", () => {
        coversWhole(ACCOUNT_ACTIVITY_KIND_LABEL, "AccountActivityKind");
    });

    it("the script's known-debt list carries no enum or union finding — R-C closed those; what remains is S-C's response-shape debt, one route each", () => {
        const shape = /^services\/[\w-]+\.ts:\d+: (GET|POST|PATCH|PUT) \S+ answers .+, but the backend's response \(\w+\) never carries \[.+\] — /;
        for (const entry of KNOWN_DEBT) expect(entry).toMatch(shape);
        expect(new Set(KNOWN_DEBT).size).toBe(KNOWN_DEBT.length);
    });
});
