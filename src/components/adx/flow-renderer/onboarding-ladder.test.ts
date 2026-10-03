import { describe, expect, it } from "vitest";
import { deskFieldsFor, formStepsFor, ladderAccountType } from "./onboarding-ladder";
import { ONBOARDING_TEMPLATE_FIXTURE } from "./test-fixtures";

/**
 * FL-3: the desk's onboarding forms take their sections from the ladder —
 * the stored template's `form` steps for the party × account type, the
 * code ladder when the row holds none — and what each section collects is
 * the desk's field list per step key.
 */

describe("formStepsFor", () => {
    it("draws the code ladder when there is no template: one details step for an individual, the business and the contact after it otherwise", () => {
        const individual = formStepsFor(null, "PUBLISHER", "INDIVIDUAL");
        expect(individual.source).toBe("code");
        expect(individual.accountTypeTitle).toBe("Account type");
        expect(individual.steps.map((step) => [step.id, step.key, step.title])).toEqual([["publisher-details", "details", "Publisher details"]]);

        expect(formStepsFor(undefined, "PUBLISHER", "BUSINESS").steps.map((step) => step.id)).toEqual(["publisher-details", "business", "contact"]);
        const organisation = formStepsFor(null, "PUBLISHER", "ORGANISATION");
        expect(organisation.steps.map((step) => step.id)).toEqual(["publisher-details", "organisation", "contact"]);
        expect(organisation.steps[1]).toMatchObject({ key: "business", title: "Organisation information" });
        expect(formStepsFor(null, "ADVERTISER", "INDIVIDUAL").steps[0]).toMatchObject({ id: "advertiser-details", title: "Advertiser details" });
    });

    it("follows a stored template's titles and order, and skips a step the library lacks", () => {
        const business = formStepsFor(ONBOARDING_TEMPLATE_FIXTURE, "PUBLISHER", "BUSINESS");
        expect(business.source).toBe("config");
        expect(business.accountTypeTitle).toBe("What kind of account");
        /* The fixture puts the contact before the business. */
        expect(business.steps.map((step) => step.title)).toEqual(["Your details", "Who to reach", "The business"]);
        expect(business.steps.map((step) => step.key)).toEqual(["details", "contact", "business"]);

        const holed = { ...ONBOARDING_TEMPLATE_FIXTURE, ladders: { ...ONBOARDING_TEMPLATE_FIXTURE.ladders, PUBLISHER: { ...ONBOARDING_TEMPLATE_FIXTURE.ladders.PUBLISHER, INDIVIDUAL: ["account-type", "missing", "publisher-details"] } } };
        expect(formStepsFor(holed, "PUBLISHER", "INDIVIDUAL").steps.map((step) => step.id)).toEqual(["publisher-details"]);
    });

    it("falls back to the code ladder when the template names no form step for the pair", () => {
        const empty = { ...ONBOARDING_TEMPLATE_FIXTURE, ladders: { ...ONBOARDING_TEMPLATE_FIXTURE.ladders, PUBLISHER: { ...ONBOARDING_TEMPLATE_FIXTURE.ladders.PUBLISHER, INDIVIDUAL: ["account-type", "kyc-intro"] } } };
        const fallback = formStepsFor(empty, "PUBLISHER", "INDIVIDUAL");
        expect(fallback.source).toBe("code");
        expect(fallback.steps.map((step) => step.id)).toEqual(["publisher-details"]);
    });
});

describe("ladderAccountType", () => {
    it("maps each side's legal form onto the ladder's three account types, individual when unknown", () => {
        expect(ladderAccountType("PUBLISHER", "NGO")).toBe("ORGANISATION");
        expect(ladderAccountType("PUBLISHER", "POLITICAL")).toBe("ORGANISATION");
        expect(ladderAccountType("PUBLISHER", "BUSINESS")).toBe("BUSINESS");
        expect(ladderAccountType("ADVERTISER", "AGENCY")).toBe("BUSINESS");
        expect(ladderAccountType("ADVERTISER", "NGO")).toBe("ORGANISATION");
        expect(ladderAccountType("PUBLISHER", null)).toBe("INDIVIDUAL");
        expect(ladderAccountType("PUBLISHER", "SOMETHING_NEW")).toBe("INDIVIDUAL");
    });
});

describe("deskFieldsFor", () => {
    it("asks the person, and the address with the person for an individual, with the business otherwise", () => {
        const person = deskFieldsFor("details", "INDIVIDUAL", "create").map((field) => field.key);
        expect(person).toEqual(["firstName", "lastName", "mobile", "email", "dateOfBirth", "gender", "address", "city", "state", "postalCode"]);
        expect(deskFieldsFor("details", "BUSINESS", "create").map((field) => field.key)).toEqual(["firstName", "lastName", "mobile", "email", "dateOfBirth", "gender"]);
        expect(deskFieldsFor("business", "BUSINESS", "create").map((field) => field.key)).toEqual(["name", "gstin", "address", "city", "state", "postalCode"]);
        expect(deskFieldsFor("business", "ORGANISATION", "create").find((field) => field.key === "gstin")?.optional).toBe(true);
        expect(deskFieldsFor("business", "BUSINESS", "create").find((field) => field.key === "gstin")?.optional).toBeFalsy();
        expect(deskFieldsFor("contact", "BUSINESS", "create").map((field) => field.key)).toEqual(["contactName", "contactMobile", "contactEmail"]);
        expect(deskFieldsFor("something-else", "BUSINESS", "create")).toEqual([]);
    });
});
