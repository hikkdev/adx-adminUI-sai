"use client";

import * as React from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import {
    MAPS_PROVIDERS,
    MAPS_PROVIDER_LABEL,
    OSM_PUBLIC_TILES_WARNING,
    integrationsService,
    isPublicOsmTileTemplate,
    mapsSectionPatch,
    osmDraftOf,
    parseTileMaxZoom,
    phoneEngineTokenPresent,
    tileTemplateProblem,
    type MapsProvider,
    type MapsSettings,
    type OsmDraft,
    type OsmSettings,
} from "@/services/integrations";

interface MapsSectionProps {
    /** The `maps` section as `GET /integrations` sent it — every key masked. Undefined on a backend older than G7. */
    stored: MapsSettings | undefined;
    onChanged: () => void;
}

interface KeyField {
    key: keyof Omit<MapsSettings, "provider" | "osm">;
    label: string;
    helper: string;
    placeholder: string;
}

const MAPBOX_PUBLIC_TOKEN_FIELD: KeyField = {
    key: "mapboxPublicToken",
    label: "Public token",
    helper: "What the console and the phones draw tiles with; published by GET /app/maps.",
    placeholder: "pk.…",
};

/**
 * Two keys per keyed vendor: the one the browser and the phones draw tiles
 * with, and the one only the server spends. OSM has no key of its own — its
 * form is `OsmFields` — but AC-B1: the phones draw OpenStreetMap through
 * the Mapbox SDK, which needs the Mapbox PUBLIC token to initialise, so
 * that one field is reachable under OSM too (the secret token is not: the
 * backend never spends it on this branch).
 */
const FIELDS: Record<MapsProvider, KeyField[]> = {
    GOOGLE: [
        { key: "googleBrowserKey", label: "Browser key", helper: "What the console and the phones draw tiles with — restricted by referrer and bundle id; published by GET /app/maps.", placeholder: "AIza…" },
        { key: "googleServerKey", label: "Server key", helper: "Geocoding and directions — restricted by IP; never leaves the backend.", placeholder: "AIza…" },
    ],
    MAPBOX: [MAPBOX_PUBLIC_TOKEN_FIELD, { key: "mapboxSecretToken", label: "Secret token", helper: "Geocoding and directions — never leaves the backend.", placeholder: "sk.…" }],
    OSM: [
        {
            ...MAPBOX_PUBLIC_TOKEN_FIELD,
            label: "Mapbox public token (for the phones)",
            helper: "The apps draw OpenStreetMap tiles through the Mapbox engine and need this token to start it; the console and the backend do not. Published by GET /app/maps beside the tile template.",
        },
    ],
};

interface OsmField {
    key: Exclude<keyof OsmDraft, "tileApiKey">;
    label: string;
    helper: string;
    /** Spans both columns. */
    wide?: boolean;
    required?: boolean;
    inputMode?: "numeric";
}

/** The OSM form — the three services, the policy's contact line, the tile line. The tile key is drawn apart, as the one secret. */
const OSM_FIELDS: OsmField[] = [
    { key: "contactEmail", label: "Contact email", helper: "Required: the public Nominatim usage policy wants a contact on every request, and the backend sends it. Selecting OpenStreetMap without one is refused.", required: true },
    { key: "userAgent", label: "User-Agent", helper: "Sent with every Nominatim request; blank means ADX/<version> (<contact email>)." },
    { key: "nominatimBaseUrl", label: "Nominatim (geocoding)", helper: "The public host allows one request a second and no bulk geocoding — the backend meters it. A self-hosted or commercial Nominatim is uncapped here." },
    { key: "osrmBaseUrl", label: "OSRM (directions)", helper: "The public demo router is for testing only; point production at a self-hosted or OSRM-compatible host." },
    { key: "photonBaseUrl", label: "Photon (autocomplete)", helper: "Address suggestions as the operator types." },
    { key: "tileUrlTemplate", label: "Tile template", helper: "An http(s) URL carrying {z}, {x} and {y}; {key} where the vendor wants the tile key in the path. What the console and the phones draw tiles from — published by GET /app/maps.", wide: true },
    { key: "tileAttribution", label: "Attribution", helper: "Printed on every map; OpenStreetMap's licence requires it." },
    { key: "tileMaxZoom", label: "Max zoom", helper: "The deepest zoom the tiles go, 1–22.", inputMode: "numeric" },
];

/**
 * The frame's "Google Maps Platform" card (5102:48770), widened into the
 * maps seam — G7 (Q101/132/137), package CG4 (Q132): the provider
 * switch (Google | Mapbox | OpenStreetMap) and, for the provider chosen,
 * its fields. Google and Mapbox have a browser / public key and a server /
 * secret key, all masked on read and never round-tripped. Z-C: OpenStreetMap
 * has no key but three usage policies, and the card is shaped around
 * them — the contact email the public Nominatim requires (the backend
 * refuses OSM without it, and the card says so before and after the
 * round trip), the three service URLs, and the tile line with the
 * public-tiles warning while the template still names
 * tile.openstreetmap.org. Written to the `maps` section of
 * `PUT /integrations` as a diff — only what moved, the `osm` sub-object
 * merged over the stored one on the server; a provider change is audited
 * `MAPS_PROVIDER_CHANGED` beside the usual row, never with a key.
 *
 * The pre-G7 `googleMaps.apiKey` row shows through as the Google server
 * key's fallback on the server, so the card shows what the backend would
 * actually spend.
 *
 * AC-C over AC-B1: under OpenStreetMap the phones still run the Mapbox
 * engine, so the OSM block carries a "Phones" line — Present / Missing on
 * the Mapbox public token, from the read's `phoneEngine.tokenPresent` (or
 * the masked token while OSM is only picked, not yet saved) — and the
 * public token field itself, so a missing token is fixed on the same card
 * without switching provider.
 */
export function MapsSection({ stored, onChanged }: MapsSectionProps) {
    if (!stored) {
        return (
            <SectionCard title="Maps" description="The provider behind the inventory map and every address the console draws.">
                <p className="text-sm text-muted-foreground">
                    This backend does not serve the <code className="rounded bg-muted px-1 py-0.5 text-xs">maps</code> section, so the provider and its
                    keys cannot be read or edited here.
                </p>
            </SectionCard>
        );
    }
    return <MapsForm key={JSON.stringify(stored)} stored={stored} onChanged={onChanged} />;
}

/** The OSM line that says whether the section can be chosen and what still stands in the way. */
function osmProblem(draft: OsmDraft): string | null {
    if (!draft.contactEmail.trim()) return "OpenStreetMap needs a contact email — the public Nominatim usage policy requires one on every request.";
    const template = tileTemplateProblem(draft.tileUrlTemplate);
    if (template) return template;
    if (draft.tileMaxZoom.trim() && parseTileMaxZoom(draft.tileMaxZoom) === null) return "Max zoom is a whole number from 1 to 22.";
    return null;
}

function MapsForm({ stored, onChanged }: { stored: MapsSettings; onChanged: () => void }) {
    const [provider, setProvider] = React.useState<MapsProvider>(stored.provider);
    const [typed, setTyped] = React.useState<Record<string, string>>({});
    const [osm, setOsm] = React.useState<OsmDraft | null>(stored.osm ? osmDraftOf(stored.osm) : null);
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
    const [busy, setBusy] = React.useState(false);

    /* A backend older than Z-B answers no `osm`: the option is listed only where its fields can be read and written. */
    const providers = MAPS_PROVIDERS.filter((option) => option !== "OSM" || Boolean(stored.osm));
    const patch = mapsSectionPatch(stored, provider, typed, osm);
    const dirty = Object.keys(patch).length > 0;
    const problem = provider === "OSM" && osm ? osmProblem(osm) : null;

    const browserKey = provider === "GOOGLE" ? stored.googleBrowserKey : provider === "MAPBOX" ? stored.mapboxPublicToken : null;
    const serverKey = provider === "GOOGLE" ? stored.googleServerKey : provider === "MAPBOX" ? stored.mapboxSecretToken : null;
    const configured = provider === "OSM" ? Boolean(stored.osm?.contactEmail) : Boolean(browserKey) || Boolean(serverKey);
    /* By the backend's own rule, as typed; an emptied template goes back to the default, which is the public server. */
    const publicTiles = provider === "OSM" && osm ? !osm.tileUrlTemplate.trim() || isPublicOsmTileTemplate(osm.tileUrlTemplate) : false;
    /* AC-B1: the phones' engine under OSM wants the Mapbox public token — as stored, or as typed just now. */
    const phoneTokenPresent = phoneEngineTokenPresent(stored) || Boolean(typed.mapboxPublicToken?.trim());

    const save = async () => {
        setBusy(true);
        setFieldErrors({});
        try {
            await integrationsService.update("maps", patch);
            toast.success("Maps saved", {
                description:
                    provider === "OSM"
                        ? "OpenStreetMap draws the map from now on. The audit trail records the field names, never a key."
                        : `${MAPS_PROVIDER_LABEL[provider]} draws the map from now on. Keys are stored masked; the audit trail records the field names, never the values.`,
            });
            setTyped({});
            onChanged();
        } catch (error) {
            if (error instanceof ApiError && Object.keys(error.fieldErrors).length) setFieldErrors(error.fieldErrors);
            toast.error(error instanceof Error ? error.message : "Could not save the maps settings.");
        } finally {
            setBusy(false);
        }
    };

    const discard = () => {
        setTyped({});
        setProvider(stored.provider);
        setOsm(stored.osm ? osmDraftOf(stored.osm) : null);
        setFieldErrors({});
    };

    return (
        <SectionCard title="Maps" description="The provider behind the inventory map and every address the console draws.">
            <div className="flex flex-col gap-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">{MAPS_PROVIDER_LABEL[stored.provider]}</p>
                            <StatusBadge status={configured ? { label: "Connected", tone: "success" } : { label: "Not connected", tone: "neutral" }} />
                            {provider !== "OSM" && !browserKey && <StatusBadge status={{ label: "No browser key", tone: "warning" }} />}
                            {provider !== "OSM" && !serverKey && <StatusBadge status={{ label: "No server key", tone: "warning" }} />}
                            {provider === "OSM" && !stored.osm?.contactEmail && <StatusBadge status={{ label: "No contact email", tone: "warning" }} />}
                            {provider === "OSM" && !phoneTokenPresent && <StatusBadge status={{ label: "Phones: no Mapbox token", tone: "warning" }} />}
                            {publicTiles && <StatusBadge status={{ label: "Public tiles", tone: "warning" }} />}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {provider === "OSM" ? "Nominatim geocodes, OSRM routes, Photon completes; raster tiles for the inventory map" : "Geocoding and map tiles for the inventory map"}
                        </p>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                        <Label htmlFor="maps-provider" className="text-xs">
                            Provider
                        </Label>
                        <Select value={provider} onValueChange={(value) => setProvider(value as MapsProvider)}>
                            <SelectTrigger id="maps-provider" className="sm:w-1/2">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {providers.map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {MAPS_PROVIDER_LABEL[option]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                            Switching vendors is audited on its own. Every vendor&apos;s keys and settings are kept, so switching back costs nothing.
                        </p>
                    </div>

                    {FIELDS[provider].map((field) => {
                        const id = `maps-${field.key}`;
                        const set = Boolean(stored[field.key]);
                        return (
                            <div key={field.key} className="space-y-1">
                                <Label htmlFor={id} className="text-xs">
                                    {field.label}
                                </Label>
                                <Input
                                    id={id}
                                    value={typed[field.key] ?? ""}
                                    autoComplete="off"
                                    placeholder={set ? String(stored[field.key]) : field.placeholder}
                                    className={set && !typed[field.key] ? "placeholder:font-mono" : undefined}
                                    onChange={(event) => setTyped((current) => ({ ...current, [field.key]: event.target.value }))}
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    {set ? "Stored. Type a new value to replace it; leave it blank to keep it. " : "Not set. "}
                                    {field.helper}
                                </p>
                            </div>
                        );
                    })}

                    {provider === "OSM" && osm && stored.osm && (
                        <>
                            <OsmFields stored={stored.osm} draft={osm} onChange={setOsm} fieldErrors={fieldErrors} publicTiles={publicTiles} busy={busy} />
                            <PhonesLine tokenPresent={phoneTokenPresent} />
                        </>
                    )}
                </div>

                <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-1">
                    {problem && (
                        <p className="mr-auto text-xs text-danger" data-testid="maps-problem">
                            {problem}
                        </p>
                    )}
                    {dirty && (
                        <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={discard}>
                            Discard
                        </Button>
                    )}
                    <Button size="sm" className="h-8" disabled={!dirty || busy || Boolean(problem)} onClick={() => void save()}>
                        Save maps
                    </Button>
                </div>
            </div>
        </SectionCard>
    );
}

/**
 * AC-B1: the phones draw OpenStreetMap through the Mapbox SDK, which needs
 * the Mapbox public token to initialise. Present / Missing from the read's
 * verdict; when missing, the line points at the token field on this card.
 */
function PhonesLine({ tokenPresent }: { tokenPresent: boolean }) {
    return (
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs" data-testid="osm-phones">
            <span className="font-medium text-foreground">Phones</span>
            <StatusBadge status={tokenPresent ? { label: "Present", tone: "success" } : { label: "Missing", tone: "warning" }} />
            <span className="text-muted-foreground">The apps draw OpenStreetMap through the Mapbox engine and need the Mapbox public token.</span>
            {!tokenPresent && (
                <a
                    href="#maps-mapboxPublicToken"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                    onClick={(event) => {
                        event.preventDefault();
                        const input = document.getElementById("maps-mapboxPublicToken");
                        input?.scrollIntoView?.({ behavior: "smooth", block: "center" });
                        input?.focus();
                    }}
                >
                    Add the token above
                </a>
            )}
        </div>
    );
}

/**
 * The OpenStreetMap form: every field starts as the section in force
 * (the read fills the defaults in), an emptied field goes back to its
 * default on save, and the tile key — the one secret — is blank until a
 * new one is typed. The public-tiles warning follows the template as it
 * is typed, by the backend's own rule.
 */
function OsmFields({
    stored,
    draft,
    onChange,
    fieldErrors,
    publicTiles,
    busy,
}: {
    stored: OsmSettings;
    draft: OsmDraft;
    onChange: (draft: OsmDraft) => void;
    /** The backend's refusal by field, `osm.<field>`, when there was one. */
    fieldErrors: Record<string, string[]>;
    publicTiles: boolean;
    busy: boolean;
}) {
    const keySet = Boolean(stored.tileApiKey);
    return (
        <>
            <div className="sm:col-span-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground" data-testid="osm-policies">
                <p className="font-medium text-foreground">OpenStreetMap has no key — it has usage policies.</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    <li>The public Nominatim allows one request a second, wants a User-Agent naming the app and a contact email, and forbids bulk geocoding.</li>
                    <li>The public OSRM demo router is for testing only.</li>
                    <li>The public tile server forbids heavy app use, and the attribution must be printed on every map.</li>
                </ul>
            </div>
            {OSM_FIELDS.map((field) => {
                const id = `maps-osm-${field.key}`;
                const errors = fieldErrors[`osm.${field.key}`];
                return (
                    <div key={field.key} className={field.wide ? "space-y-1 sm:col-span-2" : "space-y-1"}>
                        <Label htmlFor={id} className="text-xs">
                            {field.label}
                            {field.required && <span className="text-danger"> *</span>}
                        </Label>
                        <Input
                            id={id}
                            value={draft[field.key]}
                            autoComplete="off"
                            inputMode={field.inputMode}
                            disabled={busy}
                            aria-invalid={errors?.length ? true : undefined}
                            onChange={(event) => onChange({ ...draft, [field.key]: event.target.value })}
                        />
                        {errors?.[0] && (
                            <p className="text-xs text-danger" data-testid={`osm-error-${field.key}`}>
                                {errors[0]}
                            </p>
                        )}
                        {field.key === "tileUrlTemplate" && publicTiles && (
                            <p className="flex items-start gap-1 text-[11px] text-warning" data-testid="osm-public-tiles">
                                <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                                {OSM_PUBLIC_TILES_WARNING}
                            </p>
                        )}
                        <p className="text-[11px] text-muted-foreground">{field.helper}</p>
                    </div>
                );
            })}
            <div className="space-y-1">
                <Label htmlFor="maps-osm-tileApiKey" className="text-xs">
                    Tile key
                </Label>
                <Input
                    id="maps-osm-tileApiKey"
                    value={draft.tileApiKey}
                    autoComplete="off"
                    disabled={busy}
                    placeholder={keySet ? String(stored.tileApiKey) : "Only if the tile host wants one"}
                    className={keySet && !draft.tileApiKey ? "placeholder:font-mono" : undefined}
                    onChange={(event) => onChange({ ...draft, tileApiKey: event.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">
                    {keySet ? "Stored. Type a new value to replace it; leave it blank to keep it. " : "Not set. "}
                    A MapTiler, Stadia, Thunderforest or Geoapify key is a browser key by design and is put into the template the clients receive; for any other host it
                    stays on the server.
                </p>
            </div>
        </>
    );
}
