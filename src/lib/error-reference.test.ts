import { describe, expect, it } from "vitest";
import { errorReference } from "./error-reference";

/**
 * Q-C item 10 — the overlay's reference is a hash over the crash, not a
 * constant. Stable per crash, different per crash, and the shape the
 * support desk asks for.
 */
describe("errorReference", () => {
    const crash = () => {
        const error = new Error("Cannot read properties of null (reading 'filter')");
        error.stack = "TypeError: Cannot read properties of null (reading 'filter')\n    at VerificationQueue (verification-queue.tsx:184:31)";
        return error;
    };

    it("is ERR- and eight hex digits", () => {
        expect(errorReference(crash())).toMatch(/^ERR-[0-9A-F]{8}$/);
    });

    it("is the same for the same crash, however many times the overlay renders", () => {
        expect(errorReference(crash())).toBe(errorReference(crash()));
        expect(errorReference(crash())).toBe(errorReference({ message: crash().message, stack: crash().stack }));
    });

    it("is different for a different crash — another message, or the same message from another place", () => {
        const elsewhere = crash();
        elsewhere.stack = "TypeError: Cannot read properties of null (reading 'filter')\n    at AttemptsTable (attempts-table.tsx:40:12)";
        const other = new Error("Network request failed");
        expect(errorReference(elsewhere)).not.toBe(errorReference(crash()));
        expect(errorReference(other)).not.toBe(errorReference(crash()));
    });

    it("still hashes an error with neither message nor stack", () => {
        expect(errorReference({})).toMatch(/^ERR-[0-9A-F]{8}$/);
    });
});
