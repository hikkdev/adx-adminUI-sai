import { describe, expect, it } from "vitest";

import {
    CERTIFICATION_STATUS_META,
    MAX_OPTIONS,
    MIN_OPTIONS,
    blankQuestion,
    certificationStatus,
    certifiedAgentLabel,
    draftsFrom,
    durationLabel,
    modulePatch,
    nextOrdinal,
    passesForFree,
    questionProblems,
    questionsBody,
    shapeModule,
    unlockAfterLabel,
    type ModuleDraft,
    type QuestionDraft,
    type WireModule,
    type WireQuestion,
} from "./training";

/**
 * D8 — the training desk, as the console reads and writes it.
 *
 * What this file pins is the shaping and the checks, not a layout: the things
 * the screens get wrong if nobody is watching.
 *
 * 1. A module's nullable fields read as null, never as "" or 0 — "no video"
 *    and "a video at the empty string" are different sentences to the URL
 *    schema, which refuses the second.
 *
 * 2. Only what changed goes on the PATCH, so the server's "Nothing to
 *    change" cannot fire by accident and the activity log says what ops did.
 *
 * 3. A question set is refused before it is sent if the schema would refuse
 *    it: two to six options, every one labelled, exactly one correct.
 *
 * 4. An active module with no questions is called out — it is on every
 *    agent's index and passed for free.
 */

const wireModule = (over: Partial<WireModule> = {}): WireModule => ({
    id: "mod_1",
    ordinal: 1,
    title: "Welcome to ADX",
    summary: "What the platform is and who it is for.",
    durationMins: 12,
    videoUrl: "https://videos.example/welcome.mp4",
    lessonBody: "# Welcome\n\nADX is a marketplace.",
    transcript: null,
    takeaways: ["ADX is a marketplace", "Agents onboard both sides"],
    passPercent: 80,
    questionCount: 4,
    isActive: true,
    unlockAfterOrdinal: null,
    createdAt: "2026-09-01T04:30:00.000Z",
    updatedAt: "2026-09-10T04:30:00.000Z",
    ...over,
});

describe("shapeModule — the nullables", () => {
    it("reads a module with no summary, no duration, no video and no lock as null, not empty", () => {
        const row = shapeModule(
            wireModule({ summary: null, durationMins: null, videoUrl: null, lessonBody: null, transcript: null, unlockAfterOrdinal: null }),
        );
        expect(row.summary).toBeNull();
        expect(row.durationMins).toBeNull();
        expect(row.videoUrl).toBeNull();
        expect(row.lessonBody).toBeNull();
        expect(row.transcript).toBeNull();
        expect(row.unlockAfterOrdinal).toBeNull();
    });

    it("keeps the takeaways and the question count as sent", () => {
        const row = shapeModule(wireModule({ takeaways: ["One"], questionCount: 7 }));
        expect(row.takeaways).toEqual(["One"]);
        expect(row.questionCount).toBe(7);
    });

    it("reads a row older than the takeaways column as an empty list rather than crashing the table", () => {
        const row = shapeModule(wireModule({ takeaways: undefined as unknown as string[] }));
        expect(row.takeaways).toEqual([]);
    });
});

describe("the table's labels", () => {
    it("prints a duration in minutes and a dash when nobody timed it", () => {
        expect(durationLabel(45)).toBe("45 min");
        expect(durationLabel(null)).toBe("—");
        expect(durationLabel(0)).toBe("—");
    });

    it("names the module a lock waits on, and a dash when nothing locks it", () => {
        expect(unlockAfterLabel(3)).toBe("Module 3");
        expect(unlockAfterLabel(null)).toBe("—");
    });

    it("lands a new module one past the highest order, and first on an empty index", () => {
        expect(nextOrdinal([{ ordinal: 1 }, { ordinal: 4 }, { ordinal: 2 }])).toBe(5);
        expect(nextOrdinal([])).toBe(1);
    });

    /**
     * The one thing the table has to shout. An active module with no
     * questions is on every agent's index and the quiz endpoint answers 409
     * for it — but the certificate counts passed modules over active ones,
     * so it is a rung nobody can climb and everybody is credited for.
     */
    it("calls out an active module with no questions, and not an inactive one", () => {
        expect(passesForFree({ isActive: true, questionCount: 0 })).toBe(true);
        expect(passesForFree({ isActive: false, questionCount: 0 })).toBe(false);
        expect(passesForFree({ isActive: true, questionCount: 3 })).toBe(false);
    });
});

describe("modulePatch — only what changed", () => {
    const stored: ModuleDraft = {
        ordinal: 2,
        title: "Listing a spot",
        summary: "How a publisher's wall becomes inventory.",
        durationMins: 20,
        videoUrl: null,
        lessonBody: "Body",
        transcript: null,
        takeaways: ["A", "B"],
        unlockAfterOrdinal: 1,
        passPercent: 80,
        isActive: false,
    };

    it("sends nothing when nothing changed", () => {
        expect(modulePatch(stored, { ...stored })).toEqual({});
    });

    it("treats a trailing space as not an edit, and a cleared field as null", () => {
        expect(modulePatch(stored, { ...stored, title: "Listing a spot " })).toEqual({});
        expect(modulePatch(stored, { ...stored, videoUrl: "" })).toEqual({});
        expect(modulePatch(stored, { ...stored, summary: null })).toEqual({ summary: null });
    });

    it("sends only the fields that moved", () => {
        const patch = modulePatch(stored, {
            ...stored,
            title: "Listing a wall",
            passPercent: 70,
            takeaways: ["A", "B", "C"],
            isActive: true,
            unlockAfterOrdinal: null,
        });
        expect(patch).toEqual({
            title: "Listing a wall",
            passPercent: 70,
            takeaways: ["A", "B", "C"],
            isActive: true,
            unlockAfterOrdinal: null,
        });
    });
});

describe("questions — what the schema would refuse", () => {
    const good = (over: Partial<QuestionDraft> = {}): QuestionDraft => ({
        prompt: "What is ADX?",
        options: [
            { label: "A marketplace", isCorrect: true },
            { label: "A bank", isCorrect: false },
            { label: "A courier", isCorrect: false },
            { label: "A print shop", isCorrect: false },
        ],
        ...over,
    });

    it("accepts a full set", () => {
        expect(questionProblems([good(), good()])).toEqual({});
    });

    it("starts a blank question with the frame's four options and one already marked", () => {
        const blank = blankQuestion();
        expect(blank.options).toHaveLength(4);
        expect(blank.options.filter((option) => option.isCorrect)).toHaveLength(1);
        // Blank labels are the reason it is not yet sendable.
        expect(questionProblems([blank])[0]).toMatch(/prompt/);
    });

    it("refuses a question with no prompt, an unlabelled option, or the wrong number of options", () => {
        expect(questionProblems([good({ prompt: " " })])[0]).toMatch(/prompt/);
        expect(questionProblems([good({ options: [{ label: "", isCorrect: true }, { label: "B", isCorrect: false }] })])[0]).toMatch(/label/);
        expect(questionProblems([good({ options: [{ label: "Only one", isCorrect: true }] })])[0]).toMatch(
            new RegExp(`${MIN_OPTIONS} and ${MAX_OPTIONS}`),
        );
        const seven = Array.from({ length: 7 }, (_, i) => ({ label: `Option ${i}`, isCorrect: i === 0 }));
        expect(questionProblems([good({ options: seven })])[0]).toMatch(/options/);
    });

    it("refuses two correct options and none, keyed by the question's index", () => {
        const none = good({ options: good().options.map((option) => ({ ...option, isCorrect: false })) });
        const two = good({ options: good().options.map((option) => ({ ...option, isCorrect: true })) });
        const problems = questionProblems([good(), none, two]);
        expect(problems[0]).toBeUndefined();
        expect(problems[1]).toBe("Exactly one option is correct.");
        expect(problems[2]).toBe("Exactly one option is correct.");
    });

    it("puts the stored set into the editor without its ids, and back on the wire trimmed", () => {
        const wire: WireQuestion[] = [
            {
                id: "q1",
                ordinal: 1,
                prompt: "What is ADX? ",
                isActive: true,
                options: [
                    { id: "o1", ordinal: 1, label: "A marketplace ", isCorrect: true },
                    { id: "o2", ordinal: 2, label: "A bank", isCorrect: false },
                ],
            },
        ];
        const drafts = draftsFrom(wire);
        expect(drafts).toEqual([
            { prompt: "What is ADX? ", options: [{ label: "A marketplace ", isCorrect: true }, { label: "A bank", isCorrect: false }] },
        ]);
        expect(questionsBody(drafts)).toEqual({
            questions: [
                { prompt: "What is ADX?", options: [{ label: "A marketplace", isCorrect: true }, { label: "A bank", isCorrect: false }] },
            ],
        });
    });
});

describe("certifications", () => {
    it("reads a revoked certificate as revoked and every other as active", () => {
        expect(certificationStatus({ revokedAt: null })).toBe("ACTIVE");
        expect(certificationStatus({ revokedAt: "2026-09-10T00:00:00.000Z" })).toBe("REVOKED");
        expect(CERTIFICATION_STATUS_META.ACTIVE.tone).toBe("success");
        expect(CERTIFICATION_STATUS_META.REVOKED.tone).toBe("danger");
    });

    it("names the agent by their name, then their AGT- id, then the raw id", () => {
        expect(certifiedAgentLabel({ agentName: "Ravi Kumar", agentDisplayId: "AGT-1009-2601", agentId: "agt1" })).toBe("Ravi Kumar");
        expect(certifiedAgentLabel({ agentName: " ", agentDisplayId: "AGT-1009-2601", agentId: "agt1" })).toBe("AGT-1009-2601");
        expect(certifiedAgentLabel({ agentName: null, agentDisplayId: null, agentId: "agt1" })).toBe("agt1");
    });
});
