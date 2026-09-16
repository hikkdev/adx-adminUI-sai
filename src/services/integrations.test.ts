import { describe, expect, it } from "vitest";

/**
 * The SMS routing table as the console saves it — Lot E (Q128).
 *
 * `PUT /integrations` merges a patch into the stored section, so what is
 * sent must be only what moved; and a rail's registration for a kind
 * carries `vars` and `body` the grid never shows, so an edited template id
 * must not strip them.
 */

import {
    effectiveEmailDoor,
    emailModeOf,
    emailTestBlocker,
    isMasked,
    isPublicOsmTileTemplate,
    mapsSectionPatch,
    osmDraftOf,
    osmSectionPatch,
    parseTileMaxZoom,
    railsOf,
    routingDraftOf,
    routingProblem,
    sectionPatch,
    smsRoutingPatch,
    tileTemplateProblem,
    type EmailSettings,
    type MapsSettings,
    type OsmSettings,
    type ResendSettings,
    type SmsSettings,
} from "./integrations";

/** The rail names as `GET /comms/sms-kinds` answers them (E10-2) — the console no longer mirrors the list. */
const RAILS = ["msg91", "twilio", "third"];

const stored: SmsSettings = {
    authKey: "••••ab12",
    templateId: null,
    primaryRail: "msg91",
    fallbackRails: ["twilio"],
    dltEntityId: "1101",
    senderId: "ADXOOH",
    templates: {
        msg91: { LOGIN_OTP: { templateId: "flow-1", vars: ["code", "minutes"] } },
        twilio: { LOGIN_OTP: { templateId: "HX1", body: "Your ADX OTP is {{code}}." } },
    },
};

describe("the rails the table draws", () => {
    it("are the server's list, plus any rail the stored row still names", () => {
        expect(railsOf(undefined, RAILS)).toEqual(RAILS);
        expect(railsOf({ ...stored, fallbackRails: ["legacy"], templates: { ...stored.templates, other: {} } }, ["msg91", "twilio"])).toEqual([
            "msg91",
            "twilio",
            "legacy",
            "other",
        ]);
    });

    it("falls back to the first rail the server names when nothing is stored", () => {
        expect(routingDraftOf(undefined, ["twilio"]).primaryRail).toBe("twilio");
    });
});

describe("the routing draft", () => {
    it("reads the stored table with MSG91 primary when nothing is set", () => {
        expect(routingDraftOf(undefined, RAILS)).toEqual({ primaryRail: "msg91", fallbackRails: [], dltEntityId: "", senderId: "", templateIds: { msg91: {}, twilio: {}, third: {} } });
        expect(routingDraftOf(stored, RAILS).templateIds.twilio).toEqual({ LOGIN_OTP: "HX1" });
    });

    it("refuses a header over 11 characters and a rail that falls back to itself", () => {
        const draft = routingDraftOf(stored, RAILS);
        expect(routingProblem({ ...draft, senderId: "TOOLONGHEADER" })).toMatch(/11/);
        expect(routingProblem({ ...draft, fallbackRails: ["msg91"] })).toMatch(/own fallback/);
        expect(routingProblem({ ...draft, fallbackRails: ["twilio", "twilio"] })).toMatch(/twice/);
        expect(routingProblem(draft)).toBeNull();
    });
});

describe("the sms patch", () => {
    it("is empty for an untouched draft", () => {
        expect(smsRoutingPatch(stored, routingDraftOf(stored, RAILS), RAILS)).toEqual({});
    });

    it("names only the routing fields that moved", () => {
        const draft = { ...routingDraftOf(stored, RAILS), primaryRail: "twilio" as const, fallbackRails: ["msg91" as const], senderId: " ADXNEW " };
        expect(smsRoutingPatch(stored, draft, RAILS)).toEqual({ primaryRail: "twilio", fallbackRails: ["msg91"], senderId: "ADXNEW" });
    });

    it("sends the grid whole when an id changed, carrying each registration's vars and body", () => {
        const draft = routingDraftOf(stored, RAILS);
        draft.templateIds.msg91 = { ...draft.templateIds.msg91, LOGIN_OTP: "flow-2", PAYOUT_PAID: "flow-9" };
        const patch = smsRoutingPatch(stored, draft, RAILS);
        expect(patch.templates).toEqual({
            msg91: { LOGIN_OTP: { templateId: "flow-2", vars: ["code", "minutes"] }, PAYOUT_PAID: { templateId: "flow-9" } },
            twilio: { LOGIN_OTP: { templateId: "HX1", body: "Your ADX OTP is {{code}}." } },
            third: {},
        });
    });

    it("drops a registration whose id was blanked", () => {
        const draft = routingDraftOf(stored, RAILS);
        draft.templateIds.twilio = { LOGIN_OTP: "" };
        const patch = smsRoutingPatch(stored, draft, RAILS);
        expect((patch.templates as SmsSettings["templates"]).twilio).toEqual({});
        expect((patch.templates as SmsSettings["templates"]).msg91).toEqual(stored.templates.msg91);
    });
});

describe("the secrets", () => {
    it("never round-trips a mask, for the new sections too", () => {
        expect(isMasked("••••ab12")).toBe(true);
        expect(sectionPatch("twilio", { accountSid: "AC1", authToken: "••••ab12" }, { accountSid: null, authToken: "••••ab12", phoneNumber: null })).toEqual({ accountSid: "AC1" });
        expect(sectionPatch("resend", { apiKey: "re_new", fromEmail: "" }, { apiKey: "••••zz99", fromEmail: null })).toEqual({ apiKey: "re_new" });
    });
});

/* Z-C: the OpenStreetMap sub-object of the maps patch. */

const osmStored: OsmSettings = {
    nominatimBaseUrl: "https://nominatim.openstreetmap.org",
    osrmBaseUrl: "https://router.project-osrm.org",
    photonBaseUrl: "https://photon.komoot.io",
    contactEmail: null,
    userAgent: "ADX/1.0.0 (no contact email set)",
    tileUrlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileAttribution: "(c) OpenStreetMap contributors",
    tileMaxZoom: 19,
    tileApiKey: "••••9f3a",
    publicTiles: true,
};

const mapsStored: MapsSettings = {
    provider: "GOOGLE",
    googleBrowserKey: "••••ab12",
    googleServerKey: null,
    mapboxPublicToken: null,
    mapboxSecretToken: null,
    osm: osmStored,
};

describe("the osm patch", () => {
    it("starts from the section in force with the secret blank, and carries nothing while nothing moved", () => {
        const draft = osmDraftOf(osmStored);
        expect(draft.tileApiKey).toBe("");
        expect(draft.tileMaxZoom).toBe("19");
        expect(draft.contactEmail).toBe("");
        expect(osmSectionPatch(osmStored, draft)).toEqual({});
        expect(mapsSectionPatch(mapsStored, "GOOGLE", {}, draft)).toEqual({});
    });

    it("carries a typed field as text, an emptied one as null, the zoom as a number, the key only when typed and not masked — never publicTiles", () => {
        const draft = { ...osmDraftOf(osmStored), contactEmail: " ops@adx.example ", userAgent: "", tileMaxZoom: "20", tileApiKey: "mt-key", nominatimBaseUrl: "https://nominatim.openstreetmap.org" };
        expect(osmSectionPatch(osmStored, draft)).toEqual({ contactEmail: "ops@adx.example", userAgent: null, tileMaxZoom: 20, tileApiKey: "mt-key" });
        expect(osmSectionPatch(osmStored, { ...osmDraftOf(osmStored), tileApiKey: "••••9f3a" })).toEqual({});
        expect(osmSectionPatch(osmStored, { ...osmDraftOf(osmStored), tileMaxZoom: "23" })).toEqual({});
        expect(mapsSectionPatch(mapsStored, "OSM", { googleServerKey: "" }, draft)).toEqual({
            provider: "OSM",
            osm: { contactEmail: "ops@adx.example", userAgent: null, tileMaxZoom: 20, tileApiKey: "mt-key" },
        });
        /* An older backend without the section: the sub-object is never sent. */
        expect(mapsSectionPatch({ ...mapsStored, osm: undefined }, "OSM", {}, draft)).toEqual({ provider: "OSM" });
    });

    it("knows the public tile server by the backend's rule, the template's slots and the zoom bounds", () => {
        expect(isPublicOsmTileTemplate("https://tile.openstreetmap.org/{z}/{x}/{y}.png")).toBe(true);
        expect(isPublicOsmTileTemplate("https://b.tile.openstreetmap.org/{z}/{x}/{y}.png")).toBe(true);
        expect(isPublicOsmTileTemplate("https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key={key}")).toBe(false);
        expect(isPublicOsmTileTemplate("not a url")).toBe(false);
        expect(tileTemplateProblem("")).toBeNull();
        expect(tileTemplateProblem("https://tiles.example.in/{z}/{x}/{y}.png")).toBeNull();
        expect(tileTemplateProblem("tiles.example.in/{z}/{x}/{y}.png")).toMatch(/http\(s\) URL/);
        expect(tileTemplateProblem("https://tiles.example.in/{z}/{x}.png")).toMatch(/\{z\}, \{x\} and \{y\}/);
        expect(parseTileMaxZoom("1")).toBe(1);
        expect(parseTileMaxZoom("22")).toBe(22);
        expect(parseTileMaxZoom("0")).toBeNull();
        expect(parseTileMaxZoom("19.5")).toBeNull();
    });
});

/** AE-C: the email door in force and why a test cannot be sent, read the backend's way. */
describe("the email door and the test blocker (AE-C)", () => {
    const email = (over: Partial<EmailSettings> = {}): EmailSettings => ({
        host: null,
        port: null,
        user: null,
        password: null,
        from: null,
        primary: null,
        ...over,
    });
    const resend = (over: Partial<ResendSettings> = {}): ResendSettings => ({ apiKey: null, fromEmail: null, ...over });

    it("reads the mode as SMTP on a backend older than AE-B", () => {
        expect(emailModeOf(undefined)).toBe("SMTP");
        expect(emailModeOf(email())).toBe("SMTP");
        expect(emailModeOf(email({ mode: "ETHEREAL" }))).toBe("ETHEREAL");
    });

    it("picks the door as the resolver does: the chosen primary, Resend by default only when it alone has a key, Ethereal under SMTP by the mode", () => {
        expect(effectiveEmailDoor({ email: email(), resend: resend() })).toBe("SMTP");
        expect(effectiveEmailDoor({ email: email(), resend: resend({ apiKey: "••••ab12" }) })).toBe("RESEND");
        expect(effectiveEmailDoor({ email: email({ host: "smtp.gmail.com" }), resend: resend({ apiKey: "••••ab12" }) })).toBe("SMTP");
        expect(effectiveEmailDoor({ email: email({ host: "smtp.gmail.com", primary: "RESEND" }), resend: resend() })).toBe("RESEND");
        expect(effectiveEmailDoor({ email: email({ mode: "ETHEREAL" }), resend: resend() })).toBe("ETHEREAL");
        expect(effectiveEmailDoor({ email: email({ mode: "ETHEREAL", primary: "RESEND" }), resend: resend({ apiKey: "••••ab12" }) })).toBe("RESEND");
    });

    it("blocks the test with the reason while the door in force has nothing to send with", () => {
        expect(emailTestBlocker({ email: email(), resend: resend() })).toMatch(/SMTP has no host on file/);
        expect(emailTestBlocker({ email: email({ primary: "RESEND" }), resend: resend() })).toMatch(/Resend is the primary door but has no API key/);
        expect(emailTestBlocker({ email: email({ host: "smtp.gmail.com" }), resend: resend() })).toBeNull();
        expect(emailTestBlocker({ email: email({ mode: "ETHEREAL" }), resend: resend() })).toBeNull();
        expect(emailTestBlocker({ email: email(), resend: resend({ apiKey: "••••ab12" }) })).toBeNull();
    });
});
