import { describe, expect, it } from "vitest";

import {
    NO_MODULE,
    actionLabel,
    actorName,
    buildAuditQuery,
    buildExportQuery,
    cellText,
    diffRows,
    exportFilename,
    moduleChips,
    moduleLabel,
    targetLabel,
    type AuditRow,
} from "./audit";

/**
 * The audit log — Lot A's `GET /audit`, its export and the per-record
 * timeline.
 *
 * What is pinned is the shape the page sends and how it reads a row, not a
 * layout. The contract's facets are all optional tokens the schema refuses
 * empty, so an unset facet must not be sent at all; the export takes the
 * filter without the page; and the chip row is derived from `counts`, which
 * the server computes with the module facet removed.
 */

const row = (over: Partial<AuditRow> = {}): AuditRow => ({
    id: "cl_row_1",
    userId: "cl_user_1",
    action: "PLATFORM_SETTINGS_UPDATED",
    module: "settings",
    targetType: "AppConfig",
    targetId: "platform",
    requestId: "req_1",
    ipAddress: "10.4.12.8",
    userAgent: null,
    metadata: null,
    diff: null,
    createdAt: "2026-09-12T10:00:00.000Z",
    user: { id: "cl_user_1", name: "Priya Rao", email: "priya@adx.co.in" },
    ...over,
});

describe("buildAuditQuery", () => {
    it("sends only the facets that are set, trimmed", () => {
        const query = buildAuditQuery({ q: "  wallet ", module: "orders", page: 2, pageSize: 50, sort: "oldest" });
        expect(query).toBe("q=wallet&module=orders&sort=oldest&page=2&pageSize=50");
    });

    it("drops whitespace-only text rather than sending an empty token the schema refuses", () => {
        expect(buildAuditQuery({ q: "   ", action: "", targetType: undefined })).toBe("");
    });

    it("keeps the target pair together", () => {
        expect(buildAuditQuery({ targetType: "Order", targetId: "cl_order_1" })).toBe("targetType=Order&targetId=cl_order_1");
    });
});

describe("buildExportQuery", () => {
    it("takes the filter and the sort but never the page", () => {
        expect(buildExportQuery({ module: "wallets", from: "2026-09-01", sort: "newest", page: 3, pageSize: 50 })).toBe(
            "module=wallets&from=2026-09-01&sort=newest",
        );
    });
});

describe("how the page reads a row", () => {
    it("names the actor by name, then email, then id", () => {
        expect(actorName(row())).toBe("Priya Rao");
        expect(actorName(row({ user: { id: "u", name: "  ", email: "ops@adx.co.in" } }))).toBe("ops@adx.co.in");
        expect(actorName(row({ user: null }))).toBe("cl_user_1");
    });

    it("humanises a hand-written action and leaves the generic tap's route template alone", () => {
        expect(actionLabel("AUDIT_EXPORTED")).toBe("Audit exported");
        expect(actionLabel("FEATURE_FLAG_CHANGED")).toBe("Feature flag changed");
        expect(actionLabel("orders.PATCH /orders/:id")).toBe("orders.PATCH /orders/:id");
    });

    it("labels the target and the module, with the unfiled bucket named", () => {
        expect(targetLabel(row())).toBe("AppConfig · platform");
        expect(targetLabel(row({ targetType: "Order", targetId: null }))).toBe("Order");
        expect(targetLabel(row({ targetType: null, targetId: null }))).toBe("—");
        expect(moduleLabel("feature-flags")).toBe("Feature flags");
        expect(moduleLabel(null)).toBe("Unfiled");
        expect(moduleLabel(NO_MODULE)).toBe("Unfiled");
    });

    it("lays the diff out as before/after rows in the order written", () => {
        expect(diffRows({ "kyc.reviewSlaHours": { before: 48, after: 24 }, enabled: { before: false, after: true } })).toEqual([
            { field: "kyc.reviewSlaHours", before: 48, after: 24 },
            { field: "enabled", before: false, after: true },
        ]);
        expect(diffRows(null)).toEqual([]);
    });

    it("prints a cell for any value", () => {
        expect(cellText(null)).toBe("—");
        expect(cellText("")).toBe("—");
        expect(cellText(0)).toBe("0");
        expect(cellText(false)).toBe("false");
        expect(cellText({ a: 1 })).toBe('{"a":1}');
    });
});

describe("moduleChips", () => {
    it("orders by count, ties by name, and puts the unfiled rows last whatever their count", () => {
        const chips = moduleChips({ [NO_MODULE]: 900, orders: 12, wallets: 40, agents: 12 });
        expect(chips.map((chip) => chip.value)).toEqual(["wallets", "agents", "orders", NO_MODULE]);
        expect(chips[0]).toEqual({ value: "wallets", label: "Wallets", count: 40 });
        expect(chips[3].label).toBe("Unfiled");
    });
});

describe("exportFilename", () => {
    it("takes the server's name from Content-Disposition", () => {
        expect(exportFilename('attachment; filename="audit-2026-09-12-10-42-00.csv"')).toBe("audit-2026-09-12-10-42-00.csv");
    });

    it("falls back to a stamped name when there is no header", () => {
        expect(exportFilename(null)).toMatch(/^audit-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.csv$/);
    });
});
