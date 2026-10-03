"use client";

import * as React from "react";
import { AlertCircle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { DEFINITION_LIMITS, fieldsBefore, kindInfo, type FieldKindInfo, type FormDefinition, type FormField, type FormOption } from "@/services/forms";

const NONE = "__none__";

/** Options as typed, one per line ("value | Label" or just "Label") → the list. */
export function parseOptionLines(text: string): FormOption[] {
    const out: FormOption[] = [];
    for (const raw of text.split("\n")) {
        const line = raw.trim();
        if (!line) continue;
        const [left, right] = line.split("|").map((part) => part.trim());
        const label = right || left || "";
        const value = right ? left! : label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        out.push({ value, label });
    }
    return out;
}

/** The options back to the textarea's lines. */
export const optionLines = (options: readonly FormOption[] | undefined): string =>
    (options ?? []).map((option) => (option.value === option.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ? option.label : `${option.value} | ${option.label}`)).join("\n");

interface FieldEditorProps {
    field: FormField;
    index: number;
    count: number;
    definition: FormDefinition;
    kinds: FieldKindInfo[];
    /** This field's problems, keyed on its own props (`label`, `options`, `dependsOn`). */
    problems: Record<string, string>;
    showErrors: boolean;
    open: boolean;
    onToggle: () => void;
    onChange: (next: FormField) => void;
    onMove: (delta: -1 | 1) => void;
    onRemove: () => void;
}

/**
 * FM-1: one field of a form — a row that opens into its editor: the label,
 * the id a page and the answers use, the kind, the guidance, whether it is
 * required, the options of a picking kind, the range of a bounded one, the
 * files an upload takes, and which earlier answer shows it.
 */
export function FieldEditor({ field, index, count, definition, kinds, problems, showErrors, open, onToggle, onChange, onMove, onRemove }: FieldEditorProps) {
    const info = kindInfo(field.kind, kinds);
    const [optionsText, setOptionsText] = React.useState(() => optionLines(field.options));
    const [touched, setTouched] = React.useState<Set<string>>(() => new Set());
    const flagged = Object.keys(problems).length > 0 && (showErrors || touched.size > 0);
    const shown = (key: string) => (showErrors || touched.has(key) ? problems[key] : undefined);
    const set = <K extends keyof FormField>(key: K, value: FormField[K]) => {
        setTouched((current) => new Set(current).add(String(key)));
        onChange({ ...field, [key]: value });
    };
    const earlier = fieldsBefore(definition, field.id);
    const id = `field-${index}-${field.id || "new"}`;

    return (
        <li className={cn("rounded-md border bg-card", flagged && "border-danger/60")} data-testid={`form-field-${field.id}`}>
            <div className="flex items-center gap-2 px-2 py-2">
                <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
                    {open ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium text-foreground">{field.label || <span className="italic text-muted-foreground">Untitled field</span>}</span>
                            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{info.label}</span>
                            {field.required && <span className="rounded-full bg-info-soft px-1.5 py-0.5 text-[10px] font-medium text-info">Required</span>}
                            {field.dependsOn && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">If {field.dependsOn.fieldId} = {field.dependsOn.equals || "…"}</span>}
                            {flagged && <AlertCircle className="size-3.5 text-danger" aria-label="Needs attention" />}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-muted-foreground">{field.id}</span>
                    </span>
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move field up">
                        <ArrowUp className="size-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move field down">
                        <ArrowDown className="size-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-danger hover:text-danger" onClick={onRemove} aria-label="Remove field">
                        <Trash2 className="size-3.5" />
                    </Button>
                </div>
            </div>

            {open && (
                <div className="space-y-4 border-t px-4 py-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor={`${id}-label`} className="text-xs">
                                Label <span className="text-danger">*</span>
                            </Label>
                            <Input id={`${id}-label`} value={field.label} onChange={(event) => set("label", event.target.value)} maxLength={DEFINITION_LIMITS.label} className={cn("h-9", shown("label") && "border-danger")} data-testid={`${id}-label`} />
                            {shown("label") && <p className="text-xs text-danger">{shown("label")}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={`${id}-id`} className="text-xs">
                                Id — what the answers are filed under
                            </Label>
                            <Input id={`${id}-id`} value={field.id} onChange={(event) => set("id", event.target.value)} className={cn("h-9 font-mono", shown("id") && "border-danger")} data-testid={`${id}-id`} />
                            {shown("id") && <p className="text-xs text-danger">{shown("id")}</p>}
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor={`${id}-kind`} className="text-xs">
                                Kind
                            </Label>
                            <Select value={field.kind} onValueChange={(kind) => set("kind", kind)}>
                                <SelectTrigger id={`${id}-kind`} className={cn("h-9", shown("kind") && "border-danger")} data-testid={`${id}-kind`}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {!kinds.some((item) => item.kind === field.kind) && <SelectItem value={field.kind}>{field.kind} (unknown)</SelectItem>}
                                    {kinds.map((item) => (
                                        <SelectItem key={item.kind} value={item.kind}>
                                            {item.label}
                                            {item.signedInOnly ? " — signed-in only" : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {shown("kind") && <p className="text-xs text-danger">{shown("kind")}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={`${id}-placeholder`} className="text-xs">
                                Placeholder — shown inside an empty field
                            </Label>
                            <Input id={`${id}-placeholder`} value={field.placeholder ?? ""} onChange={(event) => set("placeholder", event.target.value || undefined)} className="h-9" />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor={`${id}-hint`} className="text-xs">
                            Guidance — one line under the label
                        </Label>
                        <Input id={`${id}-hint`} value={field.hint ?? ""} onChange={(event) => set("hint", event.target.value || undefined)} maxLength={DEFINITION_LIMITS.hint} className="h-9" />
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={field.required ?? false} onCheckedChange={(checked) => set("required", checked === true)} data-testid={`${id}-required`} />
                        Required — the person cannot send without it
                    </label>

                    {info.takesOptions && (
                        <div className="space-y-1.5">
                            <Label htmlFor={`${id}-options`} className="text-xs">
                                Options — one per line, “value | Label” or just the label
                            </Label>
                            <Textarea
                                id={`${id}-options`}
                                value={optionsText}
                                onChange={(event) => {
                                    setOptionsText(event.target.value);
                                    set("options", parseOptionLines(event.target.value));
                                }}
                                rows={4}
                                className={cn("font-mono text-xs", shown("options") && "border-danger")}
                                data-testid={`${id}-options`}
                            />
                            {shown("options") && <p className="text-xs text-danger">{shown("options")}</p>}
                        </div>
                    )}

                    {info.takesRange && (
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="space-y-1.5">
                                <Label htmlFor={`${id}-min`} className="text-xs">
                                    {field.kind === "multiselect" ? "Pick at least" : field.kind === "number" ? "At least" : "At least (characters)"}
                                </Label>
                                <Input id={`${id}-min`} inputMode="numeric" value={field.min ?? ""} onChange={(event) => set("min", event.target.value === "" ? undefined : Number(event.target.value))} className="h-9" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor={`${id}-max`} className="text-xs">
                                    {field.kind === "multiselect" ? "Pick at most" : field.kind === "number" ? "At most" : "At most (characters)"}
                                </Label>
                                <Input id={`${id}-max`} inputMode="numeric" value={field.max ?? ""} onChange={(event) => set("max", event.target.value === "" ? undefined : Number(event.target.value))} className={cn("h-9", shown("max") && "border-danger")} />
                            </div>
                            {(field.kind === "text" || field.kind === "textarea") && (
                                <div className="space-y-1.5">
                                    <Label htmlFor={`${id}-maxLength`} className="text-xs">
                                        Longest answer
                                    </Label>
                                    <Input id={`${id}-maxLength`} inputMode="numeric" value={field.maxLength ?? ""} onChange={(event) => set("maxLength", event.target.value === "" ? undefined : Number(event.target.value))} className={cn("h-9", shown("maxLength") && "border-danger")} />
                                </div>
                            )}
                        </div>
                    )}
                    {(shown("max") || shown("maxLength")) && <p className="text-xs text-danger">{shown("max") ?? shown("maxLength")}</p>}

                    {field.kind === "file" && (
                        <div className="space-y-1.5">
                            <Label htmlFor={`${id}-accept`} className="text-xs">
                                Files taken — comma-separated types, empty for any
                            </Label>
                            <Input id={`${id}-accept`} value={(field.accept ?? []).join(", ")} onChange={(event) => set("accept", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} placeholder="image/*, application/pdf" className="h-9 font-mono" />
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label className="text-xs">Show only when an earlier answer is — none shows it always</Label>
                        <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
                            <Select
                                value={field.dependsOn?.fieldId ?? NONE}
                                onValueChange={(value) => set("dependsOn", value === NONE ? undefined : { fieldId: value, equals: field.dependsOn?.equals ?? "" })}
                                disabled={earlier.length === 0}
                            >
                                <SelectTrigger className={cn("h-9", shown("dependsOn") && "border-danger")} aria-label="Depends on" data-testid={`${id}-depends`}>
                                    <SelectValue placeholder="Always shown" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>Always shown</SelectItem>
                                    {earlier.map((item) => (
                                        <SelectItem key={item.id} value={item.id}>
                                            {item.label || item.id}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input
                                value={field.dependsOn?.equals ?? ""}
                                onChange={(event) => set("dependsOn", field.dependsOn ? { ...field.dependsOn, equals: event.target.value } : undefined)}
                                disabled={!field.dependsOn}
                                placeholder="equals this answer"
                                className={cn("h-9", shown("dependsOn") && "border-danger")}
                                aria-label="Equals"
                            />
                        </div>
                        {shown("dependsOn") && <p className="text-xs text-danger">{shown("dependsOn")}</p>}
                    </div>
                </div>
            )}
        </li>
    );
}
