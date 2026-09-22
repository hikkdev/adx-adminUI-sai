"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/adx/section-card";
import {
    PARTY_BANDS,
    PARTY_BAND_LABEL,
    SETTING_BOUNDS,
    SIGNING_DOCUMENT_KEYS,
    SIGNING_DOCUMENT_LABEL,
    SIGN_METHODS,
    SIGN_METHOD_LABEL,
    changedKeys,
    parseBounded,
    settingsService,
    type EsignPolicy,
    type PartyBand,
    type SignMethod,
    type SigningDocumentKey,
    type StampDutyRow,
} from "@/services/settings";

interface EsignViewProps {
    /** `settings.esign`: null when the backend did not serve the section. */
    policy: EsignPolicy | null;
    live: boolean;
    onSaved: () => void;
}

interface StampDraft {
    document: SigningDocumentKey;
    state: string;
    amount: string;
    article: string;
}

interface Draft {
    enabled: boolean;
    signMethod: SignMethod;
    expireInDays: string;
    countersign: boolean;
    notifyThroughDigio: boolean;
    documents: Record<SigningDocumentKey, boolean>;
    valueThreshold: string;
    bands: PartyBand[];
    publisherLicenceAt: EsignPolicy["publisherLicenceAt"];
    resignOnNewVersion: boolean;
    stampDuty: StampDraft[];
}

const toDraft = (policy: EsignPolicy): Draft => ({
    enabled: policy.enabled,
    signMethod: policy.signMethod,
    expireInDays: String(policy.expireInDays),
    countersign: policy.countersign,
    notifyThroughDigio: policy.notifyThroughDigio,
    documents: { ...policy.documents },
    valueThreshold: String(policy.insertionOrder.valueThreshold),
    bands: [...policy.insertionOrder.bands],
    publisherLicenceAt: policy.publisherLicenceAt,
    resignOnNewVersion: policy.resignOnNewVersion,
    stampDuty: policy.stampDuty.map((row) => ({ document: row.document, state: row.state, amount: String(row.amount), article: row.article ?? "" })),
});

/** The draft as the policy, or null while a number or a state code is not one the schema takes. */
export function fromDraft(draft: Draft): EsignPolicy | null {
    const expireInDays = parseBounded(draft.expireInDays, SETTING_BOUNDS["esign.expireInDays"]);
    const valueThreshold = parseBounded(draft.valueThreshold, SETTING_BOUNDS["esign.insertionOrder.valueThreshold"]);
    if (expireInDays === null || valueThreshold === null) return null;
    const stampDuty: StampDutyRow[] = [];
    for (const row of draft.stampDuty) {
        const amount = parseBounded(row.amount, SETTING_BOUNDS["esign.stampDuty.amount"]);
        const state = row.state.trim().toUpperCase();
        if (amount === null || !/^[A-Z]{2}$/.test(state)) return null;
        stampDuty.push({ document: row.document, state, amount, ...(row.article.trim() ? { article: row.article.trim() } : {}) });
    }
    return {
        enabled: draft.enabled,
        signMethod: draft.signMethod,
        expireInDays,
        countersign: draft.countersign,
        notifyThroughDigio: draft.notifyThroughDigio,
        documents: { ...draft.documents },
        insertionOrder: { valueThreshold, bands: [...draft.bands] },
        publisherLicenceAt: draft.publisherLicenceAt,
        resignOnNewVersion: draft.resignOnNewVersion,
        stampDuty,
    };
}

/**
 * DS-1 (Digio eSign): Settings › E-signing — the policy behind the five
 * documents. Off by default, so every gate keeps its click; on, each
 * document switched on is rendered from its live template, sent through
 * Digio and waited on. The wire (keys, hosts) is Settings › Integrations;
 * the requests themselves are Agreements › Signatures.
 */
export function EsignView({ policy, live, onSaved }: EsignViewProps) {
    if (!live || !policy) {
        return (
            <SectionCard title="E-signing" description="Which documents are signed through Digio rather than clicked">
                <p className="text-sm text-muted-foreground">
                    {!live ? (
                        "Not connected to the ADX backend — the policy is read from the platform row and cannot be shown from fixtures."
                    ) : (
                        <>
                            This backend does not serve the <code className="rounded bg-muted px-1 py-0.5 text-xs">esign</code> section of the platform row, so e-signing cannot be configured here.
                        </>
                    )}
                </p>
            </SectionCard>
        );
    }
    return <EsignForm key={JSON.stringify(policy)} policy={policy} onSaved={onSaved} />;
}

function EsignForm({ policy, onSaved }: { policy: EsignPolicy; onSaved: () => void }) {
    const [draft, setDraft] = React.useState<Draft>(() => toDraft(policy));
    const [busy, setBusy] = React.useState(false);
    const next = fromDraft(draft);
    const patch = next ? changedKeys(policy as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>) : null;
    // Arrays are replaced whole: a band list or the stamp table is one value.
    const body = next && patch
        ? {
              ...patch,
              ...(JSON.stringify(policy.insertionOrder.bands) !== JSON.stringify(next.insertionOrder.bands) ? { insertionOrder: { ...(patch.insertionOrder as object | undefined), bands: next.insertionOrder.bands } } : {}),
              ...(JSON.stringify(policy.stampDuty) !== JSON.stringify(next.stampDuty) ? { stampDuty: next.stampDuty } : {}),
          }
        : null;
    const dirty = body !== null && Object.keys(body).length > 0;
    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

    async function save() {
        if (!body || !dirty || busy) return;
        setBusy(true);
        try {
            await settingsService.update({ esign: body as never });
            toast.success("E-signing settings saved", { description: next?.enabled ? "The documents switched on are sent through Digio from now." : "E-signing is off; every document keeps its click." });
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save the e-signing settings.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form
            className="space-y-5"
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
        >
            <SectionCard
                title="E-signing"
                description="Which documents are signed through Digio rather than clicked, how, and when. The keys and hosts are under Integrations; the requests themselves are under Agreements › Signatures."
            >
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <Label htmlFor="esign-enabled">E-signing is on</Label>
                            <p className="text-xs text-muted-foreground">
                                Off, every document keeps its click acceptance and nothing is sent to Digio. On, each document below that is switched on is rendered from its live template and sent for signature — and its gate waits.
                            </p>
                        </div>
                        <Switch id="esign-enabled" checked={draft.enabled} onCheckedChange={(value) => set("enabled", value)} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label>Sign method</Label>
                            <Select value={draft.signMethod} onValueChange={(value) => set("signMethod", value as SignMethod)}>
                                <SelectTrigger aria-label="Sign method">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SIGN_METHODS.map((method) => (
                                        <SelectItem key={method} value={method}>
                                            {SIGN_METHOD_LABEL[method]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">Aadhaar OTP for everyone by default; DSC for company signatories who insist.</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="esign-expire">Link valid for (days)</Label>
                            <Input id="esign-expire" inputMode="numeric" value={draft.expireInDays} onChange={(event) => set("expireInDays", event.target.value)} className="w-28 tabular-nums" aria-invalid={parseBounded(draft.expireInDays, SETTING_BOUNDS["esign.expireInDays"]) === null ? true : undefined} />
                            <p className="text-xs text-muted-foreground">1 to 90. An expired request is closed by the hourly sweep and the signer told.</p>
                        </div>
                        <div className="space-y-3 pt-6">
                            <label className="flex items-start gap-2 text-sm">
                                <Checkbox checked={draft.countersign} onCheckedChange={(value) => set("countersign", value === true)} className="mt-0.5" />
                                <span>
                                    ADX countersigns
                                    <span className="block text-xs text-muted-foreground">After the party, with the Document Signer Certificate on the Digio account (DS-4).</span>
                                </span>
                            </label>
                            <label className="flex items-start gap-2 text-sm">
                                <Checkbox checked={draft.notifyThroughDigio} onCheckedChange={(value) => set("notifyThroughDigio", value === true)} className="mt-0.5" />
                                <span>
                                    Digio sends the link too
                                    <span className="block text-xs text-muted-foreground">Beside ADX’s own email, SMS and push.</span>
                                </span>
                            </label>
                        </div>
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="The five documents" description="Each is sent at the moment named and holds the act it gates until it is signed">
                <div className="divide-y">
                    {SIGNING_DOCUMENT_KEYS.map((key) => {
                        const meta = SIGNING_DOCUMENT_LABEL[key];
                        return (
                            <div key={key} className="flex items-start justify-between gap-4 py-3">
                                <div>
                                    <div className="text-sm font-medium">{meta.label}</div>
                                    <div className="text-xs text-muted-foreground">
                                        Sent {meta.when}; gates {meta.gates}.
                                    </div>
                                </div>
                                <Switch checked={draft.documents[key]} onCheckedChange={(value) => set("documents", { ...draft.documents, [key]: value })} aria-label={meta.label} disabled={!draft.enabled} />
                            </div>
                        );
                    })}
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="esign-threshold">Insertion order: sign from a media value of (₹)</Label>
                        <Input id="esign-threshold" inputMode="numeric" value={draft.valueThreshold} onChange={(event) => set("valueThreshold", event.target.value)} className="w-40 tabular-nums" aria-invalid={parseBounded(draft.valueThreshold, SETTING_BOUNDS["esign.insertionOrder.valueThreshold"]) === null ? true : undefined} />
                        <p className="text-xs text-muted-foreground">The spots’ line totals, as the order enumerates them. Below it, and for the bands not listed, the click stands.</p>
                        <div className="flex flex-wrap gap-3 pt-1">
                            {PARTY_BANDS.map((band) => (
                                <label key={band} className="flex items-center gap-1.5 text-sm">
                                    <Checkbox checked={draft.bands.includes(band)} onCheckedChange={(value) => set("bands", value === true ? [...draft.bands, band] : draft.bands.filter((b) => b !== band))} />
                                    {PARTY_BAND_LABEL[band]}
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label>Publisher licence is asked for</Label>
                            <Select value={draft.publisherLicenceAt} onValueChange={(value) => set("publisherLicenceAt", value as EsignPolicy["publisherLicenceAt"])}>
                                <SelectTrigger aria-label="When the publisher licence is asked for">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="FIRST_APPROVED_LISTING">At the first approved listing</SelectItem>
                                    <SelectItem value="FIRST_SUBMISSION">At the first submission</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">Once asked for and unsigned, the next batch’s listing agreement waits on it.</p>
                        </div>
                        <label className="flex items-start gap-2 text-sm">
                            <Checkbox checked={draft.resignOnNewVersion} onCheckedChange={(value) => set("resignOnNewVersion", value === true)} className="mt-0.5" />
                            <span>
                                A new live version must be signed again
                                <span className="block text-xs text-muted-foreground">Off, a signature on any version stands. On, the next gated act asks for the live version.</span>
                            </span>
                        </label>
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="Stamp duty" description="DS-4: the e-stamp bought with the document, per document and state — a lawyer’s figure. Empty means no stamp.">
                <div className="space-y-2">
                    {draft.stampDuty.map((row, index) => (
                        <div key={index} className="grid grid-cols-[1fr_80px_120px_1fr_36px] items-center gap-2">
                            <Select value={row.document} onValueChange={(value) => set("stampDuty", draft.stampDuty.map((r, i) => (i === index ? { ...r, document: value as SigningDocumentKey } : r)))}>
                                <SelectTrigger aria-label="Document">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SIGNING_DOCUMENT_KEYS.map((key) => (
                                        <SelectItem key={key} value={key}>
                                            {SIGNING_DOCUMENT_LABEL[key].label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input value={row.state} onChange={(event) => set("stampDuty", draft.stampDuty.map((r, i) => (i === index ? { ...r, state: event.target.value.toUpperCase() } : r)))} placeholder="KA" maxLength={2} aria-label="State code" aria-invalid={!/^[A-Za-z]{2}$/.test(row.state) ? true : undefined} />
                            <Input inputMode="numeric" value={row.amount} onChange={(event) => set("stampDuty", draft.stampDuty.map((r, i) => (i === index ? { ...r, amount: event.target.value } : r)))} placeholder="₹" className="tabular-nums" aria-label="Amount" aria-invalid={parseBounded(row.amount, SETTING_BOUNDS["esign.stampDuty.amount"]) === null ? true : undefined} />
                            <Input value={row.article} onChange={(event) => set("stampDuty", draft.stampDuty.map((r, i) => (i === index ? { ...r, article: event.target.value } : r)))} placeholder="Article (optional)" aria-label="Article" />
                            <Button type="button" size="icon" variant="ghost" aria-label="Remove" onClick={() => set("stampDuty", draft.stampDuty.filter((_, i) => i !== index))}>
                                <Trash2 className="size-4" />
                            </Button>
                        </div>
                    ))}
                    <Button type="button" size="sm" variant="outline" onClick={() => set("stampDuty", [...draft.stampDuty, { document: "PUBLISHER_LICENCE", state: "KA", amount: "", article: "" }])}>
                        <Plus className="mr-1.5 size-3.5" /> Add a line
                    </Button>
                    <p className="text-xs text-muted-foreground">
                        The party’s state comes off their record (the city’s state when the row has none). Karnataka first; the table grows as the lawyer’s figures come in. The Digio account must have eStamp enabled.
                    </p>
                </div>
            </SectionCard>

            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                    See the requests under{" "}
                    <Link href="/agreements/signatures" className="text-primary hover:underline">
                        Agreements › Signatures
                    </Link>
                    .
                </p>
                <Button type="submit" size="sm" disabled={!dirty || busy || next === null}>
                    {busy ? "Saving…" : "Save"}
                </Button>
            </div>
        </form>
    );
}
