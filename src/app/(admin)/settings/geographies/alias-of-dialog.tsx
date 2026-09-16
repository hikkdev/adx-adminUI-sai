"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CityCombobox } from "@/components/adx/city-combobox";
import { CITY_ALIAS_MAX, citiesService } from "@/services/cities";
import { CITY_STAGES, geoCityLabel, type GeoCity } from "@/services/geo";

interface AliasOfDialogProps {
    /** The typed spelling being taught to a city; null keeps the dialog closed. */
    spelling: string | null;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

/**
 * The list the PATCH sends: the city's aliases with the spelling appended,
 * unless the city already answers to it (by name, by slug, or as an alias,
 * case-insensitively) — then null, and the dialog says so instead of
 * sending a no-op.
 */
export function aliasesWith(city: Pick<GeoCity, "name" | "slug" | "aliases">, spelling: string): string[] | null {
    const wanted = spelling.trim();
    const key = wanted.toLowerCase();
    if (!wanted) return null;
    if (city.name.toLowerCase() === key || city.slug === key) return null;
    if (city.aliases.some((alias) => alias.toLowerCase() === key)) return null;
    return [...city.aliases, wanted];
}

/**
 * Lot X-B: "Add as alias of…" on the Unresolved spellings card. The
 * combobox picks the catalogue city (every stage — a spelling may belong
 * to a town still Planned); saving is `PATCH /pricing/cities/:slug
 * { aliases }` with the spelling appended, and the backend folds every
 * null-keyed row typed under it into the city as it saves.
 */
export function AliasOfDialog({ spelling, onOpenChange, onSaved }: AliasOfDialogProps) {
    return (
        <Dialog open={spelling !== null} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                {spelling !== null && <AliasOfForm key={spelling} spelling={spelling} onClose={() => onOpenChange(false)} onSaved={onSaved} />}
            </DialogContent>
        </Dialog>
    );
}

function AliasOfForm({ spelling, onClose, onSaved }: { spelling: string; onClose: () => void; onSaved: () => void }) {
    const [text, setText] = React.useState("");
    const [city, setCity] = React.useState<GeoCity | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const aliases = city ? aliasesWith(city, spelling) : null;
    const alreadyAnswers = city !== null && aliases === null;
    const full = aliases !== null && aliases.length > CITY_ALIAS_MAX;
    const canSave = city !== null && aliases !== null && !full && !busy;

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!city || !aliases || !canSave) return;
        setBusy(true);
        setError(null);
        try {
            const next = await citiesService.update(city.slug, { aliases });
            toast.success(`"${spelling}" now resolves to ${city.name}`, {
                description: `${next.aliases.length} spelling${next.aliases.length === 1 ? "" : "s"} on the city; the rows typed under it are keyed to it now.`,
            });
            onSaved();
            onClose();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not save the alias.");
        } finally {
            setBusy(false);
        }
    }

    let hint: string;
    if (!city) hint = "Pick a city from the list; a typed name that matches nothing cannot take an alias.";
    else if (alreadyAnswers) hint = `${geoCityLabel(city)} already answers to that spelling — run the backfill to key the rows.`;
    else if (full) hint = `${geoCityLabel(city)} already has ${CITY_ALIAS_MAX} spellings, the most a city takes.`;
    else hint = `${geoCityLabel(city)} — ${city.aliases.length} other spelling${city.aliases.length === 1 ? "" : "s"} today.`;

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <DialogHeader>
                <DialogTitle>Add as alias of…</DialogTitle>
                <DialogDescription>
                    Teach the resolver that <span className="font-medium text-foreground">&ldquo;{spelling}&rdquo;</span> means a catalogue city. Every row typed under it is
                    keyed to that city as this saves, and the next one typed the same way resolves on the spot.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
                <Label htmlFor="alias-of-city">City</Label>
                <CityCombobox
                    id="alias-of-city"
                    value={text}
                    onChange={(value, picked) => {
                        setText(value);
                        setCity(picked);
                    }}
                    stages={CITY_STAGES}
                    placeholder="Search the catalogue"
                />
                <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button type="submit" disabled={!canSave}>
                    {busy ? "Saving…" : "Save alias"}
                </Button>
            </DialogFooter>
        </form>
    );
}
