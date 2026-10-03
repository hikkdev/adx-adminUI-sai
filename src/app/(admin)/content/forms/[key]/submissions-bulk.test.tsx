import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Forms › Submissions › bulk (28 Sep 2026). What is pinned: selected
 * answers are marked read (or new, or archived) through the single-answer
 * PATCH each, the ones already there skipped and counted up front; "Download
 * selected" writes a CSV of just those answers with the server CSV's own
 * columns — its fixed ones, then one per field id across every version, a
 * cell as the server writes it; and the marks are shut without content.edit.
 */

const { backend, perms, toast, saved } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        answers: {} as Record<string, unknown>,
        reset() {
            this.calls = [];
            this.answers = {};
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            const answer = this.answers[`${method} ${path.split("?")[0]}`];
            if (answer === undefined) throw new Error(`No route ${method} ${path}`);
            return answer;
        },
    },
    perms: { held: new Set<string>() },
    toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
    saved: { files: [] as { blob: Blob; name: string }[] },
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        try {
            return await backend.handle(method, path, body);
        } catch (cause) {
            throw new actual.ApiError(404, "NOT_FOUND", (cause as Error).message);
        }
    };
    return {
        ...actual,
        saveBlob: (blob: Blob, name: string) => saved.files.push({ blob, name }),
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
            put: (path: string, body?: unknown) => wrap("PUT", path, body),
            delete: (path: string) => wrap("DELETE", path),
            blob: (path: string) => wrap("GET", path),
        },
    };
});

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ can: (id: string) => perms.held.has(id), user: null }) }));

import { csvFieldColumns, submissionCsvCell, submissionsCsvRows, type FormSubmission, type FormVersionView } from "@/services/forms";
import { SUBMISSION_BULK_BLOCKED, SubmissionsTab } from "./submissions-tab";

const submission = (over: Partial<FormSubmission> = {}): FormSubmission => ({
    id: "sub_1",
    createdAt: "2026-09-28T06:30:00.000Z",
    status: "NEW",
    contactName: "Asha Rao",
    contactEmail: "asha@example.in",
    contactPhone: null,
    cityId: "city_blr",
    address: null,
    latitude: null,
    longitude: null,
    answers: { name: "Asha Rao", sizes: ["A4", "A3"], consent: true },
    formVersion: 2,
    leadId: null,
    ticketId: null,
    source: "website",
    ...over,
});

const version = (number: number, fields: { id: string; label: string; kind: string }[]): FormVersionView => ({
    id: `fv_${number}`,
    number,
    status: number === 2 ? "PUBLISHED" : "RETIRED",
    definition: { screens: [{ key: "s1", fields }], successMessage: "Thanks", consentText: "I agree" },
    changeNote: null,
    createdAt: "2026-09-20T00:00:00.000Z",
    publishedAt: null,
});

const asha = submission();
const ravi = submission({ id: "sub_2", status: "READ", contactName: "Ravi, \"RK\"", contactEmail: null, answers: { name: "Ravi", consent: false } });
const meera = submission({ id: "sub_3", contactName: "Meera" });
const nila = submission({ id: "sub_4", status: "ARCHIVED", contactName: "Nila" });

function serve(formKey: string) {
    backend.answers[`GET /forms/${formKey}/submissions`] = {
        items: [asha, ravi, meera, nila],
        total: 4,
        page: 1,
        pageSize: 25,
        fields: [
            { id: "name", label: "Your name", kind: "text" },
            { id: "sizes", label: "Sizes", kind: "multiselect" },
        ],
    };
    backend.answers[`GET /forms/${formKey}/versions`] = [
        version(2, [
            { id: "name", label: "Your name", kind: "text" },
            { id: "sizes", label: "Sizes", kind: "multiselect" },
        ]),
        version(1, [
            { id: "name", label: "Name", kind: "text" },
            { id: "consent", label: "Consent", kind: "checkbox" },
        ]),
    ];
    backend.answers[`PATCH /forms/${formKey}/submissions/sub_1`] = { ...asha, status: "READ" };
    backend.answers[`PATCH /forms/${formKey}/submissions/sub_3`] = { ...meera, status: "READ" };
}

const readBlob = (blob: Blob): Promise<string> =>
    new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsText(blob);
    });

/** The row's checkbox by the contact's name (the first cell it shows in — a name can also be an answer). */
const checkboxOf = (name: string) => within(screen.getAllByText(name)[0]!.closest("tr")!).getByRole("checkbox");

beforeEach(() => {
    backend.reset();
    saved.files = [];
    perms.held = new Set(["content.view", "content.edit"]);
    for (const fn of Object.values(toast)) fn.mockReset();
});

describe("marking a selection", () => {
    it("marks the new ones read through the single-answer PATCH, skipping one already read", async () => {
        serve("event-signup");
        render(<SubmissionsTab formKey="event-signup" />);
        await screen.findByText("Meera");
        fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
        fireEvent.click(screen.getByTestId("bulk-read"));

        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText("Mark 2 answers read?")).toBeInTheDocument();
        expect(within(dialog).getByText("2 will be marked read, 1 skipped (already read), 1 skipped (archived).")).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole("button", { name: "Mark 2 answers read" }));

        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("2 marked read", undefined));
        expect(backend.calls.filter((call) => call.method === "PATCH")).toEqual([
            { method: "PATCH", path: "/forms/event-signup/submissions/sub_1", body: { status: "READ" } },
            { method: "PATCH", path: "/forms/event-signup/submissions/sub_3", body: { status: "READ" } },
        ]);
        // One reload of the page after the run.
        await waitFor(() => expect(backend.calls.filter((call) => call.method === "GET" && call.path.startsWith("/forms/event-signup/submissions"))).toHaveLength(2));
    });

    it("is shut without content.edit, naming the power; the download is not", async () => {
        perms.held = new Set(["content.view"]);
        serve("feedback");
        render(<SubmissionsTab formKey="feedback" />);
        await screen.findByText("Meera");
        fireEvent.click(checkboxOf("Meera"));
        for (const key of ["read", "new", "archive", "unarchive"]) {
            expect(screen.getByTestId(`bulk-${key}`)).toBeDisabled();
            expect(screen.getByTestId(`bulk-${key}`)).toHaveAttribute("title", SUBMISSION_BULK_BLOCKED);
        }
        expect(screen.getByTestId("submissions-csv-selected")).toBeEnabled();
    });
});

describe("downloading a selection", () => {
    it("writes just the selected answers, with the server CSV's columns across every version", async () => {
        serve("quote-request");
        render(<SubmissionsTab formKey="quote-request" />);
        await screen.findByText("Meera");
        fireEvent.click(checkboxOf("Asha Rao"));
        fireEvent.click(checkboxOf("Ravi, \"RK\""));
        fireEvent.click(screen.getByTestId("submissions-csv-selected"));

        await waitFor(() => expect(saved.files).toHaveLength(1));
        expect(saved.files[0]!.name).toBe("form-quote-request-selected.csv");
        const text = await readBlob(saved.files[0]!.blob);
        expect(text.split("\r\n")).toEqual([
            "id,createdAt,status,version,contactName,contactEmail,contactPhone,cityId,address,latitude,longitude,leadId,ticketId,source,name (Your name),sizes (Sizes),consent (Consent)",
            "sub_1,2026-09-28T06:30:00.000Z,NEW,2,Asha Rao,asha@example.in,,city_blr,,,,,,website,Asha Rao,A4; A3,Yes",
            'sub_2,2026-09-28T06:30:00.000Z,READ,2,"Ravi, ""RK""",,,city_blr,,,,,,website,Ravi,,No',
            "",
        ]);
        expect(toast.success).toHaveBeenCalledWith("2 answers downloaded");
    });
});

describe("the CSV's pure half", () => {
    it("takes columns across versions in the order the server walks, the first label winning", () => {
        const columns = csvFieldColumns([version(2, [{ id: "name", label: "Your name", kind: "text" }]), version(1, [{ id: "name", label: "Name", kind: "text" }, { id: "city", label: "City", kind: "city" }])]);
        expect(columns).toEqual([
            { id: "name", label: "Your name", kind: "text" },
            { id: "city", label: "City", kind: "city" },
        ]);
    });

    it("writes a cell as the server does", () => {
        expect(submissionCsvCell("text", undefined)).toBeNull();
        expect(submissionCsvCell("checkbox", true)).toBe("Yes");
        expect(submissionCsvCell("multiselect", ["a", "b"])).toBe("a; b");
        expect(submissionCsvCell("location", { latitude: 12.97, longitude: 77.59, address: "MG Road" })).toBe("MG Road (12.97, 77.59)");
        expect(submissionCsvCell("location", { latitude: 12.97, longitude: 77.59 })).toBe("12.97, 77.59");
        expect(submissionCsvCell("file", { fileId: "f_1" })).toBe('{"fileId":"f_1"}');
        expect(submissionCsvCell("number", 4)).toBe(4);
    });

    it("heads the rows with the fixed columns and one per field", () => {
        expect(submissionsCsvRows([], [{ id: "name", label: "Name", kind: "text" }])[0]!.slice(-2)).toEqual(["source", "name (Name)"]);
    });
});
