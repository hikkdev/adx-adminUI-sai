"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PinPicker } from "@/components/adx/pin-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { useApiResource } from "@/lib/use-api-resource";
import { parseAliases } from "@/services/cities";
import { CITY_KINDS, CITY_KIND_LABEL, geoService, type AddCityBody, type CityKind, type GeoCity, type GeoDistricts, type GeoStateRow } from "@/services/geo";

interface AddCityDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    states: GeoStateRow[];
    onAdded: (city: GeoCity) => void;
    /** Lot X-B: the name the form opens with — an unresolved spelling being added as a city of its own. */
    initialName?: string;
}

const NO_DISTRICT = "__none__";

export interface AddCityDraft {
    name: string;
    stateCode: string;
    districtCode: string;
    lat: string;
    lng: string;
    aliases: string;
    population: string;
    kind: CityKind | "";
}

/** The body, or null while the form is not one the schema takes. */
export function addCityBodyOf(draft: AddCityDraft): AddCityBody | null {
    const name = draft.name.trim();
    const lat = Number(draft.lat.trim());
    const lng = Number(draft.lng.trim());
    if (name.length < 2 || !draft.stateCode) return null;
    if (!draft.lat.trim() || !draft.lng.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    const population = draft.population.trim() ? Number(draft.population.trim()) : undefined;
    if (population !== undefined && (!Number.isInteger(population) || population < 0)) return null;
    const aliases = parseAliases(draft.aliases);
    return {
        name,
        stateCode: draft.stateCode,
        ...(draft.districtCode ? { districtCode: draft.districtCode } : {}),
        lat,
        lng,
        ...(aliases.length ? { aliases } : {}),
        ...(population !== undefined ? { population } : {}),
        ...(draft.kind ? { kind: draft.kind } : {}),
    };
}

/**
 * A place the dataset lacks — `POST /geo/cities`: MANUAL, PLANNED, every
 * switch off, then it is a city like any other. Navi Mumbai is the case
 * the seed reported rather than guessed. A name already under the state
 * is a 409, printed as the server put it.
 */
export function AddCityDialog({ open, onOpenChange, states, onAdded, initialName }: AddCityDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {open && <AddCityForm states={states} initialName={initialName} onClose={() => onOpenChange(false)} onAdded={onAdded} />}
            </DialogContent>
        </Dialog>
    );
}

const EMPTY_DRAFT: AddCityDraft = { name: "", stateCode: "", districtCode: "", lat: "", lng: "", aliases: "", population: "", kind: "" };

function AddCityForm({ states, initialName, onClose, onAdded }: { states: GeoStateRow[]; initialName?: string; onClose: () => void; onAdded: (city: GeoCity) => void }) {
    const [draft, setDraft] = React.useState<AddCityDraft>(() => ({ ...EMPTY_DRAFT, name: initialName?.trim() ?? "" }));
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const districts = useApiResource<GeoDistricts | null>(`geo:districts:${draft.stateCode || "-"}`, () => (draft.stateCode ? geoService.districts(draft.stateCode) : Promise.resolve(null)));
    const body = addCityBodyOf(draft);
    const set = <K extends keyof AddCityDraft>(key: K, value: AddCityDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!body || busy) return;
        setBusy(true);
        setError(null);
        try {
            const city = await geoService.addCity(body);
            toast.success(`${city.name} added to the catalogue`, { description: "Planned, every switch off. Move it when ADX is ready to go there." });
            onAdded(city);
            onClose();
        } catch (cause) {
            setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "The city could not be added.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>Add a city</DialogTitle>
                <DialogDescription>For a place the GeoNames cut lacks. It is added Planned with every switch off, under the state you name; the point is where the map pins it.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="add-city-name">Name</Label>
                    <Input id="add-city-name" value={draft.name} onChange={(event) => set("name", event.target.value)} placeholder="Navi Mumbai" autoFocus maxLength={120} />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="add-city-state">State</Label>
                    <Select value={draft.stateCode} onValueChange={(value) => setDraft((current) => ({ ...current, stateCode: value, districtCode: "" }))}>
                        <SelectTrigger id="add-city-state" className="h-9">
                            <SelectValue placeholder="Choose" />
                        </SelectTrigger>
                        <SelectContent>
                            {states.map((state) => (
                                <SelectItem key={state.code} value={state.code}>
                                    {state.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="add-city-district">District</Label>
                    <Select value={draft.districtCode || NO_DISTRICT} onValueChange={(value) => set("districtCode", value === NO_DISTRICT ? "" : value)} disabled={!draft.stateCode}>
                        <SelectTrigger id="add-city-district" className="h-9">
                            <SelectValue placeholder="Optional" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={NO_DISTRICT}>None</SelectItem>
                            {(districts.data?.items ?? []).map((district) => (
                                <SelectItem key={district.id} value={district.code}>
                                    {district.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {/* AD-C: where the map pins the city — searched, dragged or typed; the body still carries `lat` and `lng`. */}
                <PinPicker
                    id="add-city"
                    className="sm:col-span-2"
                    latitude={draft.lat}
                    longitude={draft.lng}
                    onChange={(next) => setDraft((current) => ({ ...current, lat: next.latitude, lng: next.longitude }))}
                    title={draft.name.trim() || "The city"}
                    labels={{ search: "Find the city" }}
                    placeholders={{ search: "Search the city or a landmark in it", latitude: "19.0330", longitude: "73.0297" }}
                />
                <div className="space-y-1.5">
                    <Label htmlFor="add-city-kind">Kind</Label>
                    <Select value={draft.kind || "TOWN"} onValueChange={(value) => set("kind", value as CityKind)}>
                        <SelectTrigger id="add-city-kind" className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {CITY_KINDS.map((kind) => (
                                <SelectItem key={kind} value={kind}>
                                    {CITY_KIND_LABEL[kind]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="add-city-population">Population</Label>
                    <Input id="add-city-population" inputMode="numeric" value={draft.population} onChange={(event) => set("population", event.target.value)} placeholder="Optional" className="tabular-nums" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="add-city-aliases">Also written as</Label>
                    <Input id="add-city-aliases" value={draft.aliases} onChange={(event) => set("aliases", event.target.value)} placeholder="Comma-separated, optional" />
                </div>
            </div>
            {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button type="submit" disabled={!body || busy}>
                    {busy ? "Adding…" : "Add city"}
                </Button>
            </DialogFooter>
        </form>
    );
}
