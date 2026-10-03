import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-client";
import {
    UPI_CHECK_DESCRIPTION,
    UPI_CHECK_LABEL,
    upiCheckFailure,
    upiCheckOptions,
    ENCRYPTION_KEY_MISSING,
    PROVIDER_FAILED,
    backupOffer,
    breakerChanged,
    compositeProblem,
    integrationSaveError,
    methodWord,
    onlineCheckMeta,
    onlineProviderOf,
    onlineWordOf,
    pennyDropRefusal,
    resendRefusal,
    resendToastTitle,
    routeChanged,
    routeProblem,
    routingDraftOf,
    routingDraftProblem,
    routingPatch,
    secureIdDraftOf,
    secureIdPatch,
    stepsChanged,
    type SecureIdSettings,
    type VerificationRoutingSettings,
} from "./verification";

/**
 * Cashfree Phase 2 — the desk's vocabulary for the verification layer.
 *
 * What is pinned: PROVIDER_FAILED is never printed raw anywhere a method
 * or status is drawn; a record the backup ran reads "Cashfree"; a desk
 * start's `details.backup` is read only when it says `available: true`;
 * the penny drop's two new refusals are said in the desk's words; and the
 * two settings sections send strict, minimal patches.
 */

describe("the provider on a record", () => {
    it("reads CASHFREE and DIGIO off `method`, and nothing else as online", () => {
        expect(onlineProviderOf("CASHFREE")).toBe("CASHFREE");
        expect(onlineProviderOf("DIGIO")).toBe("DIGIO");
        expect(onlineProviderOf("MANUAL")).toBeNull();
        expect(onlineProviderOf(null)).toBeNull();
    });

    it("never prints PROVIDER_FAILED raw — it reads \"Digio couldn't be reached\"", () => {
        expect(onlineCheckMeta("DIGIO", PROVIDER_FAILED)).toEqual({ label: "Digio couldn't be reached", tone: "warning" });
        expect(methodWord("MANUAL", PROVIDER_FAILED)).toBe("Digio couldn't be reached");
        expect(onlineWordOf({ provider: "DIGIO", status: PROVIDER_FAILED })).toBe("Digio couldn't be reached");
        for (const meta of [onlineCheckMeta("DIGIO", PROVIDER_FAILED), onlineCheckMeta("CASHFREE", PROVIDER_FAILED)]) expect(meta.label).not.toContain(PROVIDER_FAILED);
    });

    it("names the provider that ran the check — Cashfree on the backup, Digio otherwise", () => {
        expect(onlineCheckMeta("CASHFREE", "approved")).toEqual({ label: "Cashfree · approved", tone: "success" });
        expect(onlineCheckMeta("DIGIO", "rejected")).toEqual({ label: "Digio · rejected", tone: "danger" });
        expect(onlineCheckMeta(undefined, "pending")).toEqual({ label: "Digio · waiting", tone: "warning" });
        expect(methodWord("CASHFREE", "pending")).toBe("Cashfree");
        expect(methodWord("MANUAL", null)).toBeNull();
        expect(onlineWordOf(null)).toBeNull();
    });
});

describe("the backup offer on a desk start's failure", () => {
    it("is read off `details.backup` only when it says available", () => {
        const offered = new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "Digio is not answering", {
            provider: "DIGIO",
            reason: "PROVIDER_ERROR",
            backup: { available: true, caseType: "PUBLISHER_KYC", caseId: "pub_1" },
        });
        expect(backupOffer(offered)).toEqual({ caseType: "PUBLISHER_KYC", caseId: "pub_1" });
        expect(backupOffer(new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "x", { reason: "PROVIDER_ERROR" }))).toBeNull();
        expect(backupOffer(new ApiError(503, "KYC_PROVIDER_UNAVAILABLE", "x", { backup: { available: false, caseType: "PUBLISHER_KYC", caseId: "pub_1" } }))).toBeNull();
        expect(backupOffer(new Error("boom"))).toBeNull();
    });

    it("says the resend's outcome and its refusals in the desk's words", () => {
        expect(resendToastTitle(true)).toBe("Sent — they've been notified.");
        expect(resendToastTitle(false)).toBe("Sent — they have no app account yet, so tell them yourself.");
        expect(resendRefusal(new ApiError(409, "BACKUP_NOT_AVAILABLE", "The backup provider is switched off.", { reason: "SWITCHED_OFF" }))).toBe("The backup provider is switched off.");
        expect(resendRefusal(new ApiError(409, "KYC_ALREADY_VERIFIED", "This account is already verified; there is nothing to send"))).toContain("already verified");
        expect(resendRefusal(new ApiError(404, "NOT_FOUND", "No such account"))).toBe("This account is no longer there.");
    });
});

describe("the penny drop's refusals", () => {
    it("says a UPI id can't be checked yet, naming where to choose a check when none is chosen", () => {
        const notChosen = new ApiError(409, "UPI_CHECK_NOT_CONFIGURED", "x", { upiCheck: "NONE", reason: "NOT_CHOSEN" });
        expect(pennyDropRefusal(notChosen)).toBe("UPI IDs can't be checked from the desk yet — not until a UPI check is chosen in Settings › Integrations › Verification routing.");
        const holder = new ApiError(409, "UPI_CHECK_NOT_CONFIGURED", "x", { upiCheck: "PENNY_DROP", reason: "NEEDS_ACCOUNT_HOLDER" });
        expect(pennyDropRefusal(holder)).toMatch(/^UPI IDs can't be checked from the desk yet\./);
    });

    it("says a bank method has nothing to check, and leaves every other failure alone", () => {
        expect(pennyDropRefusal(new ApiError(409, "VERIFICATION_UNAVAILABLE", "x", { code: "NOTHING_TO_CHECK" }))).toBe("This method is missing what the check needs: an account number and IFSC, or a UPI ID.");
        expect(pennyDropRefusal(new ApiError(409, "VERIFICATION_UNAVAILABLE", "Cashfree says the account is closed", { code: "INVALID" }))).toBeNull();
        expect(pennyDropRefusal(new Error("x"))).toBeNull();
    });
});

describe("the UPI check (2 Oct 2026)", () => {
    it("offers Digio's lookup first, in plain words, and keeps a value the console does not know", () => {
        expect(UPI_CHECK_LABEL.VPA_LOOKUP).toBe("Digio UPI lookup (recommended)");
        expect(UPI_CHECK_LABEL.PENNY_DROP).toBe("Cashfree ₹1 UPI transaction (needs the person's consent)");
        expect(UPI_CHECK_LABEL.REVERSE_PENNY_DROP).toBe("Reverse penny drop (the person pays ₹1)");
        expect(UPI_CHECK_LABEL.NONE).toBe("Don't check UPI IDs");
        expect(UPI_CHECK_DESCRIPTION.VPA_LOOKUP).toBe("Looks the UPI ID up with Digio: active or not, and the name on the account. No money moves.");
        expect(upiCheckOptions(["NONE", "PENNY_DROP", "REVERSE_PENNY_DROP", "VPA_LOOKUP"])).toEqual(["VPA_LOOKUP", "PENNY_DROP", "REVERSE_PENNY_DROP", "NONE"]);
        expect(upiCheckOptions([])).toEqual(["VPA_LOOKUP", "PENNY_DROP", "REVERSE_PENNY_DROP", "NONE"]);
        expect(upiCheckOptions(["NONE", "FUTURE"])).toEqual(["NONE", "FUTURE"]);
    });

    it("reads a Check UPI ID that did not verify: the answer on details.check and the backend's sentence", () => {
        const check = { check: "UPI_VPA", outcome: "NAME_MISMATCH", provider: "DIGIO", providerLabel: "Digio", nameAtBank: "RAVI KUMAR", nameMatchScore: 35, failureCode: "NAME_MISMATCH", message: "m", checkedAt: "2026-10-02T10:00:00.000Z" };
        expect(upiCheckFailure(new ApiError(409, "VERIFICATION_UNAVAILABLE", "The name does not match.", { code: "NAME_MISMATCH", check }))).toEqual({ check, message: "The name does not match." });
        expect(upiCheckFailure(new ApiError(503, "VERIFICATION_UNAVAILABLE", "Could not be checked.", { code: "UNAVAILABLE" }))).toEqual({ check: null, message: "Could not be checked." });
        expect(upiCheckFailure(new ApiError(409, "VERIFICATION_UNAVAILABLE", "x", { code: "NOTHING_TO_CHECK" }))).toBeNull();
        expect(upiCheckFailure(new ApiError(409, "UPI_CHECK_NOT_CONFIGURED", "x", { upiCheck: "NONE", reason: "NOT_CHOSEN" }))).toBeNull();
        expect(upiCheckFailure(new Error("x"))).toBeNull();
    });
});

const secureId = (over: Partial<SecureIdSettings> = {}): SecureIdSettings => ({
    clientId: "CF10001",
    clientSecret: "••••1234",
    publicKey: "••••",
    publicKeyFingerprint: "0123456789abcdef",
    testMode: true,
    configured: true,
    signing: "PUBLIC_KEY",
    baseUrl: "https://sandbox.cashfree.com/verification",
    source: "SETTINGS",
    ...over,
});

describe("the Secure ID patch", () => {
    it("sends nothing for an untouched form, and a blank secret or PEM keeps what is stored", () => {
        expect(secureIdPatch(secureId(), secureIdDraftOf(secureId()))).toEqual({});
    });

    it("sends what was typed, null to remove the PEM, and the mode when it moved", () => {
        const draft = { ...secureIdDraftOf(secureId()), clientId: "CF20002", clientSecret: "cfsk_new", testMode: false };
        expect(secureIdPatch(secureId(), draft)).toEqual({ clientId: "CF20002", clientSecret: "cfsk_new", testMode: false });
        expect(secureIdPatch(secureId(), { ...secureIdDraftOf(secureId()), removePublicKey: true })).toEqual({ publicKey: null });
        expect(secureIdPatch(secureId(), { ...secureIdDraftOf(secureId()), publicKey: "-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----\n" })).toEqual({
            publicKey: "-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----",
        });
    });

    it("names the missing encryption key, and a 400's own sentence otherwise", () => {
        expect(integrationSaveError(new ApiError(503, "ENCRYPTION_KEY_MISSING", "x"), "fallback")).toBe(ENCRYPTION_KEY_MISSING);
        expect(integrationSaveError(new ApiError(400, "VALIDATION_ERROR", "Invalid", { fieldErrors: { publicKey: ["The public key does not parse as an RSA public key"] } }), "fallback")).toBe(
            "The public key does not parse as an RSA public key"
        );
    });
});

const routing = (): VerificationRoutingSettings => ({
    checks: {
        PAN: { primary: "CASHFREE_SECURE_ID", fallbacks: [] },
        BANK_ACCOUNT: { primary: "CASHFREE_SECURE_ID", fallbacks: [] },
        UPI_VPA: { primary: "CASHFREE_SECURE_ID", fallbacks: [] },
        GSTIN: { primary: "CASHFREE_SECURE_ID", fallbacks: [] },
        VEHICLE_RC: { primary: "CASHFREE_SECURE_ID", fallbacks: [] },
        DRIVING_LICENCE: { primary: "CASHFREE_SECURE_ID", fallbacks: [] },
        FACE_LIVENESS: { primary: "CASHFREE_SECURE_ID", fallbacks: [] },
        FACE_MATCH: { primary: "CASHFREE_SECURE_ID", fallbacks: [] },
        NAME_MATCH: { primary: "CASHFREE_SECURE_ID", fallbacks: [] },
        DIGILOCKER: { primary: "CASHFREE_SECURE_ID", fallbacks: [] },
        HOSTED_KYC: { primary: "DIGIO", fallbacks: ["CASHFREE_SECURE_ID"] },
    },
    breaker: { failures: 5, windowMinutes: 10, cooldownMinutes: 5 },
    composites: {
        AGENT: [
            { step: "DIGILOCKER", required: true },
            { step: "FACE_LIVENESS", required: true },
            { step: "FACE_MATCH", required: true },
            { step: "BANK_ACCOUNT", required: true },
            { step: "NAME_MATCH", required: true },
        ],
        "PUBLISHER.INDIVIDUAL": [
            { step: "DIGILOCKER", required: true },
            { step: "BANK_ACCOUNT", required: true },
        ],
    },
    nameMatchMin: 80,
    upiCheck: "NONE",
    hostedKycBackup: "OFF",
    catalogue: {
        checks: ["PAN", "BANK_ACCOUNT", "UPI_VPA", "GSTIN", "VEHICLE_RC", "DRIVING_LICENCE", "FACE_LIVENESS", "FACE_MATCH", "NAME_MATCH", "DIGILOCKER", "HOSTED_KYC"],
        providers: [
            { name: "DIGIO", label: "Digio", capabilities: ["HOSTED_KYC"] },
            {
                name: "CASHFREE_SECURE_ID",
                label: "Cashfree Secure ID",
                capabilities: ["PAN", "BANK_ACCOUNT", "UPI_VPA", "GSTIN", "VEHICLE_RC", "DRIVING_LICENCE", "FACE_LIVENESS", "FACE_MATCH", "NAME_MATCH", "DIGILOCKER", "HOSTED_KYC"],
            },
        ],
        steps: ["DIGILOCKER", "FACE_LIVENESS", "FACE_MATCH", "DRIVING_LICENCE", "VEHICLE_RC", "PAN", "GSTIN", "PAPERS", "BANK_ACCOUNT", "NAME_MATCH"],
        upiChecks: ["NONE", "PENNY_DROP", "REVERSE_PENNY_DROP"],
    },
});

describe("the routing patch and its rules", () => {
    it("sends only what moved, per key, and null for a reset", () => {
        const stored = routing();
        const draft = routingDraftOf(stored);
        expect(routingPatch(stored, draft)).toEqual({});

        draft.hostedKycBackup = "ON";
        draft.checks.PAN = null;
        draft.breaker = { ...draft.breaker, failures: 3 };
        draft.composites.AGENT = null;
        draft.composites["PUBLISHER.INDIVIDUAL"] = [{ step: "BANK_ACCOUNT", required: false }];
        draft.nameMatchMin = 85;
        draft.upiCheck = "PENNY_DROP";
        expect(routingPatch(stored, draft)).toEqual({
            hostedKycBackup: "ON",
            checks: { PAN: null },
            breaker: { failures: 3 },
            composites: { AGENT: null, "PUBLISHER.INDIVIDUAL": [{ step: "BANK_ACCOUNT", required: false }] },
            nameMatchMin: 85,
            upiCheck: "PENNY_DROP",
        });
    });

    it("skips a reset of a row already on its default, and still sends one that differs", () => {
        const stored = { ...routing(), defaults: { checks: routing().checks, breaker: routing().breaker, composites: routing().composites, nameMatchMin: 80 } };
        stored.checks = { ...stored.checks, PAN: { primary: "CASHFREE_SECURE_ID", fallbacks: [] }, GSTIN: { primary: "DIGIO", fallbacks: [] } };
        const draft = routingDraftOf(stored);
        draft.checks.PAN = null;
        draft.checks.GSTIN = null;
        expect(routingPatch(stored, draft)).toEqual({ checks: { GSTIN: null } });
        expect(routeChanged(stored.defaults, "GSTIN", stored.checks.GSTIN)).toBe(true);
        expect(routeChanged(stored.defaults, "PAN", stored.checks.PAN)).toBe(false);
        expect(routeChanged(undefined, "GSTIN", stored.checks.GSTIN)).toBe(false);
        expect(stepsChanged(stored.defaults, "AGENT", [{ step: "PAN", required: true }])).toBe(true);
        expect(breakerChanged(stored.defaults, { failures: 5, windowMinutes: 10, cooldownMinutes: 5 })).toBe(false);
    });

    it("refuses more than two fallbacks, a fallback that is the primary, a provider that can't answer, and a step twice", () => {
        expect(routeProblem({ primary: "DIGIO", fallbacks: ["DIGIO"] }, ["DIGIO", "CASHFREE_SECURE_ID"])).toBe("A fallback can't be the primary.");
        expect(routeProblem({ primary: "DIGIO", fallbacks: ["CASHFREE_SECURE_ID", "CASHFREE_SECURE_ID", "DIGIO"] }, ["DIGIO", "CASHFREE_SECURE_ID"])).toBe("At most two fallbacks.");
        expect(routeProblem({ primary: "DIGIO", fallbacks: [] }, ["CASHFREE_SECURE_ID"])).toBe("That provider can't answer this check.");
        expect(routeProblem({ primary: "DIGIO", fallbacks: ["CASHFREE_SECURE_ID"] }, ["DIGIO", "CASHFREE_SECURE_ID"])).toBeNull();
        expect(compositeProblem([{ step: "PAN", required: true }, { step: "PAN", required: false }])).toBe("A step can appear only once.");
        expect(compositeProblem([])).toBe("Keep at least one step, or reset to the default.");

        const stored = routing();
        const draft = routingDraftOf(stored);
        draft.checks.PAN = { primary: "DIGIO", fallbacks: [] };
        expect(routingDraftProblem(stored, draft)).toBe("PAN: That provider can't answer this check.");
    });
});
