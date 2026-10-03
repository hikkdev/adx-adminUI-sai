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
    attributeGroups,
    caseTitle,
    confirmableScopes,
    defaultScopesFor,
    estimateTextWidth,
    formatScore,
    fraudCasesPath,
    fraudGraphLayout,
    fraudService,
    graphAttributes,
    GRAPH_MAX_ACCOUNTS,
    GRAPH_MIN_HEIGHT,
    GRAPH_NODE_RADIUS,
    isDecided,
    casePersonLabel,
    linkedPartiesOf,
    looksUnmasked,
    maskedDisplay,
    parseScanParam,
    partyInitials,
    scanParam,
    shapeSignals,
    sharedByLabel,
    subjectHref,
    type FraudSignal,
    type LinkedAccount,
    type LinkedPartyType,
    type SharedAttribute,
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

/* 28 Sep 2026: the link graph is bipartite — accounts, shared attributes, and the clean column. */

const subjectRow = { type: "ADVERTISER" as const, id: "adv_1", name: "FakeAds Ltd", kycStatus: "PENDING", listingId: null };

/** `n` linked accounts, most sharing the one subnet (the read that printed "IP subnet" fifteen times), some a PAN or a device too. */
function manyLinked(n: number): LinkedAccount[] {
    return Array.from({ length: n }, (_, i) => ({
        party: { type: (i % 3 === 0 ? "PUBLISHER" : "ADVERTISER") as LinkedPartyType, id: `p_${i}`, name: `Account Number ${i + 1} Private Limited` },
        via: ["SHARED_IP_SUBNET", ...(i % 4 === 0 ? ["SHARED_PAN"] : []), ...(i % 5 === 0 ? ["SHARED_DEVICE"] : [])],
        walletBalance: i % 2 ? "1000.00" : null,
        openBookings: i % 3,
        kycStatus: i % 2 ? "VERIFIED" : "PENDING",
    }));
}

function attributesFor(linked: LinkedAccount[]): SharedAttribute[] {
    const count = (signal: string) => linked.filter((account) => account.via.includes(signal)).length;
    return [
        { signal: "SHARED_PAN", label: "PAN number", display: "PAN ••••234F", accounts: count("SHARED_PAN") },
        { signal: "SHARED_IP_SUBNET", label: "IP subnet", display: "103.21.58.x/24", accounts: count("SHARED_IP_SUBNET") },
        { signal: "SHARED_DEVICE", label: "Device fingerprint", display: "Device 4f2a", accounts: count("SHARED_DEVICE") },
    ].filter((attribute) => attribute.accounts > 0);
}

const evaluatedOf = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ party: { type: "ADVERTISER" as const, id: `clean_${i}`, name: i === 0 ? "Zepto" : `Blinkit Commerce ${i}` }, linked: false as const }));

function assertReadable(graph: ReturnType<typeof fraudGraphLayout>) {
    const drawn = graph.nodes.filter((node) => node.captionBox);
    for (let i = 0; i < drawn.length; i += 1) {
        const a = drawn[i].captionBox!;
        // Inside the card.
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.x + a.width).toBeLessThanOrEqual(graph.width);
        expect(a.y).toBeGreaterThanOrEqual(0);
        expect(a.y + a.height).toBeLessThanOrEqual(graph.height);
        for (let j = i + 1; j < drawn.length; j += 1) {
            const b = drawn[j].captionBox!;
            const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
            expect(overlap, `"${drawn[i].caption.join(" / ")}" overlaps "${drawn[j].caption.join(" / ")}"`).toBe(false);
        }
        // No caption over another node's circle.
        for (const other of graph.nodes) {
            if (other === drawn[i]) continue;
            const nx = Math.min(Math.max(other.x, a.x), a.x + a.width);
            const ny = Math.min(Math.max(other.y, a.y), a.y + a.height);
            expect((nx - other.x) ** 2 + (ny - other.y) ** 2).toBeGreaterThanOrEqual(GRAPH_NODE_RADIUS ** 2);
        }
    }
    // No two circles overlap either.
    for (let i = 0; i < graph.nodes.length; i += 1) {
        for (let j = i + 1; j < graph.nodes.length; j += 1) {
            const a = graph.nodes[i];
            const b = graph.nodes[j];
            expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.key} and ${b.key}`).toBeGreaterThanOrEqual(2 * GRAPH_NODE_RADIUS + 4);
        }
    }
}

describe("the link graph — bipartite (28 Sep 2026)", () => {
    const linked: LinkedAccount[] = [
        { party: priya, via: ["SHARED_PAN", "SHARED_DEVICE"], walletBalance: "12500.00", openBookings: 3, kycStatus: "VERIFIED" },
        { party: nova, via: ["SHARED_PAN"], walletBalance: null, openBookings: 0 },
        { party: skyline, via: ["SHARED_DEVICE", "SHARED_BANK"], walletBalance: "0.00", openBookings: 1 },
    ];
    const attributes: SharedAttribute[] = [
        { signal: "SHARED_PAN", label: "PAN number", display: "PAN ••••234F", accounts: 2 },
        { signal: "SHARED_BANK", label: "Payout account", display: "HDFC ••4821", accounts: 1 },
        { signal: "SHARED_DEVICE", label: "Device fingerprint", display: "Device 4f2a", accounts: 2 },
    ];
    const read = { subject: subjectRow, linked, attributes, evaluated: evaluatedOf(2) };

    it("draws the subject and the accounts joined to shared-attribute nodes — no edge captions, the subject to every attribute", () => {
        const graph = fraudGraphLayout(read, { width: 900 });
        const kinds = graph.nodes.map((node) => node.kind);
        expect(kinds.filter((kind) => kind === "subject")).toHaveLength(1);
        expect(kinds.filter((kind) => kind === "account")).toHaveLength(3);
        expect(graph.nodes.filter((node) => node.kind === "attribute").map((node) => node.caption)).toEqual([
            ["PAN ••••234F", "shared with 2"],
            ["HDFC ••4821", "shared with 1"],
            ["Device 4f2a", "shared with 2"],
        ]);
        expect(graph.nodes.find((node) => node.signal === "SHARED_PAN")!.initials).toBe("ID");
        expect(graph.nodes.find((node) => node.signal === "SHARED_BANK")!.initials).toBe("₹");
        // Bipartite: every edge joins an account (or the subject) to an attribute.
        for (const edge of graph.edges) {
            expect(edge.to.startsWith("attr:")).toBe(true);
            expect(edge.from.startsWith("attr:")).toBe(false);
            expect(edge).not.toHaveProperty("label");
        }
        const from = (key: string) => graph.edges.filter((edge) => edge.from === key).map((edge) => edge.to).sort();
        expect(from("ADVERTISER:adv_1")).toEqual(["attr:SHARED_BANK", "attr:SHARED_DEVICE", "attr:SHARED_PAN"]);
        expect(from("ADVERTISER:adv_2")).toEqual(["attr:SHARED_DEVICE", "attr:SHARED_PAN"]);
        expect(from("PUBLISHER:pub_9")).toEqual(["attr:SHARED_BANK", "attr:SHARED_DEVICE"]);
        // Captions are the name only; the account carries what the hover card shows.
        expect(graph.nodes.find((node) => node.key === "ADVERTISER:adv_2")).toMatchObject({
            caption: ["Prime Ads"],
            title: "Prime Ads",
            initials: "PA",
            walletBalance: "12500.00",
            openBookings: 3,
            kycStatus: "VERIFIED",
        });
        assertReadable(graph);
    });

    it("puts the attributes on a central band with the accounts above and below it", () => {
        const graph = fraudGraphLayout(read, { width: 900 });
        const band = graph.nodes.filter((node) => node.kind === "attribute").map((node) => node.y);
        expect(new Set(band).size).toBe(1);
        for (const node of graph.nodes.filter((n) => n.kind === "account" || n.kind === "subject")) expect(node.y).not.toBe(band[0]);
        const subject = graph.nodes.find((node) => node.kind === "subject")!;
        expect(subject.y).toBeLessThan(band[0]);
    });

    it("stands the clean parties in a column at the right edge, captioned '<name> · no link', with no edge", () => {
        const graph = fraudGraphLayout(read, { width: 900 });
        const clean = graph.nodes.filter((node) => node.kind === "clean");
        expect(clean.map((node) => node.caption[0])).toEqual(["Zepto · no link", expect.stringMatching(/^Blinkit.* · no link$/)]);
        expect(new Set(clean.map((node) => node.x)).size).toBe(1);
        const rightmostOther = Math.max(...graph.nodes.filter((node) => node.kind !== "clean").map((node) => node.x));
        expect(clean[0].x).toBeGreaterThan(rightmostOther);
        expect(graph.edges.some((edge) => edge.from.startsWith("ADVERTISER:clean_") || edge.to.startsWith("ADVERTISER:clean_"))).toBe(false);
        // A clean party linked now, or the subject, is not doubled.
        const doubled = fraudGraphLayout({ ...read, evaluated: [{ party: priya, linked: false }, { party: { type: "ADVERTISER", id: "adv_1", name: "x" }, linked: false }] }, { width: 900 });
        expect(doubled.nodes.filter((node) => node.kind === "clean")).toEqual([]);
    });

    it("deduplicates the attribute nodes, and derives them from `via` when the server is a release behind", () => {
        const twice = fraudGraphLayout({ ...read, attributes: [...attributes, { ...attributes[0], display: "PAN ••••0000" }] }, { width: 900 });
        expect(twice.nodes.filter((node) => node.kind === "attribute").map((node) => node.signal)).toEqual(["SHARED_PAN", "SHARED_BANK", "SHARED_DEVICE"]);
        // A signal the server did not name still gets its node, by label.
        const partial = graphAttributes({ linked, attributes: [attributes[0]] });
        expect(partial).toEqual([
            attributes[0],
            { signal: "SHARED_DEVICE", label: "Device fingerprint", display: "Device fingerprint", accounts: 2 },
            { signal: "SHARED_BANK", label: "Payout account", display: "Payout account", accounts: 1 },
        ]);
        const behind = fraudGraphLayout({ subject: subjectRow, linked }, { width: 900 });
        expect(behind.nodes.filter((node) => node.kind === "attribute").map((node) => node.title)).toEqual([
            "PAN number · shared with 2",
            "Device fingerprint · shared with 2",
            "Payout account · shared with 1",
        ]);
        expect(behind.nodes.filter((node) => node.kind === "clean")).toEqual([]);
    });

    it("draws at most twelve accounts, most-linked first, the rest behind a '+N more' node", () => {
        const many = manyLinked(30);
        const graph = fraudGraphLayout({ subject: subjectRow, linked: many, attributes: attributesFor(many) }, { width: 1100 });
        const accounts = graph.nodes.filter((node) => node.kind === "account");
        expect(accounts).toHaveLength(GRAPH_MAX_ACCOUNTS);
        // The two- and three-signal accounts are drawn before the one-signal ones.
        const minDrawn = Math.min(...accounts.map((node) => node.via.length));
        expect(Math.max(...graph.undrawn.map((account) => account.via.length))).toBeLessThanOrEqual(minDrawn);
        expect(graph.undrawn).toHaveLength(18);
        const more = graph.nodes.find((node) => node.kind === "more")!;
        expect(more).toMatchObject({ initials: "+18", count: 18, moreOf: "accounts", title: "18 more linked accounts" });
        expect(graph.edges.filter((edge) => edge.from === more.key).every((edge) => edge.dashed)).toBe(true);
        expect(fraudGraphLayout({ subject: subjectRow, linked: many.slice(0, 5) }, { width: 1100, maxAccounts: 3 }).undrawn).toHaveLength(2);
    });

    for (const width of [540, 600, 1100]) {
        for (const count of [3, 15, 30]) {
            it(`never lets two drawn captions overlap — ${count} accounts at ${width} px`, () => {
                const many = manyLinked(count);
                const graph = fraudGraphLayout({ subject: subjectRow, linked: many, attributes: attributesFor(many), evaluated: evaluatedOf(3) }, { width });
                expect(graph.width).toBe(width);
                expect(graph.height).toBeGreaterThanOrEqual(GRAPH_MIN_HEIGHT);
                assertReadable(graph);
                // Names only, never the signal: "IP subnet" is on its one attribute node, not repeated per account.
                const captions = graph.nodes.flatMap((node) => node.caption);
                expect(captions.filter((line) => line.includes("103.21.58.x/24"))).toHaveLength(1);
                expect(captions.some((line) => line.includes("IP subnet"))).toBe(false);
                // Most captions survive the collision pass.
                const shown = graph.nodes.filter((node) => node.captionBox).length;
                expect(shown / graph.nodes.length).toBeGreaterThan(0.6);
            });
        }
    }

    it("staggers a crowded band so seven attributes still read at 600 px", () => {
        const seven = ["SHARED_PAN", "SHARED_BANK", "SHARED_IP_SUBNET", "SHARED_PHONE_ACROSS_ROLES", "SHARED_DEVICE", "DUPLICATE_LISTING_PHOTOS", "SELF_DEALING"];
        const linkedSeven = seven.map((signal, i) => ({ party: { type: "ADVERTISER" as const, id: `a_${i}`, name: `Party ${i}` }, via: [signal], walletBalance: null, openBookings: 0 }));
        const graph = fraudGraphLayout({ subject: subjectRow, linked: linkedSeven, evaluated: evaluatedOf(2) }, { width: 600 });
        const ys = new Set(graph.nodes.filter((node) => node.kind === "attribute").map((node) => node.y));
        expect(ys.size).toBe(2);
        assertReadable(graph);
    });

    it("truncates a long name to its room and keeps the whole name for the tooltip", () => {
        const long = { party: { type: "PUBLISHER" as const, id: "pub_long", name: "Sri Venkateswara Outdoor Advertising and Hoardings Private Limited" }, via: ["SHARED_PAN"], walletBalance: null, openBookings: 0 };
        const graph = fraudGraphLayout({ subject: subjectRow, linked: [long] }, { width: 600 });
        const node = graph.nodes.find((n) => n.key === "PUBLISHER:pub_long")!;
        expect(node.title).toBe(long.party.name);
        expect(node.caption[0].endsWith("…")).toBe(true);
        expect(estimateTextWidth(node.caption[0])).toBeLessThanOrEqual(170);
    });

    it("draws the subject alone when nothing is linked", () => {
        const graph = fraudGraphLayout({ subject: subjectRow, linked: [] }, { width: 700 });
        expect(graph.nodes.map((node) => node.kind)).toEqual(["subject"]);
        expect(graph.edges).toEqual([]);
        expect(graph.nodes[0].x).toBe(350);
        expect(partyInitials("Nova Reach", "x")).toBe("NR");
        expect(partyInitials("  ", "agt_4")).toBe("AG");
    });

    it("groups the accounts by attribute for the narrow card", () => {
        expect(attributeGroups({ linked, attributes }).map((group) => [group.attribute.signal, group.accounts.map((a) => a.party.id)])).toEqual([
            ["SHARED_PAN", ["adv_2", "adv_3"]],
            ["SHARED_BANK", ["pub_9"]],
            ["SHARED_DEVICE", ["adv_2", "pub_9"]],
        ]);
        expect(sharedByLabel({ accounts: 3 })).toBe("shared with 3");
    });
});

describe("the masking contract on the client", () => {
    it("draws the server's masked value, and never one that looks whole", () => {
        expect(maskedDisplay({ signal: "SHARED_PAN", label: "PAN number", display: "PAN ••••234F" })).toBe("PAN ••••234F");
        expect(maskedDisplay({ signal: "SHARED_BANK", label: "Payout account", display: "HDFC ••4821" })).toBe("HDFC ••4821");
        expect(maskedDisplay({ signal: "SHARED_IP_SUBNET", label: "IP subnet", display: "103.21.58.x/24" })).toBe("103.21.58.x/24");
        // A whole PAN, account number, mobile, address or UPI id falls back to the label.
        expect(maskedDisplay({ signal: "SHARED_PAN", label: "PAN number", display: "PAN ABCDE1234F" })).toBe("PAN number");
        expect(maskedDisplay({ signal: "SHARED_BANK", label: "Payout account", display: "HDFC 50100012344821" })).toBe("Payout account");
        expect(maskedDisplay({ signal: "SHARED_PHONE_ACROSS_ROLES", label: "Mobile across roles", display: "+91 9876543210" })).toBe("Mobile across roles");
        expect(maskedDisplay({ signal: "SHARED_IP_SUBNET", label: "IP subnet", display: "103.21.58.47" })).toBe("IP subnet");
        expect(maskedDisplay({ signal: "SHARED_BANK", label: "Payout account", display: "ramesh@okhdfc" })).toBe("Payout account");
        // No display, no label: the signal's own label.
        expect(maskedDisplay({ signal: "SHARED_DEVICE", display: "" })).toBe("Device fingerprint");
        expect(looksUnmasked("Device 4f2a · 6 sessions")).toBe(false);
    });

    it("re-checks every attribute the read carries before the graph draws it", () => {
        const graph = fraudGraphLayout(
            {
                subject: subjectRow,
                linked: [{ party: priya, via: ["SHARED_PAN"], walletBalance: null, openBookings: 0 }],
                attributes: [{ signal: "SHARED_PAN", label: "PAN number", display: "ABCDE1234F", accounts: 1 }],
            },
            { width: 800 }
        );
        const pan = graph.nodes.find((node) => node.kind === "attribute")!;
        expect(pan.caption[0]).toBe("PAN number");
        expect(JSON.stringify(graph)).not.toContain("ABCDE1234F");
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
