/**
 * The slice of Markdown a training lesson uses, parsed to a block tree.
 *
 * `lessonBody` is Markdown on the wire because the agent app renders it that
 * way, and the desk that writes it needs to show ops what the agent will see.
 * No Markdown library is in the console's dependencies, and pulling one in to
 * draw a preview would be a large dependency for a small job — so this
 * handles headings, paragraphs, bulleted and numbered lists, and inline bold,
 * italic and code, and nothing else. It answers with a tree rather than an
 * HTML string so the preview renders it through React and nothing typed in a
 * lesson can ever become markup.
 */

export type Inline =
    | { kind: "text"; text: string }
    | { kind: "bold"; text: string }
    | { kind: "italic"; text: string }
    | { kind: "code"; text: string };

export type Block =
    | { kind: "heading"; level: 1 | 2 | 3; inlines: Inline[] }
    | { kind: "paragraph"; inlines: Inline[] }
    | { kind: "list"; ordered: boolean; items: Inline[][] };

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;

/** `**bold**`, `*italic*` or `_italic_`, `` `code` `` — the three the app draws. */
export function parseInline(text: string): Inline[] {
    const inlines: Inline[] = [];
    const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|_([^_]+)_)/g;
    let last = 0;
    for (const match of text.matchAll(pattern)) {
        const index = match.index ?? 0;
        if (index > last) inlines.push({ kind: "text", text: text.slice(last, index) });
        if (match[2] !== undefined) inlines.push({ kind: "bold", text: match[2] });
        else if (match[3] !== undefined) inlines.push({ kind: "code", text: match[3] });
        else inlines.push({ kind: "italic", text: match[4] ?? match[5] ?? "" });
        last = index + match[0].length;
    }
    if (last < text.length) inlines.push({ kind: "text", text: text.slice(last) });
    return inlines;
}

export function parseMarkdown(source: string): Block[] {
    const blocks: Block[] = [];
    let paragraph: string[] = [];
    let list: { ordered: boolean; items: Inline[][] } | null = null;

    const flushParagraph = () => {
        if (paragraph.length) {
            blocks.push({ kind: "paragraph", inlines: parseInline(paragraph.join(" ")) });
            paragraph = [];
        }
    };
    const flushList = () => {
        if (list) {
            blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
            list = null;
        }
    };

    for (const raw of source.split(/\r?\n/)) {
        const line = raw.trimEnd();
        if (!line.trim()) {
            flushParagraph();
            flushList();
            continue;
        }
        const heading = HEADING.exec(line);
        if (heading) {
            flushParagraph();
            flushList();
            blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3, inlines: parseInline(heading[2]) });
            continue;
        }
        const bullet = BULLET.exec(line);
        const numbered = bullet ? null : NUMBERED.exec(line);
        if (bullet || numbered) {
            flushParagraph();
            const ordered = Boolean(numbered);
            if (!list || list.ordered !== ordered) {
                flushList();
                list = { ordered, items: [] };
            }
            list.items.push(parseInline((bullet ?? numbered)![1]));
            continue;
        }
        flushList();
        paragraph.push(line.trim());
    }
    flushParagraph();
    flushList();
    return blocks;
}
