"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { cn } from "@/lib/utils";
import {
    DIGIO_OVERRIDE_EXPLANATION,
    DOCUMENT_READER_EXPLANATION,
    KYC_PROVIDER_EXPLANATION,
    KYC_PROVIDER_META,
    groupWorkflows,
    kycProviderService,
    templateIdProblem,
    type DigioWorkflow,
    type DocumentReader,
    type KycProviderConfig,
    type KycProviderState,
} from "@/services/kyc-provider";

/**
 * The Digio switch — Lot D (Q129), on /settings/integrations.
 *
 * `GET /integrations` for the section, `PUT /integrations { section:
 * "digio", patch: { kycProvider } }` for the switch. DIGIO and MANUAL are
 * ops' words; DEGRADED is the probe's and is drawn read-only — it comes
 * and goes with whether Digio answers, and setting it by hand would be a
 * lie the next tick corrected. The keys are shown masked as the server
 * sends them; this card does not edit them.
 *
 * Phase D (the owner's "ADX Digio KYC Workflows", 1 Oct 2026): the card
 * lists the 25 workflows `kyc.workflows` carries — one for agents, seven
 * for publishers, eight for advertisers, four for print partners, two for
 * employees, three for spots — each with the template id a request sends
 * and whether that id is the doc's own (Default) or an admin's (Override).
 * An admin may put an override on a row (`PUT /integrations { section:
 * "digio", patch: { workflowTemplates: { key: id } } }`, the id checked
 * against `^KTP[A-Z0-9]{10,61}$` before it is sent) or clear one (`null`,
 * back to the default).
 */
export function DigioSection() {
    const live = isLive("kyc");
    const resource = useApiResource<KycProviderConfig | null>(`integrations:kyc:${live}`, () => (live ? kycProviderService.get() : Promise.resolve(null)));
    const [busy, setBusy] = React.useState<KycProviderState | null>(null);

    const config = resource.data;
    const state = config?.kycProvider ?? "DIGIO";
    // DR-2: the document door's reader for identity papers.
    const reader: DocumentReader = config?.documentReader ?? "MODEL";
    const [readerBusy, setReaderBusy] = React.useState<DocumentReader | null>(null);
    /* Phase D: the one workflow row being edited, what is typed in it, and the row a write is in flight for. */
    const [editingKey, setEditingKey] = React.useState<string | null>(null);
    const [typedId, setTypedId] = React.useState("");
    const [typedTried, setTypedTried] = React.useState(false);
    const [workflowBusy, setWorkflowBusy] = React.useState<string | null>(null);
    const workflows = config?.workflows ?? [];
    const typedProblem = templateIdProblem(typedId);

    const startEditing = (row: DigioWorkflow) => {
        setEditingKey(row.key);
        setTypedId(row.source === "OVERRIDE" ? row.templateId : "");
        setTypedTried(false);
    };

    /** An id puts an override in place of the doc's template; null clears it back to the default. */
    const saveWorkflow = async (row: DigioWorkflow, templateId: string | null) => {
        if (templateId !== null) {
            setTypedTried(true);
            if (templateIdProblem(templateId)) return;
        }
        setWorkflowBusy(row.key);
        try {
            await kycProviderService.setWorkflowTemplate(row.key, templateId);
            toast.success(templateId === null ? `${row.label} is back on the default template` : `${row.label} now uses the override`, {
                description:
                    templateId === null
                        ? "Requests on this workflow send the template the owner's doc lists."
                        : "Requests on this workflow send this template instead of the one the owner's doc lists.",
            });
            setEditingKey(null);
            resource.reload();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The template did not reach ADX.");
        } finally {
            setWorkflowBusy(null);
        }
    };

    const setReader = async (next: DocumentReader) => {
        setReaderBusy(next);
        try {
            await kycProviderService.setDocumentReader(next);
            toast.success(next === "DIGIO" ? "Identity papers go to Digio's OCR" : "Every document goes to the vision model", {
                description: next === "DIGIO" ? "PAN, driving licence, passport and voter id. Bills, agreements and PDFs still go to the model." : "Digio reads nothing at the document door until this is set back.",
            });
            resource.reload();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The switch did not reach ADX.");
        } finally {
            setReaderBusy(null);
        }
    };

    const set = async (next: "DIGIO" | "MANUAL") => {
        setBusy(next);
        try {
            await kycProviderService.set(next);
            toast.success(next === "DIGIO" ? "Digio switched on" : "Digio switched off", {
                description:
                    next === "DIGIO"
                        ? "Publishers and advertisers may verify through Digio again; the probe keeps watching it."
                        : "Every verification goes through the manual desk until this is set back.",
            });
            resource.reload();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The switch did not reach ADX.");
        } finally {
            setBusy(null);
        }
    };

    return (
        <SectionCard
            title="Digio"
            description="PAN, Aadhaar and liveness verification for KYC — and the switch that takes it off the menu"
            actions={config ? <StatusBadge status={KYC_PROVIDER_META[state]} /> : undefined}
        >
            {!live ? (
                <p className="text-sm text-muted-foreground">Read from the API; turn the KYC domain on to see the switch.</p>
            ) : resource.loading && !config ? (
                <p className="text-sm text-muted-foreground">Reading the switch…</p>
            ) : resource.error ? (
                <p className="text-sm text-danger">{resource.error}</p>
            ) : config ? (
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground" data-testid="kyc-provider-explanation">
                        {KYC_PROVIDER_EXPLANATION[state]}
                    </p>

                    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="KYC provider">
                        {(["DIGIO", "MANUAL"] as const).map((option) => (
                            <Button
                                key={option}
                                type="button"
                                role="radio"
                                aria-checked={state === option}
                                variant={state === option ? "default" : "outline"}
                                size="sm"
                                className={cn("h-8", state !== option && "bg-card")}
                                disabled={busy !== null || state === option}
                                onClick={() => void set(option)}
                                data-testid={`kyc-provider-${option.toLowerCase()}`}
                            >
                                {busy === option ? "Switching…" : option === "DIGIO" ? "Digio" : "Manual only"}
                            </Button>
                        ))}
                        <span
                            className={cn(
                                "inline-flex h-8 items-center rounded-md border border-dashed px-3 text-xs",
                                state === "DEGRADED" ? "border-warning text-warning" : "text-muted-foreground"
                            )}
                            title="The probe's verdict. It cannot be set by hand."
                            data-testid="kyc-provider-degraded"
                        >
                            Degraded · probe only
                        </span>
                    </div>

                    <div className="space-y-2 rounded-md border border-border p-3" data-testid="document-reader">
                        <p className="text-sm font-medium text-foreground">Document reading</p>
                        <p className="text-xs text-muted-foreground" data-testid="document-reader-explanation">
                            {DOCUMENT_READER_EXPLANATION[reader]}
                        </p>
                        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Document reader">
                            {(["MODEL", "DIGIO"] as const).map((option) => (
                                <Button
                                    key={option}
                                    type="button"
                                    role="radio"
                                    aria-checked={reader === option}
                                    variant={reader === option ? "default" : "outline"}
                                    size="sm"
                                    className={cn("h-8", reader !== option && "bg-card")}
                                    disabled={readerBusy !== null || reader === option}
                                    onClick={() => void setReader(option)}
                                    data-testid={`document-reader-${option.toLowerCase()}`}
                                >
                                    {readerBusy === option ? "Switching…" : option === "MODEL" ? "Vision model" : "Digio OCR"}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
                        <div>
                            <dt className="text-xs text-muted-foreground">Client id</dt>
                            <dd className="mt-0.5 font-mono text-xs text-foreground">{config.clientId ?? "not configured"}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">Client secret</dt>
                            <dd className="mt-0.5 font-mono text-xs text-foreground">{config.clientSecret ?? "not configured"}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">API host</dt>
                            <dd className="mt-0.5 truncate font-mono text-xs text-foreground">{config.baseUrl ?? "not configured"}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">Verification page</dt>
                            <dd className="mt-0.5 truncate font-mono text-xs text-foreground">{config.gatewayUrl ?? "not configured"}</dd>
                        </div>
                    </dl>
                    <div className="space-y-3 rounded-md border border-border p-3" data-testid="digio-workflows">
                        <div>
                            <p className="text-sm font-medium text-foreground">KYC workflows</p>
                            <p className="text-xs text-muted-foreground">{DIGIO_OVERRIDE_EXPLANATION}</p>
                        </div>
                        {workflows.length === 0 ? (
                            <p className="text-xs text-muted-foreground" data-testid="digio-workflows-absent">
                                This backend does not list its Digio workflows yet.
                            </p>
                        ) : (
                            groupWorkflows(workflows).map((group) => (
                                <div key={group.label} data-testid={`digio-workflow-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`}>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p>
                                    <ul className="mt-1 divide-y divide-border">
                                        {group.rows.map((row) => {
                                            const editing = editingKey === row.key;
                                            const busyHere = workflowBusy === row.key;
                                            return (
                                                <li key={row.key} className="py-1.5" data-testid={`digio-workflow-${row.key}`}>
                                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                        <span className="min-w-0 flex-1 basis-40 text-sm text-foreground">{row.label}</span>
                                                        <span className="max-w-[16rem] truncate font-mono text-xs text-muted-foreground" title={row.templateId}>
                                                            {row.templateId}
                                                        </span>
                                                        <StatusBadge status={row.source === "OVERRIDE" ? { label: "Override", tone: "warning" } : { label: "Default", tone: "neutral" }} />
                                                        {!editing && (
                                                            <span className="flex items-center gap-1">
                                                                <Button type="button" variant="ghost" size="sm" className="h-7 px-2" disabled={workflowBusy !== null} onClick={() => startEditing(row)} aria-label={`${row.source === "OVERRIDE" ? "Change the override" : "Set an override"} for ${row.label}`}>
                                                                    {row.source === "OVERRIDE" ? "Change" : "Set override"}
                                                                </Button>
                                                                {row.source === "OVERRIDE" && (
                                                                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2" disabled={workflowBusy !== null} onClick={() => void saveWorkflow(row, null)} aria-label={`Use the default for ${row.label}`}>
                                                                        {busyHere ? "Clearing…" : "Use default"}
                                                                    </Button>
                                                                )}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {editing && (
                                                        <div className="mt-1.5 space-y-1">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <Input
                                                                    value={typedId}
                                                                    onChange={(event) => setTypedId(event.target.value.toUpperCase())}
                                                                    placeholder="KTP… — the override's template id on Digio"
                                                                    aria-label={`Override template id for ${row.label}`}
                                                                    aria-invalid={typedTried && typedProblem ? true : undefined}
                                                                    className="h-8 max-w-sm flex-1 font-mono text-xs"
                                                                    maxLength={64}
                                                                    disabled={busyHere}
                                                                />
                                                                <Button type="button" size="sm" className="h-8" disabled={busyHere} onClick={() => void saveWorkflow(row, typedId)}>
                                                                    {busyHere ? "Saving…" : "Save override"}
                                                                </Button>
                                                                <Button type="button" variant="outline" size="sm" className="h-8 bg-card" disabled={busyHere} onClick={() => setEditingKey(null)}>
                                                                    Cancel
                                                                </Button>
                                                            </div>
                                                            {typedTried && typedProblem ? (
                                                                <p className="text-xs text-danger" role="alert">
                                                                    {typedProblem}
                                                                </p>
                                                            ) : (
                                                                <p className="text-xs text-muted-foreground">An override replaces the template the owner&rsquo;s doc lists for this workflow.</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            ))
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground" data-testid="digio-keys-note">
                        Outside production, unconfigured keys run the mock path, and the probe never degrades that. In production every Digio request is refused until the keys are set. Every Digio initiate and restart answers 503 while the switch is off Digio, and the apps offer the manual upload instead.
                    </p>
                </div>
            ) : null}
        </SectionCard>
    );
}
