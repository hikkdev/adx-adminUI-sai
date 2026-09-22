import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * D8 — the training desk, live.
 *
 * No screen existed before this one. What this pins is the table reading
 * the real contract — the question count shouting when an active module has
 * none, the pass mark and the lock printed as the contract has them — the
 * Active switch actually PATCHing and being honest about it, "New module"
 * creating something with the exact body it POSTs and the module landing
 * inactive by default, the editor's "Save questions" PUTting the whole set
 * with one correct option each, the server's ordering sentence surfaced
 * inline, and Revoke posting a reason.
 */

const { backend, toast, router } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    const router = { push: vi.fn(), replace: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        refusePatch: false,
        refuseWith: null as { status: number; message: string } | null,
        modules: [] as Record<string, unknown>[],
        questions: {} as Record<string, unknown[]>,
        certifications: [] as Record<string, unknown>[],
        reset() {
            this.calls = [];
            this.refusePatch = false;
            this.refuseWith = null;
            this.modules = [
                {
                    id: "mod_welcome",
                    ordinal: 1,
                    title: "Welcome to ADX",
                    summary: "What the platform is.",
                    durationMins: 12,
                    videoUrl: null,
                    lessonBody: "# Welcome\n\nADX is a **marketplace**.",
                    transcript: null,
                    takeaways: ["ADX is a marketplace"],
                    passPercent: 80,
                    questionCount: 2,
                    isActive: true,
                    unlockAfterOrdinal: null,
                    createdAt: "2026-09-01T04:30:00.000Z",
                    updatedAt: "2026-09-10T04:30:00.000Z",
                },
                {
                    id: "mod_listing",
                    ordinal: 3,
                    title: "Listing a spot",
                    summary: null,
                    durationMins: null,
                    videoUrl: null,
                    lessonBody: null,
                    transcript: null,
                    takeaways: [],
                    passPercent: 70,
                    questionCount: 0,
                    isActive: true,
                    unlockAfterOrdinal: 1,
                    createdAt: "2026-09-01T04:30:00.000Z",
                    updatedAt: "2026-09-10T04:30:00.000Z",
                },
            ];
            this.questions = {
                mod_welcome: [
                    {
                        id: "q1",
                        ordinal: 1,
                        prompt: "What is ADX?",
                        isActive: true,
                        options: [
                            { id: "o1", ordinal: 1, label: "A marketplace", isCorrect: true },
                            { id: "o2", ordinal: 2, label: "A bank", isCorrect: false },
                        ],
                    },
                    {
                        id: "q2",
                        ordinal: 2,
                        prompt: "Who onboards a publisher?",
                        isActive: true,
                        options: [
                            { id: "o3", ordinal: 1, label: "An agent", isCorrect: true },
                            { id: "o4", ordinal: 2, label: "Nobody", isCorrect: false },
                        ],
                    },
                ],
                mod_listing: [],
            };
            this.certifications = [
                {
                    id: "cert_1",
                    agentId: "agt_ravi",
                    agentDisplayId: "AGT-1009-2601",
                    agentName: "Ravi Kumar",
                    certificateId: "ADX-CERT-1109-2601",
                    issuedAt: "2026-09-05T04:30:00.000Z",
                    revokedAt: null,
                    revokedReason: null,
                },
                {
                    id: "cert_2",
                    agentId: "agt_priya",
                    agentDisplayId: null,
                    agentName: "Priya Nair",
                    certificateId: "ADX-CERT-1110-2601",
                    issuedAt: "2026-09-06T04:30:00.000Z",
                    revokedAt: "2026-09-08T04:30:00.000Z",
                    revokedReason: "Left the field team",
                },
            ];
        },
        async handle(method: string, path: string, body?: unknown) {
            this.calls.push({ method, path, body });
            if (this.refuseWith) throw Object.assign(new Error(this.refuseWith.message), { status: this.refuseWith.status });
            if (method === "GET" && path === "/training/modules") return this.modules;
            if (method === "POST" && path === "/training/modules") {
                const row = {
                    id: "mod_new",
                    questionCount: 0,
                    createdAt: "2026-09-11T00:00:00.000Z",
                    updatedAt: "2026-09-11T00:00:00.000Z",
                    ...(body as object),
                };
                this.modules.push(row);
                return row;
            }
            const admin = path.match(/^\/training\/modules\/([^/]+)\/admin$/);
            if (method === "GET" && admin) {
                const row = this.modules.find((module) => module.id === admin[1]);
                if (!row) throw Object.assign(new Error("No such module"), { status: 404 });
                return { ...row, questions: this.questions[admin[1]] ?? [] };
            }
            const patch = path.match(/^\/training\/modules\/([^/]+)$/);
            if (method === "PATCH" && patch) {
                if (this.refusePatch) throw Object.assign(new Error("No such module"), { status: 404 });
                const row = this.modules.find((module) => module.id === patch[1])!;
                Object.assign(row, body as object);
                return row;
            }
            const put = path.match(/^\/training\/modules\/([^/]+)\/questions$/);
            if (method === "PUT" && put) {
                const { questions } = body as { questions: { prompt: string; options: { label: string; isCorrect: boolean }[] }[] };
                const stored = questions.map((question, i) => ({
                    id: `q_new_${i}`,
                    ordinal: i + 1,
                    prompt: question.prompt,
                    isActive: true,
                    options: question.options.map((option, j) => ({ id: `o_new_${i}_${j}`, ordinal: j + 1, ...option })),
                }));
                this.questions[put[1]] = stored;
                return stored;
            }
            if (method === "GET" && path === "/training/certifications") return this.certifications;
            const revoke = path.match(/^\/training\/certifications\/([^/]+)\/revoke$/);
            if (method === "POST" && revoke) {
                const row = this.certifications.find((cert) => cert.id === revoke[1])!;
                Object.assign(row, { revokedAt: "2026-09-11T00:00:00.000Z", revokedReason: (body as { reason: string }).reason });
                return row;
            }
            throw Object.assign(new Error(`No route ${method} ${path}`), { status: 404 });
        },
    };
    return { backend, toast, router };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/training",
    useSearchParams: () => new URLSearchParams(),
    notFound: () => {
        throw new Error("notFound");
    },
}));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return {
        ...actual,
        apiConfig: { ...actual.apiConfig, live: true },
        isLive: (domain: keyof typeof actual.liveDomains) => actual.liveDomains[domain],
    };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        try {
            return await backend.handle(method, path, body);
        } catch (cause) {
            const status = (cause as { status?: number }).status ?? 500;
            throw new actual.ApiError(status, status === 400 ? "VALIDATION_ERROR" : "NOT_FOUND", (cause as Error).message);
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

import { trainingService } from "@/services/training";
import { TrainingView } from "./training-view";
import { ModuleEditor } from "./[id]/module-editor";
import { CertificationsView } from "./certifications/certifications-view";

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
    router.push.mockReset();
});

async function mountTable() {
    const modules = await trainingService.modules();
    const onChanged = vi.fn();
    render(<TrainingView modules={modules} onChanged={onChanged} />);
    return { onChanged };
}

const rowOf = (title: string) => within(screen.getByText(title).closest("tr")!);

describe("what the modules table draws", () => {
    it("prints the duration, the pass mark and the lock as the contract has them", async () => {
        await mountTable();
        const welcome = rowOf("Welcome to ADX");
        expect(welcome.getByText("12 min")).toBeInTheDocument();
        expect(welcome.getByText("80%")).toBeInTheDocument();
        expect(welcome.getByText("2")).toBeInTheDocument();

        const listing = rowOf("Listing a spot");
        expect(listing.getByText("70%")).toBeInTheDocument();
        expect(listing.getByText("Module 1")).toBeInTheDocument();
    });

    /**
     * The column that matters. An active module with no questions is on
     * every agent's index and counted as passed for the certificate.
     */
    it("shouts when an active module has no questions, and stays quiet for one that has some", async () => {
        await mountTable();
        expect(rowOf("Listing a spot").getByText("no quiz")).toBeInTheDocument();
        expect(rowOf("Welcome to ADX").queryByText("no quiz")).not.toBeInTheDocument();
        expect(screen.getByText(/1 active with no quiz/)).toBeInTheDocument();
    });

    it("opens the editor when a row is clicked", async () => {
        await mountTable();
        fireEvent.click(screen.getByText("Welcome to ADX"));
        expect(router.push).toHaveBeenCalledWith("/training/mod_welcome");
    });
});

describe("the Active switch", () => {
    it("moves at once, PATCHes isActive, and says so only once the server answered", async () => {
        const { onChanged } = await mountTable();
        const toggle = rowOf("Welcome to ADX").getByRole("switch");
        expect(toggle).toHaveAttribute("aria-checked", "true");

        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute("aria-checked", "false");
        expect(toast.success).not.toHaveBeenCalled();

        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(backend.calls).toContainEqual({
            method: "PATCH",
            path: "/training/modules/mod_welcome",
            body: { isActive: false },
        });
        expect(toast.success.mock.calls[0][0]).toBe("Welcome to ADX switched off");
        expect(toast.error).not.toHaveBeenCalled();
    });

    it("moves back when the server refuses, and does not claim a save that did not happen", async () => {
        backend.refusePatch = true;
        const { onChanged } = await mountTable();
        const toggle = rowOf("Welcome to ADX").getByRole("switch");

        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute("aria-checked", "false");

        await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
        expect(toggle).toHaveAttribute("aria-checked", "true");
        expect(toast.success).not.toHaveBeenCalled();
        expect(onChanged).not.toHaveBeenCalled();
    });
});

describe("New module", () => {
    it("POSTs the module with the order one past the highest and inactive by default", async () => {
        const { onChanged } = await mountTable();
        fireEvent.click(screen.getByRole("button", { name: "New module" }));
        const dialog = within(await screen.findByRole("dialog"));

        expect(dialog.getByRole("switch")).toHaveAttribute("aria-checked", "false");
        // One past 3, the highest order on the index — not one past the count.
        expect(dialog.getByLabelText("Order")).toHaveValue(4);
        expect(dialog.getByLabelText("Pass mark (%)")).toHaveValue(80);

        fireEvent.change(dialog.getByLabelText("Title"), { target: { value: "Pricing a wall" } });
        fireEvent.change(dialog.getByLabelText(/^Duration \(minutes\)/), { target: { value: "20" } });
        fireEvent.change(dialog.getByLabelText(/^Unlock after/), { target: { value: "3" } });
        fireEvent.click(dialog.getByRole("button", { name: "Create module" }));

        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        const post = backend.calls.find((call) => call.method === "POST");
        expect(post?.path).toBe("/training/modules");
        expect(post?.body).toEqual({
            ordinal: 4,
            title: "Pricing a wall",
            summary: null,
            durationMins: 20,
            videoUrl: null,
            unlockAfterOrdinal: 3,
            passPercent: 80,
            isActive: false,
            // AG-4: a lesson for every agent, untimed, unless the desk says otherwise.
            audience: "ALL",
            kind: "LESSON",
            timeLimitMins: null,
        });
        expect(toast.success.mock.calls[0][0]).toBe("Pricing a wall created");
    });

    it("will not send a lock on a later module — the server's own rule, said first", async () => {
        await mountTable();
        fireEvent.click(screen.getByRole("button", { name: "New module" }));
        const dialog = within(await screen.findByRole("dialog"));

        fireEvent.change(dialog.getByLabelText("Title"), { target: { value: "Pricing a wall" } });
        fireEvent.change(dialog.getByLabelText(/^Unlock after/), { target: { value: "4" } });

        expect(dialog.getByRole("button", { name: "Create module" })).toBeDisabled();
        expect(dialog.getByText("A module can only wait on one that comes before it.")).toBeInTheDocument();
        expect(backend.calls.some((call) => call.method === "POST")).toBe(false);
    });
});

describe("the editor", () => {
    async function mountEditor(id: string) {
        const [module, modules] = await Promise.all([trainingService.module(id), trainingService.modules()]);
        const onSaved = vi.fn();
        render(<ModuleEditor module={module} modules={modules} onSaved={onSaved} />);
        return { onSaved };
    }

    it("previews the lesson as blocks and lists the stored questions with their correct option marked", async () => {
        await mountEditor("mod_welcome");
        expect(screen.getByRole("heading", { name: "Welcome" })).toBeInTheDocument();
        expect(screen.getByText("marketplace").tagName).toBe("STRONG");

        expect(screen.getByLabelText("Question 1 prompt")).toHaveValue("What is ADX?");
        expect(screen.getByLabelText("Question 1 option 1 is correct")).toBeChecked();
        expect(screen.getByLabelText("Question 1 option 2 is correct")).not.toBeChecked();
        // Nothing to send until something changes.
        expect(screen.getByRole("button", { name: "Save questions" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    });

    it("PUTs the whole set with exactly one correct option per question, and refuses a set with none", async () => {
        const { onSaved } = await mountEditor("mod_welcome");

        // Move the second question's correct answer, then add a third question.
        fireEvent.click(screen.getByLabelText("Question 2 option 2 is correct"));
        fireEvent.click(screen.getByRole("button", { name: "Add question" }));
        // A blank question is not sendable: its problem is shown and the button stays off.
        expect(screen.getByRole("button", { name: "Save questions" })).toBeDisabled();
        expect(screen.getByText("A question needs a prompt.")).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText("Question 3 prompt"), { target: { value: "What is a spot?" } });
        fireEvent.change(screen.getByLabelText("Question 3 option 1"), { target: { value: "A wall" } });
        fireEvent.change(screen.getByLabelText("Question 3 option 2"), { target: { value: "A bank" } });
        // The frame's four options; two blank ones are removed down to the schema's floor of two.
        fireEvent.click(screen.getByLabelText("Remove question 3 option 4"));
        fireEvent.click(screen.getByLabelText("Remove question 3 option 3"));
        expect(screen.getByLabelText("Remove question 3 option 2")).toBeDisabled();

        fireEvent.click(screen.getByRole("button", { name: "Save questions" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

        const put = backend.calls.find((call) => call.method === "PUT");
        expect(put?.path).toBe("/training/modules/mod_welcome/questions");
        expect(put?.body).toEqual({
            questions: [
                { prompt: "What is ADX?", options: [{ label: "A marketplace", isCorrect: true }, { label: "A bank", isCorrect: false }] },
                { prompt: "Who onboards a publisher?", options: [{ label: "An agent", isCorrect: false }, { label: "Nobody", isCorrect: true }] },
                { prompt: "What is a spot?", options: [{ label: "A wall", isCorrect: true }, { label: "A bank", isCorrect: false }] },
            ],
        });
        expect(toast.success.mock.calls[0][0]).toBe("3 questions saved");
    });

    it("PATCHes only what changed, and surfaces the server's ordering sentence inline when it still fires", async () => {
        const { onSaved } = await mountEditor("mod_welcome");

        fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Welcome to ADX " } });
        expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

        fireEvent.change(screen.getByLabelText("Pass mark (%)"), { target: { value: "90" } });
        fireEvent.change(screen.getByLabelText("New takeaway"), { target: { value: "Agents onboard both sides" } });
        fireEvent.click(screen.getByRole("button", { name: "Add" }));

        backend.refuseWith = { status: 400, message: "A module can only wait on one that comes before it" };
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
        await waitFor(() => expect(screen.getByText("A module can only wait on one that comes before it")).toBeInTheDocument());
        expect(onSaved).not.toHaveBeenCalled();
        expect(toast.success).not.toHaveBeenCalled();

        backend.refuseWith = null;
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        const patches = backend.calls.filter((call) => call.method === "PATCH");
        expect(patches.at(-1)?.body).toEqual({
            passPercent: 90,
            takeaways: ["ADX is a marketplace", "Agents onboard both sides"],
        });
    });
});

describe("certifications", () => {
    async function mountCertifications() {
        const rows = await trainingService.certifications();
        const onChanged = vi.fn();
        render(<CertificationsView rows={rows} onChanged={onChanged} />);
        return { onChanged };
    }

    it("names the agent with their AGT- id and links them, prints the certificate, and offers Revoke only while it stands", async () => {
        await mountCertifications();
        const ravi = rowOf("Ravi Kumar");
        expect(ravi.getByText("AGT-1009-2601")).toBeInTheDocument();
        expect(ravi.getByRole("link")).toHaveAttribute("href", "/agents/agt_ravi");
        expect(ravi.getByText("ADX-CERT-1109-2601")).toBeInTheDocument();
        expect(ravi.getByText("Active")).toBeInTheDocument();
        expect(ravi.getByRole("button", { name: "Revoke" })).toBeInTheDocument();

        const priya = rowOf("Priya Nair");
        expect(priya.getByText("Revoked")).toBeInTheDocument();
        expect(priya.getByText(/Left the field team/)).toBeInTheDocument();
        expect(priya.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
        // No PDF exists, so nothing offers one.
        expect(screen.queryByText(/Download/)).not.toBeInTheDocument();
    });

    it("POSTs the reason, and says so only once the server answered", async () => {
        const { onChanged } = await mountCertifications();
        fireEvent.click(rowOf("Ravi Kumar").getByRole("button", { name: "Revoke" }));
        const dialog = within(await screen.findByRole("dialog"));

        const submit = dialog.getByRole("button", { name: "Revoke certificate" });
        expect(submit).toBeDisabled();
        fireEvent.change(dialog.getByLabelText("Reason"), { target: { value: "Failed a site audit" } });
        fireEvent.click(submit);

        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        expect(backend.calls).toContainEqual({
            method: "POST",
            path: "/training/certifications/cert_1/revoke",
            body: { reason: "Failed a site audit" },
        });
        expect(toast.success.mock.calls[0][0]).toBe("ADX-CERT-1109-2601 revoked");
    });
});
