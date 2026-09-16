import { describe, expect, it, vi } from "vitest";

/**
 * The fraud desk's service — Lot D (Q54/Q92/Q121).
 *
 * What is pinned: the routes every button on the desk calls, with the
 * bodies the zod schemas take; the list contract's query string; and the
 * per-party scope filtering a confirmation reuses from the suspend dialog,
 * so a listing is never offered a wallet freeze and the default pair is
 * narrowed the same way the server narrows it.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body?: unknown }[] }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return {};
    };
    return { ...actual, api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), put: record("PUT"), delete: record("DELETE") } };
});

import {
    caseTitle,
    confirmableScopes,
    defaultScopesFor,
    formatScore,
    fraudCasesPath,
    fraudService,
    isDecided,
    casePersonLabel,
    CLEAN_BAND_HEIGHT,
    linkedGraphLayout,
    linkedPartiesOf,
    parseScanParam,
    partyInitials,
    scanParam,
    shapeSignals,
    subjectHref,
    type FraudSignal,
} from "./fraud";

describe("the scopes a confirmation may apply", () => {
    it("are the subject's own list, and the default pair narrowed to it", () => {
        expect(confirmableScopes("LISTING")).toEqual(["BLOCK_NEW", "STOP_OPEN_WORK", "STOP_ACCRUAL"]);
        expect(confirmableScopes("PUBLISHER")).toEqual(["BLOCK_NEW", "STOP_OPEN_WORK", "STOP_ACCRUAL", "FREEZE_WALLET", "BLOCK_SIGNIN"]);
        expect(defaultScopesFor("ADVERTISER")).toEqual(["BLOCK_NEW", "FREEZE_WALLET"]);
        // A listing has no wallet: the default freeze falls away rather than 400ing.
        expect(defaultScopesFor("LISTING")).toEqual(["BLOCK_NEW"]);
    });
});

describe("what the desk derives", () => {
    it("links the subject to its party page and titles a case from its summary's first line", () => {
        expect(subjectHref("AGENT", "agt_1")).toBe("/agents/agt_1");
        expect(subjectHref("LISTING", "lst 1")).toBe("/listings/lst%201");
        expect(caseTitle({ kind: "Shared payout", summary: "Four advertisers share one account.\nAlso a device." })).toBe(
            "Four advertisers share one account."
        );
        expect(isDecided("CONFIRMED")).toBe(true);
        expect(isDecided("INVESTIGATING")).toBe(false);
        // Lot G: ESCALATED is a working status — the case is still open.
        expect(isDecided("ESCALATED")).toBe(false);
    });

    it("builds the list query on the contract, sending only what was asked", () => {
        expect(fraudCasesPath()).toBe("/fraud/cases?sort=NEWEST&pageSize=100");
        expect(fraudCasesPath({ q: "PAN", status: ["OPEN", "INVESTIGATING"], subjectType: "ADVERTISER", disputeId: "dsp_1", page: 2 })).toBe(
            "/fraud/cases?q=PAN&status=OPEN%2CINVESTIGATING&sort=NEWEST&page=2&pageSize=100&subjectType=ADVERTISER&disputeId=dsp_1"
        );
    });
});

describe("the calls the desk makes", () => {
    it("are the seven fraud routes with the bodies the schemas take", async () => {
        calls.length = 0;
        await fraudService.list({ status: ["OPEN"] });
        await fraudService.get("frd_1");
        await fraudService.open({ subjectType: "ADVERTISER", subjectId: "adv_1", kind: "Shared payout", summary: "Four accounts, one payout.", disputeId: "dsp_1" });
        await fraudService.addNote("frd_1", "Device fingerprint matches.");
        await fraudService.addEvidence("frd_1", { kind: "Screenshot", fileId: "fil_1", note: "The payout page" });
        await fraudService.patch("frd_1", { status: "INVESTIGATING", assignedToUserId: "usr_1" });
        await fraudService.decide("frd_1", { status: "CONFIRMED", decision: "Confirmed on the evidence.", scopes: ["BLOCK_NEW", "FREEZE_WALLET"] });
        await fraudService.decide("frd_1", { status: "DISMISSED", decision: "Overturned." });
        expect(calls).toEqual([
            { method: "GET", path: "/fraud/cases?status=OPEN&sort=NEWEST&pageSize=100", body: undefined },
            { method: "GET", path: "/fraud/cases/frd_1", body: undefined },
            {
                method: "POST",
                path: "/fraud/cases",
                body: { subjectType: "ADVERTISER", subjectId: "adv_1", kind: "Shared payout", summary: "Four accounts, one payout.", disputeId: "dsp_1" },
            },
            { method: "POST", path: "/fraud/cases/frd_1/notes", body: { body: "Device fingerprint matches." } },
            { method: "POST", path: "/fraud/cases/frd_1/evidence", body: { kind: "Screenshot", fileId: "fil_1", note: "The payout page" } },
            { method: "PATCH", path: "/fraud/cases/frd_1", body: { status: "INVESTIGATING", assignedToUserId: "usr_1" } },
            { method: "POST", path: "/fraud/cases/frd_1/decide", body: { status: "CONFIRMED", decision: "Confirmed on the evidence.", scopes: ["BLOCK_NEW", "FREEZE_WALLET"] } },
            { method: "POST", path: "/fraud/cases/frd_1/decide", body: { status: "DISMISSED", decision: "Overturned." } },
        ]);
    });
});

/* Lot G (Q118/138): the signals card, the link graph, the scan hand-off, and the four new routes. */

const priya = { type: "ADVERTISER" as const, id: "adv_2", name: "Prime Ads" };
const nova = { type: "ADVERTISER" as const, id: "adv_3", name: "Nova Reach" };
const skyline = { type: "PUBLISHER" as const, id: "pub_9", name: "Skyline Co" };

const signals: FraudSignal[] = [
    { key: "SHARED_PAN", weight: 0.35, value: 1, detail: "PAN ****1234 is on 2 other KYC rows", links: [priya, nova] },
    { key: "SHARED_BANK", weight: 0.35, value: 0, detail: "No other party shares the payout account" },
    { key: "WITHDRAW_AFTER_CREDIT", weight: 0.2, value: 0.5, detail: "1 withdrawal within an hour of a credit in 90 days" },
    { key: "DUPLICATE_LISTING_PHOTOS", weight: 0.3, value: null, detail: "No image decoder installed" },
    { key: "SHARED_DEVICE", weight: 0.25, value: 1, detail: "Device token registered by 1 other login", links: [priya, priya, skyline] },
];

describe("the SHARED SIGNALS card", () => {
    it("lists every signal present — above zero, or not computable — strongest first, and drops the ones that read zero", () => {
        const rows = shapeSignals(signals);
        expect(rows.map((row) => row.key)).toEqual(["SHARED_PAN", "SHARED_DEVICE", "WITHDRAW_AFTER_CREDIT", "DUPLICATE_LISTING_PHOTOS"]);
        expect(rows[0]).toEqual({
            key: "SHARED_PAN",
            label: "PAN number",
            weight: 0.35,
            value: 1,
            contribution: 0.35,
            detail: "PAN ****1234 is on 2 other KYC rows",
            links: [priya, nova],
        });
        // A fraction contributes its share; a null contributes nothing and says so.
        expect(rows[2].contribution).toBe(0.1);
        expect(rows[3]).toMatchObject({ label: "Duplicate listing photos", value: null, contribution: 0, links: [] });
        // The same account named twice by one signal is one link.
        expect(rows[1].links).toEqual([priya, skyline]);
    });

    it("counts the distinct accounts across the stored signals for the queue row, and prints the score to two places", () => {
        expect(linkedPartiesOf(signals)).toEqual([priya, nova, skyline]);
        expect(linkedPartiesOf(null)).toEqual([]);
        expect(shapeSignals(null)).toEqual([]);
        expect(formatScore("0.912")).toBe("0.91");
        expect(formatScore("1.000")).toBe("1.00");
        expect(formatScore(null)).toBeNull();
        expect(formatScore("n/a")).toBeNull();
    });
});

describe("the link graph's layout", () => {
    const read = {
        subject: { type: "ADVERTISER" as const, id: "adv_1", name: "FakeAds Ltd", kycStatus: "PENDING", listingId: null },
        linked: [
            { party: priya, via: ["SHARED_PAN", "SHARED_DEVICE"], walletBalance: "12500.00", openBookings: 3 },
            { party: nova, via: ["SHARED_PAN"], walletBalance: null, openBookings: 0 },
            { party: skyline, via: ["SHARED_DEVICE"], walletBalance: "0.00", openBookings: 1 },
            { party: { type: "AGENT" as const, id: "agt_4", name: null }, via: ["SHARED_IP_SUBNET"], walletBalance: "800.50", openBookings: 2 },
        ],
        valueAtRisk: "61300.50",
        computedAt: "2026-09-14T06:00:00.000Z",
    };

    it("puts the subject in the centre and the linked accounts on a ring from twelve o'clock, one captioned edge each", () => {
        const layout = linkedGraphLayout(read, { width: 400, height: 300 });
        expect(layout.nodes).toHaveLength(5);
        expect(layout.edges).toHaveLength(4);
        const [subject, first, second, third, fourth] = layout.nodes;
        expect(subject).toMatchObject({ key: "ADVERTISER:adv_1", subject: true, x: 200, y: 150, initials: "FL", name: "FakeAds Ltd" });
        // G11-1: the subject's own exposure is not in the read — the rail is about the accounts around the case.
        expect(subject).toMatchObject({ walletBalance: null, openBookings: null });
        // Four on a ring of radius 102 (min side / 2 − 48): top, right, bottom, left.
        expect([first.x, first.y]).toEqual([200, 48]);
        expect([second.x, second.y]).toEqual([302, 150]);
        expect([third.x, third.y]).toEqual([200, 252]);
        expect([fourth.x, fourth.y]).toEqual([98, 150]);
        expect(first).toMatchObject({ key: "ADVERTISER:adv_2", subject: false, initials: "PA", type: "ADVERTISER", id: "adv_2" });
        // G11-1: each linked node carries its party's wallet balance and open bookings for the node card.
        expect(first).toMatchObject({ walletBalance: "12500.00", openBookings: 3 });
        expect(second).toMatchObject({ walletBalance: null, openBookings: 0 });
        expect(fourth).toMatchObject({ walletBalance: "800.50", openBookings: 2 });
        // No name: the id's first two letters stand in.
        expect(fourth.initials).toBe("AG");
        expect(layout.edges[0]).toEqual({ from: "ADVERTISER:adv_1", to: "ADVERTISER:adv_2", label: "PAN number · Device fingerprint", x: 200, y: 99 });
        expect(layout.edges[3].label).toBe("IP subnet");
    });

    it("G13-B: puts the evaluated-but-unlinked parties in a band under the ring as clean nodes with no edge", () => {
        const evaluated = [
            { party: { type: "PUBLISHER" as const, id: "pub_77", name: "Clean Boards" }, linked: false as const },
            { party: { type: "ADVERTISER" as const, id: "adv_2", name: "already linked" }, linked: false as const },
            { party: { type: "AGENT" as const, id: "agt_5", name: null }, linked: false as const },
        ];
        const layout = linkedGraphLayout({ ...read, evaluated }, { width: 400, height: 300 });
        // The ring is where it was; the layout grew by the band; adv_2 is linked now and so is not doubled.
        expect(layout.height).toBe(300 + CLEAN_BAND_HEIGHT);
        expect(layout.nodes[1]).toMatchObject({ key: "ADVERTISER:adv_2", clean: false, x: 200, y: 48 });
        const clean = layout.nodes.filter((node) => node.clean);
        expect(clean.map((node) => [node.key, node.x, node.y])).toEqual([
            ["PUBLISHER:pub_77", 133, 328],
            ["AGENT:agt_5", 267, 328],
        ]);
        expect(layout.edges).toHaveLength(4);
        expect(linkedGraphLayout({ ...read, evaluated: [] }, { width: 400, height: 300 }).height).toBe(300);
    });

    it("draws the subject alone when nothing is linked, and never lets the ring collapse", () => {
        const layout = linkedGraphLayout({ ...read, linked: [] }, { width: 100, height: 100 });
        expect(layout.nodes).toHaveLength(1);
        expect(layout.edges).toEqual([]);
        const tight = linkedGraphLayout({ ...read, linked: read.linked.slice(0, 1) }, { width: 100, height: 100 });
        expect(tight.nodes[1].y).toBe(50 - 60);
        expect(partyInitials("Nova Reach", "x")).toBe("NR");
        expect(partyInitials("  ", "agt_4")).toBe("AG");
    });
});

describe("the people on a case — G11-1", () => {
    it("prints the read's name, the id when the lookup found none, and the given word for nobody", () => {
        expect(casePersonLabel({ id: "usr_1", name: "Priya Nair" }, "usr_1")).toBe("Priya Nair");
        expect(casePersonLabel({ id: "usr_1", name: null }, "usr_1")).toBe("usr_1");
        expect(casePersonLabel({ id: "usr_1", name: "  " }, "usr_1")).toBe("usr_1");
        // A write answers the row without the names: the id column stands in until the desk re-reads.
        expect(casePersonLabel(undefined, "usr_1")).toBe("usr_1");
        expect(casePersonLabel(null, null)).toBe("Nobody yet");
        expect(casePersonLabel(null, null, "nobody in particular")).toBe("nobody in particular");
    });
});

describe("the scan hand-off", () => {
    it("round-trips the party through the query string and refuses a type it does not know", () => {
        expect(scanParam("PUBLISHER", "pub_1")).toBe("PUBLISHER:pub_1");
        expect(parseScanParam("PUBLISHER:pub_1")).toEqual({ subjectType: "PUBLISHER", subjectId: "pub_1" });
        expect(parseScanParam("AGENT:agt:with:colons")).toEqual({ subjectType: "AGENT", subjectId: "agt:with:colons" });
        expect(parseScanParam("USER:usr_1")).toBeNull();
        expect(parseScanParam("PUBLISHER:")).toBeNull();
        expect(parseScanParam(null)).toBeNull();
    });

    it("calls the four Lot G routes with the bodies the schemas take", async () => {
        calls.length = 0;
        await fraudService.score("frd_1");
        await fraudService.linked("frd_1");
        await fraudService.escalate("frd_1", { note: "The sums warrant a notice.", toUserId: "usr_legal" });
        await fraudService.escalate("frd_1", { note: "Hand to the investigator." });
        await fraudService.scan("AGENT", "agt 4");
        expect(calls).toEqual([
            { method: "POST", path: "/fraud/cases/frd_1/score", body: {} },
            { method: "GET", path: "/fraud/cases/frd_1/linked", body: undefined },
            { method: "POST", path: "/fraud/cases/frd_1/escalate", body: { note: "The sums warrant a notice.", toUserId: "usr_legal" } },
            { method: "POST", path: "/fraud/cases/frd_1/escalate", body: { note: "Hand to the investigator." } },
            { method: "POST", path: "/fraud/scan/AGENT/agt%204", body: {} },
        ]);
    });
});
