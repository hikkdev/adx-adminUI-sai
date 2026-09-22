import { describe, expect, it } from "vitest";
import { AGENT_STATE_META, ageLabel, etaLabel, markerToneOf } from "./agent-locations";
import { fromDraft } from "@/app/(admin)/settings/tracking/tracking-view";
import { distanceLabel } from "@/app/(admin)/orders/[id]/order-journey-card";

/**
 * LT-1 (live agent tracking): the pure helpers the live map, the order's
 * journey card and Settings › Live tracking lean on.
 */

describe("the live map's labels", () => {
    it("prints the age of a fix in the unit that reads", () => {
        expect(ageLabel(10)).toBe("just now");
        expect(ageLabel(44)).toBe("just now");
        expect(ageLabel(120)).toBe("2 min ago");
        expect(ageLabel(3600)).toBe("1 h ago");
        expect(ageLabel(2 * 86400)).toBe("2 d ago");
    });

    it("prints the ETA as distance and minutes, or nothing", () => {
        expect(etaLabel(null)).toBeNull();
        expect(etaLabel(undefined)).toBeNull();
        expect(etaLabel({ minutes: 12, distanceM: 4800 })).toBe("4.8 km · about 12 min");
        expect(etaLabel({ minutes: 2, distanceM: 640 })).toBe("640 m · about 2 min");
        expect(distanceLabel(12_440)).toBe("12.4 km");
        expect(distanceLabel(850)).toBe("850 m");
    });

    it("paints the marker by the alert first and the state otherwise", () => {
        expect(markerToneOf({ state: "TRAVELLING", alerts: [] })).toBe(AGENT_STATE_META.TRAVELLING.tone);
        expect(markerToneOf({ state: "ON_SITE", alerts: [] })).toBe("success");
        expect(markerToneOf({ state: "TRAVELLING", alerts: [{ kind: "IDLE", since: null, detail: "" }] })).toBe("warning");
        expect(markerToneOf({ state: "TRAVELLING", alerts: [{ kind: "OFF_ROUTE", since: null, detail: "" }] })).toBe("warning");
        expect(markerToneOf({ state: "STILL", alerts: [{ kind: "IDLE", since: null, detail: "" }, { kind: "LATE", since: null, detail: "" }] })).toBe("danger");
        expect(markerToneOf({ state: "OFFLINE", alerts: [{ kind: "OFFLINE", since: null, detail: "" }] })).toBe("danger");
    });
});

describe("Settings › Live tracking", () => {
    const draft = {
        pingMovingSec: "45",
        pingStillSec: "300",
        mode: "WHILE_USING" as const,
        retentionDays: "30",
        geofenceRadiusM: "150",
        idleAlertMin: "15",
        lateGraceMin: "15",
        offRouteKm: "2",
        offlineAfterMin: "10",
        partiesSeeEta: true,
    };

    it("reads the defaults back as the section", () => {
        expect(fromDraft(draft)).toEqual({ pingMovingSec: 45, pingStillSec: 300, mode: "WHILE_USING", retentionDays: 30, geofenceRadiusM: 150, idleAlertMin: 15, lateGraceMin: 15, offRouteKm: 2, offlineAfterMin: 10, partiesSeeEta: true });
        expect(fromDraft({ ...draft, offRouteKm: "1.5" })?.offRouteKm).toBe(1.5);
    });

    it("refuses a number outside the schema, and a still ping faster than the moving one", () => {
        expect(fromDraft({ ...draft, pingMovingSec: "10" })).toBeNull();
        expect(fromDraft({ ...draft, geofenceRadiusM: "" })).toBeNull();
        expect(fromDraft({ ...draft, offRouteKm: "0.2" })).toBeNull();
        expect(fromDraft({ ...draft, retentionDays: "400" })).toBeNull();
        expect(fromDraft({ ...draft, pingMovingSec: "120", pingStillSec: "60" })).toBeNull();
    });
});
