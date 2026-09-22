import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The party importer's service — package S. What is pinned: every party
 * talks to `/party-imports/:party` and nothing else, the list unwraps the
 * list contract, ids are encoded, the report location is what the
 * backend serves, and the multipart body carries the CSV under `file`
 * with the note beside it.
 */

const { calls, liveGate } = vi.hoisted(() => ({
    calls: [] as { method: string; path: string; body?: unknown }[],
    liveGate: { live: true },
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const record = (id: string) => ({ id, party: "advertisers", status: "VALIDATED", rows: [] });
    return {
        ...actual,
        api: {
            get: async (path: string) => {
                calls.push({ method: "GET", path });
                if (/\/party-imports\/[a-z-]+\?/.test(path)) return { items: [record("imp_1"), record("imp_2")], total: 2, page: 1, pageSize: 100, counts: { VALIDATED: 2 } };
                return record("imp_1");
            },
            post: async (path: string, body: unknown) => {
                calls.push({ method: "POST", path, body });
                return record("imp_new");
            },
            patch: async () => ({}),
            put: async () => ({}),
            delete: async () => ({}),
        },
    };
});
vi.mock("@/lib/api-config", () => ({
    isLive: () => liveGate.live,
    apiConfig: { live: true, baseUrl: "" },
}));

import { IMPORT_PARTIES, IMPORT_PARTY_DOMAIN, importBody, partyImportService } from "./party-imports";

beforeEach(() => {
    calls.length = 0;
    liveGate.live = true;
});

describe("partyImportService", () => {
    it.each(IMPORT_PARTIES)("%s: every verb is under /party-imports/%s", async (party) => {
        const service = partyImportService(party);
        const file = new File(["mobile\n9876543210"], "book.csv", { type: "text/csv" });

        await service.validate(file, "ledger");
        expect(await service.list()).toHaveLength(2);
        await service.get("imp 1");
        await service.commit("imp/1");
        await service.revoke("imp_1");

        expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
            `POST /party-imports/${party}`,
            `GET /party-imports/${party}?page=1&pageSize=100`,
            `GET /party-imports/${party}/imp%201`,
            `POST /party-imports/${party}/imp%2F1/commit`,
            `POST /party-imports/${party}/imp_1/revoke`,
        ]);
        expect(service.reportUrl("imp_1")).toBe(`/party-imports/${party}/imp_1/report.csv`);
        expect(calls[0].body).toBeInstanceOf(FormData);
    });

    it("gates each party on its own api-config domain and refuses to call when the domain is off", async () => {
        // LH3: leads joined the kit, on the leads domain.
        expect(IMPORT_PARTY_DOMAIN).toEqual({ advertisers: "advertisers", agents: "agents", "print-partners": "printPartners", employees: "employees", leads: "leads" });
        liveGate.live = false;
        await expect(partyImportService("agents").list()).rejects.toThrow(/connect the console/);
        expect(calls).toEqual([]);
    });
});

describe("importBody", () => {
    it("carries the CSV under `file` and the trimmed note beside it, or no note at all", () => {
        const file = new File(["mobile\n9876543210"], "book.csv", { type: "text/csv" });
        const body = importBody(file, " the 2019 ledger ");
        expect((body.get("file") as File).name).toBe("book.csv");
        expect(body.get("note")).toBe("the 2019 ledger");
        expect(importBody(file).get("note")).toBeNull();
        expect(importBody(file, "   ").get("note")).toBeNull();
    });
});
