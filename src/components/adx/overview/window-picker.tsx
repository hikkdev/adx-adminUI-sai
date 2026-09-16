"use client";

import { Calendar, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CityCombobox } from "@/components/adx/city-combobox";
import { shiftDay } from "@/services/overview";
import {
    MAX_OVERVIEW_DAYS,
    WINDOW_PRESETS,
    WINDOW_PRESET_LABEL,
    presetRange,
    windowLabel,
    type OverviewWindow,
    type WindowPreset,
} from "@/services/section-overviews";

export interface WindowPickerProps {
    window: OverviewWindow;
    onChange: (next: OverviewWindow) => void;
    /** Today in India — the presets end on it and the date inputs cannot pass it. */
    today: string;
    /** Whether the section's read takes `?city=` — employees have a region, not a city. */
    cityFilter: boolean;
}

/**
 * The window every overview is read over: the last 7 / 30 / 90 days,
 * this month, or two inclusive days at most a year apart (the server's own
 * ceiling), and — where the section's read narrows by city — the city,
 * through the shared city combobox over `GET /geo/cities` (V-C: the
 * catalogue is the country now, so a select of every row is no longer a
 * list anyone scrolls; a party's own `city` column is matched on the name,
 * case-insensitively, so free text still reaches the server). The whole
 * choice lives in the URL through `useOverviewWindow`.
 */
export function WindowPicker({ window, onChange, today, cityFilter }: WindowPickerProps) {
    const latestTo = shiftDay(window.from, MAX_OVERVIEW_DAYS - 1);

    const pick = (preset: WindowPreset) => {
        if (preset === "CUSTOM") onChange({ ...window, preset: "CUSTOM" });
        else onChange({ ...window, preset, ...presetRange(preset, today) });
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-9 bg-card" aria-label="Window">
                        <Calendar className="mr-1.5 size-4" />
                        {windowLabel(window)}
                        <ChevronDown className="ml-1.5 size-3.5" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {WINDOW_PRESETS.map((preset) => (
                        <DropdownMenuItem key={preset} onSelect={() => pick(preset)}>
                            {WINDOW_PRESET_LABEL[preset]}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            {window.preset === "CUSTOM" && (
                <div className="flex items-center gap-2 rounded-md border bg-card px-2">
                    <Label htmlFor="overview-from" className="text-xs font-normal text-muted-foreground">
                        From
                    </Label>
                    <Input
                        id="overview-from"
                        type="date"
                        value={window.from}
                        max={today}
                        onChange={(event) => {
                            if (event.target.value) onChange({ ...window, from: event.target.value });
                        }}
                        className="h-8 w-[150px] border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                    />
                    <Label htmlFor="overview-to" className="text-xs font-normal text-muted-foreground">
                        To
                    </Label>
                    <Input
                        id="overview-to"
                        type="date"
                        value={window.to}
                        min={window.from}
                        max={latestTo < today ? latestTo : today}
                        onChange={(event) => {
                            if (event.target.value) onChange({ ...window, to: event.target.value });
                        }}
                        className="h-8 w-[150px] border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                    />
                </div>
            )}

            {cityFilter && (
                <CityCombobox
                    id="overview-city"
                    value={window.city}
                    onChange={(city) => onChange({ ...window, city })}
                    placeholder="All cities"
                    aria-label="City"
                    className="w-44 [&_input]:h-9 [&_input]:bg-card"
                />
            )}
        </div>
    );
}
