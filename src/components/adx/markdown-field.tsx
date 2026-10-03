"use client";

import * as React from "react";
import { Bold, Code, Italic, Link2, List, ListOrdered, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseMarkdown, type Inline } from "@/lib/markdown";

/**
 * A Markdown box with the formatting a policy or a page actually uses, and a
 * preview beside it.
 *
 * The toolbar works on the selection in the textarea rather than replacing
 * the textarea with a rich editor: what is stored has to stay Markdown,
 * because the apps and the website render the source. Pressing Bold with
 * nothing selected inserts the markers and puts the caret between them;
 * pressing it with a word selected wraps that word, and pressing it again on
 * the same selection unwraps it.
 *
 * The preview goes through the console's own parser, which answers a tree
 * rather than an HTML string — so nothing typed into a document can become
 * markup on this screen.
 */

type Wrap = { kind: "wrap"; before: string; after: string };
type LinePrefix = { kind: "line"; prefix: string };
type Action = { id: string; label: string; icon: React.ComponentType<{ className?: string }>; hint: string; apply: Wrap | LinePrefix };

const ACTIONS: Action[] = [
    { id: "bold", label: "Bold", icon: Bold, hint: "Bold — Ctrl+B", apply: { kind: "wrap", before: "**", after: "**" } },
    { id: "italic", label: "Italic", icon: Italic, hint: "Italic — Ctrl+I", apply: { kind: "wrap", before: "*", after: "*" } },
    { id: "code", label: "Code", icon: Code, hint: "Code", apply: { kind: "wrap", before: "`", after: "`" } },
    { id: "h2", label: "H2", icon: HeadingTwo, hint: "Heading", apply: { kind: "line", prefix: "## " } },
    { id: "h3", label: "H3", icon: HeadingThree, hint: "Sub-heading", apply: { kind: "line", prefix: "### " } },
    { id: "ul", label: "Bullets", icon: List, hint: "Bulleted list", apply: { kind: "line", prefix: "- " } },
    { id: "ol", label: "Numbered", icon: ListOrdered, hint: "Numbered list", apply: { kind: "line", prefix: "1. " } },
    { id: "quote", label: "Quote", icon: Quote, hint: "Quotation", apply: { kind: "line", prefix: "> " } },
    { id: "link", label: "Link", icon: Link2, hint: "Link", apply: { kind: "wrap", before: "[", after: "](https://)" } },
];

function HeadingTwo({ className }: { className?: string }) {
    return <span className={cn("text-[11px] font-bold leading-none", className)}>H2</span>;
}
function HeadingThree({ className }: { className?: string }) {
    return <span className={cn("text-[11px] font-bold leading-none", className)}>H3</span>;
}

/** What the box becomes when an action is applied to `value` over `[start, end)`. */
export function applyMarkdown(value: string, start: number, end: number, apply: Wrap | LinePrefix): { value: string; start: number; end: number } {
    if (apply.kind === "wrap") {
        const selected = value.slice(start, end);
        const before = value.slice(0, start);
        const after = value.slice(end);
        // Pressing the same button twice on its own markers takes them off again.
        if (before.endsWith(apply.before) && after.startsWith(apply.after)) {
            return {
                value: before.slice(0, -apply.before.length) + selected + after.slice(apply.after.length),
                start: start - apply.before.length,
                end: end - apply.before.length,
            };
        }
        return {
            value: `${before}${apply.before}${selected}${apply.after}${after}`,
            start: start + apply.before.length,
            end: end + apply.before.length,
        };
    }
    // A line prefix runs over every line the selection touches, and toggles off.
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEndIndex = value.indexOf("\n", end);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const lines = value.slice(lineStart, lineEnd).split("\n");
    const numbered = /^\d+[.)]\s/;
    const has = lines.every((line) => (apply.prefix === "1. " ? numbered.test(line) : line.startsWith(apply.prefix)));
    const next = lines
        .map((line, index) => {
            if (has) return line.replace(apply.prefix === "1. " ? numbered : new RegExp(`^${apply.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "");
            return apply.prefix === "1. " ? `${index + 1}. ${line}` : `${apply.prefix}${line}`;
        })
        .join("\n");
    const value2 = value.slice(0, lineStart) + next + value.slice(lineEnd);
    const shift = next.length - (lineEnd - lineStart);
    return { value: value2, start: lineStart, end: end + shift };
}

export interface MarkdownFieldProps {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    rows?: number;
    placeholder?: string;
    "aria-invalid"?: boolean;
    className?: string;
}

export function MarkdownField({ id, value, onChange, disabled, rows = 16, placeholder, className, ...rest }: MarkdownFieldProps) {
    const ref = React.useRef<HTMLTextAreaElement>(null);
    const [tab, setTab] = React.useState<"write" | "preview">("write");

    const run = (apply: Wrap | LinePrefix) => {
        const box = ref.current;
        if (!box || disabled) return;
        const next = applyMarkdown(value, box.selectionStart, box.selectionEnd, apply);
        onChange(next.value);
        // Put the caret back where the writer expects it, after React has painted.
        requestAnimationFrame(() => {
            box.focus();
            box.setSelectionRange(next.start, next.end);
        });
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (!(event.ctrlKey || event.metaKey)) return;
        const key = event.key.toLowerCase();
        const action = key === "b" ? ACTIONS[0] : key === "i" ? ACTIONS[1] : null;
        if (!action) return;
        event.preventDefault();
        run(action.apply);
    };

    return (
        <div className={cn("rounded-md border border-border", className)} data-testid="markdown-field">
            <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1">
                {!disabled &&
                    ACTIONS.map((action) => (
                        <Button
                            key={action.id}
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-foreground"
                            title={action.hint}
                            aria-label={action.label}
                            onClick={() => run(action.apply)}
                            data-testid={`markdown-${action.id}`}
                        >
                            <action.icon className="size-3.5" />
                        </Button>
                    ))}
                <div className="ml-auto flex items-center gap-0.5">
                    {(["write", "preview"] as const).map((option) => (
                        <Button
                            key={option}
                            type="button"
                            variant={tab === option ? "default" : "ghost"}
                            size="sm"
                            className="h-7 px-2 text-xs capitalize"
                            onClick={() => setTab(option)}
                            data-testid={`markdown-tab-${option}`}
                        >
                            {option}
                        </Button>
                    ))}
                </div>
            </div>

            {tab === "write" ? (
                <Textarea
                    id={id}
                    ref={ref}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={onKeyDown}
                    disabled={disabled}
                    rows={rows}
                    placeholder={placeholder}
                    aria-invalid={rest["aria-invalid"]}
                    className="rounded-none border-0 font-mono text-xs leading-5 focus-visible:ring-0"
                />
            ) : (
                <div className="px-3 py-3" style={{ minHeight: `${rows * 1.25}rem` }} data-testid="markdown-preview">
                    <MarkdownPreview source={value} />
                </div>
            )}
        </div>
    );
}

/** The preview: the console's parser, drawn through React so nothing becomes markup. */
export function MarkdownPreview({ source }: { source: string }) {
    const blocks = React.useMemo(() => parseMarkdown(source), [source]);
    if (!source.trim()) return <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>;
    return (
        <div className="space-y-3">
            {blocks.map((block, index) => {
                if (block.kind === "heading") {
                    const size = block.level === 1 ? "text-lg" : block.level === 2 ? "text-base" : "text-sm";
                    return (
                        <p key={index} className={cn("font-semibold text-foreground", size)}>
                            <Inlines inlines={block.inlines} />
                        </p>
                    );
                }
                if (block.kind === "list") {
                    const Tag = block.ordered ? "ol" : "ul";
                    return (
                        <Tag key={index} className={cn("space-y-1 pl-5 text-sm text-foreground", block.ordered ? "list-decimal" : "list-disc")}>
                            {block.items.map((item, itemIndex) => (
                                <li key={itemIndex}>
                                    <Inlines inlines={item} />
                                </li>
                            ))}
                        </Tag>
                    );
                }
                return (
                    <p key={index} className="text-sm leading-6 text-foreground">
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
                            <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
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
