import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The Digio card's workflows — Phase D (the owner's "ADX Digio KYC
 * Workflows", 1 Oct 2026).
 *
 * What this pins: the card lists the 25 workflows `GET /integrations`
 * carries under `kyc.workflows` — label, template id, Default or Override
 * — grouped as the owner's doc groups them (Agents, Publishers,
 * Advertisers, Print partners, Employees, Spots); an override is saved as
 * `PUT /integrations { section: "digio", patch: { workflowTemplates: {
 * key: id } } }` and cleared with `null`; an id off
 * `^KTP[A-Z0-9]{10,61}$` is refused before the round trip; and the card
 * says the truth about unconfigured keys — the mock path is for outside
 * production only.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        kyc: {} as Record<string, unknown>,
        failure: null as Error | null,
        reset() {
            this.calls = [];
            this.kyc = {};
            this.failure = null;
        },
    };
    return { backend, toast };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (backend.failure && method !== "GET") throw backend.failure;
        return method === "GET" ? { kyc: backend.kyc } : { message: "Saved", kyc: backend.kyc };
    };
    return {
        ...actual,
        api: {
            ...actual.api,
            get: (path: string) => wrap("GET", path),
            put: (path: string, body?: unknown) => wrap("PUT", path, body),
        },
    };
});

import { ApiError } from "@/lib/api-client";
import { groupWorkflows, templateIdProblem, type DigioWorkflow } from "@/services/kyc-provider";
import { DigioSection } from "./digio-section";

/** The 25 workflows in the owner's doc order, each on its default template, labelled as the server labels them. */
const DEFAULTS: [key: string, label: string, templateId: string][] = [
    ["AGENT", "Agent (field and sales)", "KTP2610010306408243IR71R3AROTQNN"],
    ["PUBLISHER.INDIVIDUAL", "Publisher · Individual", "KTP261001040743600LJTDRKKQJX52I7"],
    ["PUBLISHER.SOLE_PROPRIETOR", "Publisher · Sole proprietor", "KTP2610010414215107PAQTRCWA15MH9"],
    ["PUBLISHER.COMPANY", "Publisher · Company", "KTP261001042249519XAHQ1QZQ8NTSH6"],
    ["PUBLISHER.LLP_PARTNERSHIP", "Publisher · LLP or partnership", "KTP261001043029821KBY5W6MIRT8AH5"],
    ["PUBLISHER.NON_PROFIT", "Publisher · Non-profit", "KTP261001043339245CSPZP7VJGDSJJX"],
    ["PUBLISHER.GOVERNMENT_EDUCATION", "Publisher · Government or education", "KTP261001043745628KB5W2BGMLSCS8M"],
    ["PUBLISHER.OTHER_ENTITY", "Publisher · Other entity (political too)", "KTP2610010440468859RHQ93W3ZR6H58"],
    ["ADVERTISER.INDIVIDUAL", "Advertiser · Individual", "KTP261001044441631C6LOZYN91JC9NF"],
    ["ADVERTISER.SOLE_PROPRIETOR", "Advertiser · Sole proprietor", "KTP261001044723855AH9Y39VDH4S25L"],
    ["ADVERTISER.COMPANY", "Advertiser · Company", "KTP26100104502784323YQMCV19CW8HM"],
    ["ADVERTISER.LLP_PARTNERSHIP", "Advertiser · LLP or partnership", "KTP261001045257491BM49QX1UXNBG2I"],
    ["ADVERTISER.NON_PROFIT", "Advertiser · Non-profit", "KTP261001050016491512UR8EIKS2D86"],
    ["ADVERTISER.GOVERNMENT_EDUCATION", "Advertiser · Government or education", "KTP261001050859618GXOMOZR73XBXJ9"],
    ["ADVERTISER.OTHER_ENTITY", "Advertiser · Other entity", "KTP261001051625798GCFAVZBGJ19WUG"],
    ["ADVERTISER.POLITICAL", "Advertiser · Political party or candidate", "KTP261001052617020C8K7M6HA846LI6"],
    ["PRINT_PARTNER.INDIVIDUAL", "Print partner · Individual", "KTP261001060717528VGFNERP3GZXBJU"],
    ["PRINT_PARTNER.SOLE_PROPRIETOR", "Print partner · Sole proprietor", "KTP261001061121621SI1SKKYYE6QSLM"],
    ["PRINT_PARTNER.COMPANY", "Print partner · Company", "KTP2610010613526217KEIXUUG4MP2QL"],
    ["PRINT_PARTNER.LLP_PARTNERSHIP", "Print partner · LLP or partnership", "KTP2610010615549436Z42BMRM9OY8BJ"],
    ["EMPLOYEE.FULL_TIME", "Employee · Full time (part time too)", "KTP261001060045852S9A5UOLMEW92VJ"],
    ["EMPLOYEE.INTERN_CONTRACT", "Employee · Intern or contract", "KTP26100106044372673RIO8R1PYPPJG"],
    ["SPOT.TRANSIT", "Spot · Transit", "KTP261001061911043NJSUULTFQW4D12"],
    ["SPOT.OUTDOOR", "Spot · Outdoor", "KTP261001062202963DV6D3TQZ5QRM1M"],
    ["SPOT.MEDIA", "Spot · Media", "KTP261001062349355CXZ7URFIGSOBVO"],
];

const OVERRIDE = "KTP2610019999999999OVERRIDE00001";

const workflows = (overrides: Record<string, string> = {}): DigioWorkflow[] =>
    DEFAULTS.map(([key, label, templateId]) => (overrides[key] ? { key, label, templateId: overrides[key]!, source: "OVERRIDE" } : { key, label, templateId, source: "DEFAULT" }));

const kyc = (overrides: Record<string, string> = {}) => ({
    clientId: "••••1234",
    clientSecret: "••••abcd",
    baseUrl: "https://api.digio.in",
    gatewayUrl: "https://app.digio.in",
    kycProvider: "DIGIO",
    documentReader: "MODEL",
    workflows: workflows(overrides),
});

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
});

const row = (key: string) => screen.getByTestId(`digio-workflow-${key}`);

describe("the workflow list", () => {
    it("draws the 25 workflows with their label, template id and Default badge, grouped as the owner's doc groups them", async () => {
        backend.kyc = kyc();
        render(<DigioSection />);
        const list = await screen.findByTestId("digio-workflows");

        expect(within(list).getAllByTestId(/^digio-workflow-(?!group-)/)).toHaveLength(25);
        const groups = within(list).getAllByTestId(/^digio-workflow-group-/);
        expect(groups.map((group) => group.firstElementChild?.textContent)).toEqual(["Agents", "Publishers", "Advertisers", "Print partners", "Employees", "Spots"]);
        expect(groups.map((group) => within(group).getAllByRole("listitem").length)).toEqual([1, 7, 8, 4, 2, 3]);

        for (const [key, label, templateId] of DEFAULTS) {
            const item = row(key);
            expect(within(item).getByText(label)).toBeInTheDocument();
            // The id in full is the title; the cell itself truncates.
            const id = within(item).getByText(templateId);
            expect(id).toHaveAttribute("title", templateId);
            expect(id.className).toContain("font-mono");
            expect(id.className).toContain("truncate");
            expect(within(item).getByText("Default")).toBeInTheDocument();
        }
        expect(list).toHaveTextContent("an override replaces the doc's template for that workflow until it is set back to the default");
        // The per-party template rows are gone.
        expect(screen.queryByTestId("digio-kyc-templates")).not.toBeInTheDocument();
    });

    it("marks an overridden row Override and offers to go back to the default", async () => {
        backend.kyc = kyc({ "PUBLISHER.COMPANY": OVERRIDE });
        render(<DigioSection />);
        await screen.findByTestId("digio-workflows");
        const item = row("PUBLISHER.COMPANY");
        expect(within(item).getByText("Override")).toBeInTheDocument();
        expect(within(item).getByText(OVERRIDE)).toHaveAttribute("title", OVERRIDE);
        expect(within(item).getByRole("button", { name: "Use the default for Publisher · Company" })).toBeInTheDocument();
        expect(within(row("PUBLISHER.INDIVIDUAL")).queryByRole("button", { name: /Use the default/ })).not.toBeInTheDocument();
    });

    it("groups by the key's first part, and keeps a workflow the card does not know under Other", () => {
        const grouped = groupWorkflows([...workflows(), { key: "VENDOR.COMPANY", label: "Vendor: Company", templateId: OVERRIDE, source: "DEFAULT" }]);
        expect(grouped.map((group) => [group.label, group.rows.length])).toEqual([
            ["Agents", 1],
            ["Publishers", 7],
            ["Advertisers", 8],
            ["Print partners", 4],
            ["Employees", 2],
            ["Spots", 3],
            ["Other", 1],
        ]);
    });

    it("says so when the backend does not list its workflows", async () => {
        backend.kyc = { ...kyc(), workflows: undefined };
        render(<DigioSection />);
        expect(await screen.findByTestId("digio-workflows-absent")).toHaveTextContent("This backend does not list its Digio workflows yet.");
    });
});

describe("an override", () => {
    it("is saved as workflowTemplates { key: id } on the digio section, and the card re-reads", async () => {
        backend.kyc = kyc();
        render(<DigioSection />);
        await screen.findByTestId("digio-workflows");
        fireEvent.click(screen.getByRole("button", { name: "Set an override for Advertiser · Political party or candidate" }));
        const item = row("ADVERTISER.POLITICAL");
        expect(item).toHaveTextContent("An override replaces the template the owner’s doc lists for this workflow.");
        fireEvent.change(within(item).getByLabelText("Override template id for Advertiser · Political party or candidate"), { target: { value: `  ${OVERRIDE.toLowerCase()} ` } });

        backend.kyc = kyc({ "ADVERTISER.POLITICAL": OVERRIDE });
        fireEvent.click(within(item).getByRole("button", { name: "Save override" }));
        await waitFor(() => expect(within(row("ADVERTISER.POLITICAL")).getByText("Override")).toBeInTheDocument());
        expect(backend.calls.filter((call) => call.method === "PUT")).toEqual([
            { method: "PUT", path: "/integrations", body: { section: "digio", patch: { workflowTemplates: { "ADVERTISER.POLITICAL": OVERRIDE } } } },
        ]);
        expect(toast.success).toHaveBeenCalledWith("Advertiser · Political party or candidate now uses the override", { description: "Requests on this workflow send this template instead of the one the owner's doc lists." });
        // Re-read after the write: the GET went out twice.
        expect(backend.calls.filter((call) => call.method === "GET")).toHaveLength(2);
    });

    it("is cleared with null — back to the template the owner's doc lists", async () => {
        backend.kyc = kyc({ AGENT: OVERRIDE });
        render(<DigioSection />);
        await screen.findByTestId("digio-workflows");
        backend.kyc = kyc();
        fireEvent.click(screen.getByRole("button", { name: "Use the default for Agent (field and sales)" }));
        await waitFor(() => expect(within(row("AGENT")).getByText("Default")).toBeInTheDocument());
        expect(backend.calls.filter((call) => call.method === "PUT")).toEqual([{ method: "PUT", path: "/integrations", body: { section: "digio", patch: { workflowTemplates: { AGENT: null } } } }]);
        expect(toast.success).toHaveBeenCalledWith("Agent (field and sales) is back on the default template", { description: "Requests on this workflow send the template the owner's doc lists." });
    });

    it("refuses an id off ^KTP[A-Z0-9]{10,61}$ before the round trip", async () => {
        backend.kyc = kyc();
        render(<DigioSection />);
        await screen.findByTestId("digio-workflows");
        fireEvent.click(screen.getByRole("button", { name: "Set an override for Spot · Transit" }));
        const item = row("SPOT.TRANSIT");
        const input = within(item).getByLabelText("Override template id for Spot · Transit");

        for (const bad of ["", "ABC2610019999999999", "KTP123", "KTP26100199-9999999", `KTP${"A".repeat(62)}`]) {
            fireEvent.change(input, { target: { value: bad } });
            fireEvent.click(within(item).getByRole("button", { name: "Save override" }));
            expect(within(item).getByRole("alert")).toBeInTheDocument();
        }
        expect(within(item).getByRole("alert")).toHaveTextContent("A Digio template id starts with KTP, then 10 to 61 capital letters and digits.");
        expect(backend.calls.filter((call) => call.method === "PUT")).toHaveLength(0);

        // Cancel leaves the row as it was.
        fireEvent.click(within(item).getByRole("button", { name: "Cancel" }));
        expect(within(row("SPOT.TRANSIT")).queryByLabelText("Override template id for Spot · Transit")).not.toBeInTheDocument();
        expect(within(row("SPOT.TRANSIT")).getByText("Default")).toBeInTheDocument();
    });

    it("the rule itself: KTP, then 10 to 61 capitals and digits", () => {
        expect(templateIdProblem(OVERRIDE)).toBeNull();
        expect(templateIdProblem(`  ${OVERRIDE}  `)).toBeNull();
        expect(templateIdProblem(`KTP${"A".repeat(10)}`)).toBeNull();
        expect(templateIdProblem(`KTP${"A".repeat(61)}`)).toBeNull();
        expect(templateIdProblem(`KTP${"A".repeat(9)}`)).not.toBeNull();
        expect(templateIdProblem(`KTP${"A".repeat(62)}`)).not.toBeNull();
        expect(templateIdProblem("ktp2610019999999999")).not.toBeNull();
        expect(templateIdProblem("")).toBe("Type the template id, or cancel.");
    });

    it("says what the server said when the write is refused, and keeps the row open", async () => {
        backend.kyc = kyc();
        render(<DigioSection />);
        await screen.findByTestId("digio-workflows");
        fireEvent.click(screen.getByRole("button", { name: "Set an override for Employee · Full time (part time too)" }));
        const item = row("EMPLOYEE.FULL_TIME");
        fireEvent.change(within(item).getByLabelText("Override template id for Employee · Full time (part time too)"), { target: { value: OVERRIDE } });
        backend.failure = new ApiError(400, "VALIDATION_ERROR", "Unknown workflow key");
        fireEvent.click(within(item).getByRole("button", { name: "Save override" }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Unknown workflow key"));
        expect(within(row("EMPLOYEE.FULL_TIME")).getByLabelText("Override template id for Employee · Full time (part time too)")).toHaveValue(OVERRIDE);
    });
});

describe("the card's word on unconfigured keys", () => {
    it("says the mock path is for outside production only — in production every request is refused until the keys are set", async () => {
        backend.kyc = kyc();
        render(<DigioSection />);
        const note = await screen.findByTestId("digio-keys-note");
        expect(note).toHaveTextContent("Outside production, unconfigured keys run the mock path, and the probe never degrades that.");
        expect(note).toHaveTextContent("In production every Digio request is refused until the keys are set.");
        expect(screen.queryByText(/^Unconfigured keys run the mock path/)).not.toBeInTheDocument();
    });
});
