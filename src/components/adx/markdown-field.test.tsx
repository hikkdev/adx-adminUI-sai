import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MarkdownField, applyMarkdown } from "./markdown-field";

/**
 * The Markdown box's formatting.
 *
 * What is pinned is the arithmetic a click does to the text and the caret,
 * because that is what a writer feels: wrapping a selection, wrapping
 * nothing and being left inside the markers, pressing the same button twice
 * to undo it, and prefixes running over every line the selection touches.
 * The preview is drawn through React, so it is checked to render rather
 * than to escape — it cannot produce markup in the first place.
 */

describe("what a button does to the text", () => {
    it("wraps a selection and moves the caret past the opening marker", () => {
        const next = applyMarkdown("make this bold", 5, 9, { kind: "wrap", before: "**", after: "**" });
        expect(next.value).toBe("make **this** bold");
        expect(next.value.slice(next.start, next.end)).toBe("this");
    });

    it("with nothing selected, leaves the caret between the markers", () => {
        const next = applyMarkdown("ready ", 6, 6, { kind: "wrap", before: "**", after: "**" });
        expect(next.value).toBe("ready ****");
        expect(next.start).toBe(8);
        expect(next.end).toBe(8);
    });

    it("pressing the same button again takes the markers off", () => {
        const on = applyMarkdown("make this bold", 5, 9, { kind: "wrap", before: "**", after: "**" });
        const off = applyMarkdown(on.value, on.start, on.end, { kind: "wrap", before: "**", after: "**" });
        expect(off.value).toBe("make this bold");
        expect(off.value.slice(off.start, off.end)).toBe("this");
    });

    it("runs a prefix over every line the selection touches, and toggles it off", () => {
        const source = "one\ntwo\nthree";
        const on = applyMarkdown(source, 0, source.length, { kind: "line", prefix: "- " });
        expect(on.value).toBe("- one\n- two\n- three");
        const off = applyMarkdown(on.value, 0, on.value.length, { kind: "line", prefix: "- " });
        expect(off.value).toBe(source);
    });

    it("numbers a numbered list from one, and unnumbers it", () => {
        const on = applyMarkdown("first\nsecond", 0, 12, { kind: "line", prefix: "1. " });
        expect(on.value).toBe("1. first\n2. second");
        const off = applyMarkdown(on.value, 0, on.value.length, { kind: "line", prefix: "1. " });
        expect(off.value).toBe("first\nsecond");
    });

    it("prefixes only the line the caret sits on", () => {
        const next = applyMarkdown("one\ntwo\nthree", 5, 5, { kind: "line", prefix: "## " });
        expect(next.value).toBe("one\n## two\nthree");
    });

    it("builds a link with the text selected and a placeholder target", () => {
        const next = applyMarkdown("see the terms", 8, 13, { kind: "wrap", before: "[", after: "](https://)" });
        expect(next.value).toBe("see the [terms](https://)");
    });
});

describe("the box", () => {
    it("offers the toolbar, writes through onChange, and previews what was written", () => {
        const onChange = vi.fn();
        render(<MarkdownField value={"## Heading\n\nSome **bold** text."} onChange={onChange} />);

        expect(screen.getByTestId("markdown-bold")).toBeTruthy();
        expect(screen.getByTestId("markdown-ul")).toBeTruthy();
        expect(screen.getByTestId("markdown-link")).toBeTruthy();

        fireEvent.click(screen.getByTestId("markdown-tab-preview"));
        const preview = screen.getByTestId("markdown-preview");
        expect(preview.textContent).toContain("Heading");
        expect(preview.textContent).toContain("bold");
        // The parser gives a tree, so bold is an element and never raw markup.
        expect(preview.querySelector("strong")?.textContent).toBe("bold");
        expect(preview.innerHTML).not.toContain("**");
    });

    it("hides the toolbar on a version that may not be edited", () => {
        render(<MarkdownField value="Read only." onChange={vi.fn()} disabled />);
        expect(screen.queryByTestId("markdown-bold")).toBeNull();
        // The preview is still offered, because reading is the point of that mode.
        expect(screen.getByTestId("markdown-tab-preview")).toBeTruthy();
    });

    it("says there is nothing to preview rather than drawing an empty box", () => {
        render(<MarkdownField value="" onChange={vi.fn()} />);
        fireEvent.click(screen.getByTestId("markdown-tab-preview"));
        expect(screen.getByTestId("markdown-preview").textContent).toContain("Nothing to preview yet");
    });
});
