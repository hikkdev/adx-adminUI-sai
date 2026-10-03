import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Pages › Redirects › bulk (28 Sep 2026). What is pinned: an import is read
 * line by line with the Add dialog's own checks (the source through
 * `pathProblem`, not an address already answered, not twice; the
 * destination a site path or https; the third column true/false) and
 * previewed before anything is written; the lines that pass are created one
 * by one, in file order; a line the server refuses stays in the box with its
 * reason. Selected redirects delete together, each its own DELETE, and only
 * for a role with content.addresses and content.delete.
 */

const { backend, toast } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        refuse: new Map<string, string>(),
        reset() {
            this.calls = [];
            this.refuse = new Map();
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            const from = (body as { fromPath?: string } | undefined)?.fromPath;
            const refusal = this.refuse.get(`${method} ${path}`) ?? (from ? this.refuse.get(from) : undefined);
            if (refusal) throw new Error(refusal);
            return { id: `rd_${this.calls.length}` };
        },
    },
    toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        try {
            return await backend.handle(method, path, body);
        } catch (cause) {
            throw new actual.ApiError(409, "CONFLICT", (cause as Error).message);
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

import { readRedirectCsv, type SiteRedirectRow } from "@/services/site-pages";
import { REMOVE_REDIRECT_BLOCKED, RedirectsTab } from "./redirects-tab";

const redirect = (over: Partial<SiteRedirectRow> = {}): SiteRedirectRow => ({
    id: "rd_1",
    fromPath: "/old-diwali",
    toPath: "/diwali-offers",
    permanent: true,
    reason: "MANUAL",
    page: null,
    createdAt: "2026-09-27T00:00:00.000Z",
    ...over,
});

beforeEach(() => {
    backend.reset();
    for (const fn of Object.values(toast)) fn.mockReset();
});

describe("reading an import", () => {
    it("takes a header, reads the permanent column, and numbers the lines as the file does", () => {
        const rows = readRedirectCsv("from,to,permanent\n/old-offer,/diwali-offers,true\n/press,https://news.adx.in,false\n/blog,/news\n");
        expect(rows).toEqual([
            { line: 2, fromPath: "/old-offer", toPath: "/diwali-offers", permanent: true, problem: null },
            { line: 3, fromPath: "/press", toPath: "https://news.adx.in", permanent: false, problem: null },
            { line: 4, fromPath: "/blog", toPath: "/news", permanent: true, problem: null },
        ]);
    });

    it("reads a file with no header from its first line", () => {
        expect(readRedirectCsv("/a,/b")[0]).toMatchObject({ line: 1, fromPath: "/a", toPath: "/b" });
    });

    it("applies the Add dialog's checks to every line", () => {
        const text = [
            "/api/old,/x", // reserved first segment
            "/Old,/x", // not lowercase
            "/taken,/x", // already answered
            "/twice,/x",
            "/twice,/y", // twice in the file
            "/plain,http://insecure.in", // outside must be https
            "/loop,/loop", // itself
            "/flag,/x,maybe", // bad third column
            "/extra,/x,true,more", // four columns
        ].join("\n");
        const problems = readRedirectCsv(text, ["/taken"]).map((row) => row.problem);
        expect(problems).toEqual([
            "From: “/api” is kept by the website.",
            "From: Segments are lowercase letters, digits and single hyphens — “/diwali-offers”.",
            "A page or another redirect already answers this address.",
            null,
            "This address is listed twice in the file.",
            "To: An outside address must be https.",
            "It would point at itself.",
            "The third column is true or false.",
            "Two or three columns: from, to, permanent.",
        ]);
    });
});

describe("importing", () => {
    it("previews the lines, then creates the good ones one by one in file order", async () => {
        const onChanged = vi.fn();
        render(<RedirectsTab redirects={[redirect()]} pages={[]} mayManage mayRemove onChanged={onChanged} />);
        fireEvent.click(screen.getByTestId("redirect-import"));
        fireEvent.change(await screen.findByTestId("redirect-import-text"), {
            target: { value: "from,to,permanent\n/old-offer,/diwali-offers,true\n/old-diwali,/x\n/press,https://news.adx.in,false" },
        });
        expect(within(screen.getByTestId("redirect-import-line-3")).getByText("A page or another redirect already answers this address.")).toBeInTheDocument();
        expect(screen.getByTestId("redirect-import-plan")).toHaveTextContent("2 will be imported, 1 skipped (a problem on the line).");

        fireEvent.click(screen.getByRole("button", { name: "Import 2 redirects" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(backend.calls).toEqual([
            { method: "POST", path: "/site/redirects", body: { fromPath: "/old-offer", toPath: "/diwali-offers", permanent: true } },
            { method: "POST", path: "/site/redirects", body: { fromPath: "/press", toPath: "https://news.adx.in", permanent: false } },
        ]);
        expect(toast.success).toHaveBeenCalledWith("2 imported", undefined);
        await waitFor(() => expect(screen.queryByTestId("redirect-import-text")).toBeNull());
    });

    it("leaves a line the server refused in the box, with its reason", async () => {
        backend.refuse.set("/press", "/press is the address of “Press” (press)");
        render(<RedirectsTab redirects={[]} pages={[]} mayManage mayRemove onChanged={vi.fn()} />);
        fireEvent.click(screen.getByTestId("redirect-import"));
        fireEvent.change(await screen.findByTestId("redirect-import-text"), { target: { value: "/old-offer,/diwali-offers\n/press,/news" } });
        fireEvent.click(screen.getByRole("button", { name: "Import 2 redirects" }));

        await waitFor(() => expect(screen.getByTestId("redirect-import-refused")).toHaveTextContent("/press — /press is the address of “Press” (press)"));
        expect(toast.warning).toHaveBeenCalledWith("1 imported · 1 failed: /press is the address of “Press” (press)", expect.anything());
        expect(screen.getByTestId("redirect-import-text")).toHaveValue("from,to,permanent\n/press,/news,true\n");
    });

    it("reads an uploaded CSV into the box", async () => {
        render(<RedirectsTab redirects={[]} pages={[]} mayManage mayRemove onChanged={vi.fn()} />);
        fireEvent.click(screen.getByTestId("redirect-import"));
        const file = new File(["from,to\n/spring,/offers\n"], "old-links.csv", { type: "text/csv" });
        fireEvent.change(await screen.findByTestId("redirect-import-file"), { target: { files: [file] } });
        await waitFor(() => expect(screen.getByTestId("redirect-import-text")).toHaveValue("from,to\n/spring,/offers\n"));
        expect(screen.getByText("old-links.csv")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Import 1 redirect" })).toBeEnabled();
    });

    it("is shut without content.addresses", () => {
        render(<RedirectsTab redirects={[]} pages={[]} mayManage={false} mayRemove={false} onChanged={vi.fn()} />);
        expect(screen.getByTestId("redirect-import")).toBeDisabled();
        expect(screen.getByTestId("redirect-import")).toHaveAttribute("title", "Adding a redirect needs content.addresses.");
    });
});

describe("deleting a selection", () => {
    it("deletes each selected redirect through its own DELETE and reloads once", async () => {
        const onChanged = vi.fn();
        render(<RedirectsTab redirects={[redirect(), redirect({ id: "rd_2", fromPath: "/old-holi" })]} pages={[]} mayManage mayRemove onChanged={onChanged} />);
        fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
        fireEvent.click(screen.getByTestId("bulk-delete"));
        fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete 2 redirects" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(backend.calls.map((call) => `${call.method} ${call.path}`)).toEqual(["DELETE /site/redirects/rd_1", "DELETE /site/redirects/rd_2"]);
    });

    it("is shut without content.addresses and content.delete", () => {
        render(<RedirectsTab redirects={[redirect()]} pages={[]} mayManage mayRemove={false} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
        expect(screen.getByTestId("bulk-delete")).toBeDisabled();
        expect(screen.getByTestId("bulk-delete")).toHaveAttribute("title", REMOVE_REDIRECT_BLOCKED);
    });
});
