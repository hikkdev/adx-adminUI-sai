import { describe, expect, it, vi } from "vitest";

/**
 * The comms desk as the console reads it — Lot E's dispatcher.
 *
 * A template's key is its callers' handle and every PATCH bumps the version,
 * so what is sent is pinned: only the fields that moved, and never a PATCH
 * for an edit that changed nothing. A resend puts a real message back on a
 * real queue, so the rule for when the button is drawn is the server's own.
 */

const { calls, saved } = vi.hoisted(() => ({
    calls: [] as { method: string; path: string; body?: unknown }[],
    saved: [] as { filename: string; size: number }[],
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (method: string) => async (path: string, body?: unknown) => {
        calls.push({ method, path, body });
        return {};
    };
    return {
        ...actual,
        api: {
            get: record("GET"),
            post: record("POST"),
            patch: record("PATCH"),
            put: record("PUT"),
            delete: record("DELETE"),
            blob: async (path: string) => {
                calls.push({ method: "BLOB", path });
                return { blob: new Blob(["id,createdAt\n"]), filename: "deliveries-2026-09-13-08-00-00.csv", contentType: "text/csv" };
            },
        },
        saveBlob: (blob: Blob, filename: string) => {
            saved.push({ filename, size: blob.size });
        },
    };
});

import {
    canResend,
    channelCount,
    commsService,
    deliveriesQuery,
    draftOf,
    emptyDraft,
    draftVariables,
    etherealPreviewUrl,
    eventVariablesDiff,
    exportDeliveriesQuery,
    exportFilename,
    formatDeliveryRate,
    placeholdersOf,
    resendBlocker,
    sumTemplateStats,
    templateInput,
    templatePatch,
    templateProblem,
    templatesQuery,
    TEMPLATE_CHANNELS,
    type CommsEvent,
    type CommsTemplate,
    type Delivery,
} from "./comms";

const template = (over: Partial<CommsTemplate> = {}): CommsTemplate => ({
    id: "tpl_1",
    key: "payout-paid",
    event: "PAYOUT_PAID",
    channels: ["EMAIL", "SMS"],
    subject: "ADX payout of ₹{{amount}} sent",
    emailBody: "<p>Your payout of <strong>₹{{amount}}</strong> was sent to {{method}}.</p>",
    smsKind: "PAYOUT_PAID",
    smsBody: "ADX: your payout of ₹{{amount}} was sent to {{method}}. Ref {{reference}}.",
    pushTitle: null,
    pushBody: null,
    isSensitive: false,
    transactional: true,
    status: "ACTIVE",
    version: 3,
    updatedById: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-12T00:00:00.000Z",
    variables: ["amount", "method", "reference"],
    stats: { sent30d: 120, delivered30d: 96, failed30d: 4, deliveryRate: 0.97 },
    ...over,
});

const event = (over: Partial<CommsEvent> = {}): CommsEvent => ({
    event: "PAYOUT_PAID",
    variables: ["amount", "method", "reference", "utr"],
    raisedBy: ["payouts"],
    via: "notify",
    templates: [{ key: "payout-paid", status: "ACTIVE", channels: ["EMAIL", "SMS"] }],
    ...over,
});

const delivery = (over: Partial<Delivery> = {}): Delivery => ({
    id: "dlv_1",
    userId: "usr_1",
    notificationId: null,
    templateKey: "payout-paid",
    channel: "SMS",
    recipientMasked: "+91 98450 •••23",
    recipientHash: "a".repeat(64),
    variables: { amount: "1,24,500" },
    status: "FAILED",
    attempts: 3,
    provider: "msg91",
    providerMessageId: null,
    lastError: "Rail timed out",
    sentAt: null,
    deliveredAt: null,
    purgedAt: null,
    createdAt: "2026-09-12T08:00:00.000Z",
    ...over,
});

describe("the 30-day figures (E10-2)", () => {
    it("sums every template's counts and computes the rate over the sums, the server's own rule", () => {
        const totals = sumTemplateStats([
            template(),
            template({ stats: { sent30d: 30, delivered30d: 0, failed30d: 20, deliveryRate: 0.6 } }),
            template({ stats: { sent30d: 0, delivered30d: 0, failed30d: 0, deliveryRate: null } }),
        ]);
        // 150 / (150 + 24) = 0.862… → two places, not the average of 0.97, 0.6 and nothing.
        expect(totals).toEqual({ sent30d: 150, delivered30d: 96, failed30d: 24, deliveryRate: 0.86 });
    });

    it("is null, not zero, when nothing was attempted — and tolerates a row with no stats", () => {
        expect(sumTemplateStats([])).toEqual({ sent30d: 0, delivered30d: 0, failed30d: 0, deliveryRate: null });
        expect(sumTemplateStats([{ stats: undefined as unknown as CommsTemplate["stats"] }]).deliveryRate).toBeNull();
    });

    it("prints a rate as a whole percentage and a null one as a dash", () => {
        expect(formatDeliveryRate(0.97)).toBe("97%");
        expect(formatDeliveryRate(1)).toBe("100%");
        expect(formatDeliveryRate(null)).toBe("—");
    });

    it("reads a channel chip's count off byChannel, zero when the page did not name it", () => {
        expect(channelCount({ byChannel: { EMAIL: 12, SMS: 3 } }, "EMAIL")).toBe(12);
        expect(channelCount({ byChannel: { EMAIL: 12, SMS: 3 } }, "PUSH")).toBe(0);
        expect(channelCount({ byChannel: undefined as unknown as Record<string, number> }, "SMS")).toBe(0);
    });
});

describe("the events catalogue against the placeholders typed (E10-2)", () => {
    it("names what the event supplies, what it does not, and what it offers that no body uses", () => {
        expect(eventVariablesDiff(["amount", "method", "bankName"], event())).toEqual({
            provided: ["amount", "method"],
            missing: ["bankName"],
            unused: ["reference", "utr"],
            unknown: [],
        });
    });

    it("has nothing to say without a catalogue entry — every placeholder is unknown, none is called missing", () => {
        expect(eventVariablesDiff(["amount"], null)).toEqual({ provided: [], missing: [], unused: [], unknown: ["amount"] });
        expect(eventVariablesDiff([], event({ variables: [] }))).toEqual({ provided: [], missing: [], unused: [], unknown: [] });
    });
});

describe("the list queries", () => {
    it("names the list contract's facets and leaves blanks off", () => {
        expect(templatesQuery({ q: " otp ", status: ["ACTIVE", "DRAFT"], event: "LOGIN_OTP", sort: "key", pageSize: 100 })).toBe(
            "q=otp&status=ACTIVE%2CDRAFT&sort=key&page=1&pageSize=100&event=LOGIN_OTP",
        );
        expect(templatesQuery()).toBe("page=1&pageSize=20");
    });

    it("carries every delivery facet the server cuts by", () => {
        const query = deliveriesQuery({
            channel: "EMAIL",
            status: ["FAILED"],
            templateKey: "kyc-decision",
            q: "j***@x.com",
            from: "2026-09-01T00:00:00.000Z",
            to: "2026-09-12T00:00:00.000Z",
            sort: "newest",
        });
        const params = new URLSearchParams(query);
        expect(params.get("channel")).toBe("EMAIL");
        expect(params.get("status")).toBe("FAILED");
        expect(params.get("templateKey")).toBe("kyc-decision");
        expect(params.get("q")).toBe("j***@x.com");
        expect(params.get("from")).toBe("2026-09-01T00:00:00.000Z");
        expect(params.get("to")).toBe("2026-09-12T00:00:00.000Z");
        expect(params.has("userId")).toBe(false);
    });

    it("files the export under the same filters, with no page", () => {
        const query = exportDeliveriesQuery({ channel: "SMS", status: ["FAILED", "SKIPPED"], templateKey: "kyc-decision", q: " otp ", sort: "oldest", page: 3, pageSize: 50 });
        const params = new URLSearchParams(query);
        expect(params.get("channel")).toBe("SMS");
        expect(params.get("status")).toBe("FAILED,SKIPPED");
        expect(params.get("templateKey")).toBe("kyc-decision");
        expect(params.get("q")).toBe("otp");
        expect(params.get("sort")).toBe("oldest");
        expect(params.has("page")).toBe(false);
        expect(params.has("pageSize")).toBe(false);
        expect(exportDeliveriesQuery()).toBe("");
        expect(exportFilename(null, new Date("2026-09-13T10:00:00.000Z"))).toBe("deliveries-2026-09-13.csv");
        expect(exportFilename("named.csv")).toBe("named.csv");
    });
});

describe("what the editor refuses before the server would", () => {
    it("wants a slug key on create and an UPPER_SNAKE event always", () => {
        const draft = draftOf(template());
        expect(templateProblem(draft, "Payout Paid")).toMatch(/key/);
        expect(templateProblem(draft, "payout-paid")).toBeNull();
        expect(templateProblem({ ...draft, event: "payout.paid" })).toMatch(/UPPER_SNAKE/);
    });

    it("wants a body for each channel that is on, and a kind for SMS", () => {
        const draft = draftOf(template());
        expect(templateProblem({ ...draft, channels: [] })).toMatch(/channel/);
        expect(templateProblem({ ...draft, emailBody: " " })).toMatch(/email body/);
        expect(templateProblem({ ...draft, smsKind: "" })).toMatch(/kind/);
        expect(templateProblem({ ...draft, smsBody: "" })).toMatch(/registered text/);
        expect(templateProblem({ ...draft, channels: ["EMAIL"], smsKind: "", smsBody: "" })).toBeNull();
    });

    it("G13-C: lets PUSH on with no copy of its own (the push falls back to the subject) but holds the server's caps", () => {
        const draft = draftOf(template());
        expect(TEMPLATE_CHANNELS).toEqual(["EMAIL", "SMS", "PUSH"]);
        expect(templateProblem({ ...draft, channels: ["PUSH"] })).toBeNull();
        expect(templateProblem({ ...draft, channels: ["PUSH"], pushTitle: "x".repeat(201) })).toMatch(/push title/);
        expect(templateProblem({ ...draft, channels: ["PUSH"], pushBody: "x".repeat(1001) })).toMatch(/push body/);
        expect(templatePatch(template(), { ...draft, pushTitle: "Paid ₹{{amount}}", pushBody: "" })).toEqual({ pushTitle: "Paid ₹{{amount}}" });
        expect(draftVariables({ subject: "", emailBody: "", smsBody: "", pushTitle: "{{title}}", pushBody: "{{body}}" })).toEqual(["title", "body"]);
    });
});

describe("the patch is only what moved", () => {
    it("is empty for an untouched draft, so no version is bumped for nothing", () => {
        expect(templatePatch(template(), draftOf(template()))).toEqual({});
    });

    it("names the changed fields and nulls a body that was cleared", () => {
        const draft = { ...draftOf(template()), subject: "Paid: ₹{{amount}}", smsBody: "", status: "DRAFT" as const, channels: ["EMAIL"] as const };
        expect(templatePatch(template(), { ...draft, channels: [...draft.channels] })).toEqual({
            subject: "Paid: ₹{{amount}}",
            smsBody: null,
            status: "DRAFT",
            channels: ["EMAIL"],
        });
    });

    it("treats channel order as no change", () => {
        expect(templatePatch(template(), { ...draftOf(template()), channels: ["SMS", "EMAIL"] })).toEqual({});
    });

    it("builds the create body with blanks as null", () => {
        expect(templateInput(" welcome ", { ...draftOf(template()), subject: "", smsKind: "" })).toMatchObject({
            key: "welcome",
            subject: null,
            smsKind: null,
            isSensitive: false,
        });
    });
});

describe("the variables a body names", () => {
    it("reads {{name}} once each, in order, whitespace tolerated — the server's own rule", () => {
        expect(placeholdersOf("Hi {{ name }}, {{amount}} for {{name}}", null, "{{amount}} {{reference}}")).toEqual(["name", "amount", "reference"]);
        expect(draftVariables({ subject: "", emailBody: "", smsBody: "", pushTitle: "", pushBody: "" })).toEqual([]);
    });
});

describe("when a resend is offered", () => {
    it("is offered for an email or SMS row whose template is not sensitive and whose variables are still there", () => {
        expect(canResend(delivery(), template())).toBe(true);
        expect(resendBlocker(delivery(), template())).toBeNull();
    });

    it("is not offered for a sensitive template, a purged row, or an in-app row", () => {
        expect(canResend(delivery(), template({ isSensitive: true }))).toBe(false);
        expect(resendBlocker(delivery(), template({ isSensitive: true }))).toMatch(/sensitive/);
        expect(canResend(delivery({ purgedAt: "2026-09-13T00:00:00.000Z", variables: null }), template())).toBe(false);
        expect(resendBlocker(delivery({ purgedAt: "2026-09-13T00:00:00.000Z" }), template())).toMatch(/purged/);
        expect(canResend(delivery({ channel: "IN_APP" }), template())).toBe(false);
    });

    it("is offered when the template is unknown to the console: the server has the final word", () => {
        expect(canResend(delivery({ templateKey: "gone" }), undefined)).toBe(true);
    });
});

describe("the routes", () => {
    it("reads, creates, patches and resends where the module mounts them", async () => {
        calls.length = 0;
        await commsService.templates({ status: ["ACTIVE"] });
        await commsService.template("payout-paid");
        await commsService.createTemplate(templateInput("welcome", draftOf(template({ smsKind: null, smsBody: null, channels: ["EMAIL"] }))));
        await commsService.updateTemplate("payout-paid", { status: "RETIRED" });
        await commsService.deliveries({ channel: "SMS" });
        await commsService.delivery("dlv_1");
        await commsService.resend("dlv_1");
        await commsService.events();
        await commsService.smsKinds();
        expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
            "GET /comms/templates?status=ACTIVE&page=1&pageSize=20",
            "GET /comms/templates/payout-paid",
            "POST /comms/templates",
            "PATCH /comms/templates/payout-paid",
            "GET /comms/deliveries?page=1&pageSize=20&channel=SMS",
            "GET /comms/deliveries/dlv_1",
            "POST /comms/deliveries/dlv_1/resend",
            "GET /comms/events",
            "GET /comms/sms-kinds",
        ]);
        expect(calls[2].body).toMatchObject({ key: "welcome", event: "PAYOUT_PAID", channels: ["EMAIL"] });
        expect(calls[3].body).toEqual({ status: "RETIRED" });
        expect(calls[6].body).toBeUndefined();
    });

    it("downloads the export through the blob helper under the filters in force and hands it to the browser", async () => {
        calls.length = 0;
        saved.length = 0;
        const result = await commsService.exportDeliveries({ channel: "EMAIL", status: ["FAILED"], sort: "newest" });
        expect(calls).toEqual([{ method: "BLOB", path: "/comms/deliveries/export.csv?status=FAILED&sort=newest&channel=EMAIL" }]);
        expect(saved).toEqual([{ filename: "deliveries-2026-09-13-08-00-00.csv", size: result.bytes }]);
        expect(result.filename).toBe("deliveries-2026-09-13-08-00-00.csv");
    });
});

describe("Lot G (Q117/Q121): send test, the transactional switch and the attempt trail", () => {
    it("posts the test to the template's own route with no address — the server sends to the operator's own", async () => {
        calls.length = 0;
        await commsService.sendTest("payout-paid");
        await commsService.sendTest("payout paid", ["SMS"]);
        expect(calls).toEqual([
            { method: "POST", path: "/comms/templates/payout-paid/send-test", body: {} },
            { method: "POST", path: "/comms/templates/payout%20paid/send-test", body: { channels: ["SMS"] } },
        ]);
        for (const call of calls) {
            expect(JSON.stringify(call.body)).not.toMatch(/"to"|"email"|@/);
        }
    });

    it("a new draft is transactional, the server's own default, and the patch carries the switch only when it moved", () => {
        expect(emptyDraft().transactional).toBe(true);
        const before = template();
        expect(templatePatch(before, { ...draftOf(before), transactional: false })).toEqual({ transactional: false });
        expect(templatePatch(before, draftOf(before))).toEqual({});
        expect(templateInput("announcement", { ...emptyDraft(), event: "ANNOUNCEMENT", emailBody: "<p>Hi</p>", transactional: false }).transactional).toBe(false);
    });

    it("reads a row older than the column as transactional rather than as capped", () => {
        const older = template({ transactional: undefined as unknown as boolean });
        expect(draftOf(older).transactional).toBe(true);
        expect(templatePatch(older, draftOf(older))).toEqual({});
    });

    it("reads the single delivery, where the attempt rows live", async () => {
        calls.length = 0;
        await commsService.delivery("dlv_9");
        expect(calls).toEqual([{ method: "GET", path: "/comms/deliveries/dlv_9", body: undefined }]);
    });
});

/** AE-C: the Ethereal preview inside a try's response, for the delivery log to print as a link. */
describe("the Ethereal preview in a response line (AE-C)", () => {
    it("finds the https ethereal.email URL the dispatcher appended, and nothing else", () => {
        expect(etherealPreviewUrl("250 Accepted [STATUS=new MSGID=abc] | preview: https://ethereal.email/message/Zt1.abc")).toBe(
            "https://ethereal.email/message/Zt1.abc",
        );
        expect(etherealPreviewUrl("https://ethereal.email/message/Zt1.abc")).toBe("https://ethereal.email/message/Zt1.abc");
        expect(etherealPreviewUrl("250 2.0.0 OK 1726000000 - gsmtp")).toBeNull();
        expect(etherealPreviewUrl("see https://example.com/message/1")).toBeNull();
        expect(etherealPreviewUrl("http://ethereal.email/message/1")).toBeNull();
        expect(etherealPreviewUrl(null)).toBeNull();
        expect(etherealPreviewUrl("")).toBeNull();
    });
});
