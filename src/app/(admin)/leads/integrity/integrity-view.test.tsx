import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * LH10 — the integrity desk.
 *
 * What is pinned: the flags table draws what the scan saw with the open
 * counts per kind on the chips; confirming or dismissing opens a dialog
 * whose note rides the call; a decided flag offers no buttons; the QA table
 * words each sample's evidence and says whether the verdict is the
 * evidence's or a person's; and overruling the evidence needs a reason
 * before it can be saved.
 */

const { service } = vi.hoisted(() => ({
    service: { decide: vi.fn(async () => ({})), review: vi.fn(async () => ({})), scan: vi.fn(async () => ({})), sample: vi.fn(async () => ({})), runClawbacks: vi.fn(async () => ({})) },
}));

vi.mock("@/services/leads", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/leads")>();
    return { ...actual, integrityService: { ...actual.integrityService, ...service } };
});

import { IntegrityView } from "./integrity-view";
import type { LeadFlag, LeadFlagsPage, QaSample } from "@/services/leads";

const flag = (over: Partial<LeadFlag> = {}): LeadFlag => ({
    id: "flg_1",
    leadId: "led_1",
    displayId: "LED-0001",
    businessName: "Suraj Kumar Prints",
    city: "Bengaluru",
    side: "PUBLISHER",
    stage: "SCORED",
    kind: "PHONE_REUSE",
    label: "Phone reused across leads",
    status: "OPEN",
    detail: "2 leads carry this number — LED-0002.",
    evidence: { phone: "+919845012210" },
    agentId: "agt_1",
    openedAt: "2026-09-22T09:00:00.000Z",
    decidedAt: null,
    decidedByUserId: null,
    note: null,
    ...over,
});

const sample = (over: Partial<QaSample> = {}): QaSample => ({
    id: "qa_1",
    kind: "VISIT",
    agentId: "agt_1",
    visitId: "vst_1",
    messageId: null,
    leadId: "led_1",
    evidence: { photo: true, gps: true, metres: 16, site: true },
    autoVerdict: "PASS",
    verdict: null,
    reviewedByUserId: null,
    reviewedAt: null,
    note: null,
    sampledAt: "2026-09-22T00:00:00.000Z",
    ...over,
});

const page = (over: Partial<LeadFlagsPage> = {}): LeadFlagsPage => ({
    items: [flag()],
    total: 1,
    openByKind: { SELF_REFERRAL: 0, PHONE_REUSE: 1, CAPTURE_BURST: 2, WEBHOOK_REPLAY: 0 },
    ...over,
});

const view = (over: { flags?: Partial<LeadFlagsPage>; samples?: QaSample[] } = {}) =>
    render(
        <IntegrityView
            flags={page(over.flags)}
            samples={{ items: over.samples ?? [sample()], total: (over.samples ?? [sample()]).length }}
            filter={{ status: "OPEN", kind: "ALL" }}
            onFilter={vi.fn()}
            onChanged={vi.fn()}
        />
    );

describe("the integrity desk", () => {
    it("draws the flags with the open counts per kind, and what the scan saw", () => {
        view();
        expect(screen.getByTestId("integrity-desk")).toBeInTheDocument();
        expect(screen.getByText("Capture burst · 2")).toBeInTheDocument();
        expect(screen.getByText("Phone reuse · 1")).toBeInTheDocument();
        expect(screen.getByText("2 leads carry this number — LED-0002.")).toBeInTheDocument();
        expect(screen.getByTestId("integrity-open-led_1")).toHaveAttribute("href", "/leads/led_1");
    });

    it("confirms a flag through a dialog, carrying the note", async () => {
        view();
        fireEvent.click(screen.getByTestId("integrity-confirm-flg_1"));
        const dialog = within(screen.getByTestId("integrity-decide-dialog"));
        expect(dialog.getByText(/counts against the agent's quality score/)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Same shop twice" } });
        fireEvent.click(screen.getByTestId("integrity-decide-submit"));
        expect(service.decide).toHaveBeenCalledWith("flg_1", { status: "CONFIRMED", note: "Same shop twice" });
    });

    it("offers no buttons on a decided flag, and says what was decided", () => {
        view({ flags: { items: [flag({ status: "DISMISSED", note: "A second outlet, not a duplicate", decidedAt: "2026-09-22T10:00:00.000Z" })], total: 1 } });
        expect(screen.queryByTestId("integrity-confirm-flg_1")).not.toBeInTheDocument();
        expect(screen.getByTestId("integrity-decided-flg_1")).toHaveTextContent("A second outlet, not a duplicate");
    });

    it("words each sample's evidence and marks whose verdict it is", () => {
        view({
            samples: [
                sample(),
                sample({ id: "qa_2", kind: "CALL", visitId: null, messageId: "msg_1", evidence: { recording: true, consent: false, durationSec: 95, outcome: "ANSWERED" }, autoVerdict: "FAIL" }),
                sample({ id: "qa_3", evidence: { photo: false, gps: false, metres: null, site: true }, autoVerdict: "FAIL", verdict: "PASS", note: "The photo was on the order" }),
            ],
        });
        expect(screen.getByTestId("qa-evidence-qa_1")).toHaveTextContent("Photo · fix 16 m from the site");
        expect(screen.getByTestId("qa-evidence-qa_2")).toHaveTextContent("Recorded with NO consent line · 95 s · answered");
        expect(screen.getByTestId("qa-evidence-qa_3")).toHaveTextContent("No photo · no fix");
        expect(screen.getByText("pass (auto)")).toBeInTheDocument();
        expect(screen.getByText("fail (auto)")).toBeInTheDocument();
        expect(screen.getByText("pass (reviewed)")).toBeInTheDocument();
    });

    it("will not save an overrule without a reason, and saves one with it", () => {
        view();
        fireEvent.click(screen.getByTestId("qa-fail-qa_1"));
        expect(screen.getByTestId("qa-review-evidence")).toHaveTextContent("Photo · fix 16 m from the site");
        expect(screen.getByTestId("qa-review-submit")).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Note"), { target: { value: "The photo is of a different wall" } });
        fireEvent.click(screen.getByTestId("qa-review-submit"));
        expect(service.review).toHaveBeenCalledWith("qa_1", { verdict: "FAIL", note: "The photo is of a different wall" });
    });

    it("runs the three sweeps by hand", async () => {
        // One at a time: the first click disables the row until it answers,
        // which is the point of the busy flag.
        for (const [testId, spy] of [
            ["integrity-scan", service.scan],
            ["integrity-sample", service.sample],
            ["integrity-clawbacks", service.runClawbacks],
        ] as const) {
            const { unmount } = view();
            fireEvent.click(screen.getByTestId(testId));
            await waitFor(() => expect(spy).toHaveBeenCalled());
            unmount();
        }
    });
});
