import { describe, expect, it } from "vitest";
import {
    consoleHref,
    figureDelta,
    foldMoneySeries,
    foldSeries,
    kycMixItems,
    moneyFigureDelta,
    overviewPath,
    presetRange,
    windowDays,
    windowFromQuery,
    windowQuery,
    windowValid,
    type OverviewWindow,
} from "./section-overviews";

/**
 * Package O-C — the overview tabs' service: the window in the URL, the
 * deltas as the tiles print them, the KYC mix's links into the queue, and
 * the console route a backend `href` maps to.
 */

const today = "2026-09-15";

describe("the window in the URL", () => {
    it("reads nothing as the last thirty days ending today in India, every city", () => {
        expect(windowFromQuery(new URLSearchParams(""), today)).toEqual({ preset: "30D", from: "2026-08-17", to: "2026-09-15", city: "" });
    });

    it("a preset names its own days — 7D, 90D, and This month from the 1st", () => {
        expect(windowFromQuery(new URLSearchParams("window=7D"), today)).toMatchObject({ preset: "7D", from: "2026-09-09", to: today });
        expect(windowFromQuery(new URLSearchParams("window=90D"), today)).toMatchObject({ preset: "90D", from: "2026-06-18", to: today });
        expect(windowFromQuery(new URLSearchParams("window=MONTH"), today)).toMatchObject({ preset: "MONTH", from: "2026-09-01", to: today });
        expect(presetRange("MONTH", "2026-01-01")).toEqual({ from: "2026-01-01", to: "2026-01-01" });
    });

    it("Custom reads from and to; a custom window missing a day falls back to the last thirty", () => {
        expect(windowFromQuery(new URLSearchParams("window=CUSTOM&from=2026-07-01&to=2026-07-31"), today)).toEqual({
            preset: "CUSTOM",
            from: "2026-07-01",
            to: "2026-07-31",
            city: "",
        });
        expect(windowFromQuery(new URLSearchParams("window=CUSTOM&from=2026-07-01"), today)).toMatchObject({ preset: "30D", from: "2026-08-17" });
        expect(windowFromQuery(new URLSearchParams("window=CUSTOM&from=July&to=2026-07-31"), today)).toMatchObject({ preset: "30D" });
    });

    it("an unknown preset word is the default, and the city is trimmed", () => {
        expect(windowFromQuery(new URLSearchParams("window=YEAR&city=%20Bengaluru%20"), today)).toEqual({
            preset: "30D",
            from: "2026-08-17",
            to: today,
            city: "Bengaluru",
        });
    });

    it("writes only what is not the default, and round-trips", () => {
        const custom: OverviewWindow = { preset: "CUSTOM", from: "2026-07-01", to: "2026-07-31", city: "Pune" };
        expect(windowQuery({ preset: "30D", from: "2026-08-17", to: today, city: "" })).toBe("");
        expect(windowQuery({ preset: "7D", from: "2026-09-09", to: today, city: "" })).toBe("window=7D");
        expect(windowQuery({ preset: "30D", from: "2026-08-17", to: today, city: "Bengaluru" })).toBe("city=Bengaluru");
        expect(windowQuery(custom)).toBe("window=CUSTOM&from=2026-07-01&to=2026-07-31&city=Pune");
        expect(windowFromQuery(new URLSearchParams(windowQuery(custom)), today)).toEqual(custom);
    });

    it("refuses a window of no days or of more than a year, as the server would", () => {
        expect(windowDays({ from: "2026-09-01", to: "2026-09-01" })).toBe(1);
        expect(windowValid({ from: "2026-09-02", to: "2026-09-01" })).toBe(false);
        expect(windowValid({ from: "2025-09-15", to: "2026-09-15" })).toBe(true);
        expect(windowValid({ from: "2025-09-14", to: "2026-09-15" })).toBe(false);
    });

    it("the read's path carries the window and the city only when set", () => {
        expect(overviewPath("publishers", { from: "2026-08-17", to: today, city: "" })).toBe("/section-overviews/publishers?from=2026-08-17&to=2026-09-15");
        expect(overviewPath("print-partners", { from: "2026-08-17", to: today, city: " Navi Mumbai " })).toBe(
            "/section-overviews/print-partners?from=2026-08-17&to=2026-09-15&city=Navi+Mumbai",
        );
    });
});

describe("the deltas", () => {
    it("a count figure moves by the plain difference, signed; a state figure has none", () => {
        expect(figureDelta({ value: 12, previous: 9, delta: 3 })).toEqual({ text: "+3", tone: "positive" });
        expect(figureDelta({ value: 4, previous: 9, delta: -5 })).toEqual({ text: "-5", tone: "negative" });
        expect(figureDelta({ value: 9, previous: 9, delta: 0 })).toEqual({ text: "0", tone: "neutral" });
        expect(figureDelta({ value: 9, previous: null, delta: null })).toBeNull();
    });

    it("a money figure moves as a share of the previous window, and by the amount when the previous was nothing", () => {
        expect(moneyFigureDelta({ value: "1250.00", previous: "1000.00", delta: "250.00" })).toEqual({ text: "+25%", tone: "positive" });
        expect(moneyFigureDelta({ value: "500.00", previous: "0.00", delta: "500.00" })).toEqual({ text: "+500.00", tone: "positive" });
        expect(moneyFigureDelta({ value: "0.00", previous: "0.00", delta: "0.00" })).toEqual({ text: "0.00", tone: "neutral" });
        expect(moneyFigureDelta({ value: "0.00", previous: null, delta: null })).toBeNull();
    });
});

describe("the KYC mix", () => {
    it("each state leads to the section's queue with the chip preselected, in the queue's own URL word", () => {
        const items = kycMixItems({ awaitingDocuments: 3, requested: 1, pending: 4, needsInfo: 0, rejected: 2, verified: 40 }, "/kyc/agents");
        expect(items.map((item) => `${item.label} ${item.count} → ${item.href}`)).toEqual([
            "Awaiting documents 3 → /kyc/agents?state=awaiting_documents",
            "Requested 1 → /kyc/agents?state=requested",
            "Pending review 4 → /kyc/agents?state=pending",
            "Needs info 0 → /kyc/agents?state=needs_info",
            "Rejected 2 → /kyc/agents?state=rejected",
            "Verified 40 → /kyc/agents?state=verified",
        ]);
    });

    it("with no queue (users are logins, not parties) the segments carry no link", () => {
        const items = kycMixItems({ awaitingDocuments: 0, requested: 0, pending: 0, needsInfo: 0, rejected: 0, verified: 0 }, null);
        expect(items.every((item) => item.href === null)).toBe(true);
    });
});

describe("the series, folded for the chart", () => {
    it("matches the previous window's day by position and prints the count", () => {
        const points = foldSeries({
            days: [
                { day: "2026-09-14", value: 2 },
                { day: "2026-09-15", value: 1500 },
            ],
            previous: [
                { day: "2026-09-12", value: 1 },
                { day: "2026-09-13", value: 0 },
            ],
            total: { value: 1502, previous: 1, delta: 1501 },
        });
        expect(points[0]).toEqual({ day: "2026-09-14", label: "14 Sep", previousDay: "2026-09-12", value: 2, previous: 1, text: "2", previousText: "1" });
        expect(points[1].text).toBe("1,500");
    });

    it("a money series keeps the decimal string for the tooltip and a float for the axis", () => {
        const points = foldMoneySeries(
            { days: [{ day: "2026-09-15", value: "1250.50" }], previous: [], total: { value: "1250.50", previous: "0.00", delta: "1250.50" } },
            (amount) => `₹${amount}`,
        );
        expect(points[0]).toEqual({ day: "2026-09-15", label: "15 Sep", previousDay: null, value: 1250.5, previous: null, text: "₹1250.50", previousText: null });
    });
});

describe("where a row leads", () => {
    const window: OverviewWindow = { preset: "7D", from: "2026-09-09", to: today, city: "" };

    it("a record opens as it is", () => {
        expect(consoleHref("publishers", "/publishers/pub_1", window)).toBe("/publishers/pub_1");
        expect(consoleHref("publishers", "/agents/agt_1", window)).toBe("/agents/agt_1");
        expect(consoleHref("print-partners", "/print-partners/pp_1", window)).toBe("/print-partners/pp_1");
    });

    it("a city narrows this overview, keeping the window — no directory takes a city facet", () => {
        expect(consoleHref("publishers", "/publishers?city=Bengaluru", window)).toBe("/publishers?window=7D&city=Bengaluru");
        expect(consoleHref("agents", "/agents?city=Navi%20Mumbai", { ...window, preset: "30D" })).toBe("/agents?city=Navi+Mumbai");
        expect(consoleHref("users", "/users?city=Pune", window)).toBe("/users?window=7D&city=Pune");
    });

    it("a users role opens the accounts directory under that role; a department its console page", () => {
        expect(consoleHref("users", "/users?role=AGENT_PUBLISHER", window)).toBe("/users/accounts?role=AGENT_PUBLISHER");
        expect(consoleHref("employees", "/hr/departments/dep_1", window)).toBe("/employees/departments/dep_1");
    });

    it("a cut nothing on the console honours stays a label", () => {
        expect(consoleHref("publishers", "/listings?category=OUTDOOR", window)).toBeNull();
        expect(consoleHref("advertisers", "/advertisers?industry=Retail", window)).toBeNull();
        expect(consoleHref("employees", "/employees?workMode=REMOTE", window)).toBeNull();
        expect(consoleHref("agents", "/agents?tier=GOLD", window)).toBeNull();
        expect(consoleHref("publishers", null, window)).toBeNull();
    });
});
