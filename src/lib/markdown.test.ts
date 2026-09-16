import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./markdown";

/**
 * The lesson preview's parser. What it pins: the handful of constructs the
 * agent app draws come through as blocks, and nothing typed in a lesson can
 * become markup — the output is a tree of text, never a string of HTML.
 */

describe("parseMarkdown", () => {
    it("splits headings, paragraphs and lists into blocks", () => {
        const blocks = parseMarkdown("# Welcome\n\nADX is a marketplace.\nAgents onboard both sides.\n\n- One\n- Two\n\n1. First\n2. Second");
        expect(blocks).toEqual([
            { kind: "heading", level: 1, inlines: [{ kind: "text", text: "Welcome" }] },
            { kind: "paragraph", inlines: [{ kind: "text", text: "ADX is a marketplace. Agents onboard both sides." }] },
            { kind: "list", ordered: false, items: [[{ kind: "text", text: "One" }], [{ kind: "text", text: "Two" }]] },
            { kind: "list", ordered: true, items: [[{ kind: "text", text: "First" }], [{ kind: "text", text: "Second" }]] },
        ]);
    });

    it("ends a paragraph at a heading or a list without a blank line between", () => {
        const blocks = parseMarkdown("Intro line\n## Section\n- item");
        expect(blocks.map((block) => block.kind)).toEqual(["paragraph", "heading", "list"]);
    });

    it("keeps a fourth hash as text rather than a heading level it cannot draw", () => {
        expect(parseMarkdown("#### Too deep")[0].kind).toBe("paragraph");
    });

    it("answers empty for an empty lesson", () => {
        expect(parseMarkdown("")).toEqual([]);
        expect(parseMarkdown("\n\n")).toEqual([]);
    });
});

describe("parseInline", () => {
    it("marks bold, italic and code and leaves the rest as text", () => {
        expect(parseInline("A **bold** word, an *italic* one, _another_ and `code`.")).toEqual([
            { kind: "text", text: "A " },
            { kind: "bold", text: "bold" },
            { kind: "text", text: " word, an " },
            { kind: "italic", text: "italic" },
            { kind: "text", text: " one, " },
            { kind: "italic", text: "another" },
            { kind: "text", text: " and " },
            { kind: "code", text: "code" },
            { kind: "text", text: "." },
        ]);
    });

    it("never produces markup: an angle bracket stays a character of text", () => {
        expect(parseInline("<script>alert(1)</script>")).toEqual([{ kind: "text", text: "<script>alert(1)</script>" }]);
    });
});
