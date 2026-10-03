"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ADDRESS_SEARCH_PLACEHOLDER, PlaceSuggestions, usePlaceSearch } from "@/components/adx/pin-picker";
import type { GeocodedPlace, GeoPoint, PlacePrediction } from "@/services/geo";

export interface AddressSearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
    id: string;
    /** The address line as the form holds it. */
    value: string;
    /** Every keystroke, and the picked place's line. */
    onChange: (next: string) => void;
    /**
     * A picked place, for the form to fill what else it has — the city, the
     * state, the PIN. Coordinates ride on it but a search-only field (a
     * billing address) never sends them.
     */
    onPlace: (place: GeocodedPlace) => void;
    /** Where to bias the suggestions, when the form knows. */
    near?: GeoPoint | null;
}

/**
 * The address box with the map's suggestions under it, and no map: the
 * search-only counterpart of the pin picker (address search everywhere, the
 * owner, 1 Oct 2026), on the very same search code — `usePlaceSearch`.
 *
 * Typing is the address line; once it is long enough the suggestions open
 * under it, and a pick writes the place's line and hands the place over for
 * the rest of the form. When the vendor answers nothing — no key, fixtures,
 * a failed lookup — it stays a plain box for the address and nothing is
 * said under it, so it stands as tall as its neighbours.
 */
export function AddressSearchInput({ id, value, onChange, onPlace, near, placeholder = ADDRESS_SEARCH_PLACEHOLDER, className, onFocus, onBlur, onKeyDown, ...rest }: AddressSearchInputProps) {
    const search = usePlaceSearch(value, {
        near,
        onPlace: (place) => {
            if (place.formattedAddress) onChange(place.formattedAddress);
            onPlace(place);
        },
    });
    const listId = `${id}-predictions`;

    const pick = async (prediction: PlacePrediction) => {
        /* The place could not be looked up: the words of the suggestion are still an address. */
        if (!(await search.pick(prediction))) onChange(prediction.description);
    };

    return (
        <div className="relative">
            <Input
                {...rest}
                id={id}
                value={value}
                placeholder={placeholder}
                autoComplete="off"
                className={cn("h-9", className)}
                {...(search.live ? { role: "combobox", "aria-expanded": search.showing && search.rows.length > 0, "aria-controls": listId, "aria-autocomplete": "list" as const } : {})}
                onChange={(event) => {
                    onChange(event.target.value);
                    search.clearLookupError();
                    search.setOpen(true);
                }}
                onFocus={(event) => {
                    search.begin();
                    onFocus?.(event);
                }}
                onBlur={(event) => {
                    search.setOpen(false);
                    onBlur?.(event);
                }}
                onKeyDown={(event) => {
                    if (event.key === "Escape" && search.open) search.setOpen(false);
                    /* Enter picks the first suggestion while the list shows; otherwise it is the form's (submit). */
                    if (event.key === "Enter" && search.showing && search.rows.length > 0) {
                        event.preventDefault();
                        void pick(search.rows[0]);
                    }
                    onKeyDown?.(event);
                }}
            />
            <PlaceSuggestions id={listId} search={search} onPick={(prediction) => void pick(prediction)} quiet />
        </div>
    );
}
