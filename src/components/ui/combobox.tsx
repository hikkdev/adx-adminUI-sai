"use client";

import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * A dropdown you can type into.
 *
 * The catalogue has 1,377 spot types and 57 venues. A native select is a wall
 * of options with no way through it, so anywhere the list is longer than a
 * screenful this replaces it.
 *
 * Two things here are corrections rather than choices, and both were silent
 * failures in the version this replaces:
 *
 * `cmdk` filters on a `CommandItem`'s `value` prop. That prop used to hold the
 * option's id, so typing "atrium" searched a list of cuids and matched nothing —
 * the search box was decorative. Filtering is now done here, against the label
 * and the description, and the item's `value` is only ever used for keyboard
 * navigation.
 *
 * `cmdk` also lowercases the value it hands back to `onSelect`. Reading the
 * selection from there returned a mangled id, so the previous implementation
 * could not have round-tripped a cuid at all. The id now comes from the closure
 * and never passes through the library.
 */

export interface ComboboxItem {
    label: string;
    value: string;
    /** Searchable, and shown under the label. A catalogue group, a city, a slug. */
    description?: string;
    /** Optional heading to file this option under. */
    group?: string;
}

interface BaseComboboxProps {
    items: ComboboxItem[];
    placeholder?: string;
    searchPlaceholder?: string;
    emptyText?: string;
    className?: string;
    disabled?: boolean;
    /** Shown as the trigger label when nothing is chosen and the list is empty. */
    id?: string;
}

interface SingleComboboxProps extends BaseComboboxProps {
    multiple?: false;
    value: string;
    onValueChange: (value: string) => void;
}

interface MultiComboboxProps extends BaseComboboxProps {
    multiple: true;
    value: string[];
    onValueChange: (value: string[]) => void;
}

type ComboboxProps = SingleComboboxProps | MultiComboboxProps;

/**
 * How many matches are put in the DOM at once.
 *
 * Rendering thirteen hundred rows makes opening the list visibly slow, and
 * nobody scrolls that far anyway. The cap applies *after* filtering, so typing
 * always reaches what you are looking for — and the count of what is hidden is
 * shown, because a list that silently stops at a hundred looks like a list that
 * does not contain the thing you are searching for.
 */
const RENDER_CAP = 100;

const normalise = (value: string) => value.toLowerCase().trim();

function useMatches(items: ComboboxItem[], query: string) {
    return React.useMemo(() => {
        const needle = normalise(query);
        const matched = needle
            ? items.filter((item) =>
                  normalise(`${item.label} ${item.description ?? ""}`).includes(needle)
              )
            : items;
        return { shown: matched.slice(0, RENDER_CAP), hidden: Math.max(matched.length - RENDER_CAP, 0) };
    }, [items, query]);
}

/** Matches under their group headings, preserving the order they arrived in. */
function grouped(items: ComboboxItem[]): [string, ComboboxItem[]][] {
    const groups = new Map<string, ComboboxItem[]>();
    for (const item of items) {
        const key = item.group ?? "";
        const bucket = groups.get(key);
        if (bucket) bucket.push(item);
        else groups.set(key, [item]);
    }
    return [...groups.entries()];
}

export function Combobox(props: ComboboxProps) {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const {
        items,
        placeholder = "Select an option",
        searchPlaceholder = "Type to search…",
        emptyText = "No matches.",
        className,
        disabled,
        id,
    } = props;

    const { shown, hidden } = useMatches(items, query);
    const multiple = props.multiple === true;
    const selected = multiple ? props.value : props.value ? [props.value] : [];

    const triggerLabel = multiple
        ? selected.length === 0
            ? placeholder
            : `${selected.length} selected`
        : (items.find((item) => item.value === props.value)?.label ?? placeholder);

    function choose(itemValue: string) {
        if (props.multiple) {
            const next = props.value.includes(itemValue)
                ? props.value.filter((candidate) => candidate !== itemValue)
                : [...props.value, itemValue];
            props.onValueChange(next);
            return;
        }
        // Toggling off a single selection clears it, matching a Select's "—".
        props.onValueChange(itemValue === props.value ? "" : itemValue);
        setOpen(false);
    }

    const list = (
        <Command shouldFilter={false}>
            <CommandInput
                placeholder={searchPlaceholder}
                value={query}
                onValueChange={setQuery}
            />
            <CommandList className="max-h-72">
                {shown.length === 0 ? <CommandEmpty>{emptyText}</CommandEmpty> : null}
                {grouped(shown).map(([group, groupItems]) => (
                    <CommandGroup key={group || "__ungrouped__"} heading={group || undefined}>
                        {groupItems.map((item) => (
                            <CommandItem
                                key={item.value}
                                value={item.value}
                                onSelect={() => choose(item.value)}
                            >
                                <Check
                                    className={cn(
                                        "mr-2 size-4 shrink-0",
                                        selected.includes(item.value) ? "opacity-100" : "opacity-0"
                                    )}
                                />
                                <span className="min-w-0">
                                    <span className="block truncate">{item.label}</span>
                                    {item.description ? (
                                        <span className="block truncate text-xs text-muted-foreground">
                                            {item.description}
                                        </span>
                                    ) : null}
                                </span>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                ))}
                {hidden > 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                        {hidden} more match — keep typing to narrow it down.
                    </p>
                ) : null}
            </CommandList>
        </Command>
    );

    const trigger = (
        <PopoverTrigger asChild>
            <Button
                id={id}
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                disabled={disabled}
                className={cn("w-full justify-between font-normal", className)}
            >
                <span
                    className={cn(
                        "truncate",
                        (multiple ? selected.length === 0 : !props.value) && "text-muted-foreground"
                    )}
                >
                    {triggerLabel}
                </span>
                <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
            </Button>
        </PopoverTrigger>
    );

    if (!props.multiple) {
        return (
            <Popover open={open} onOpenChange={setOpen}>
                {trigger}
                <PopoverContent
                    align="start"
                    className="w-[--radix-popover-trigger-width] min-w-64 p-0"
                >
                    {list}
                </PopoverContent>
            </Popover>
        );
    }

    const { value, onValueChange } = props;
    return (
        <div className="space-y-2">
            <Popover open={open} onOpenChange={setOpen}>
                {trigger}
                <PopoverContent
                    align="start"
                    className="w-[--radix-popover-trigger-width] min-w-64 p-0"
                >
                    {list}
                </PopoverContent>
            </Popover>
            {value.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {value.map((itemValue) => {
                        const item = items.find((candidate) => candidate.value === itemValue);
                        return (
                            <Badge key={itemValue} variant="secondary" className="gap-1">
                                {item?.label ?? itemValue}
                                <button
                                    type="button"
                                    aria-label={`Remove ${item?.label ?? itemValue}`}
                                    className="transition-colors hover:text-destructive"
                                    onClick={() =>
                                        onValueChange(
                                            value.filter((candidate) => candidate !== itemValue)
                                        )
                                    }
                                >
                                    <X className="size-3" aria-hidden />
                                </button>
                            </Badge>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
