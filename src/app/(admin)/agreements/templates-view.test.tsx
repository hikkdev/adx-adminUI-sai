import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AgreementTemplate } from "@/services/agreements";

/**
 * The life of an agreement version, walked from the console.
 *
 * One screen and one in-memory backend that keeps the agreements module's
 * rules — a version is a draft until activated, only a draft can be edited or
 * discarded, activation retires whatever was live, numbers only go up — so
 * what is tested is the sequence a person at the desk performs: write the
 * first version, make it live, draft the next, retire the old one, bring it
 * back. The service and its URLs are real; only the transport is faked.
 *
 * The failure this guards against is the quiet one: the stall banner (the
 * reason D9 exists) not clearing, or a retired version — the text people
 * accepted — offering an Edit button.
 */

const { backend } = vi.hoisted(() => {
    type Row = Omit<AgreementTemplate, "state">;
    type Kind = AgreementTemplate["kind"];

    class FakeApiError extends Error {
        constructor(
            readonly status: number,
            readonly code: string,
            message: string
        ) {
            super(message);
        }
    }

    const backend = {
        rows: [] as Row[],
        seq: 0,
        calls: [] as string[],
        reset() {
            this.rows = [];
            this.seq = 0;
            this.calls = [];
        },
        state(row: Row): AgreementTemplate["state"] {
            if (row.isActive) return "ACTIVE";
            if (row.activatedAt || row.retiredAt || row.acceptanceCount > 0) return "SUPERSEDED";
            return "DRAFT";
        },
        view(row: Row): AgreementTemplate {
            return { ...row, state: this.state(row) };
        },
        find(id: string): Row {
            const row = this.rows.find((r) => r.id === id);
            if (!row) throw new FakeApiError(404, "NOT_FOUND", "Agreement template not found");
            return row;
        },
        list(kind?: Kind): AgreementTemplate[] {
            return this.rows.filter((r) => !kind || r.kind === kind).map((r) => this.view(r));
        },
        create(input: { kind: Kind; title: string; body: string; changeNote?: string; activate?: boolean; requiresReacceptance?: boolean }) {
            const version = Math.max(0, ...this.rows.filter((r) => r.kind === input.kind).map((r) => r.version)) + 1;
            const now = new Date(2026, 8, 10, 12, 0, 0).toISOString();
            const row: Row = {
                id: `tpl_${++this.seq}`,
                kind: input.kind,
                version,
                title: input.title,
                body: input.body,
                isActive: false,
                effectiveFrom: now,
                activatedAt: null,
                retiredAt: null,
                createdByUserId: "usr_admin",
                changeNote: input.changeNote ?? null,
                createdAt: now,
                updatedAt: now,
                acceptanceCount: 0,
                requiresReacceptance: Boolean(input.requiresReacceptance),
            };
            this.rows.push(row);
            return input.activate ? this.activate(row.id) : this.view(row);
        },
        update(id: string, patch: { title?: string; body?: string; changeNote?: string | null; requiresReacceptance?: boolean }) {
            const row = this.find(id);
            if (this.state(row) !== "DRAFT") {
                throw new FakeApiError(409, "CONFLICT", `Version ${row.version} has been live and its text is what people accepted.`);
            }
            Object.assign(row, patch);
            return this.view(row);
        },
        remove(id: string) {
            const row = this.find(id);
            if (this.state(row) !== "DRAFT") throw new FakeApiError(409, "CONFLICT", "Only a draft can be discarded");
            this.rows = this.rows.filter((r) => r.id !== id);
        },
        activate(id: string) {
            const row = this.find(id);
            if (this.state(row) === "ACTIVE") return this.view(row);
            const at = new Date(2026, 8, 10, 12, 30, 0).toISOString();
            for (const other of this.rows) {
                if (other.kind === row.kind && other.isActive && other.id !== id) {
                    other.isActive = false;
                    other.retiredAt = at;
                }
            }
            Object.assign(row, { isActive: true, activatedAt: at, retiredAt: null, effectiveFrom: at });
            return this.view(row);
        },
        /** Routes the console's calls the way the Express router would. */
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push(`${method} ${path}`);
            const [pathname, query] = path.split("?");
            const params = new URLSearchParams(query);
            const m = pathname.match(/^\/agreements\/templates(?:\/([^/]+))?(\/activate)?$/);
            if (!m) throw new FakeApiError(404, "NOT_FOUND", `No route ${method} ${path}`);
            const [, id, activate] = m;
            if (method === "GET" && !id) return this.list((params.get("kind") as Kind | null) ?? undefined);
            if (method === "GET" && id) return this.view(this.find(id));
            if (method === "POST" && !id) return this.create(body as Parameters<typeof backend.create>[0]);
            if (method === "POST" && id && activate) return this.activate(id);
            if (method === "PATCH" && id) return this.update(id, body as Parameters<typeof backend.update>[1]);
            if (method === "DELETE" && id) return this.remove(id);
            throw new FakeApiError(404, "NOT_FOUND", `No route ${method} ${path}`);
        },
    };
    return { backend };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    // Faults come back as the console's own ApiError so the screens' checks
    // (`instanceof ApiError`, `.fieldErrors`) see what they would see live.
    const wrap = async (method: string, path: string, body?: unknown) => {
        try {
            return await backend.handle(method, path, body);
        } catch (cause) {
            const fault = cause as { status?: number; code?: string; message: string };
            throw new actual.ApiError(fault.status ?? 500, fault.code ?? "INTERNAL", fault.message);
        }
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
            put: (path: string, body?: unknown) => wrap("PUT", path, body),
            delete: (path: string) => wrap("DELETE", path),
        },
    };
});

import { agreementService } from "@/services/agreements";
import { TemplatesView } from "./templates-view";

/**
 * What the loader does around the view: hold the list and refetch it when the
 * view says something changed. Rendering the view directly keeps the page
 * shell's router hooks out of the test.
 */
function Desk() {
    const [templates, setTemplates] = React.useState<AgreementTemplate[]>(() => backend.list());
    const reload = React.useCallback(() => {
        void agreementService.templates().then(setTemplates);
    }, []);
    return <TemplatesView templates={templates} onChanged={reload} />;
}

const rail = () => within(screen.getByRole("navigation", { name: "Agreement kinds" }));
const dialog = () => within(screen.getByRole("dialog"));
const versionRow = (version: string) => {
    const cell = screen.getByText(version, { selector: "td span" });
    return within(cell.closest("tr")!);
};

/** Fills the editor and saves. Leaves the "make it live" switch alone. */
function writeVersion(title: string, body: string) {
    fireEvent.change(dialog().getByLabelText("Title"), { target: { value: title } });
    fireEvent.change(dialog().getByLabelText("Agreement text"), { target: { value: body } });
}

async function confirm(label: string) {
    const button = await screen.findByRole("button", { name: label });
    fireEvent.click(button);
}

beforeEach(() => backend.reset());

describe("before anything is written", () => {
    it("says every kind is empty and that publishers are stalled on the platform terms", () => {
        render(<Desk />);

        // The rail opens on the first stalled kind — publisher platform terms.
        expect(rail().getByRole("button", { name: /Publisher platform terms/ })).toHaveAttribute("aria-current", "page");
        // Six kinds since Lot D: the package terms and the agent's job terms joined the four.
        expect(rail().getAllByText("Nothing live")).toHaveLength(6);

        expect(screen.getByText("Nothing is live")).toBeInTheDocument();
        expect(screen.getByText(/Publishers cannot get past their agreement gate/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Write the first version" })).toBeInTheDocument();
    });

    it("moves to the advertiser side from the rail and says the same for them", () => {
        render(<Desk />);
        fireEvent.click(rail().getByRole("button", { name: /Advertiser platform terms/ }));
        expect(screen.getByText(/Advertisers cannot get past their agreement gate/)).toBeInTheDocument();
    });
});

describe("the first version", () => {
    it("is saved as a draft and does not end the stall on its own", async () => {
        render(<Desk />);
        fireEvent.click(screen.getByRole("button", { name: "Write the first version" }));

        expect(dialog().getByText("New version · Publisher platform terms")).toBeInTheDocument();
        expect(dialog().getByText(/This becomes v1/)).toBeInTheDocument();
        writeVersion("Publisher terms 2026", "# Terms\n\nBe good.");
        fireEvent.click(dialog().getByRole("button", { name: "Save v1 as a draft" }));

        // A draft row, with the three things a draft allows.
        await waitFor(() => expect(versionRow("v1").getByText("Draft")).toBeInTheDocument());
        expect(backend.calls).toContain("POST /agreements/templates");
        expect(backend.rows[0]).toMatchObject({ kind: "PLATFORM", version: 1, title: "Publisher terms 2026", isActive: false });
        const row = versionRow("v1");
        expect(row.getByRole("button", { name: "Edit" })).toBeInTheDocument();
        expect(row.getByRole("button", { name: "Activate" })).toBeInTheDocument();
        expect(row.getByRole("button", { name: "Discard" })).toBeInTheDocument();

        // Still stalled: a draft is not live.
        expect(screen.getByText("Nothing is live")).toBeInTheDocument();
        expect(rail().getByText("1 draft, nothing live")).toBeInTheDocument();
    });

    it("refuses to save without a title or a body, before asking the server", () => {
        render(<Desk />);
        fireEvent.click(screen.getByRole("button", { name: "Write the first version" }));
        fireEvent.click(dialog().getByRole("button", { name: "Save v1 as a draft" }));

        expect(dialog().getByText("Give the version a title.")).toBeInTheDocument();
        expect(dialog().getByText("The agreement needs a body.")).toBeInTheDocument();
        expect(backend.calls).toEqual([]);
    });

    it("can go live in the same save when the switch is on", async () => {
        render(<Desk />);
        fireEvent.click(screen.getByRole("button", { name: "Write the first version" }));
        writeVersion("Publisher terms 2026", "# Terms");
        fireEvent.click(dialog().getByRole("switch", { name: "Make it live now" }));
        fireEvent.click(dialog().getByRole("button", { name: "Save and make v1 live" }));

        await waitFor(() => expect(versionRow("v1").getByText("Live")).toBeInTheDocument());
        expect(backend.rows[0].isActive).toBe(true);
        expect(screen.queryByText("Nothing is live")).not.toBeInTheDocument();
        expect(rail().getByText("v1 live")).toBeInTheDocument();
    });
});

describe("a draft", () => {
    beforeEach(() => {
        backend.create({ kind: "PLATFORM", title: "Publisher terms 2026", body: "# Terms" });
    });

    it("can still be edited, through PATCH", async () => {
        render(<Desk />);
        fireEvent.click(versionRow("v1").getByRole("button", { name: "Edit" }));

        expect(dialog().getByText("Edit draft · Publisher platform terms")).toBeInTheDocument();
        expect(dialog().getByLabelText("Title")).toHaveValue("Publisher terms 2026");
        fireEvent.change(dialog().getByLabelText("Title"), { target: { value: "Publisher terms (Sept 2026)" } });
        fireEvent.change(dialog().getByLabelText("What changed"), { target: { value: "Renamed" } });
        fireEvent.click(dialog().getByRole("button", { name: "Save draft" }));

        await waitFor(() => expect(screen.getByText("Publisher terms (Sept 2026)")).toBeInTheDocument());
        expect(backend.calls).toContain("PATCH /agreements/templates/tpl_1");
        expect(backend.rows[0]).toMatchObject({ title: "Publisher terms (Sept 2026)", changeNote: "Renamed" });
    });

    it("can be discarded, after a confirmation, and the kind goes back to empty", async () => {
        render(<Desk />);
        fireEvent.click(versionRow("v1").getByRole("button", { name: "Discard" }));

        expect(screen.getByRole("alertdialog")).toHaveTextContent("Discard draft v1?");
        await confirm("Discard draft");

        await waitFor(() => expect(screen.getByText("Write the first version")).toBeInTheDocument());
        expect(backend.calls).toContain("DELETE /agreements/templates/tpl_1");
        expect(backend.rows).toHaveLength(0);
    });
});

describe("going live, and the versions after it", () => {
    beforeEach(() => {
        backend.create({ kind: "PLATFORM", title: "Publisher terms 2026", body: "# Terms" });
    });

    it("activates a draft after a confirmation, and the stall clears", async () => {
        render(<Desk />);
        fireEvent.click(versionRow("v1").getByRole("button", { name: "Activate" }));

        const confirmation = screen.getByRole("alertdialog");
        expect(confirmation).toHaveTextContent("Make v1 the live publisher platform terms?");
        expect(confirmation).toHaveTextContent("Nothing is live today.");
        await confirm("Make it live");

        await waitFor(() => expect(versionRow("v1").getByText("Live")).toBeInTheDocument());
        expect(backend.calls).toContain("POST /agreements/templates/tpl_1/activate");
        expect(screen.queryByText("Nothing is live")).not.toBeInTheDocument();
        expect(screen.getByText(/every publisher accepting now accepts this text/)).toBeInTheDocument();
        expect(rail().getByText("v1 live")).toBeInTheDocument();
    });

    it("numbers the next version after the live one, and activating it retires the old one", async () => {
        backend.activate("tpl_1");
        render(<Desk />);

        fireEvent.click(screen.getByRole("button", { name: "New version" }));
        expect(dialog().getByText(/This becomes v2/)).toBeInTheDocument();
        expect(dialog().getByText(/Retires the version that is live today/)).toBeInTheDocument();
        writeVersion("Publisher terms 2027", "# Terms, revised");
        fireEvent.click(dialog().getByRole("button", { name: "Save v2 as a draft" }));
        await waitFor(() => expect(versionRow("v2").getByText("Draft")).toBeInTheDocument());

        // v1 is still the live one; the draft sits beside it.
        expect(versionRow("v1").getByText("Live")).toBeInTheDocument();

        fireEvent.click(versionRow("v2").getByRole("button", { name: "Activate" }));
        expect(screen.getByRole("alertdialog")).toHaveTextContent("v1 is retired and stays on record");
        await confirm("Make it live");

        await waitFor(() => expect(versionRow("v2").getByText("Live")).toBeInTheDocument());
        expect(versionRow("v1").getByText("Retired")).toBeInTheDocument();
        expect(backend.rows.map((r) => [r.version, r.isActive])).toEqual([
            [1, false],
            [2, true],
        ]);
        expect(rail().getByText("v2 live")).toBeInTheDocument();
    });

    it("freezes a retired version — no edit, no discard, only bringing it back", async () => {
        backend.activate("tpl_1");
        backend.create({ kind: "PLATFORM", title: "Publisher terms 2027", body: "# Revised", activate: true });
        render(<Desk />);

        const retired = versionRow("v1");
        expect(retired.getByText("Retired")).toBeInTheDocument();
        expect(retired.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
        expect(retired.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
        expect(retired.getByRole("button", { name: "Bring back" })).toBeInTheDocument();

        // The live one offers nothing but reading it.
        const live = versionRow("v2");
        expect(live.queryByRole("button", { name: "Activate" })).not.toBeInTheDocument();
        expect(live.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();

        // Rollback: v1 goes live again and v2 is the one retired.
        fireEvent.click(retired.getByRole("button", { name: "Bring back" }));
        await confirm("Make it live");
        await waitFor(() => expect(versionRow("v1").getByText("Live")).toBeInTheDocument());
        expect(versionRow("v2").getByText("Retired")).toBeInTheDocument();
        expect(backend.rows.map((r) => [r.version, r.isActive])).toEqual([
            [1, true],
            [2, false],
        ]);
    });

    it("keeps the versions of one kind out of another's rail entry", () => {
        backend.activate("tpl_1");
        render(<Desk />);
        expect(rail().getByText("v1 live")).toBeInTheDocument();
        fireEvent.click(rail().getByRole("button", { name: /Listing agreement/ }));
        expect(screen.getByText(/No listing agreement can be accepted until a version is activated/)).toBeInTheDocument();
        expect(screen.queryByText("v1", { selector: "td span" })).not.toBeInTheDocument();
    });
});

describe("reading a version", () => {
    it("opens the stored text, frozen, with its history", () => {
        backend.create({ kind: "PLATFORM", title: "Publisher terms 2026", body: "# Terms\n\nClause one.", activate: true });
        render(<Desk />);

        fireEvent.click(screen.getByRole("button", { name: "Read the text" }));
        expect(dialog().getByText("Clause one.", { exact: false })).toBeInTheDocument();
        expect(dialog().getByText(/live from/)).toBeInTheDocument();
        expect(dialog().getByText(/0 acceptances/)).toBeInTheDocument();
    });
});
