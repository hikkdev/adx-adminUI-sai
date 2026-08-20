"use client";

import * as React from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface FacetOption {
    value: string;
    label: string;
    /** Matching records, shown beside the option like an e-commerce facet. */
    count?: number;
}

export interface Facet {
    id: string;
    label: string;
    /** "single" renders radios and holds at most one value. Defaults to "multi". */
    type?: "single" | "multi";
    options: FacetOption[];
}

/** facetId to selected values. An absent or empty entry means "not filtering". */
export type FilterSelection = Record<string, string[]>;

interface FilterPanelProps {
    facets: Facet[];
    selection: FilterSelection;
    onChange: (next: FilterSelection) => void;
    /** Rows matching the current selection, shown on the apply button. */
    resultCount: number;
    /** Optional free-text search kept alongside the facets. */
    search?: {
        value: string;
        onChange: (value: string) => void;
        placeholder?: string;
    };
    triggerLabel?: string;
    className?: string;
}

export const activeFilterCount = (selection: FilterSelection) =>
    Object.values(selection).reduce((total, values) => total + values.length, 0);

/**
 * Slide-over filter panel, the pattern shopping sites use: one trigger showing
 * how many filters are on, faceted sections inside, and a footer that commits.
 *
 * Edits are staged locally so the table does not thrash on every checkbox;
 * nothing reaches the caller until Apply.
 */
export function FilterPanel({
    facets,
    selection,
    onChange,
    resultCount,
    search,
    triggerLabel = "Filters",
    className,
}: FilterPanelProps) {
    const [open, setOpen] = React.useState(false);
    const [draft, setDraft] = React.useState<FilterSelection>(selection);

    // Re-sync whenever the panel opens so it always reflects what is applied.
    React.useEffect(() => {
        if (open) setDraft(selection);
    }, [open, selection]);

    const applied = activeFilterCount(selection);
    const staged = activeFilterCount(draft);

    const toggle = (facet: Facet, value: string) => {
        const current = draft[facet.id] ?? [];
        if (facet.type === "single") {
            setDraft({ ...draft, [facet.id]: current[0] === value ? [] : [value] });
            return;
        }
        setDraft({
            ...draft,
            [facet.id]: current.includes(value)
                ? current.filter((item) => item !== value)
                : [...current, value],
        });
    };

    const clearAll = () => setDraft({});

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="outline" className={cn("h-9 bg-card", className)}>
                    <SlidersHorizontal className="size-4" />
                    {triggerLabel}
                    {applied > 0 && (
                        <span className="ml-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold tabular-nums text-primary-foreground">
                            {applied}
                        </span>
                    )}
                </Button>
            </SheetTrigger>

            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
                <SheetHeader className="border-b px-5 py-4 text-left">
                    <SheetTitle>Filters</SheetTitle>
                    <SheetDescription>
                        Narrow the list, then apply.
                    </SheetDescription>
                </SheetHeader>

                <ScrollArea className="flex-1">
                    <div className="divide-y">
                        {search && (
                            <div className="space-y-1.5 px-5 py-4">
                                <Label htmlFor="filter-search">Search</Label>
                                <Input
                                    id="filter-search"
                                    value={search.value}
                                    onChange={(event) => search.onChange(event.target.value)}
                                    placeholder={search.placeholder}
                                />
                            </div>
                        )}

                        {facets.map((facet) => {
                            const values = draft[facet.id] ?? [];

                            return (
                                <fieldset key={facet.id} className="px-5 py-4">
                                    <legend className="mb-2.5 flex w-full items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-foreground">
                                            {facet.label}
                                        </span>
                                        {values.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setDraft({ ...draft, [facet.id]: [] })
                                                }
                                                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </legend>

                                    {facet.type === "single" ? (
                                        <RadioGroup
                                            value={values[0] ?? ""}
                                            onValueChange={(value) => toggle(facet, value)}
                                            className="space-y-0"
                                        >
                                            {facet.options.map((option) => (
                                                <label
                                                    key={option.value}
                                                    className="flex cursor-pointer items-center gap-2.5 py-1.5"
                                                >
                                                    <RadioGroupItem
                                                        value={option.value}
                                                        id={`${facet.id}-${option.value}`}
                                                    />
                                                    <span className="flex-1 text-sm text-foreground">
                                                        {option.label}
                                                    </span>
                                                    {typeof option.count === "number" && (
                                                        <span className="text-xs tabular-nums text-muted-foreground">
                                                            {option.count}
                                                        </span>
                                                    )}
                                                </label>
                                            ))}
                                        </RadioGroup>
                                    ) : (
                                        facet.options.map((option) => (
                                            <label
                                                key={option.value}
                                                className="flex cursor-pointer items-center gap-2.5 py-1.5"
                                            >
                                                <Checkbox
                                                    checked={values.includes(option.value)}
                                                    onCheckedChange={() => toggle(facet, option.value)}
                                                    id={`${facet.id}-${option.value}`}
                                                />
                                                <span className="flex-1 text-sm text-foreground">
                                                    {option.label}
                                                </span>
                                                {typeof option.count === "number" && (
                                                    <span className="text-xs tabular-nums text-muted-foreground">
                                                        {option.count}
                                                    </span>
                                                )}
                                            </label>
                                        ))
                                    )}
                                </fieldset>
                            );
                        })}
                    </div>
                </ScrollArea>

                <SheetFooter className="flex-row items-center gap-2 border-t px-5 py-3">
                    <Button
                        variant="ghost"
                        className="flex-1"
                        onClick={clearAll}
                        disabled={staged === 0}
                    >
                        Clear all
                    </Button>
                    <SheetClose asChild>
                        <Button
                            className="flex-1"
                            onClick={() => onChange(draft)}
                        >
                            Apply
                        </Button>
                    </SheetClose>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}

/**
 * Row of removable tokens for what is currently applied, so the active filters
 * stay visible once the panel is closed.
 */
export function ActiveFilters({
    facets,
    selection,
    onChange,
    resultCount,
    className,
}: {
    facets: Facet[];
    selection: FilterSelection;
    onChange: (next: FilterSelection) => void;
    resultCount?: number;
    className?: string;
}) {
    const entries = facets.flatMap((facet) =>
        (selection[facet.id] ?? []).map((value) => ({
            facet,
            value,
            label:
                facet.options.find((option) => option.value === value)?.label ?? value,
        }))
    );

    if (!entries.length) return null;

    return (
        <div className={cn("flex flex-wrap items-center gap-2", className)}>
            {typeof resultCount === "number" && (
                <span className="text-sm text-muted-foreground">
                    <span className="font-medium tabular-nums text-foreground">
                        {resultCount}
                    </span>{" "}
                    {resultCount === 1 ? "result" : "results"}
                </span>
            )}
            {entries.map(({ facet, value, label }) => (
                <button
                    key={`${facet.id}-${value}`}
                    type="button"
                    onClick={() =>
                        onChange({
                            ...selection,
                            [facet.id]: (selection[facet.id] ?? []).filter(
                                (item) => item !== value
                            ),
                        })
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted"
                >
                    <span className="text-muted-foreground">{facet.label}:</span>
                    {label}
                    <X className="size-3 text-muted-foreground" />
                    <span className="sr-only">Remove filter</span>
                </button>
            ))}
            <button
                type="button"
                onClick={() => onChange({})}
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
                Clear all
            </button>
        </div>
    );
}
