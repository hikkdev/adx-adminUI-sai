"use client";

import * as React from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PinPicker, formatCoordinate, parseCoordinate } from "@/components/adx/pin-picker";
import { SectionCard } from "@/components/adx/section-card";
import { ApiError } from "@/lib/api-client";
import { useOptionalAuth } from "@/lib/auth";
import { useApiResource } from "@/lib/use-api-resource";
import { cn } from "@/lib/utils";
import {
    customFieldsReadApi,
    customFieldsService,
    formatValue,
    isEmptyValue,
    sortDefs,
    valueProblem,
    type CustomFieldDef,
    type CustomFieldEntity,
    type LocationValue,
} from "@/services/custom-fields";

const NONE = "__none__";

/** The permission group each record type's answers are written under — the same map the backend's routes use. */
export const EDIT_PERMISSION: Record<CustomFieldEntity, string> = {
    PUBLISHER: "supply.edit",
    LISTING: "supply.edit",
    ADVERTISER: "demand.edit",
    LEAD: "marketplace.edit",
};

interface CustomFieldsCardProps {
    entity: CustomFieldEntity;
    entityId: string;
    className?: string;
}

interface CardData {
    defs: CustomFieldDef[];
    values: Record<string, unknown>;
}

/**
 * CF-1: the "Extra details" card on the publisher, advertiser, listing and
 * lead pages — every definition with `showOnDesk`, its answer beside it,
 * edited in place and saved whole through `PUT /custom-fields/values`. A
 * `location` answer is picked on the map. Draws nothing when the record
 * type has no desk fields, so a page without them is exactly as it was.
 */
export function CustomFieldsCard({ entity, entityId, className }: CustomFieldsCardProps) {
    const live = customFieldsReadApi();
    /* The card sits inside pages that are rendered without an AuthProvider in their own tests; no session means no Edit button, never a crash. */
    const auth = useOptionalAuth();
    const mayEdit = auth?.can(EDIT_PERMISSION[entity]) ?? false;
    const resource = useApiResource<CardData | null>(`custom-fields:card:${live}:${entity}:${entityId}`, async () => {
        if (!live) return null;
        const [defs, values] = await Promise.all([customFieldsService.list(entity), customFieldsService.values(entity, entityId).catch(() => ({ values: {} }))]);
        return { defs: sortDefs(defs.filter((def) => def.showOnDesk && !def.archivedAt)), values: values.values ?? {} };
    });
    const [editing, setEditing] = React.useState(false);

    if (!live) return null;
    /* The card is extra, never the page's reason: a read that fails draws nothing rather than a card of one error line. */
    if (resource.error) return null;
    if (resource.loading && resource.data === null) return null;
    const data = resource.data;
    if (!data || data.defs.length === 0) return null;

    return (
        <SectionCard
            title="Extra details"
            description="The questions Settings › Custom fields asks of this record."
            className={className}
            actions={
                mayEdit && !editing ? (
                    <Button variant="outline" size="sm" className="h-7 bg-card" onClick={() => setEditing(true)} data-testid="custom-fields-edit">
                        <Pencil className="mr-1 size-3.5" />
                        Edit
                    </Button>
                ) : undefined
            }
        >
            {editing ? (
                <CustomFieldsForm
                    entity={entity}
                    entityId={entityId}
                    defs={data.defs}
                    values={data.values}
                    onCancel={() => setEditing(false)}
                    onSaved={() => {
                        setEditing(false);
                        resource.reload();
                    }}
                />
            ) : (
                <dl className="space-y-3 text-sm" data-testid="custom-fields-values">
                    {data.defs.map((def) => (
                        <div key={def.id} className="flex items-start justify-between gap-4">
                            <dt className="text-muted-foreground">
                                {def.label}
                                {def.required && isEmptyValue(def.kind, data.values[def.key]) && <span className="ml-1 text-[11px] text-warning">missing</span>}
                            </dt>
                            <dd className="text-right font-medium text-foreground" data-testid={`custom-field-value-${def.key}`}>
                                {formatValue(def, data.values[def.key])}
                            </dd>
                        </div>
                    ))}
                </dl>
            )}
        </SectionCard>
    );
}

/** The form's own copy of the answers: strings for the text-shaped kinds, the value itself for the rest. */
type Draft = Record<string, unknown>;

function CustomFieldsForm({ entity, entityId, defs, values, onCancel, onSaved }: { entity: CustomFieldEntity; entityId: string; defs: CustomFieldDef[]; values: Record<string, unknown>; onCancel: () => void; onSaved: () => void }) {
    const [draft, setDraft] = React.useState<Draft>(() => Object.fromEntries(defs.map((def) => [def.key, values[def.key] ?? (def.kind === "checkbox" ? false : def.kind === "multiselect" ? [] : def.kind === "location" ? null : "")])));
    const [busy, setBusy] = React.useState(false);
    const [tried, setTried] = React.useState(false);
    const set = (key: string, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));

    /** The answers as they will be sent: numbers parsed, empties left out. */
    const payload = React.useMemo(() => {
        const out: Record<string, unknown> = {};
        for (const def of defs) {
            const raw = draft[def.key];
            if (def.kind === "number") {
                const text = typeof raw === "string" ? raw.trim() : raw;
                if (text === "" || text === null || text === undefined) continue;
                out[def.key] = typeof text === "number" ? text : Number(text);
                continue;
            }
            if (isEmptyValue(def.kind, raw)) continue;
            out[def.key] = typeof raw === "string" ? raw.trim() : raw;
        }
        return out;
    }, [defs, draft]);
    const problems = React.useMemo(() => {
        const out: Record<string, string> = {};
        for (const def of defs) {
            const raw = draft[def.key];
            const value = def.kind === "number" && typeof raw === "string" && raw.trim() !== "" ? (Number.isFinite(Number(raw)) ? Number(raw) : raw) : raw;
            const problem = valueProblem(def, value);
            if (problem) out[def.key] = problem;
        }
        return out;
    }, [defs, draft]);

    async function save() {
        setTried(true);
        if (Object.keys(problems).length > 0 || busy) return;
        setBusy(true);
        try {
            await customFieldsService.saveValues(entity, entityId, payload);
            toast.success("Extra details saved");
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "The details did not save.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-4" data-testid="custom-fields-form">
            {defs.map((def) => {
                const id = `cf-${def.key}`;
                const error = tried ? problems[def.key] : undefined;
                return (
                    <div key={def.id} className="space-y-1.5">
                        {def.kind !== "checkbox" && (
                            <Label htmlFor={id} className="text-xs">
                                {def.label}
                                {def.required ? <span className="text-danger"> *</span> : null}
                                {def.hint && <span className="font-normal text-muted-foreground"> — {def.hint}</span>}
                            </Label>
                        )}
                        <FieldControl id={id} def={def} value={draft[def.key]} invalid={!!error} onChange={(value) => set(def.key, value)} />
                        {error && <p className="text-xs text-danger">{error}</p>}
                    </div>
                );
            })}
            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" className="bg-card" onClick={onCancel} disabled={busy}>
                    Cancel
                </Button>
                <Button type="button" size="sm" onClick={() => void save()} disabled={busy} data-testid="custom-fields-save">
                    {busy ? (
                        <>
                            <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden /> Saving…
                        </>
                    ) : (
                        "Save"
                    )}
                </Button>
            </div>
        </div>
    );
}

function FieldControl({ id, def, value, invalid, onChange }: { id: string; def: CustomFieldDef; value: unknown; invalid: boolean; onChange: (value: unknown) => void }) {
    const text = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
    switch (def.kind) {
        case "textarea":
            return <Textarea id={id} value={text} onChange={(event) => onChange(event.target.value)} rows={3} className={cn(invalid && "border-danger")} />;
        case "number":
            return <Input id={id} inputMode="decimal" value={text} onChange={(event) => onChange(event.target.value)} className={cn("h-9 w-40", invalid && "border-danger")} />;
        case "date":
            return <Input id={id} type="date" value={text.slice(0, 10)} onChange={(event) => onChange(event.target.value)} className={cn("h-9 w-48", invalid && "border-danger")} />;
        case "email":
            return <Input id={id} type="email" value={text} onChange={(event) => onChange(event.target.value)} className={cn("h-9", invalid && "border-danger")} />;
        case "phone":
            return <Input id={id} type="tel" value={text} onChange={(event) => onChange(event.target.value)} className={cn("h-9", invalid && "border-danger")} />;
        case "url":
            return <Input id={id} type="url" value={text} onChange={(event) => onChange(event.target.value)} placeholder="https://" className={cn("h-9", invalid && "border-danger")} />;
        case "checkbox":
            return (
                <label className="flex items-center gap-2 text-sm">
                    <Checkbox id={id} checked={value === true} onCheckedChange={(checked) => onChange(checked === true)} />
                    {def.label}
                    {def.hint && <span className="text-xs text-muted-foreground"> — {def.hint}</span>}
                </label>
            );
        case "select":
            return (
                <Select value={text || NONE} onValueChange={(next) => onChange(next === NONE ? "" : next)}>
                    <SelectTrigger id={id} className={cn("h-9", invalid && "border-danger")}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={NONE}>Not set</SelectItem>
                        {(def.options ?? []).map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            );
        case "multiselect": {
            const list = Array.isArray(value) ? (value as string[]) : [];
            return (
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {(def.options ?? []).map((option) => (
                        <label key={option.value} className="flex items-center gap-1.5 text-sm">
                            <Checkbox checked={list.includes(option.value)} onCheckedChange={(checked) => onChange(checked ? [...list, option.value] : list.filter((item) => item !== option.value))} />
                            {option.label}
                        </label>
                    ))}
                </div>
            );
        }
        case "location": {
            const place = (value ?? null) as Partial<LocationValue> | null;
            const latitude = typeof place?.latitude === "number" ? formatCoordinate(place.latitude) : "";
            const longitude = typeof place?.longitude === "number" ? formatCoordinate(place.longitude) : "";
            const write = (next: { latitude: string; longitude: string }, address?: string) => {
                const lat = parseCoordinate(next.latitude, 90);
                const lng = parseCoordinate(next.longitude, 180);
                if (lat === null || lng === null) {
                    onChange(null);
                    return;
                }
                onChange({ latitude: lat, longitude: lng, ...(address ?? place?.address ? { address: address ?? place?.address } : {}), ...(place?.cityId ? { cityId: place.cityId } : {}) });
            };
            return (
                <div className="space-y-2">
                    <PinPicker id={id} latitude={latitude} longitude={longitude} onChange={(next) => write(next)} onAddress={(found) => write({ latitude: formatCoordinate(found.latitude), longitude: formatCoordinate(found.longitude) }, found.formattedAddress)} title={def.label} />
                    <Input value={place?.address ?? ""} onChange={(event) => onChange(place && typeof place.latitude === "number" ? { ...place, address: event.target.value } : null)} placeholder="Address, as it should read" className="h-9" aria-label={`${def.label} address`} />
                </div>
            );
        }
        default:
            return <Input id={id} value={text} onChange={(event) => onChange(event.target.value)} className={cn("h-9", invalid && "border-danger")} />;
    }
}
