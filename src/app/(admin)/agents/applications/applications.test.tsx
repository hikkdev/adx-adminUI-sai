import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * AG-3 (the owner, 20 Sep 2026) — the agent application desk in the console.
 *
 * Pinned: the service speaks the application doors exactly (the queue with
 * its chip group, the desk's profile/terms/submit/review/decision/grade/
 * exit doors); the queue draws every applicant with their stage and papers,
 * and the chips carry the server's counts; the workbench shows the ladder,
 * lets the desk record the terms and submit for the applicant, reviews a
 * paper with a note, and activates with a grade and an engagement.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const { backend } = vi.hoisted(() => ({
    backend: {
        calls: [] as { method: string; path: string; body?: unknown }[],
        reply: {} as Record<string, unknown>,
    },
}));

vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/agents/applications",
    useSearchParams: () => new URLSearchParams(),
    notFound: () => {
        throw new Error("notFound");
    },
}));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const answer = (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        const key = `${method} ${path.split("?")[0]}`;
        const reply = backend.reply[key] ?? backend.reply[`${method} *`];
        if (reply instanceof actual.ApiError) return Promise.reject(reply);
        return Promise.resolve(reply);
    };
    return {
        ...actual,
        api: {
            get: (path: string) => answer("GET", path),
            post: (path: string, body?: unknown) => answer("POST", path, body),
            patch: (path: string, body?: unknown) => answer("PATCH", path, body),
            put: (path: string, body?: unknown) => answer("PUT", path, body),
            delete: (path: string) => answer("DELETE", path),
            getEnvelope: (path: string) => answer("GET", path),
        },
    };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});
vi.mock("@/components/adx/city-combobox", () => ({
    CityCombobox: ({ id, value, onChange }: { id: string; value: string; onChange: (v: string, picked: null) => void }) => (
        <input id={id} value={value} onChange={(e) => onChange(e.target.value, null)} />
    ),
}));

import { ApiError } from "@/lib/api-client";
import { agentApplicationService, buildApplicationsQuery, decisionsFor, type ApplicationRow, type ApplicationView, type ApplicationsPage } from "@/services/agent-applications";
import { ApplicationsQueue, queueChips } from "./applications-queue";
import { ApplicationWorkbench } from "./[id]/application-workbench";

const row = (over: Partial<ApplicationRow> = {}): ApplicationRow => ({
    id: "agt_1",
    displayId: "AGT-2009-2604",
    stage: "UNDER_REVIEW",
    grade: null,
    sourceKind: "SELF",
    side: "PUBLISHER",
    city: "Bengaluru",
    createdAt: "2026-09-18T10:00:00.000Z",
    applicationSubmittedAt: "2026-09-19T10:00:00.000Z",
    activatedAt: null,
    user: { name: "Deepak Rao", mobile: "+919000000777", email: null },
    documents: { filed: 3, flagged: 1 },
    ...over,
});

const page = (rows: ApplicationRow[], counts: ApplicationsPage["counts"] = {}): ApplicationsPage => ({ rows, page: 1, pageSize: 25, total: rows.length, totalPages: 1, counts });

const step = (key: ApplicationView["ladder"]["steps"][number]["key"], state: ApplicationView["ladder"]["steps"][number]["state"], missing: string[] = []) => ({ key, state, missing });
const paper = (kind: ApplicationView["documents"][number]["kind"], label: string, status: ApplicationView["documents"][number]["status"] = "SUBMITTED"): ApplicationView["documents"][number] => ({
    kind,
    label,
    required: true,
    status,
    url: status === "MISSING" ? null : `http://localhost:3000/api/v1/files/${kind}`,
    numberMasked: null,
    expiresAt: null,
    reviewNote: null,
    uploadedVia: "APP",
    updatedAt: "2026-09-19T09:00:00.000Z",
});

function view(over: Partial<ApplicationView["agent"]> = {}, ladder: Partial<ApplicationView["ladder"]> = {}, documents?: ApplicationView["documents"]): ApplicationView {
    return {
        agent: {
            id: "agt_1",
            userId: "usr_1",
            displayId: "AGT-2009-2604",
            stage: "UNDER_REVIEW",
            side: "PUBLISHER",
            grade: null,
            gradeLabel: null,
            sourceKind: "SELF",
            applicationSubmittedAt: "2026-09-19T10:00:00.000Z",
            activatedAt: null,
            holdReason: null,
            rejectionReason: null,
            reviewNote: null,
            engagement: { type: null, startAt: null, endAt: null, probationEndsAt: null, reportingManagerId: null, weeklyHours: null },
            exit: { at: null, reason: null, note: null, rehireEligible: true, blacklisted: false },
            ...over,
        },
        person: { name: "Deepak Rao", mobile: "+919000000777", email: null, dateOfBirth: "1995-05-05", gender: "MALE" },
        profile: { city: "Bengaluru", state: "Karnataka", languages: ["Kannada"], vehicleType: "NONE", vehicleNumber: null, currentAddress: "12, 4th Cross", currentLatitude: null, currentLongitude: null, permanentAddress: "Hassan", emergencyContactName: "Meena", emergencyContactRelation: "Mother", emergencyContactPhone: "+919000000778", highestEducation: null, salesExperienceYears: null, industries: [], noticePeriodDays: null, territory: null, homeZone: null },
        educations: [],
        employments: [],
        references: [],
        platformExperiences: [{ platform: "ZOMATO", partnerId: "Z-1", years: 2, active: true, ratingNote: null }],
        documents: documents ?? [paper("PAN", "PAN card"), paper("AADHAAR_FRONT", "Aadhaar (front)"), paper("SELFIE", "Live selfie")],
        identity: { verified: false, kycStatus: null },
        bank: { onFile: true },
        agreement: { kind: "AGENT_PUBLISHER_PLATFORM", accepted: true, currentVersion: 1 },
        training: { state: "LOCKED" },
        ladder: {
            stage: over.stage ?? "UNDER_REVIEW",
            steps: [step("PROFILE", "DONE"), step("DOCUMENTS", "DONE"), step("BANK", "DONE"), step("AGREEMENT", "DONE"), step("SCREENING", "WAITING"), step("TRAINING", "PENDING", ["The ADX training and its quiz"]), step("REVIEW", "WAITING")],
            canSubmit: false,
            nextStep: null,
            ...ladder,
        },
    };
}

const staff = [{ id: "emp_1", userId: "usr_9", displayId: "EMP-1", externalHrmsId: null, name: "Priya Nair", mobile: null, email: null, department: "Field ops", departmentId: null, designation: "City lead", region: null, workMode: null, employmentType: null, isActive: true, status: "active" as const, createdAt: "2026-01-01T00:00:00.000Z" }];

describe("the service", () => {
    it("speaks the application doors, with the chip group and the single stage as the query takes them", async () => {
        backend.calls.length = 0;
        backend.reply = { "GET *": { data: [row()], meta: { page: 1, pageSize: 25, total: 1, totalPages: 1, counts: { UNDER_REVIEW: 1 } } } };
        const listed = await agentApplicationService.list({ group: "WITH_DESK", side: "PUBLISHER", q: "deep", page: 2 });
        expect(backend.calls[0].path).toBe("/agents/applications?group=WITH_DESK&side=PUBLISHER&q=deep&page=2&pageSize=25");
        expect(listed.counts).toEqual({ UNDER_REVIEW: 1 });
        expect(buildApplicationsQuery({ stage: "ON_HOLD", group: "CLOSED" })).toBe("stage=ON_HOLD&page=1&pageSize=25");

        backend.reply = { "PATCH *": view(), "POST *": view(), "PUT *": view() };
        await agentApplicationService.updateProfile("agt_1", { city: "Mysuru", languages: ["Kannada"] });
        await agentApplicationService.recordAgreement("agt_1");
        await agentApplicationService.submit("agt_1");
        await agentApplicationService.fileDocument("agt_1", "PAN", { url: "http://f/1", number: "ABCDE1234F", expiresAt: "" });
        await agentApplicationService.reviewDocument("agt_1", "PAN", { decision: "FLAGGED", note: "Blurred" });
        await agentApplicationService.decide("agt_1", { decision: "ACTIVATE", grade: "G2", engagementType: "GIG", note: "" });
        await agentApplicationService.setGrade("agt_1", { grade: "G3" });
        await agentApplicationService.exit("agt_1", { reason: "RESIGNED", rehireEligible: true, blacklist: false });
        expect(backend.calls.slice(1).map((c) => `${c.method} ${c.path}`)).toEqual([
            "PATCH /agents/agt_1/application/profile",
            "POST /agents/agt_1/application/agreement",
            "POST /agents/agt_1/application/submit",
            "PUT /agents/agt_1/application/documents/PAN",
            "PATCH /agents/agt_1/application/documents/PAN/review",
            "POST /agents/agt_1/application/decision",
            "PATCH /agents/agt_1/grade",
            "POST /agents/agt_1/exit",
        ]);
        // Blank strings are not sent: the schema refuses empty text.
        expect(backend.calls[4].body).toEqual({ url: "http://f/1", number: "ABCDE1234F" });
        expect(backend.calls[6].body).toEqual({ decision: "ACTIVATE", grade: "G2", engagementType: "GIG" });
    });

    it("offers the decisions the stage allows, the backend's rule", () => {
        expect(decisionsFor("UNDER_REVIEW")).toEqual(["ACTIVATE", "HOLD", "REJECT"]);
        expect(decisionsFor("ON_HOLD")).toEqual(["RESUME", "ACTIVATE", "REJECT"]);
        expect(decisionsFor("DOCUMENTS")).toEqual(["HOLD", "REJECT"]);
        expect(decisionsFor("ACTIVE")).toEqual([]);
        expect(decisionsFor("REJECTED")).toEqual([]);
    });
});

describe("the queue", () => {
    it("lists every applicant with their side, stage, source and papers, and the chips carry the server's counts", () => {
        const onChipChange = vi.fn();
        render(
            <ApplicationsQueue
                page={page([row(), row({ id: "agt_2", displayId: "AGT-2009-2605", stage: "ON_HOLD", side: "ADVERTISER", sourceKind: "WALK_IN", user: { name: "Anita Sharma", mobile: "+919000000888", email: null }, documents: { filed: 5, flagged: 0 } })], { UNDER_REVIEW: 1, ON_HOLD: 1, PROFILE: 3, ACTIVE: 2 })}
                chip="WITH_DESK"
                onChipChange={onChipChange}
                side="all"
                onSideChange={vi.fn()}
                search=""
                onSearchChange={vi.fn()}
                onPageChange={vi.fn()}
                onChanged={vi.fn()}
            />,
        );
        expect(screen.getByText("Deepak Rao")).toBeInTheDocument();
        expect(screen.getByText("Anita Sharma")).toBeInTheDocument();
        expect(screen.getByText("Field agent")).toBeInTheDocument();
        expect(screen.getByText("Sales agent")).toBeInTheDocument();
        expect(screen.getByText("Under review")).toBeInTheDocument();
        expect(screen.getByText("Walk-in")).toBeInTheDocument();
        expect(screen.getByText("3 filed · 1 flagged")).toBeInTheDocument();
        expect(screen.getByText("5 filed")).toBeInTheDocument();

        const chips = queueChips({ UNDER_REVIEW: 1, SCREENING: 2, ON_HOLD: 1, PROFILE: 3, DOCUMENTS: 1, ACTIVE: 2, REJECTED: 4 });
        expect(chips.map((c) => [c.value, c.count])).toEqual([["WITH_DESK", 3], ["ON_HOLD", 1], ["IN_PROGRESS", 4], ["ACTIVE", 2], ["CLOSED", 4], ["all", 14]]);
        fireEvent.click(screen.getByRole("tab", { name: /Still applying/ }));
        expect(onChipChange).toHaveBeenCalledWith("IN_PROGRESS");
    });

    it("says so when nobody is there", () => {
        render(<ApplicationsQueue page={page([])} chip="all" onChipChange={vi.fn()} side="all" onSideChange={vi.fn()} search="" onSearchChange={vi.fn()} onPageChange={vi.fn()} onChanged={vi.fn()} />);
        expect(screen.getByText("No applications yet")).toBeInTheDocument();
    });
});

describe("the workbench", () => {
    it("draws the ladder with what each step needs, and the decision the stage allows", () => {
        render(<ApplicationWorkbench view={view()} staff={staff} onChanged={vi.fn()} />);
        expect(screen.getByText("Deepak Rao")).toBeInTheDocument();
        expect(within(screen.getByTestId("ladder-TRAINING")).getByText("The ADX training and its quiz")).toBeInTheDocument();
        expect(within(screen.getByTestId("ladder-PROFILE")).getByText("Done")).toBeInTheDocument();
        expect(screen.getByTestId("decision-activate")).toBeInTheDocument();
        expect(screen.getByText("Put on hold")).toBeInTheDocument();
        expect(screen.getByText("Reject")).toBeInTheDocument();
        // The terms are already accepted, and the application is submitted: neither desk button is offered.
        expect(screen.queryByTestId("application-record-terms")).not.toBeInTheDocument();
        expect(screen.queryByTestId("application-submit")).not.toBeInTheDocument();
    });

    it("records the terms shown at the desk and submits for the applicant, with what is missing when it cannot", async () => {
        backend.calls.length = 0;
        const unsubmitted = view({ stage: "AGREEMENT", applicationSubmittedAt: null }, { canSubmit: true, nextStep: null });
        unsubmitted.agreement = { kind: "AGENT_PUBLISHER_PLATFORM", accepted: false, currentVersion: 1 };
        backend.reply = {
            "POST /agents/agt_1/application/agreement": { ...unsubmitted, agreement: { ...unsubmitted.agreement, accepted: true } },
            "POST /agents/agt_1/application/submit": new ApiError(409, "APPLICATION_INCOMPLETE", "The application is not complete yet", { missing: ["A bank account or UPI ID for payouts"], nextStep: "BANK" }),
        };
        render(<ApplicationWorkbench view={unsubmitted} staff={staff} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByTestId("application-record-terms"));
        fireEvent.click(await screen.findByRole("button", { name: "Record acceptance" }));
        await waitFor(() => expect(backend.calls.map((c) => `${c.method} ${c.path}`)).toContain("POST /agents/agt_1/application/agreement"));
        await waitFor(() => expect(screen.queryByTestId("application-record-terms")).not.toBeInTheDocument());

        fireEvent.click(screen.getByTestId("application-submit"));
        fireEvent.click(await screen.findByRole("button", { name: "Submit" }));
        await waitFor(() => expect(backend.calls.map((c) => `${c.method} ${c.path}`)).toContain("POST /agents/agt_1/application/submit"));
        const { toast } = await import("sonner");
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Not complete yet", { description: "A bank account or UPI ID for payouts" }));
    });

    it("reviews a paper: approve at once, flag with a note the applicant reads", async () => {
        backend.calls.length = 0;
        const flagged = view();
        flagged.documents = flagged.documents.map((d) => (d.kind === "PAN" ? { ...d, status: "FLAGGED", reviewNote: "Blurred" } : d));
        backend.reply = { "PATCH /agents/agt_1/application/documents/SELFIE/review": view(), "PATCH /agents/agt_1/application/documents/PAN/review": flagged };
        render(<ApplicationWorkbench view={view()} staff={staff} onChanged={vi.fn()} />);
        fireEvent.mouseDown(screen.getByRole("tab", { name: /Papers/ }), { button: 0 });
        const selfie = await screen.findByTestId("paper-SELFIE");
        fireEvent.click(within(selfie).getByRole("button", { name: "Approve" }));
        await waitFor(() => expect(backend.calls).toContainEqual(expect.objectContaining({ method: "PATCH", path: "/agents/agt_1/application/documents/SELFIE/review", body: { decision: "APPROVED" } })));

        const pan = screen.getByTestId("paper-PAN");
        fireEvent.click(within(pan).getByRole("button", { name: "Flag" }));
        const note = await screen.findByLabelText("What is wrong");
        fireEvent.change(note, { target: { value: "Blurred" } });
        fireEvent.click(screen.getByRole("button", { name: "Flag it" }));
        await waitFor(() => expect(backend.calls).toContainEqual(expect.objectContaining({ method: "PATCH", path: "/agents/agt_1/application/documents/PAN/review", body: { decision: "FLAGGED", note: "Blurred" } })));
        await waitFor(() => expect(within(screen.getByTestId("paper-PAN")).getByText("Blurred")).toBeInTheDocument());
    });

    it("activates with a grade and the engagement, vouching for the identity papers seen in person", async () => {
        backend.calls.length = 0;
        const active = view({ stage: "ACTIVE", grade: "G2", gradeLabel: "Senior field", activatedAt: "2026-09-20T12:00:00.000Z", engagement: { type: "GIG", startAt: "2026-09-20", endAt: null, probationEndsAt: null, reportingManagerId: "emp_1", weeklyHours: null } });
        backend.reply = { "POST /agents/agt_1/application/decision": active };
        const onChanged = vi.fn();
        render(<ApplicationWorkbench view={view()} staff={staff} onChanged={onChanged} />);
        fireEvent.click(screen.getByTestId("decision-activate"));
        const confirm = await screen.findByTestId("activate-confirm");
        // The identity is not verified: the button waits for the in-person tick.
        expect(confirm).toBeDisabled();
        fireEvent.click(screen.getByRole("checkbox", { name: "The originals were checked in person" }));
        fireEvent.click(screen.getByRole("radio", { name: /G2 · Senior field/ }));
        fireEvent.change(screen.getByLabelText("Territory"), { target: { value: "South Bengaluru" } });
        await waitFor(() => expect(confirm).toBeEnabled());
        fireEvent.click(confirm);
        await waitFor(() => expect(backend.calls).toContainEqual(expect.objectContaining({ method: "POST", path: "/agents/agt_1/application/decision" })));
        const body = backend.calls.find((c) => c.path === "/agents/agt_1/application/decision")?.body as Record<string, unknown>;
        expect(body).toMatchObject({ decision: "ACTIVATE", grade: "G2", engagementType: "GIG", identityCheckedInPerson: true, territory: "South Bengaluru" });
        expect(body.engagementEndAt).toBeUndefined();
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        // The engagement card appears, naming the manager from the staff list.
        await waitFor(() => expect(screen.getByTestId("agent-engagement-card")).toBeInTheDocument());
        expect(screen.getByText("Priya Nair")).toBeInTheDocument();
    });
});

/**
 * AG-4: screening on the workbench — the interview the desk books and
 * marks, the tick, the waivers on activation, and the RC check.
 */
describe("screening (AG-4)", () => {
    const screening = (over: Partial<NonNullable<ApplicationView["screening"]>> = {}): NonNullable<ApplicationView["screening"]> => ({
        done: false,
        owedBy: "DESK",
        missing: ["An interview with ADX — the desk schedules it"],
        assessment: { required: true, passed: true, bestPercent: 80, passPercent: 60 },
        assessmentModules: [{ id: "assess_1", title: "Sales assessment", passPercent: 60, timeLimitMins: 20, best: { score: 16, total: 20, passed: true, percent: 80 } }],
        interviews: [],
        interviewPassed: false,
        secondRoundPassed: false,
        nextInterview: null,
        screenedAt: null,
        screeningNote: null,
        ...over,
    });
    const sales = (over: Partial<NonNullable<ApplicationView["screening"]>> = {}): ApplicationView => {
        const v = view({ side: "ADVERTISER", stage: "SCREENING" });
        v.screening = screening(over);
        v.training = { state: "LOCKED", available: true };
        return v;
    };

    it("books an interview and records its outcome with marks", async () => {
        backend.calls.length = 0;
        const slot = { id: "int_1", round: 1, scheduledAt: "2026-09-25T05:00:00.000Z", mode: "IN_PERSON" as const, location: "ADX office", interviewerId: "emp_1", outcome: "SCHEDULED" as const, marks: null, notes: null, decidedAt: null };
        const booked = sales({ interviews: [slot], nextInterview: { round: 1, scheduledAt: slot.scheduledAt, outcome: "SCHEDULED" }, missing: ["The interview on 2026-09-25"] });
        const passed = sales({ done: true, owedBy: null, missing: [], interviewPassed: true, interviews: [{ ...slot, outcome: "PASSED", marks: 4, notes: "Spoke well", decidedAt: "2026-09-25T06:00:00.000Z" }] });
        backend.reply = { "POST /agents/agt_1/application/interviews": booked, "PATCH /agents/agt_1/application/interviews/int_1": passed };
        render(<ApplicationWorkbench view={sales()} staff={staff} onChanged={vi.fn()} />);
        expect(within(screen.getByTestId("screening-assessment")).getByText("80% · 16/20")).toBeInTheDocument();

        fireEvent.click(screen.getByTestId("interview-book-1"));
        fireEvent.click(await screen.findByTestId("interview-book-confirm"));
        await waitFor(() => expect(backend.calls).toContainEqual(expect.objectContaining({ method: "POST", path: "/agents/agt_1/application/interviews" })));
        const body = backend.calls.find((c) => c.path === "/agents/agt_1/application/interviews")?.body as Record<string, unknown>;
        expect(body).toMatchObject({ round: 1, mode: "IN_PERSON", location: "ADX office" });
        expect(String(body.scheduledAt)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00[+-]\d{2}:\d{2}$/);
        await waitFor(() => expect(screen.getByTestId("interview-int_1")).toBeInTheDocument());
        expect(within(screen.getByTestId("interview-int_1")).getByText(/Priya Nair/)).toBeInTheDocument();

        fireEvent.click(screen.getByTestId("interview-decide-int_1"));
        fireEvent.change(await screen.findByLabelText("Notes"), { target: { value: "Spoke well" } });
        fireEvent.click(screen.getByTestId("interview-outcome-confirm"));
        await waitFor(() => expect(backend.calls).toContainEqual(expect.objectContaining({ method: "PATCH", path: "/agents/agt_1/application/interviews/int_1", body: { outcome: "PASSED", marks: 4, notes: "Spoke well" } })));
        await waitFor(() => expect(within(screen.getByTestId("screening-card")).getByText("Screened")).toBeInTheDocument());
    });

    it("ticks the screen by hand, and the activation form asks for a waiver while the training is open", async () => {
        backend.calls.length = 0;
        const ticked = sales({ done: true, owedBy: null, missing: [], screenedAt: "2026-09-21T10:00:00.000Z", screeningNote: "Judged in person" });
        backend.reply = { "POST /agents/agt_1/application/screen": ticked };
        render(<ApplicationWorkbench view={sales()} staff={staff} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByTestId("screening-tick"));
        fireEvent.change(await screen.findByLabelText("Note"), { target: { value: "Judged in person" } });
        fireEvent.click(screen.getByTestId("screening-tick-confirm"));
        await waitFor(() => expect(backend.calls).toContainEqual(expect.objectContaining({ method: "POST", path: "/agents/agt_1/application/screen", body: { note: "Judged in person", clear: false } })));
        await waitFor(() => expect(screen.getByText(/Ticked by the desk/)).toBeInTheDocument());

        // Screened; the identity vouched; the training not certified: the waiver is offered, and the note is asked for with it.
        fireEvent.click(screen.getByTestId("decision-activate"));
        const confirm = await screen.findByTestId("activate-confirm");
        fireEvent.click(screen.getByRole("checkbox", { name: "The originals were checked in person" }));
        expect(confirm).toBeDisabled();
        fireEvent.click(screen.getByRole("checkbox", { name: "Waive the training" }));
        expect(confirm).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/Note for the record/), { target: { value: "Trained on the job at IndiaMART" } });
        await waitFor(() => expect(confirm).toBeEnabled());
    });

    it("checks a vehicle RC with Cashfree from the paper row and prints what came back; a refusal is read to the desk", async () => {
        backend.calls.length = 0;
        const rider = view({ side: "PUBLISHER", stage: "SCREENING" }, {}, [paper("PAN", "PAN card"), paper("VEHICLE_RC", "Vehicle RC")]);
        const checked = {
            ...rider,
            documents: rider.documents.map((d) => (d.kind === "VEHICLE_RC" ? { ...d, verification: { via: "CASHFREE_VRS", at: "2026-09-21T10:00:00.000Z", payload: { ownerName: "DEEPAK RAO", nameMatch: 100, status: "VALID", insuranceValidUntil: "2027-03-14" } } } : d)),
            verification: { via: "CASHFREE_VRS", nameMatch: 100, facts: {} },
        };
        backend.reply = { "POST /agents/agt_1/application/documents/VEHICLE_RC/verify": checked };
        render(<ApplicationWorkbench view={rider} staff={staff} onChanged={vi.fn()} />);
        fireEvent.mouseDown(screen.getByRole("tab", { name: /Papers/ }), { button: 0 });
        fireEvent.click(await screen.findByTestId("paper-VEHICLE_RC-check"));
        await waitFor(() => expect(backend.calls).toContainEqual(expect.objectContaining({ method: "POST", path: "/agents/agt_1/application/documents/VEHICLE_RC/verify" })));
        await waitFor(() => expect(screen.getByTestId("paper-VEHICLE_RC-verification")).toHaveTextContent("owner DEEPAK RAO"));
        expect(screen.getByTestId("paper-VEHICLE_RC-verification")).toHaveTextContent("name match 100%");

        backend.reply = { "POST /agents/agt_1/application/documents/VEHICLE_RC/verify": new ApiError(409, "VERIFICATION_UNAVAILABLE", "IP not whitelisted", { code: "REFUSED" }) };
        fireEvent.click(screen.getByTestId("paper-VEHICLE_RC-check"));
        const { toast } = await import("sonner");
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not check the RC", { description: "IP not whitelisted — check it by hand and approve." }));
    });
});
