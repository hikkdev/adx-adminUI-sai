"use client";

import { cn } from "@/lib/utils";

export interface FilterChip<T extends string> {
    value: T;
    label: string;
    count?: number;
}

interface FilterChipsProps<T extends string> {
    chips: FilterChip<T>[];
    value: T;
    onChange: (value: T) => void;
    className?: string;
}

/** Horizontal pill filter row with counts (queue screens). */
export function FilterChips<T extends string>({
    chips,
    value,
    onChange,
    className,
}: FilterChipsProps<T>) {
    return (
        <div className={cn("flex flex-wrap items-center gap-1.5", className)} role="tablist">
            {chips.map((chip) => {
                const active = chip.value === value;
                return (
                    <button
                        key={chip.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(chip.value)}
                        className={cn(
                            "flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                            active
                                ? "border-foreground bg-foreground text-background"
                                : "bg-card text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {chip.label}
                        {typeof chip.count === "number" && (
                            <span
                                className={cn(
                                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                    active ? "bg-background/20" : "bg-muted"
                                )}
                            >
                                {chip.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
