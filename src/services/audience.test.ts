import { describe, expect, it } from "vitest";

/**
 * The audience vocabulary — Y-C over Y-B.
 *
 * What is pinned: the policy patch is a per-key diff (the backend merges
 * it over the stored policy, so a restatement would audit a change that
 * never happened); the preview says in one line what the seam will do,
 * per group, and knows when a vendor named as primary is off; the
 * integrations patch carries the set whole when it moved, never the
 * legacy `provider`; the agreement is said as a distance; the period
 * picker is the last three months, this one first.
 *
 * AC-C: the GeoIQ variable map is one record — built from the named rows
 * and the affinity rows, blanks left out, sent whole only when it moved;
 * a half-filled or ill-named affinity row is refused before the round
 * trip; and the vendor test's verdict is said in one plain sentence per
 * kind.
 */

import {
    affinityRowsOf,
    agreementSentence,
    audiencePeriods,
    audienceTestBadge,
    audienceTestKind,
    audienceTestSentence,
    extraFieldsOf,
    geoiqVariablesOf,
    geoiqVariablesProblem,
    sameVariables,
    type AudienceVendorTest,
    audiencePolicyPatch,
    audiencePolicyPreview,
    audienceSourceLabel,
    audienceVendorsLabel,
    currentAudiencePeriod,
    shareMixItems,
    DEFAULT_AUDIENCE_POLICY,
    type AudiencePolicy,
} from "./audience";
import { audienceProvidersOf, audienceSectionPatch, audienceVendorConfigured, type AudienceSettings } from "./integrations";

const stored: AudienceSettings = {
    provider: "GEOIQ",
    providers: ["GEOIQ"],
    policy: DEFAULT_AUDIENCE_POLICY,
    geoiqApiKey: "••••ab12",
    geoiqBaseUrl: "https://api.geoiq.io",
    geoiqVariables: { "footfall.daily": "v_1" },
    aziraApiKey: null,
    aziraClientId: null,
    aziraBaseUrl: null,
    catchmentRadiusM: 500,
};

describe("the policy patch", () => {
    it("carries only the keys that moved, per group", () => {
        const draft: AudiencePolicy = {
            footfall: { primary: "AZIRA", fallback: true, blend: "PRIMARY" },
            demographics: { primary: "GEOIQ", fallback: false },
            affinities: { primary: "AZIRA", fallback: true },
        };
        expect(audiencePolicyPatch(DEFAULT_AUDIENCE_POLICY, draft)).toEqual({
            footfall: { blend: "PRIMARY" },
            demographics: { fallback: false },
            affinities: { primary: "AZIRA" },
        });
        expect(audiencePolicyPatch(DEFAULT_AUDIENCE_POLICY, DEFAULT_AUDIENCE_POLICY)).toEqual({});
    });
});

describe("the preview", () => {
    it("says per group what the seam will do with both vendors on", () => {
        expect(audiencePolicyPreview(DEFAULT_AUDIENCE_POLICY, ["GEOIQ", "AZIRA"])).toBe(
            "Footfall: Azira, averaged with GeoIQ when both answer · Demographics: GeoIQ, Azira as fallback · Affinities: GeoIQ, Azira as fallback",
        );
        const primaryOnly: AudiencePolicy = {
            footfall: { primary: "AZIRA", fallback: false, blend: "PRIMARY" },
            demographics: { primary: "GEOIQ", fallback: false },
            affinities: { primary: "GEOIQ", fallback: true },
        };
        expect(audiencePolicyPreview(primaryOnly, ["GEOIQ", "AZIRA"])).toBe("Footfall: Azira only · Demographics: GeoIQ only · Affinities: GeoIQ, Azira as fallback");
    });

    it("knows when the primary is off and whether the other may fill in", () => {
        expect(audiencePolicyPreview(DEFAULT_AUDIENCE_POLICY, ["GEOIQ"])).toBe("Footfall: GeoIQ (Azira is off) · Demographics: GeoIQ alone · Affinities: GeoIQ alone");
        const noFallback: AudiencePolicy = { ...DEFAULT_AUDIENCE_POLICY, footfall: { primary: "AZIRA", fallback: false, blend: "AVERAGE" } };
        expect(audiencePolicyPreview(noFallback, ["GEOIQ"])).toContain("Footfall: nobody — Azira is off and GeoIQ may not fill in");
        expect(audiencePolicyPreview(DEFAULT_AUDIENCE_POLICY, [])).toBe("No vendor is on: the analytics say no panel backs an audience figure.");
    });
});

describe("the integrations patch", () => {
    it("reads the legacy label as a one-element set and sends the set whole when it moved, never `provider`", () => {
        expect(audienceProvidersOf({ provider: "AZIRA" })).toEqual(["AZIRA"]);
        expect(audienceProvidersOf({ provider: "NONE" })).toEqual([]);
        expect(audienceProvidersOf({ provider: "NONE", providers: ["AZIRA", "GEOIQ"] })).toEqual(["GEOIQ", "AZIRA"]);

        const patch = audienceSectionPatch(stored, { providers: ["AZIRA", "GEOIQ"], policy: DEFAULT_AUDIENCE_POLICY, radius: "500", typed: {} });
        expect(patch).toEqual({ providers: ["GEOIQ", "AZIRA"] });
        expect(patch).not.toHaveProperty("provider");
    });

    it("sends nothing for an unchanged draft, and a typed key, a moved radius and a policy diff beside the set", () => {
        expect(audienceSectionPatch(stored, { providers: ["GEOIQ"], policy: DEFAULT_AUDIENCE_POLICY, radius: "500", typed: { geoiqApiKey: "" } })).toEqual({});
        expect(
            audienceSectionPatch(stored, {
                providers: ["GEOIQ", "AZIRA"],
                policy: { ...DEFAULT_AUDIENCE_POLICY, demographics: { primary: "GEOIQ", fallback: false } },
                radius: "750",
                typed: { aziraApiKey: "az-live-1", aziraBaseUrl: "https://api.azira.example" },
            }),
        ).toEqual({
            providers: ["GEOIQ", "AZIRA"],
            policy: { demographics: { fallback: false } },
            catchmentRadiusM: 750,
            aziraApiKey: "az-live-1",
            aziraBaseUrl: "https://api.azira.example",
        });
        /* An out-of-bounds radius is not sent; the card refuses to save it. */
        expect(audienceSectionPatch(stored, { providers: ["GEOIQ"], policy: DEFAULT_AUDIENCE_POLICY, radius: "12", typed: {} })).toEqual({});
    });

    it("says whether a vendor is configured by the adapter's own rule", () => {
        expect(audienceVendorConfigured(stored, "GEOIQ")).toBe(true);
        expect(audienceVendorConfigured({ ...stored, geoiqVariables: {} }, "GEOIQ")).toBe(false);
        expect(audienceVendorConfigured(stored, "AZIRA")).toBe(false);
        expect(audienceVendorConfigured({ ...stored, aziraApiKey: "••••zz99", aziraBaseUrl: "https://api.azira.example" }, "AZIRA")).toBe(true);
        expect(audienceVendorConfigured({ ...stored, aziraApiKey: "••••zz99" }, "AZIRA")).toBe(false);
    });
});

describe("the GeoIQ variable map (AC-C)", () => {
    const catalogue = [
        { field: "footfall.daily", group: "footfall" as const, label: "Daily footfall", required: true },
        { field: "gender.female", group: "gender" as const, label: "Female", required: false },
    ];

    it("builds one record from the named rows and the affinity rows, blanks and half rows left out, names lower-cased", () => {
        expect(
            geoiqVariablesOf(
                { "footfall.daily": " v_1 ", "gender.female": "", "gender.male": "   " },
                [
                    { name: " Fitness ", id: "v_f" },
                    { name: "", id: "v_orphan" },
                    { name: "travel", id: "" },
                ],
            ),
        ).toEqual({ "footfall.daily": "v_1", "affinity.fitness": "v_f" });
    });

    it("reads a stored map back into rows: affinities by name, an off-catalogue field kept as its own row", () => {
        const variables = { "footfall.daily": "v_1", "affinity.travel": "v_t", "age.60_plus": "v_60" };
        expect(affinityRowsOf(variables)).toEqual([{ name: "travel", id: "v_t" }]);
        expect(extraFieldsOf(variables, catalogue)).toEqual([{ field: "age.60_plus", group: "age", label: "age.60_plus", required: false }]);
        expect(affinityRowsOf(undefined)).toEqual([]);
    });

    it("compares two maps key order aside, and the integrations patch carries the map whole only when it moved", () => {
        expect(sameVariables({ a: "1", b: "2" }, { b: "2", a: "1" })).toBe(true);
        expect(sameVariables({ a: "1" }, { a: "1", b: "2" })).toBe(false);
        expect(sameVariables({ a: "1" }, { a: "2" })).toBe(false);

        const draft = { providers: ["GEOIQ" as const], policy: DEFAULT_AUDIENCE_POLICY, radius: "500", typed: {} };
        /* Re-typed the same: no geoiqVariables in the patch. */
        expect(audienceSectionPatch(stored, { ...draft, variables: { named: { "footfall.daily": "v_1 ", "gender.female": "" }, affinities: [] } })).toEqual({});
        /* Anything moved: the whole record, not a diff. */
        expect(
            audienceSectionPatch(stored, { ...draft, variables: { named: { "footfall.daily": "v_1", "gender.female": "v_2" }, affinities: [{ name: "fitness", id: "v_f" }] } }),
        ).toEqual({ geoiqVariables: { "footfall.daily": "v_1", "gender.female": "v_2", "affinity.fitness": "v_f" } });
        /* Everything emptied: an empty record, which unmaps the vendor. */
        expect(audienceSectionPatch(stored, { ...draft, variables: { named: { "footfall.daily": "" }, affinities: [] } })).toEqual({ geoiqVariables: {} });
        /* A card that does not edit the map sends none. */
        expect(audienceSectionPatch(stored, draft)).toEqual({});
    });

    it("refuses a half-filled, ill-named or duplicated affinity row before the round trip", () => {
        expect(geoiqVariablesProblem([])).toBeNull();
        expect(geoiqVariablesProblem([{ name: "", id: "" }])).toBeNull();
        expect(geoiqVariablesProblem([{ name: "", id: "v_1" }])).toMatch(/needs a name/);
        expect(geoiqVariablesProblem([{ name: "fitness", id: "" }])).toBe('The affinity "fitness" needs a catalogue id, or remove the row.');
        expect(geoiqVariablesProblem([{ name: "bad name", id: "v_1" }])).toMatch(/not an affinity name/);
        expect(geoiqVariablesProblem([{ name: "fitness", id: "v_1" }, { name: "Fitness", id: "v_2" }])).toBe("An affinity is named twice.");
        expect(geoiqVariablesProblem([{ name: "fitness_2", id: "v_1" }])).toBeNull();
    });
});

describe("the vendor test verdict (AC-C)", () => {
    const verdict = (over: Partial<AudienceVendorTest>): AudienceVendorTest => ({
        vendor: "GEOIQ",
        keyPresent: true,
        variablesMapped: 1,
        reachable: true,
        authorized: true,
        status: 200,
        message: "",
        fieldsAnswered: ["footfall.daily"],
        fieldsMissing: [],
        sample: { footfallDaily: 100 },
        ...over,
    });

    it("decides the kind in order — key, reach, authorisation, then whether anything came back — and says each plainly", () => {
        const noKey = verdict({ keyPresent: false, reachable: false, authorized: false, status: null, fieldsAnswered: [] });
        expect(audienceTestKind(noKey)).toBe("NO_KEY");
        expect(audienceTestBadge(noKey)).toEqual({ label: "No key", tone: "neutral" });
        expect(audienceTestSentence(noKey)).toMatch(/No GeoIQ key is stored/);

        const dead = verdict({ reachable: false, authorized: false, status: null, fieldsAnswered: [] });
        expect(audienceTestKind(dead)).toBe("UNREACHABLE");
        expect(audienceTestSentence(dead)).toMatch(/could not be reached/);

        const refused = verdict({ authorized: false, status: 401, fieldsAnswered: [] });
        expect(audienceTestKind(refused)).toBe("REFUSED");
        expect(audienceTestBadge(refused)).toEqual({ label: "Not authorised", tone: "danger" });
        expect(audienceTestSentence(refused)).toBe("The key is stored but GeoIQ refuses it — ask GeoIQ to enable the Data API on this key.");
        expect(audienceTestSentence(verdict({ vendor: "AZIRA", authorized: false, status: 403, fieldsAnswered: [] }))).toBe(
            "The key is stored but Azira refuses it — ask Azira to enable this key for the account.",
        );

        const empty = verdict({ fieldsAnswered: [], fieldsMissing: ["footfall.daily"] });
        expect(audienceTestKind(empty)).toBe("EMPTY");
        expect(audienceTestBadge(empty).tone).toBe("warning");

        const ok = verdict({ fieldsMissing: ["gender.female"] });
        expect(audienceTestKind(ok)).toBe("ANSWERED");
        expect(audienceTestBadge(ok)).toEqual({ label: "Working", tone: "success" });
        expect(audienceTestSentence(ok)).toBe("GeoIQ answered 1 of 2 fields asked.");
    });
});

describe("the labels", () => {
    it("names the set, the source and the agreement", () => {
        expect(audienceVendorsLabel(["AZIRA", "GEOIQ"])).toBe("GeoIQ + Azira");
        expect(audienceVendorsLabel([])).toBe("Off");
        expect(audienceSourceLabel("BLENDED")).toBe("Both, blended");
        expect(audienceSourceLabel(null)).toBe("Not provided");
        expect(agreementSentence(0.88)).toBe("Both vendors agree within 12% on daily footfall");
        expect(agreementSentence(1)).toBe("Both vendors give the same daily footfall");
        expect(agreementSentence(null)).toBeNull();
    });

    it("turns a share group into mix items with the share as the count", () => {
        expect(shareMixItems([{ label: "18–24", share: 31.25 }, { label: "25–34", share: 40 }])).toEqual([
            { key: "18–24", label: "18–24", count: 31.3, href: null, tone: "info" },
            { key: "25–34", label: "25–34", count: 40, href: null, tone: "success" },
        ]);
    });

    it("offers the last three months, this one first", () => {
        const now = new Date("2026-09-15T10:00:00.000Z");
        expect(currentAudiencePeriod(now)).toBe("2026-09");
        expect(audiencePeriods(now).map((period) => period.value)).toEqual(["2026-09", "2026-08", "2026-07"]);
        expect(audiencePeriods(now)[0]?.label).toBe("September 2026");
        expect(audiencePeriods(new Date("2026-01-03T00:00:00.000Z")).map((period) => period.value)).toEqual(["2026-01", "2025-12", "2025-11"]);
    });
});
