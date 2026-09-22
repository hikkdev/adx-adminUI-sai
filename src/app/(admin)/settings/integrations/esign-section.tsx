"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { esignWireService, type EsignWireConfig, type EsignWirePatch } from "@/services/kyc-provider";

/**
 * DS-1 (Digio eSign): the signing rail's wire on /settings/integrations —
 * the API and gateway hosts, ADX's signer for the countersign, and whether
 * keys of its own are set (else the KYC section's Digio account signs).
 * The policy — which documents, how, when — is Settings › E-signing.
 */
export function EsignSection() {
    const live = isLive("kyc");
    const resource = useApiResource<EsignWireConfig | null>(`integrations:esign:${live}`, () => (live ? esignWireService.get() : Promise.resolve(null)));
    const config = resource.data;
    return (
        <SectionCard
            title="Digio eSign"
            description="Aadhaar, DSC and electronic signatures on the five documents — the same Digio account as KYC unless keys of its own are set"
            actions={config ? <StatusBadge status={config.configured ? { label: "Configured", tone: "success" } : { label: "Mock rail", tone: "warning" }} /> : undefined}
        >
            {!live ? (
                <p className="text-sm text-muted-foreground">Read from the API; turn the KYC domain on to see the wire.</p>
            ) : resource.loading && !config ? (
                <p className="text-sm text-muted-foreground">Reading…</p>
            ) : resource.error ? (
                <p className="text-sm text-danger">{resource.error}</p>
            ) : config ? (
                <EsignWireForm key={`${config.apiUrl}:${config.gatewayUrl}:${config.adxSignerName}:${config.adxSignerIdentifier}`} config={config} onSaved={resource.reload} />
            ) : (
                <p className="text-sm text-muted-foreground">This backend does not serve the eSign section of the integrations row.</p>
            )}
        </SectionCard>
    );
}

function EsignWireForm({ config, onSaved }: { config: EsignWireConfig; onSaved: () => void }) {
    const [draft, setDraft] = React.useState<EsignWirePatch>({
        apiUrl: config.apiUrl ?? "",
        gatewayUrl: config.gatewayUrl ?? "",
        adxSignerName: config.adxSignerName ?? "",
        adxSignerIdentifier: config.adxSignerIdentifier ?? "",
        clientId: "",
        clientSecret: "",
    });
    const [busy, setBusy] = React.useState(false);
    const patch: EsignWirePatch = {};
    if (draft.apiUrl && draft.apiUrl !== config.apiUrl) patch.apiUrl = draft.apiUrl;
    if (draft.gatewayUrl && draft.gatewayUrl !== config.gatewayUrl) patch.gatewayUrl = draft.gatewayUrl;
    if ((draft.adxSignerName ?? "") !== (config.adxSignerName ?? "")) patch.adxSignerName = draft.adxSignerName ?? "";
    if ((draft.adxSignerIdentifier ?? "") !== (config.adxSignerIdentifier ?? "")) patch.adxSignerIdentifier = draft.adxSignerIdentifier ?? "";
    if (draft.clientId) patch.clientId = draft.clientId;
    if (draft.clientSecret) patch.clientSecret = draft.clientSecret;
    const dirty = Object.keys(patch).length > 0;

    async function save() {
        if (!dirty || busy) return;
        setBusy(true);
        try {
            await esignWireService.set(patch);
            toast.success("eSign wire saved");
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save the eSign wire.");
        } finally {
            setBusy(false);
        }
    }

    const field = (key: keyof EsignWirePatch, label: string, placeholder: string, hint?: string, type = "text") => (
        <div className="space-y-1.5">
            <Label htmlFor={`esign-${key}`}>{label}</Label>
            <Input
                id={`esign-${key}`}
                type={type}
                value={draft[key] ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                placeholder={placeholder}
                className="font-mono text-xs"
                autoComplete="off"
            />
            {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
    );

    return (
        <form
            className="space-y-4"
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
        >
            <p className="text-sm text-muted-foreground">
                {config.configured
                    ? config.sharesKycCredentials
                        ? "Signing with the KYC section’s Digio account. Set keys here only if Digio issued a separate pair for eSign."
                        : "Signing with keys of its own."
                    : "No Digio keys anywhere: requests open on the mock rail in development (signed from the Signatures desk) and are refused in production."}{" "}
                What is signed, and when, is{" "}
                <Link href="/settings/esign" className="text-primary hover:underline">
                    Settings › E-signing
                </Link>
                .
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
                {field("apiUrl", "API host", "https://ext.digio.in:444", "Sandbox: https://ext.digio.in:444 · production: https://api.digio.in")}
                {field("gatewayUrl", "Signing gateway", "https://ext-gateway.digio.in", "Sandbox: https://ext-gateway.digio.in · production: https://app.digio.in")}
                {field("adxSignerName", "ADX signs as", "ADX (Keysquare Technologies)", "Printed on the signature page when ADX countersigns.")}
                {field("adxSignerIdentifier", "ADX signer’s email", "legal@adx.in", "The Document Signer Certificate on the Digio account signs for this identity.")}
                {field("clientId", "Client id (eSign only)", config.clientId ?? "leave empty to share KYC’s")}
                {field("clientSecret", "Client secret (eSign only)", config.clientSecret ?? "leave empty to share KYC’s", undefined, "password")}
            </div>
            <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={!dirty || busy}>
                    {busy ? "Saving…" : "Save"}
                </Button>
            </div>
        </form>
    );
}
