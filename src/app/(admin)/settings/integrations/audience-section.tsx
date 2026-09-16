"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import {
    AUDIENCE_FOOTFALL_BLENDS,
    AUDIENCE_FOOTFALL_BLEND_LABEL,
    AUDIENCE_GROUPS,
    AUDIENCE_GROUP_FIELDS,
    AUDIENCE_GROUP_LABEL,
    AUDIENCE_VENDORS,
    AUDIENCE_VENDOR_LABEL,
    AUDIENCE_VENDOR_NATURE,
    GEOIQ_CATALOGUE_URL,
    GEOIQ_DEFAULT_BASE_URL,
    affinityRowsOf,
    audiencePolicyPreview,
    audienceTestBadge,
    audienceTestKind,
    audienceTestSentence,
    audienceVendorsLabel,
    extraFieldsOf,
    geoiqVariablesProblem,
    type AffinityRow,
    type AudienceFieldDescriptor,
    type AudienceFieldsCatalogue,
    type AudienceFootfallBlend,
    type AudienceGroup,
    type AudiencePolicy,
    type AudienceVendor,
    type AudienceVendorTest,
} from "@/services/audience";
import {
    audiencePolicyOf,
    audienceProvidersOf,
    audienceSectionPatch,
    audienceVendorConfigured,
    integrationsService,
    parseRadius,
    type AudienceSettings,
} from "@/services/integrations";

interface AudienceSectionProps {
    /** The `audience` section as `GET /integrations` sent it — the two keys masked. Undefined on a backend older than G7. */
    stored: AudienceSettings | undefined;
    onChanged: () => void;
}

/**
 * G7 (Q109) / Y-B / Y-C: the audience data vendors beside the maps seam.
 * The owner (15 Sep 2026): both GeoIQ and Azira at once, for rich data on
 * the audience in a geography. So the card is two switches — one per
 * vendor, each with its credentials and whether the seam can actually
 * call it — the catchment radius every spot is asked about, and the blend
 * policy: per field group the primary vendor, whether the other fills a
 * null, and for footfall whether two figures are averaged; one line
 * under it says what the seam will do. Written to the `audience` section
 * of `PUT /integrations` as a diff (the set whole when it changed, the
 * policy per key, a key only when typed); a change of set or policy is
 * audited `AUDIENCE_PROVIDER_CHANGED` with both, never a key.
 *
 * AC-C over AC-B2 (16 Sep 2026): the GeoIQ variable map is EDITED here —
 * one row per seam field from `GET /integrations/audience/fields` (label,
 * field key, the account's catalogue id; blank = unmapped), the affinity
 * group as an add-a-row list. The ids are account-specific and live in
 * the account's GeoIQ catalogue, never guessed. The map is one record, so
 * it travels whole when anything in it moved, blanks left out. And each
 * vendor has a Test button — `POST /integrations/audience/test` asks the
 * vendor once with the stored key and the verdict is printed inline,
 * GeoIQ's own sentence verbatim, so "the key is stored but the vendor
 * refuses it" is said plainly rather than left to a null on a spot.
 */
export function AudienceSection({ stored, onChanged }: AudienceSectionProps) {
    if (!stored) {
        return (
            <SectionCard title="Audience data" description="The footfall and demographics panels behind a spot's audience figures.">
                <p className="text-sm text-muted-foreground">
                    This backend does not serve the <code className="rounded bg-muted px-1 py-0.5 text-xs">audience</code> section, so the vendors
                    cannot be read or edited here.
                </p>
            </SectionCard>
        );
    }
    return <AudienceForm key={JSON.stringify(stored)} stored={stored} onChanged={onChanged} />;
}

/** The secret plus the fields the seam wants beside it, per vendor. */
const VENDOR_FIELDS: Record<AudienceVendor, { key: string; label: string; helper: string; secret?: boolean; placeholder?: string }[]> = {
    GEOIQ: [
        { key: "geoiqApiKey", label: "GeoIQ API key", helper: "", secret: true },
        {
            key: "geoiqBaseUrl",
            label: "GeoIQ base URL",
            helper: "The host the account was sold on. Blank means the India data-serving host, which is the default.",
            placeholder: GEOIQ_DEFAULT_BASE_URL,
        },
    ],
    AZIRA: [
        { key: "aziraApiKey", label: "Azira API key", helper: "", secret: true },
        { key: "aziraClientId", label: "Azira client id", helper: "As the contract names it." },
        { key: "aziraBaseUrl", label: "Azira base URL", helper: "No public default host; from the contract. Without it the vendor is skipped.", placeholder: "https://…" },
    ],
};

/** Why a vendor is not configured, in the adapter's own terms. */
function notConfiguredReason(stored: AudienceSettings, vendor: AudienceVendor): string {
    if (vendor === "GEOIQ") {
        if (!stored.geoiqApiKey) return "No API key";
        return "No catalogue id mapped";
    }
    if (!stored.aziraApiKey) return "No API key";
    return "No base URL";
}

/** The named rows of the stored map, keyed by seam field — every catalogue row present, blank where unmapped. */
function namedOf(stored: AudienceSettings, fields: readonly AudienceFieldDescriptor[]): Record<string, string> {
    const named: Record<string, string> = {};
    for (const row of fields) named[row.field] = stored.geoiqVariables?.[row.field] ?? "";
    return named;
}

type FieldsRead = { state: "loading" } | { state: "ready"; catalogue: AudienceFieldsCatalogue } | { state: "failed"; reason: string };

function AudienceForm({ stored, onChanged }: { stored: AudienceSettings; onChanged: () => void }) {
    const [providers, setProviders] = React.useState<AudienceVendor[]>(() => audienceProvidersOf(stored));
    const [policy, setPolicy] = React.useState<AudiencePolicy>(() => audiencePolicyOf(stored));
    const [typed, setTyped] = React.useState<Record<string, string>>({});
    const [radius, setRadius] = React.useState(String(stored.catchmentRadiusM));
    const [busy, setBusy] = React.useState(false);

    /* AC-C: the field catalogue the variable map is drawn from, read once per mount. */
    const [fields, setFields] = React.useState<FieldsRead>({ state: "loading" });
    const [named, setNamed] = React.useState<Record<string, string> | null>(null);
    const [affinities, setAffinities] = React.useState<AffinityRow[]>(() => affinityRowsOf(stored.geoiqVariables));
    const [verdicts, setVerdicts] = React.useState<Partial<Record<AudienceVendor, AudienceVendorTest>>>({});
    const [testing, setTesting] = React.useState<AudienceVendor | null>(null);

    /* Read once per mount — the form is keyed on the stored section, so a new read remounts it rather than re-running this over edits. */
    const mounted = React.useRef(stored);
    React.useEffect(() => {
        let alive = true;
        const at = mounted.current;
        integrationsService
            .audienceFields()
            .then((catalogue) => {
                if (!alive) return;
                const rows = [...catalogue.fields, ...extraFieldsOf(at.geoiqVariables, catalogue.fields)];
                setFields({ state: "ready", catalogue: { ...catalogue, fields: rows } });
                setNamed(namedOf(at, rows));
            })
            .catch((error: unknown) => {
                if (alive) setFields({ state: "failed", reason: error instanceof Error ? error.message : "The field catalogue could not be read." });
            });
        return () => {
            alive = false;
        };
    }, []);

    const variables = named ? { named, affinities } : undefined;
    const patch = audienceSectionPatch(stored, { providers, policy, radius, typed, variables });
    const dirty = Object.keys(patch).length > 0;
    const variablesProblem = named ? geoiqVariablesProblem(affinities) : null;
    const valid = parseRadius(radius) !== null && !variablesProblem;
    const storedProviders = audienceProvidersOf(stored);

    const toggleVendor = (vendor: AudienceVendor, on: boolean) =>
        setProviders((state) => AUDIENCE_VENDORS.filter((candidate) => (candidate === vendor ? on : state.includes(candidate))));

    const setGroup = <G extends AudienceGroup>(group: G, change: Partial<AudiencePolicy[G]>) =>
        setPolicy((state) => ({ ...state, [group]: { ...state[group], ...change } }));

    const discard = () => {
        setTyped({});
        setProviders(storedProviders);
        setPolicy(audiencePolicyOf(stored));
        setRadius(String(stored.catchmentRadiusM));
        if (fields.state === "ready") setNamed(namedOf(stored, fields.catalogue.fields));
        setAffinities(affinityRowsOf(stored.geoiqVariables));
    };

    const save = async () => {
        setBusy(true);
        try {
            await integrationsService.update("audience", patch);
            toast.success("Audience data saved", {
                description:
                    providers.length === 0
                        ? "No panel backs an audience figure; the analytics say so rather than draw one."
                        : `${audienceVendorsLabel(providers)} answer${providers.length === 1 ? "s" : ""} from now on; stored panels are re-blended on the next read. Keys are stored masked; the audit trail records the set and the policy, never a key.`,
            });
            setTyped({});
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not save the audience settings.");
        } finally {
            setBusy(false);
        }
    };

    const test = async (vendor: AudienceVendor) => {
        setTesting(vendor);
        try {
            const verdict = await integrationsService.testAudienceVendor(vendor);
            setVerdicts((state) => ({ ...state, [vendor]: verdict }));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : `Could not test ${AUDIENCE_VENDOR_LABEL[vendor]}.`);
        } finally {
            setTesting(null);
        }
    };

    const field = ({ key, label, helper, secret, placeholder }: (typeof VENDOR_FIELDS)[AudienceVendor][number]) => {
        const id = `audience-${key}`;
        const current = stored[key as keyof AudienceSettings];
        const set = current !== null && current !== undefined && current !== "";
        return (
            <div key={key} className="space-y-1">
                <Label htmlFor={id} className="text-xs">
                    {label}
                </Label>
                <Input
                    id={id}
                    value={typed[key] ?? (secret ? "" : String(current ?? ""))}
                    autoComplete="off"
                    placeholder={secret && set ? String(current) : placeholder}
                    onChange={(event) => setTyped((state) => ({ ...state, [key]: event.target.value }))}
                />
                <p className="text-[11px] text-muted-foreground">
                    {secret ? (set ? "Stored. Type a new value to replace it; leave it blank to keep it. " : "Not set. ") : ""}
                    {helper}
                </p>
            </div>
        );
    };

    const vendorSelect = (id: string, value: AudienceVendor, onChange: (vendor: AudienceVendor) => void) => (
        <Select value={value} onValueChange={(next) => onChange(next as AudienceVendor)}>
            <SelectTrigger id={id} className="h-8 text-xs">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {AUDIENCE_VENDORS.map((vendor) => (
                    <SelectItem key={vendor} value={vendor}>
                        {AUDIENCE_VENDOR_LABEL[vendor]}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );

    /** The key the test would spend: stored on the server. A key typed but not yet saved is not one the backend can use. */
    const keyStored = (vendor: AudienceVendor) => Boolean(vendor === "GEOIQ" ? stored.geoiqApiKey : stored.aziraApiKey);

    return (
        <SectionCard
            title="Audience data"
            description="The footfall and demographics panels behind a spot's audience figures. Both vendors at once give the richest picture; none means the analytics say no panel backs them."
        >
            <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{audienceVendorsLabel(storedProviders)}</p>
                    <StatusBadge
                        status={
                            storedProviders.length === 0
                                ? { label: "Off", tone: "neutral" }
                                : storedProviders.every((vendor) => audienceVendorConfigured(stored, vendor))
                                  ? { label: "Connected", tone: "success" }
                                  : { label: "Not fully configured", tone: "warning" }
                        }
                    />
                </div>

                {/* The two vendors */}
                <div className="grid gap-3 lg:grid-cols-2">
                    {AUDIENCE_VENDORS.map((vendor) => {
                        const on = providers.includes(vendor);
                        const configured = audienceVendorConfigured(stored, vendor);
                        const reason = notConfiguredReason(stored, vendor);
                        const verdict = verdicts[vendor];
                        return (
                            <div key={vendor} className="flex flex-col gap-3 rounded-lg border p-4" data-testid={`vendor-${vendor}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-semibold text-foreground">{AUDIENCE_VENDOR_LABEL[vendor]}</p>
                                            {configured ? (
                                                <StatusBadge status={{ label: "Configured", tone: "success" }} />
                                            ) : vendor === "GEOIQ" && reason === "No catalogue id mapped" && on ? (
                                                <a
                                                    href="#audience-variable-map"
                                                    className="inline-flex"
                                                    data-testid="geoiq-map-link"
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        const block = document.getElementById("audience-variable-map");
                                                        block?.scrollIntoView?.({ behavior: "smooth", block: "center" });
                                                        block?.querySelector("input")?.focus();
                                                    }}
                                                >
                                                    <StatusBadge status={{ label: reason, tone: "warning" }} />
                                                </a>
                                            ) : (
                                                <StatusBadge status={{ label: reason, tone: on ? "warning" : "neutral" }} />
                                            )}
                                        </div>
                                        <p className="mt-1 text-xs text-muted-foreground">{AUDIENCE_VENDOR_NATURE[vendor]}</p>
                                    </div>
                                    <Switch checked={on} onCheckedChange={(value) => toggleVendor(vendor, value)} aria-label={`${AUDIENCE_VENDOR_LABEL[vendor]} on`} />
                                </div>
                                {on && (
                                    <div className="grid gap-3">
                                        {VENDOR_FIELDS[vendor].map(field)}
                                        {vendor === "GEOIQ" && (
                                            <VariableMap
                                                fields={fields}
                                                named={named}
                                                affinities={affinities}
                                                onNamed={(fieldKey, id) => setNamed((state) => ({ ...(state ?? {}), [fieldKey]: id }))}
                                                onAffinities={setAffinities}
                                                problem={variablesProblem}
                                                busy={busy}
                                            />
                                        )}
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8"
                                                disabled={!keyStored(vendor) || testing !== null}
                                                onClick={() => void test(vendor)}
                                            >
                                                {testing === vendor ? "Testing…" : `Test ${AUDIENCE_VENDOR_LABEL[vendor]}`}
                                            </Button>
                                            <span className="text-[11px] text-muted-foreground">
                                                {keyStored(vendor)
                                                    ? "Asks the vendor once, at a fixed point in Bengaluru, with the stored key. Audited; the key never leaves the backend."
                                                    : "Save a key first — the test spends the stored one."}
                                            </span>
                                        </div>
                                        {verdict && <Verdict verdict={verdict} />}
                                    </div>
                                )}
                                {!on && configured && <p className="text-[11px] text-muted-foreground">Credentials stay on file while the vendor is off.</p>}
                            </div>
                        );
                    })}
                </div>

                {/* The circle */}
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                        <Label htmlFor="audience-radius" className="text-xs">
                            Catchment radius (m)
                        </Label>
                        <Input
                            id="audience-radius"
                            inputMode="numeric"
                            value={radius}
                            onChange={(event) => setRadius(event.target.value)}
                            aria-invalid={parseRadius(radius) === null}
                        />
                        <p className="text-[11px] text-muted-foreground">
                            {parseRadius(radius) !== null
                                ? "The circle every spot is asked about, by every vendor, so two spots' figures compare. GeoIQ answers 100–2,000 m and clamps the rest."
                                : "A whole number from 50 to 5,000."}
                        </p>
                    </div>
                </div>

                {/* The policy */}
                <div className="rounded-lg border p-4" data-testid="audience-policy">
                    <p className="text-sm font-semibold text-foreground">Blend policy</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Per field group: whose figure is printed, whether the other vendor fills a gap, and for footfall whether two figures are averaged. Stored panels are
                        re-blended on the next read — a change here calls no vendor.
                    </p>
                    <div className="mt-3 divide-y">
                        {AUDIENCE_GROUPS.map((group) => {
                            const rule = policy[group];
                            return (
                                <div key={group} className="grid gap-3 py-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end" data-testid={`policy-${group}`}>
                                    <div>
                                        <p className="text-sm font-medium text-foreground">{AUDIENCE_GROUP_LABEL[group]}</p>
                                        <p className="text-[11px] text-muted-foreground">{AUDIENCE_GROUP_FIELDS[group]}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor={`policy-${group}-primary`} className="text-[11px]">
                                            Primary
                                        </Label>
                                        {vendorSelect(`policy-${group}-primary`, rule.primary, (primary) => setGroup(group, { primary }))}
                                    </div>
                                    <div className="flex items-center gap-2 pb-1">
                                        <Switch
                                            id={`policy-${group}-fallback`}
                                            checked={rule.fallback}
                                            onCheckedChange={(fallback) => setGroup(group, { fallback })}
                                            aria-label={`${AUDIENCE_GROUP_LABEL[group]} fallback`}
                                        />
                                        <Label htmlFor={`policy-${group}-fallback`} className="text-[11px]">
                                            Other fills a gap
                                        </Label>
                                    </div>
                                    {group === "footfall" ? (
                                        <div className="space-y-1">
                                            <Label htmlFor="policy-footfall-blend" className="text-[11px]">
                                                When both answer
                                            </Label>
                                            <Select value={policy.footfall.blend} onValueChange={(blend) => setGroup("footfall", { blend: blend as AudienceFootfallBlend })}>
                                                <SelectTrigger id="policy-footfall-blend" className="h-8 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {AUDIENCE_FOOTFALL_BLENDS.map((blend) => (
                                                        <SelectItem key={blend} value={blend}>
                                                            {AUDIENCE_FOOTFALL_BLEND_LABEL[blend]}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    ) : (
                                        <div className="hidden sm:block" aria-hidden />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <p className="mt-3 rounded-md bg-muted/40 p-2.5 text-xs text-foreground" data-testid="policy-preview">
                        {audiencePolicyPreview(policy, providers)}
                    </p>
                </div>

                <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-1">
                    {variablesProblem && (
                        <p className="mr-auto text-xs text-danger" data-testid="audience-problem">
                            {variablesProblem}
                        </p>
                    )}
                    {dirty && (
                        <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={discard}>
                            Discard
                        </Button>
                    )}
                    <Button size="sm" className="h-8" disabled={!dirty || !valid || busy} onClick={() => void save()}>
                        Save audience data
                    </Button>
                </div>
            </div>
        </SectionCard>
    );
}

/**
 * The GeoIQ variable map as rows: one per seam field from the catalogue
 * (grouped as the backend groups them), the id as a text input — blank
 * means unmapped, and an unmapped field answers null, never a guess — and
 * the affinity group as an add-a-row list of name + id. The ids are the
 * account's own, from its GeoIQ catalogue.
 */
function VariableMap({
    fields,
    named,
    affinities,
    onNamed,
    onAffinities,
    problem,
    busy,
}: {
    fields: FieldsRead;
    named: Record<string, string> | null;
    affinities: AffinityRow[];
    onNamed: (field: string, id: string) => void;
    onAffinities: (rows: AffinityRow[]) => void;
    problem: string | null;
    busy: boolean;
}) {
    return (
        <div className="rounded-md bg-muted/40 p-3" id="audience-variable-map" data-testid="geoiq-variable-map">
            <p className="text-xs font-medium text-foreground">Variable map</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
                The seam&apos;s field names to the catalogue ids this account bought. A field with no id answers nothing; with none mapped the vendor is skipped.
                A wrong id here is a wrong number on every spot.
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground" data-testid="geoiq-where-ids">
                Where to find ids: the account&apos;s GeoIQ catalogue at{" "}
                <a href={GEOIQ_CATALOGUE_URL} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">
                    catalog.geoiq.io
                </a>{" "}
                — the ids are specific to the account and are never guessed.
            </p>

            {fields.state === "loading" && <p className="mt-2 text-xs text-muted-foreground">Reading the field catalogue…</p>}
            {fields.state === "failed" && (
                <p className="mt-2 text-xs text-danger" data-testid="geoiq-fields-failed">
                    The field catalogue could not be read, so the map cannot be edited here: {fields.reason}
                </p>
            )}
            {fields.state === "ready" && named && (
                <div className="mt-2 flex flex-col gap-3">
                    {fields.catalogue.groups
                        .filter((group) => !group.freeForm)
                        .map((group) => {
                            const rows = fields.catalogue.fields.filter((row) => row.group === group.group);
                            if (!rows.length) return null;
                            return (
                                <div key={group.group} data-testid={`geoiq-group-${group.group}`}>
                                    <p className="text-[11px] font-medium text-foreground">{group.label}</p>
                                    <div className="mt-1 grid gap-2">
                                        {rows.map((row) => {
                                            const id = `geoiq-var-${row.field}`;
                                            return (
                                                <div key={row.field} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
                                                    <Label htmlFor={id} className="text-xs">
                                                        {row.label}
                                                        {row.required && <span className="text-danger"> *</span>}
                                                    </Label>
                                                    <code className="truncate text-[11px] text-muted-foreground">{row.field}</code>
                                                    <Input
                                                        id={id}
                                                        className="h-8 font-mono text-xs"
                                                        value={named[row.field] ?? ""}
                                                        autoComplete="off"
                                                        placeholder="unmapped"
                                                        disabled={busy}
                                                        onChange={(event) => onNamed(row.field, event.target.value)}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}

                    {fields.catalogue.groups
                        .filter((group) => group.freeForm)
                        .map((group) => (
                            <div key={group.group} data-testid={`geoiq-group-${group.group}`}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-[11px] font-medium text-foreground">{group.label}</p>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-xs"
                                        disabled={busy}
                                        onClick={() => onAffinities([...affinities, { name: "", id: "" }])}
                                    >
                                        <Plus className="size-3" aria-hidden /> Add affinity
                                    </Button>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    Any name the account bought, stored as <code>{group.pattern ?? `${group.group}.<name>`}</code>; letters, digits and underscores.
                                </p>
                                {affinities.length === 0 ? (
                                    <p className="mt-1 text-xs text-muted-foreground">No affinities mapped.</p>
                                ) : (
                                    <div className="mt-1 grid gap-2">
                                        {affinities.map((row, index) => (
                                            <div key={index} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]" data-testid="geoiq-affinity-row">
                                                <Input
                                                    aria-label={`Affinity ${index + 1} name`}
                                                    className="h-8 font-mono text-xs"
                                                    value={row.name}
                                                    autoComplete="off"
                                                    placeholder="name, e.g. fitness"
                                                    disabled={busy}
                                                    onChange={(event) => onAffinities(affinities.map((item, at) => (at === index ? { ...item, name: event.target.value } : item)))}
                                                />
                                                <Input
                                                    aria-label={`Affinity ${index + 1} id`}
                                                    className="h-8 font-mono text-xs"
                                                    value={row.id}
                                                    autoComplete="off"
                                                    placeholder="catalogue id"
                                                    disabled={busy}
                                                    onChange={(event) => onAffinities(affinities.map((item, at) => (at === index ? { ...item, id: event.target.value } : item)))}
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-8 px-2"
                                                    aria-label={`Remove affinity ${index + 1}`}
                                                    disabled={busy}
                                                    onClick={() => onAffinities(affinities.filter((_, at) => at !== index))}
                                                >
                                                    <Trash2 className="size-3.5" aria-hidden />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    {problem && (
                        <p className="text-xs text-danger" data-testid="geoiq-map-problem">
                            {problem}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

/** The vendor test's verdict, printed inline under its button: badge, the plain sentence, the vendor's own message verbatim, the fields, the sample. */
function Verdict({ verdict }: { verdict: AudienceVendorTest }) {
    const kind = audienceTestKind(verdict);
    const footfall = verdict.sample.footfallDaily;
    return (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs" data-testid={`audience-verdict-${verdict.vendor}`}>
            <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={audienceTestBadge(verdict)} />
                <span className="text-muted-foreground">
                    reachable: {verdict.reachable ? "yes" : "no"} · authorised: {verdict.authorized ? "yes" : "no"}
                    {verdict.status !== null && <> · status {verdict.status}</>}
                </span>
            </div>
            <p className="mt-1.5 font-medium text-foreground">{audienceTestSentence(verdict)}</p>
            {verdict.message && kind !== "NO_KEY" && (
                <p className="mt-1 text-muted-foreground">
                    {AUDIENCE_VENDOR_LABEL[verdict.vendor]} said: <q className="italic">{verdict.message}</q>
                </p>
            )}
            {(kind === "ANSWERED" || kind === "EMPTY") && (
                <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                    <dt className="text-muted-foreground">Answered</dt>
                    <dd className="font-mono text-foreground">{verdict.fieldsAnswered.length ? verdict.fieldsAnswered.join(", ") : "—"}</dd>
                    <dt className="text-muted-foreground">Missing</dt>
                    <dd className="font-mono text-foreground">{verdict.fieldsMissing.length ? verdict.fieldsMissing.join(", ") : "—"}</dd>
                    {typeof footfall === "number" && (
                        <>
                            <dt className="text-muted-foreground">Sample daily footfall</dt>
                            <dd className="font-mono text-foreground">{footfall.toLocaleString("en-IN")}</dd>
                        </>
                    )}
                </dl>
            )}
        </div>
    );
}
