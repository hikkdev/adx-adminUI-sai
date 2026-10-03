import { describe, expect, it } from "vitest";
import { describeMissing, missingPermissionsOf, permissionLabel } from "./permissions";

/**
 * RP-2 — a 403 names the permission the role lacks, the way the Roles tab
 * names it, so the operator can ask for exactly that.
 */
describe("permissionLabel", () => {
    it("reads a tier as the Roles tab does, keeping an acronym's case", () => {
        expect(permissionLabel("finance.approve")).toBe("Approve finance");
        expect(permissionLabel("kyc.view")).toBe("View KYC");
        expect(permissionLabel("supply.edit")).toBe("Edit publishers and listings");
        expect(permissionLabel("print.view")).toBe("View print partners");
        expect(permissionLabel("pricing.approve")).toBe("Approve pricing");
    });

    it("leaves a named capability as its id", () => {
        expect(permissionLabel("system.roles")).toBe("system.roles");
        expect(permissionLabel("hr.salary.view")).toBe("hr.salary.view");
    });
});

describe("describeMissing", () => {
    it("names one, and lists several", () => {
        expect(describeMissing(["finance.approve"])).toBe(
            "Your role does not hold the permission this needs: Approve finance. Ask a super admin to add it."
        );
        expect(describeMissing(["finance.view", "kyc.edit", "system.roles"])).toContain("View finance, Edit KYC and system.roles");
    });
});

describe("missingPermissionsOf", () => {
    it("reads the ids off a 403's details and nothing else", () => {
        expect(missingPermissionsOf({ missing: ["finance.approve", 4, "kyc.edit"] })).toEqual(["finance.approve", "kyc.edit"]);
        expect(missingPermissionsOf({ fieldErrors: {} })).toEqual([]);
        expect(missingPermissionsOf(undefined)).toEqual([]);
    });
});
