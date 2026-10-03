"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { integrationsService } from "@/services/integrations";
import { integrationSaveError, secureIdDraftOf, secureIdPatch, type SecureIdDraft, type SecureIdSettings } from "@/services/verification";

const SOURCE_LABEL: Record<NonNullable<SecureIdSettings["source"]>, string> = {
    SETTINGS: "Keys from Settings",
    ENV: "Keys from the server's environment",
};

/**
 * Cashfree Secure ID — Cashfree Phase 2, on /settings/integrations.
 *
 * `GET /integrations` → `secureId`; `PUT /integrations { section:
 * "secureId", patch }` (strict). The client id is drawn as it is; the
 * secret arrives masked and the public key never leaves the server — only
 * whether one is loaded and a short fingerprint of it, so the owner can
 * tell which of Cashfree's keys is in use. Both are write-only here: a
 * blank field keeps what is stored, and the PEM is removed only by the
 * explicit "Remove the public key" (`publicKey: null`, back to IP
 * whitelisting). A 400 carries a person-facing sentence (a PEM that does
 * not parse, say) and is shown as it stands; a production server without
 * an encryption key refuses with 503 `ENCRYPTION_KEY_MISSING`.
 */
export function SecureIdSection({ stored, onChanged }: { stored: SecureIdSettings | undefined; onChanged: () => void }) {
    return (
        <SectionCard
            title="Cashfree Secure ID"
            description="Identity, bank and business checks — the backup to Digio."
            actions={
                stored ? (
                    <StatusBadge status={stored.configured ? { label: "Configured", tone: "success" } : { label: "Not configured", tone: "neutral" }} />
                ) : undefined
            }
        >
            {stored ? (
                <SecureIdForm key={JSON.stringify(stored)} stored={stored} onChanged={onChanged} />
            ) : (
                <p className="text-sm text-muted-foreground" data-testid="secure-id-absent">
                    This backend does not carry the Secure ID keys yet.
                </p>
            )}
        </SectionCard>
    );
}

function SecureIdForm({ stored, onChanged }: { stored: SecureIdSettings; onChanged: () => void }) {
    const initial = React.useMemo(() => secureIdDraftOf(stored), [stored]);
    const [draft, setDraft] = React.useState<SecureIdDraft>(initial);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const patch = secureIdPatch(stored, draft);
    const dirty = Object.keys(patch).length > 0;
    const set = <K extends keyof SecureIdDraft>(key: K, value: SecureIdDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            await integrationsService.update("secureId", patch);
            toast.success("Cashfree Secure ID saved", {
                description: `${Object.keys(patch).length} field${Object.keys(patch).length === 1 ? "" : "s"} updated. The audit trail records which keys changed, never the keys.`,
            });
            onChanged();
        } catch (cause) {
            const message = integrationSaveError(cause, "Could not save Cashfree Secure ID.");
            setError(message);
            toast.error(message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-4" data-testid="secure-id-card">
            <div className="flex flex-wrap items-center gap-2">
                {stored.source && <StatusBadge status={{ label: SOURCE_LABEL[stored.source], tone: "info" }} />}
                <StatusBadge status={stored.testMode ? { label: "Sandbox", tone: "warning" } : { label: "Live", tone: "info" }} />
                <StatusBadge
                    status={stored.signing === "PUBLIC_KEY" ? { label: "Signed with the public key", tone: "success" } : { label: "IP whitelisting", tone: "neutral" }}
                />
            </div>

            <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                <div>
                    <dt className="text-xs text-muted-foreground">API host</dt>
                    <dd className="mt-0.5 truncate font-mono text-xs text-foreground">{stored.baseUrl}</dd>
                </div>
                <div>
                    <dt className="text-xs text-muted-foreground">Public key fingerprint</dt>
                    <dd className="mt-0.5 font-mono text-xs text-foreground" data-testid="secure-id-fingerprint">
                        {stored.publicKeyFingerprint ?? "No public key loaded"}
                    </dd>
                </div>
            </dl>

            <div className="space-y-1">
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                        <Label htmlFor="secureId-clientId" className="text-xs">
                            Client ID
                        </Label>
                        <Input id="secureId-clientId" value={draft.clientId} autoComplete="off" onChange={(event) => set("clientId", event.target.value)} disabled={busy} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="secureId-clientSecret" className="text-xs">
                            Client secret
                        </Label>
                        <Input
                            id="secureId-clientSecret"
                            type="password"
                            value={draft.clientSecret}
                            autoComplete="off"
                            placeholder={stored.clientSecret ?? "Not set"}
                            onChange={(event) => set("clientSecret", event.target.value)}
                            disabled={busy}
                        />
                    </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                    The secret is never shown. {stored.clientSecret ? "One is stored — type a new one to replace it, leave it blank to keep it." : "None stored yet."}
                </p>
            </div>

            <div className="space-y-1">
                <Label htmlFor="secureId-publicKey" className="text-xs">
                    Public key (PEM)
                </Label>
                <Textarea
                    id="secureId-publicKey"
                    value={draft.publicKey}
                    onChange={(event) => setDraft((current) => ({ ...current, publicKey: event.target.value, removePublicKey: false }))}
                    placeholder={"-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----"}
                    className="min-h-24 font-mono text-xs"
                    disabled={busy || draft.removePublicKey}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                        {stored.publicKey ? "A key is loaded. Paste a new one to replace it; leave it blank to keep it." : "No key loaded — calls rely on Cashfree's IP whitelisting."}
                    </p>
                    {stored.publicKey && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-danger hover:text-danger"
                            disabled={busy}
                            onClick={() => setDraft((current) => ({ ...current, publicKey: "", removePublicKey: !current.removePublicKey }))}
                        >
                            {draft.removePublicKey ? "Keep the public key" : "Remove the public key"}
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex items-start justify-between gap-3 rounded-md bg-muted/40 p-3">
                <div className="min-w-0">
                    <Label htmlFor="secureId-testMode" className="text-xs">
                        Test mode
                    </Label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">sandbox.cashfree.com while on, api.cashfree.com off.</p>
                </div>
                <Switch id="secureId-testMode" checked={draft.testMode} onCheckedChange={(checked) => set("testMode", checked)} disabled={busy} />
            </div>

            {error && (
                <p className="text-sm text-danger" role="alert" data-testid="secure-id-error">
                    {error}
                </p>
            )}

            <div className="flex items-center justify-end gap-2">
                {dirty && (
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        disabled={busy}
                        onClick={() => {
                            setDraft(initial);
                            setError(null);
                        }}
                    >
                        Discard
                    </Button>
                )}
                <Button size="sm" className="h-8" disabled={!dirty || busy} onClick={() => void save()}>
                    {busy ? "Saving…" : "Save Secure ID"}
                </Button>
            </div>
        </div>
    );
}
