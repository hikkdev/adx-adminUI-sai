"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { HRMS_PROVIDER_LABEL } from "@/services/employees";
import {
    WORK_TOOL_PROVIDERS,
    WORK_TOOL_PROVIDER_LABEL,
    integrationsService,
    isMasked,
    sectionPatch,
    workToolLabel,
    type HrmsProvider,
    type HrmsSettings,
    type IntegrationSection,
    type WorkToolSettings,
} from "@/services/integrations";

interface StaffToolsSectionProps {
    hrms: HrmsSettings | undefined;
    workTool: WorkToolSettings | undefined;
    onChanged: () => void;
}

interface ToolField {
    key: string;
    label: string;
    placeholder?: string;
    /** Masked on read; blank on save keeps the stored value. */
    secret?: boolean;
    helper?: string;
}

interface ToolSpec {
    section: IntegrationSection;
    name: string;
    helper: string;
    providers: readonly string[];
    providerLabel: (provider: string) => string;
    fields: ToolField[];
}

const HRMS_PROVIDERS: readonly HrmsProvider[] = ["NONE", "ZOHO_PEOPLE", "KEKA", "GREYTHR"];

/** Lot E (Q98): the HR tool — a portal link and a deep-link template; the API key is held for the day the tier has an API. */
const HR_TOOL: ToolSpec = {
    section: "hrms",
    name: "HR tool",
    helper: "Leave, payroll, attendance and hiring live here; the console opens it by link and never syncs.",
    providers: HRMS_PROVIDERS,
    providerLabel: (provider) => HRMS_PROVIDER_LABEL[provider as HrmsProvider] ?? "None",
    fields: [
        { key: "portalUrl", label: "Portal URL", placeholder: "https://people.zoho.in" },
        {
            key: "employeeLinkTemplate",
            label: "Employee link template",
            placeholder: "https://people.zoho.in/adx/employee/{externalId}",
            helper: "Must contain {externalId}; each record's HR-tool id fills it for the profile's deep link.",
        },
        { key: "apiBaseUrl", label: "API base URL", placeholder: "https://people.zoho.in/api" },
        { key: "apiKey", label: "API key", secret: true },
    ],
};

/** E10-1: the work tool — a link the console follows from the employees overview, and a name for it. */
const WORK_TOOL: ToolSpec = {
    section: "workTool",
    name: "Work tool",
    helper: "Tasks, boards and issues. The employees overview's Internal work card opens the portal URL.",
    providers: WORK_TOOL_PROVIDERS,
    providerLabel: (provider) => WORK_TOOL_PROVIDER_LABEL[provider as WorkToolSettings["provider"]] ?? provider,
    fields: [
        { key: "name", label: "Name", placeholder: "ADX Jira", helper: "What the console calls it; the provider's name when blank." },
        { key: "portalUrl", label: "Portal URL", placeholder: "https://adx.atlassian.net" },
    ],
};

type Stored = Record<string, string | number | boolean | null> | undefined;

/**
 * Settings › Integrations › Staff tools — the HR tool (Lot E, Q98) and the
 * work tool (E10-1) side by side, each a provider and the links the
 * console follows, written one section at a time through
 * `PUT /integrations { section, patch }`. The HR tool's API key is the
 * one secret between them: masked on read, never round-tripped.
 */
export function StaffToolsSection({ hrms, workTool, onChanged }: StaffToolsSectionProps) {
    return (
        <SectionCard title="Staff tools" description="Where the team's own work lives. The console links out; nothing is synced.">
            <div className="grid gap-4 lg:grid-cols-2">
                <ToolCard
                    key={`hrms:${JSON.stringify(hrms ?? null)}`}
                    spec={HR_TOOL}
                    stored={hrms as unknown as Stored}
                    connected={Boolean(hrms && hrms.provider !== "NONE" && hrms.portalUrl)}
                    onChanged={onChanged}
                />
                <ToolCard
                    key={`workTool:${JSON.stringify(workTool ?? null)}`}
                    spec={WORK_TOOL}
                    stored={workTool as unknown as Stored}
                    connected={Boolean(workToolLabel(workTool) && workTool?.portalUrl)}
                    onChanged={onChanged}
                />
            </div>
        </SectionCard>
    );
}

function ToolCard({
    spec,
    stored,
    connected,
    onChanged,
}: {
    spec: ToolSpec;
    stored: Stored;
    connected: boolean;
    onChanged: () => void;
}) {
    const initial = React.useMemo(() => {
        const typed: Record<string, string | boolean> = { provider: String(stored?.provider ?? spec.providers[0]) };
        for (const field of spec.fields) {
            const value = stored?.[field.key];
            typed[field.key] = value === null || value === undefined ? "" : String(value);
        }
        return typed;
    }, [spec, stored]);

    const [typed, setTyped] = React.useState<Record<string, string | boolean>>(initial);
    const [busy, setBusy] = React.useState(false);
    const patch = sectionPatch(spec.section, typed, stored);
    const dirty = Object.keys(patch).length > 0;
    const provider = String(typed.provider);

    const save = async () => {
        setBusy(true);
        try {
            await integrationsService.update(spec.section, patch);
            toast.success(`${spec.name} saved`, {
                description: `${Object.keys(patch).length} field${Object.keys(patch).length === 1 ? "" : "s"} updated. The audit trail records the names, never the values.`,
            });
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : `Could not save the ${spec.name.toLowerCase()}.`);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{spec.name}</p>
                    <StatusBadge status={connected ? { label: "Connected", tone: "success" } : { label: "Not connected", tone: "neutral" }} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{spec.helper}</p>
            </div>

            <div className="space-y-2.5">
                <div className="space-y-1">
                    <Label htmlFor={`${spec.section}-provider`} className="text-xs">
                        Provider
                    </Label>
                    <Select value={provider} onValueChange={(value) => setTyped((current) => ({ ...current, provider: value }))}>
                        <SelectTrigger id={`${spec.section}-provider`} className="bg-card">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {spec.providers.map((option) => (
                                <SelectItem key={option} value={option}>
                                    {spec.providerLabel(option)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {provider === "NONE" && (
                        <p className="text-[11px] text-muted-foreground">Off. The links below are kept but nothing is drawn from them.</p>
                    )}
                </div>
                {spec.fields.map((field) => {
                    const id = `${spec.section}-${field.key}`;
                    const value = typed[field.key];
                    const masked = typeof value === "string" && isMasked(value);
                    return (
                        <div key={field.key} className="space-y-1">
                            <Label htmlFor={id} className="text-xs">
                                {field.label}
                            </Label>
                            <Input
                                id={id}
                                value={typeof value === "string" ? value : ""}
                                placeholder={field.placeholder}
                                autoComplete="off"
                                className={masked ? "font-mono text-muted-foreground" : undefined}
                                onFocus={() => {
                                    if (masked) setTyped((current) => ({ ...current, [field.key]: "" }));
                                }}
                                onBlur={() => {
                                    // Left blank after clearing a mask: the stored secret stays; show the mask again.
                                    if (field.secret && typeof typed[field.key] === "string" && !(typed[field.key] as string).trim()) {
                                        setTyped((current) => ({ ...current, [field.key]: String(stored?.[field.key] ?? "") }));
                                    }
                                }}
                                onChange={(event) => setTyped((current) => ({ ...current, [field.key]: event.target.value }))}
                            />
                            {field.secret ? (
                                <p className="text-[11px] text-muted-foreground">
                                    {stored?.[field.key] ? "Stored. Type a new value to replace it; leave it to keep it." : "Not set."}
                                </p>
                            ) : field.helper ? (
                                <p className="text-[11px] text-muted-foreground">{field.helper}</p>
                            ) : null}
                        </div>
                    );
                })}
            </div>

            <div className="mt-auto flex items-center justify-end gap-2 pt-1">
                {dirty && (
                    <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => setTyped(initial)}>
                        Discard
                    </Button>
                )}
                <Button size="sm" className="h-8" disabled={!dirty || busy} onClick={() => void save()}>
                    Save {spec.name.toLowerCase()}
                </Button>
            </div>
        </div>
    );
}
