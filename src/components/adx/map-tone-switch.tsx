"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MapTone } from "@/lib/use-map-tone";

const OPTIONS: { value: MapTone; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "dark", label: "Dark", Icon: Moon },
];

/**
 * The map's Light / Dark switch: a pill of two choices with a thumb that
 * slides under the one in force. It sits on the map, so it takes the map's
 * tone — a white pill with a dark thumb on the light map, a dark glass pill
 * with a white thumb on the dark one. A radio group: arrow keys move the
 * choice, only the chosen one is in the tab order.
 */
export function MapToneSwitch({ tone, onChange, className }: { tone: MapTone; onChange: (tone: MapTone) => void; className?: string }) {
    const dark = tone === "dark";
    const refs = React.useRef<Record<MapTone, HTMLButtonElement | null>>({ light: null, dark: null });

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const next: MapTone = dark ? "light" : "dark";
        onChange(next);
        refs.current[next]?.focus();
    };

    return (
        <div
            role="radiogroup"
            aria-label="Map style"
            onKeyDown={onKeyDown}
            className={cn(
                "relative grid grid-cols-2 rounded-full border p-0.5 text-xs font-medium backdrop-blur-md transition-colors duration-300",
                dark ? "border-white/10 bg-neutral-900/90 text-neutral-400 shadow-lg shadow-black/30" : "border-border bg-card/95 text-muted-foreground shadow-sm",
                className,
            )}
        >
            <span
                aria-hidden
                className={cn(
                    "absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full shadow-sm transition-[transform,background-color] duration-300 ease-out motion-reduce:transition-none",
                    dark ? "translate-x-full bg-white" : "translate-x-0 bg-foreground",
                )}
            />
            {OPTIONS.map(({ value, label, Icon }) => {
                const chosen = tone === value;
                return (
                    <button
                        key={value}
                        ref={(node) => {
                            refs.current[value] = node;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={chosen}
                        tabIndex={chosen ? 0 : -1}
                        onClick={() => onChange(value)}
                        className={cn(
                            "relative flex h-7 items-center justify-center gap-1.5 rounded-full px-3 outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                            chosen ? (dark ? "text-neutral-900" : "text-background") : dark ? "hover:text-neutral-100" : "hover:text-foreground",
                        )}
                    >
                        <Icon className="size-3.5" aria-hidden />
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

/** The frame of a control group laid over the map (the zoom stack, a legend): it takes the map's tone. */
export function mapControlSurface(tone: MapTone): string {
    return tone === "dark"
        ? "border border-white/10 bg-neutral-900/85 text-neutral-100 shadow-lg shadow-black/30 backdrop-blur-md"
        : "border bg-card text-foreground shadow-sm";
}

/** One button inside such a group: its divider and hover follow the map's tone. */
export function mapControlButton(tone: MapTone): string {
    return tone === "dark" ? "border-white/10 hover:bg-white/10" : "hover:bg-muted";
}
