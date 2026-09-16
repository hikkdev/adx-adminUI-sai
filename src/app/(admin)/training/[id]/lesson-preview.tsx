"use client";

import * as React from "react";
import { parseMarkdown, type Inline } from "@/lib/markdown";

/**
 * The lesson as the agent app will draw it, rendered through React from the
 * parser's block tree — never from an HTML string, so nothing typed in a
 * lesson can become markup.
 */
export function LessonPreview({ source }: { source: string }) {
    const blocks = React.useMemo(() => parseMarkdown(source), [source]);

    if (blocks.length === 0) {
        return <p className="text-sm italic text-muted-foreground">Nothing written yet.</p>;
    }

    return (
        <div className="space-y-3 text-sm text-foreground">
            {blocks.map((block, index) => {
                if (block.kind === "heading") {
                    const className =
                        block.level === 1
                            ? "text-lg font-semibold"
                            : block.level === 2
                              ? "text-base font-semibold"
                              : "text-sm font-semibold";
                    const Tag = `h${block.level + 2}` as "h3" | "h4" | "h5";
                    return (
                        <Tag key={index} className={className}>
                            <Inlines inlines={block.inlines} />
                        </Tag>
                    );
                }
                if (block.kind === "list") {
                    const Tag = block.ordered ? "ol" : "ul";
                    return (
                        <Tag key={index} className={block.ordered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
                            {block.items.map((item, itemIndex) => (
                                <li key={itemIndex}>
                                    <Inlines inlines={item} />
                                </li>
                            ))}
                        </Tag>
                    );
                }
                return (
                    <p key={index} className="leading-relaxed">
                        <Inlines inlines={block.inlines} />
                    </p>
                );
            })}
        </div>
    );
}

function Inlines({ inlines }: { inlines: Inline[] }) {
    return (
        <>
            {inlines.map((inline, index) => {
                switch (inline.kind) {
                    case "bold":
                        return <strong key={index}>{inline.text}</strong>;
                    case "italic":
                        return <em key={index}>{inline.text}</em>;
                    case "code":
                        return (
                            <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
                                {inline.text}
                            </code>
                        );
                    default:
                        return <React.Fragment key={index}>{inline.text}</React.Fragment>;
                }
            })}
        </>
    );
}
