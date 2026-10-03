"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Eye, MapPin, Smartphone, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { kindInfo, type FieldKindInfo, type FormDefinition, type FormField } from "@/services/forms";

/** The four listing categories a `category` field offers — the enum, spelled here so the preview stays a leaf. */
const CATEGORIES = ["Indoor", "Outdoor", "Transit", "Media"];

/**
 * FM-1: the draft form in a phone frame, screen by screen, read-only — a
 * light web rendering of each kind so the person building it sees the
 * shape of what the website and the apps will draw, not their exact
 * pixels. It shows what is in the editor now, saved or not.
 */
export function FormPreview({ definition, title, description, kinds }: { definition: FormDefinition; title: string; description?: string | null; kinds: FieldKindInfo[] }) {
    const [at, setAt] = React.useState(0);
    const screens = definition.screens;
    const index = Math.min(at, Math.max(0, screens.length - 1));
    const screen = screens[index];
    const last = index === screens.length - 1;

    return (
        <Card className="rounded-lg border-border shadow-none" data-testid="form-preview">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Eye className="size-4 text-muted-foreground" aria-hidden />
                    Preview
                </h3>
                <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <Smartphone className="size-3.5" aria-hidden />
                    As typed — not what is saved
                </span>
            </div>
            <div className="bg-muted/40 p-4">
                <div className="mx-auto w-full max-w-[390px] rounded-[28px] border-[6px] border-foreground/80 bg-card p-4 shadow-sm">
                    <div className="space-y-4">
                        <div>
                            <p className="text-base font-semibold text-foreground">{title}</p>
                            {description && <p className="text-xs text-muted-foreground">{description}</p>}
                        </div>
                        {screens.length > 1 && (
                            <div className="flex items-center gap-1" aria-label={`Screen ${index + 1} of ${screens.length}`}>
                                {screens.map((item, i) => (
                                    <span key={item.key || i} className={cn("h-1 flex-1 rounded-full", i <= index ? "bg-foreground" : "bg-muted")} />
                                ))}
                            </div>
                        )}
                        {screen ? (
                            <div className="space-y-3">
                                {(screen.title || screen.description) && (
                                    <div>
                                        {screen.title && <p className="text-sm font-semibold text-foreground">{screen.title}</p>}
                                        {screen.description && <p className="text-xs text-muted-foreground">{screen.description}</p>}
                                    </div>
                                )}
                                {screen.fields.length === 0 && <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">No fields on this screen.</p>}
                                {screen.fields.map((field, i) => (
                                    <PreviewField key={field.id || i} field={field} kinds={kinds} />
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground">No screens.</p>
                        )}
                        {last && (
                            <label className="flex items-start gap-2 text-xs text-foreground">
                                <span className="mt-0.5 size-3.5 shrink-0 rounded border border-foreground/40" aria-hidden />
                                <span>{definition.consentText || <span className="italic text-danger">A consent line is required.</span>}</span>
                            </label>
                        )}
                        <div className="flex items-center gap-2">
                            {index > 0 && (
                                <Button type="button" variant="outline" size="sm" className="h-9 bg-card" onClick={() => setAt(index - 1)} aria-label="Previous screen">
                                    <ChevronLeft className="size-4" />
                                </Button>
                            )}
                            {last ? (
                                <span className="flex h-9 flex-1 items-center justify-center rounded-md bg-foreground text-sm font-medium text-background">{definition.submitLabel?.trim() || "Send"}</span>
                            ) : (
                                <Button type="button" size="sm" className="h-9 flex-1" onClick={() => setAt(index + 1)} data-testid="form-preview-next">
                                    Next
                                    <ChevronRight className="ml-1 size-4" />
                                </Button>
                            )}
                        </div>
                        {last && definition.successMessage && <p className="text-center text-[11px] text-muted-foreground">After sending: “{definition.successMessage}”</p>}
                    </div>
                </div>
            </div>
        </Card>
    );
}

function PreviewField({ field, kinds }: { field: FormField; kinds: FieldKindInfo[] }) {
    const info = kindInfo(field.kind, kinds);
    const box = "flex h-10 w-full items-center rounded-md border bg-card px-3 text-xs text-muted-foreground";
    let control: React.ReactNode;
    switch (field.kind) {
        case "textarea":
            control = <div className={cn(box, "h-20 items-start py-2")}>{field.placeholder ?? ""}</div>;
            break;
        case "select":
            control = (
                <div className={cn(box, "justify-between")}>
                    <span>{field.placeholder ?? "Pick one"}</span>
                    <ChevronRight className="size-3.5 rotate-90" aria-hidden />
                </div>
            );
            break;
        case "multiselect":
            control = (
                <div className="space-y-1.5">
                    {(field.options ?? []).slice(0, 6).map((option) => (
                        <label key={option.value} className="flex items-center gap-2 text-xs text-foreground">
                            <span className="size-3.5 rounded border border-foreground/40" aria-hidden />
                            {option.label}
                        </label>
                    ))}
                    {(field.options ?? []).length === 0 && <p className="text-[11px] italic text-muted-foreground">No options yet.</p>}
                </div>
            );
            break;
        case "checkbox":
            control = null;
            break;
        case "category":
            control = (
                <div className="flex flex-wrap gap-1.5">
                    {CATEGORIES.map((category) => (
                        <span key={category} className="rounded-full border px-2.5 py-1 text-xs text-foreground">
                            {category}
                        </span>
                    ))}
                </div>
            );
            break;
        case "location":
            control = (
                <div className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted/40 text-xs text-muted-foreground">
                    <MapPin className="size-4" aria-hidden />
                    Pin on the map
                </div>
            );
            break;
        case "file":
            control = (
                <div className="flex h-16 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted/40 text-xs text-muted-foreground">
                    <Upload className="size-4" aria-hidden />
                    {(field.accept ?? []).length ? field.accept!.join(", ") : "Any file"}
                </div>
            );
            break;
        case "date":
            control = <div className={box}>{field.placeholder ?? "DD / MM / YYYY"}</div>;
            break;
        case "city":
            control = <div className={box}>{field.placeholder ?? "Search a city"}</div>;
            break;
        default:
            control = <div className={box}>{field.placeholder ?? ""}</div>;
    }

    if (field.kind === "checkbox") {
        return (
            <label className="flex items-start gap-2 text-xs text-foreground">
                <span className="mt-0.5 size-3.5 shrink-0 rounded border border-foreground/40" aria-hidden />
                <span>
                    {field.label || <span className="italic text-muted-foreground">Untitled</span>}
                    {field.required && <span className="text-danger"> *</span>}
                    {field.hint && <span className="block text-[11px] text-muted-foreground">{field.hint}</span>}
                </span>
            </label>
        );
    }

    return (
        <div className="space-y-1" data-testid={`preview-field-${field.id}`}>
            <p className="text-xs font-medium text-foreground">
                {field.label || <span className="italic text-muted-foreground">Untitled {info.label.toLowerCase()}</span>}
                {field.required && <span className="text-danger"> *</span>}
                {field.dependsOn && <span className="ml-1 text-[10px] font-normal text-muted-foreground">(if {field.dependsOn.fieldId} = {field.dependsOn.equals || "…"})</span>}
            </p>
            {field.hint && <p className="text-[11px] text-muted-foreground">{field.hint}</p>}
            {control}
        </div>
    );
}
