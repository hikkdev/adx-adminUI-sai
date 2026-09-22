"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import {
    leadChannelsService,
    parseCallerIds,
    TELEPHONY_PROVIDER_LABEL,
    WHATSAPP_BSP_LABEL,
    type LeadChannelsPatch,
    type LeadChannelsView,
    type TelephonyProvider,
    type WhatsAppBsp,
    type WhatsAppTemplateView,
} from "@/services/leads";

/** "Not configured · bsp, apiKey missing" — the card's badge and the fields it still wants. */
export function cardState(card: { configured: boolean; missing: string[] }): { label: string; tone: "success" | "neutral"; missing: string } {
    return card.configured ? { label: "Configured", tone: "success", missing: "" } : { label: "Not configured", tone: "neutral", missing: card.missing.length ? `${card.missing.join(", ")} missing` : "" };
}

/** The WhatsApp template map typed as lines: `key = name | language | param1,param2`. */
export function parseTemplateLines(text: string): Record<string, WhatsAppTemplateView> {
    const out: Record<string, WhatsAppTemplateView> = {};
    for (const raw of text.split("\n")) {
        const line = raw.trim();
        if (!line || !line.includes("=")) continue;
        const [key, rest] = line.split("=", 2).map((part) => part.trim());
        if (!key || !rest) continue;
        const [name, language, params] = rest.split("|").map((part) => part.trim());
        if (!name) continue;
        out[key] = { name, ...(language ? { language } : {}), ...(params ? { params: params.split(",").map((p) => p.trim()).filter(Boolean) } : {}) };
    }
    return out;
}

export function templateLines(templates: Record<string, WhatsAppTemplateView>): string {
    return Object.entries(templates)
        .map(([key, t]) => `${key} = ${t.name}${t.language || t.params?.length ? ` | ${t.language ?? ""}` : ""}${t.params?.length ? ` | ${t.params.join(",")}` : ""}`)
        .join("\n");
}

/**
 * LH6 (D5): the Channels cards — one per outreach provider, each
 * NOT_CONFIGURED until filled. A secret typed here is never shown back;
 * the mask says one is set. SMS and email have no card: they ride the
 * comms doors above.
 */
export function ChannelsSection() {
    const live = isLive("leads");
    const resource = useApiResource<LeadChannelsView | null>(`integrations:channels:${live}`, () => (live ? leadChannelsService.get() : Promise.resolve(null)));
    const data = resource.data;
    return (
        <SectionCard
            title="Channels"
            description="The outreach hub's providers — WhatsApp (a BSP), Instagram DM and Messenger (one Meta app), Google Business Messages, and telephony for click-to-call, the missed-call number and the IVR. SMS and email use the doors above."
            actions={
                <Link href="/leads/sequences" className="text-sm text-primary hover:underline">
                    Sequences
                </Link>
            }
        >
            {!live ? (
                <p className="text-sm text-muted-foreground">Read from the API; turn the leads domain on to see the cards.</p>
            ) : resource.loading && !data ? (
                <p className="text-sm text-muted-foreground">Reading…</p>
            ) : resource.error ? (
                <p className="text-sm text-danger">{resource.error}</p>
            ) : data ? (
                <div className="grid gap-4 lg:grid-cols-2" data-testid="channels-cards">
                    <WhatsAppCard card={data.whatsapp} onSaved={resource.reload} />
                    <TelephonyCard card={data.telephony} onSaved={resource.reload} />
                    <MetaCard section="instagram" title="Instagram DM" card={data.instagram} onSaved={resource.reload} />
                    <MetaCard section="messenger" title="Messenger" card={data.messenger} onSaved={resource.reload} />
                    <GoogleBusinessCard card={data.googleBusiness} onSaved={resource.reload} />
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">This backend does not serve the Channels section of the integrations row.</p>
            )}
        </SectionCard>
    );
}

function useSave(label: string, onSaved: () => void) {
    const [busy, setBusy] = React.useState(false);
    async function save(patch: LeadChannelsPatch, after?: () => void) {
        if (busy) return;
        setBusy(true);
        try {
            await leadChannelsService.set(patch);
            toast.success(`${label} saved`);
            after?.();
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save the card.");
        } finally {
            setBusy(false);
        }
    }
    return { busy, save };
}

function Field({ id, label, value, onChange, placeholder, secret }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string | null; secret?: boolean }) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Input id={id} type={secret ? "password" : "text"} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder ?? undefined} />
        </div>
    );
}

function CardHead({ title, card, hint }: { title: string; card: { configured: boolean; missing: string[] }; hint: string }) {
    const state = cardState(card);
    return (
        <>
            <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-medium text-foreground">{title}</h4>
                <StatusBadge status={{ label: state.label, tone: state.tone }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
                {hint}
                {state.missing ? <span className="text-warning"> · {state.missing}</span> : null}
            </p>
        </>
    );
}

function WhatsAppCard({ card, onSaved }: { card: LeadChannelsView["whatsapp"]; onSaved: () => void }) {
    const [bsp, setBsp] = React.useState<WhatsAppBsp | "">(card.bsp ?? "");
    const [draft, setDraft] = React.useState({ apiKey: "", appName: card.appName ?? "", sourceNumber: card.sourceNumber ?? "", phoneNumberId: card.phoneNumberId ?? "", accessToken: "", appSecret: "", verifyToken: "" });
    const [templates, setTemplates] = React.useState(templateLines(card.templates));
    const { busy, save } = useSave("WhatsApp", onSaved);
    const set = (key: keyof typeof draft) => (value: string) => setDraft((current) => ({ ...current, [key]: value }));
    const patch: NonNullable<LeadChannelsPatch["whatsapp"]> = {};
    if (bsp && bsp !== card.bsp) patch.bsp = bsp;
    for (const key of ["apiKey", "accessToken", "appSecret", "verifyToken"] as const) if (draft[key]) patch[key] = draft[key];
    if (draft.appName !== (card.appName ?? "") && draft.appName) patch.appName = draft.appName;
    if (draft.sourceNumber !== (card.sourceNumber ?? "") && draft.sourceNumber) patch.sourceNumber = draft.sourceNumber;
    if (draft.phoneNumberId !== (card.phoneNumberId ?? "") && draft.phoneNumberId) patch.phoneNumberId = draft.phoneNumberId;
    if (templates !== templateLines(card.templates)) patch.templates = parseTemplateLines(templates);
    const dirty = Object.keys(patch).length > 0;
    return (
        <div className="rounded-md border p-4" data-testid="channel-card-whatsapp">
            <CardHead title="WhatsApp" card={card} hint="Free text inside the 24-hour window after the lead writes; an approved template outside it." />
            <div className="mt-3 grid gap-3">
                <div className="space-y-1.5">
                    <Label htmlFor="wa-bsp">Provider (BSP)</Label>
                    <Select value={bsp} onValueChange={(value) => setBsp(value as WhatsAppBsp)}>
                        <SelectTrigger id="wa-bsp" className="h-9" data-testid="wa-bsp">
                            <SelectValue placeholder="Pick a BSP" />
                        </SelectTrigger>
                        <SelectContent>
                            {(Object.keys(WHATSAPP_BSP_LABEL) as WhatsAppBsp[]).map((value) => (
                                <SelectItem key={value} value={value}>
                                    {WHATSAPP_BSP_LABEL[value]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {bsp === "GUPSHUP" ? (
                    <div className="grid grid-cols-2 gap-3">
                        <Field id="wa-app" label="App name" value={draft.appName} onChange={set("appName")} placeholder="ADX" />
                        <Field id="wa-source" label="Source number" value={draft.sourceNumber} onChange={set("sourceNumber")} placeholder="+91 80000 00000" />
                    </div>
                ) : null}
                {bsp === "META" ? (
                    <div className="grid grid-cols-2 gap-3">
                        <Field id="wa-phone-id" label="Phone number id" value={draft.phoneNumberId} onChange={set("phoneNumberId")} placeholder={card.phoneNumberId} />
                        <Field id="wa-token" label="Access token" value={draft.accessToken} onChange={set("accessToken")} placeholder={card.accessToken ?? "not set"} secret />
                    </div>
                ) : null}
                {bsp === "GUPSHUP" || bsp === "INTERAKT" ? <Field id="wa-key" label="API key" value={draft.apiKey} onChange={set("apiKey")} placeholder={card.apiKey ?? "not set"} secret /> : null}
                <div className="grid grid-cols-2 gap-3">
                    <Field id="wa-secret" label="App secret (webhook signature)" value={draft.appSecret} onChange={set("appSecret")} placeholder={card.appSecret ?? "not set"} secret />
                    <Field id="wa-verify" label="Verify / webhook token" value={draft.verifyToken} onChange={set("verifyToken")} placeholder={card.verifyToken ?? "not set"} secret />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="wa-templates">Approved templates</Label>
                    <Textarea id="wa-templates" rows={3} value={templates} onChange={(event) => setTemplates(event.target.value)} placeholder={"lead-seq-publisher-intro = lead_intro | en | contactName,agentName"} data-testid="wa-templates" />
                    <p className="text-[11px] text-muted-foreground">One per line: the comms template key, then the BSP&apos;s template name, its language and the variables in the BSP&apos;s order.</p>
                </div>
            </div>
            <div className="mt-3 flex justify-end">
                <Button size="sm" disabled={!dirty || busy} onClick={() => void save({ whatsapp: patch }, () => setDraft((c) => ({ ...c, apiKey: "", accessToken: "", appSecret: "", verifyToken: "" })))} data-testid="wa-save">
                    {busy ? "Saving…" : "Save"}
                </Button>
            </div>
        </div>
    );
}

function MetaCard({ section, title, card, onSaved }: { section: "instagram" | "messenger"; title: string; card: LeadChannelsView["instagram"]; onSaved: () => void }) {
    const [draft, setDraft] = React.useState({ pageId: card.pageId ?? "", accessToken: "", appSecret: "", verifyToken: "" });
    const { busy, save } = useSave(title, onSaved);
    const set = (key: keyof typeof draft) => (value: string) => setDraft((current) => ({ ...current, [key]: value }));
    const patch: NonNullable<LeadChannelsPatch["instagram"]> = {};
    if (draft.pageId !== (card.pageId ?? "") && draft.pageId) patch.pageId = draft.pageId;
    for (const key of ["accessToken", "appSecret", "verifyToken"] as const) if (draft[key]) patch[key] = draft[key];
    const dirty = Object.keys(patch).length > 0;
    return (
        <div className="rounded-md border p-4" data-testid={`channel-card-${section}`}>
            <CardHead title={title} card={card} hint="Replies only, inside the window after they write — a DM, a comment on our post, a story reply. No cold DMs." />
            <div className="mt-3 grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                    <Field id={`${section}-page`} label={section === "instagram" ? "Instagram account id" : "Page id"} value={draft.pageId} onChange={set("pageId")} placeholder={card.pageId} />
                    <Field id={`${section}-token`} label="Page access token" value={draft.accessToken} onChange={set("accessToken")} placeholder={card.accessToken ?? "not set"} secret />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Field id={`${section}-secret`} label="App secret" value={draft.appSecret} onChange={set("appSecret")} placeholder={card.appSecret ?? "not set"} secret />
                    <Field id={`${section}-verify`} label="Verify token" value={draft.verifyToken} onChange={set("verifyToken")} placeholder={card.verifyToken ?? "not set"} secret />
                </div>
            </div>
            <div className="mt-3 flex justify-end">
                <Button size="sm" disabled={!dirty || busy} onClick={() => void save({ [section]: patch }, () => setDraft((c) => ({ ...c, accessToken: "", appSecret: "", verifyToken: "" })))} data-testid={`${section}-save`}>
                    {busy ? "Saving…" : "Save"}
                </Button>
            </div>
        </div>
    );
}

function GoogleBusinessCard({ card, onSaved }: { card: LeadChannelsView["googleBusiness"]; onSaved: () => void }) {
    const [draft, setDraft] = React.useState({ agentId: card.agentId ?? "", serviceAccountJson: "", partnerKey: "" });
    const { busy, save } = useSave("Google Business Messages", onSaved);
    const set = (key: keyof typeof draft) => (value: string) => setDraft((current) => ({ ...current, [key]: value }));
    const patch: NonNullable<LeadChannelsPatch["googleBusiness"]> = {};
    if (draft.agentId !== (card.agentId ?? "") && draft.agentId) patch.agentId = draft.agentId;
    if (draft.serviceAccountJson) patch.serviceAccountJson = draft.serviceAccountJson;
    if (draft.partnerKey) patch.partnerKey = draft.partnerKey;
    const dirty = Object.keys(patch).length > 0;
    return (
        <div className="rounded-md border p-4" data-testid="channel-card-google-business">
            <CardHead title="Google Business Messages" card={card} hint="Google retired the public product in July 2024; the card stays for a partner endpoint. Replies inside the conversation only." />
            <div className="mt-3 grid gap-3">
                <Field id="gbm-agent" label="Agent id" value={draft.agentId} onChange={set("agentId")} placeholder={card.agentId ?? "brands/…/agents/…"} />
                <div className="space-y-1.5">
                    <Label htmlFor="gbm-sa">Service account JSON</Label>
                    <Textarea id="gbm-sa" rows={2} value={draft.serviceAccountJson} onChange={(event) => set("serviceAccountJson")(event.target.value)} placeholder={card.serviceAccountJson ?? "{ … }"} />
                </div>
                <Field id="gbm-partner" label="Partner key (webhook signature)" value={draft.partnerKey} onChange={set("partnerKey")} placeholder={card.partnerKey ?? "not set"} secret />
            </div>
            <div className="mt-3 flex justify-end">
                <Button size="sm" disabled={!dirty || busy} onClick={() => void save({ googleBusiness: patch }, () => setDraft((c) => ({ ...c, serviceAccountJson: "", partnerKey: "" })))}>
                    {busy ? "Saving…" : "Save"}
                </Button>
            </div>
        </div>
    );
}

function TelephonyCard({ card, onSaved }: { card: LeadChannelsView["telephony"]; onSaved: () => void }) {
    const [provider, setProvider] = React.useState<TelephonyProvider | "">(card.provider ?? "");
    const [draft, setDraft] = React.useState({
        accountSid: card.accountSid ?? "",
        apiKey: "",
        apiToken: "",
        subdomain: card.subdomain ?? "",
        callerIds: card.callerIds.join(", "),
        missedCallNumber: card.missedCallNumber ?? "",
        ivrNumber: card.ivrNumber ?? "",
        recordCalls: card.recordCalls,
        consentLine: card.consentLine,
        ivrGreeting: card.ivrGreeting,
        ivrPublisherPrompt: card.ivrPublisherPrompt,
        ivrAdvertiserPrompt: card.ivrAdvertiserPrompt,
        webhookSecret: "",
    });
    const { busy, save } = useSave("Telephony", onSaved);
    const set = (key: keyof typeof draft) => (value: string) => setDraft((current) => ({ ...current, [key]: value }));
    const patch: NonNullable<LeadChannelsPatch["telephony"]> = {};
    if (provider && provider !== card.provider) patch.provider = provider;
    for (const key of ["apiKey", "apiToken", "webhookSecret"] as const) if (draft[key]) patch[key] = draft[key];
    for (const key of ["accountSid", "subdomain", "missedCallNumber", "ivrNumber", "consentLine", "ivrGreeting", "ivrPublisherPrompt", "ivrAdvertiserPrompt"] as const) {
        if (draft[key] !== (card[key] ?? "") && draft[key]) patch[key] = draft[key];
    }
    if (draft.callerIds !== card.callerIds.join(", ")) patch.callerIds = parseCallerIds(draft.callerIds);
    if (draft.recordCalls !== card.recordCalls) patch.recordCalls = draft.recordCalls;
    const dirty = Object.keys(patch).length > 0;
    return (
        <div className="rounded-md border p-4" data-testid="channel-card-telephony">
            <CardHead title="Telephony" card={card} hint="Click-to-call rings the agent first, then the lead on a masked number. Recording needs the consent line, which plays first; recordings are kept 90 days." />
            <div className="mt-3 grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="tel-provider">Operator</Label>
                        <Select value={provider} onValueChange={(value) => setProvider(value as TelephonyProvider)}>
                            <SelectTrigger id="tel-provider" className="h-9" data-testid="tel-provider">
                                <SelectValue placeholder="Pick an operator" />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(TELEPHONY_PROVIDER_LABEL) as TelephonyProvider[]).map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {TELEPHONY_PROVIDER_LABEL[value]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Field id="tel-sid" label={provider === "KNOWLARITY" ? "Account (unused)" : "Account SID"} value={draft.accountSid} onChange={set("accountSid")} placeholder={card.accountSid} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Field id="tel-key" label={provider === "TWILIO" ? "API key (unused)" : "API key"} value={draft.apiKey} onChange={set("apiKey")} placeholder={card.apiKey ?? "not set"} secret />
                    <Field id="tel-token" label={provider === "TWILIO" ? "Auth token" : "API token"} value={draft.apiToken} onChange={set("apiToken")} placeholder={card.apiToken ?? "not set"} secret />
                </div>
                {provider !== "TWILIO" ? <Field id="tel-subdomain" label={provider === "KNOWLARITY" ? "Knowlarity number (k-number)" : "Exotel API host"} value={draft.subdomain} onChange={set("subdomain")} placeholder={provider === "KNOWLARITY" ? "+91 80300 00000" : "api.exotel.com"} /> : null}
                <div className="space-y-1.5">
                    <Label htmlFor="tel-callers">Masked numbers (caller ids)</Label>
                    <Input id="tel-callers" value={draft.callerIds} onChange={(event) => set("callerIds")(event.target.value)} placeholder="+91 80000 00000, +91 80000 00001" data-testid="tel-callers" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Field id="tel-missed" label="Missed-call number" value={draft.missedCallNumber} onChange={set("missedCallNumber")} placeholder="+91 80300 00000" />
                    <Field id="tel-ivr" label="IVR number" value={draft.ivrNumber} onChange={set("ivrNumber")} placeholder="+91 80300 00001" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                    <Switch checked={draft.recordCalls} onCheckedChange={(checked) => setDraft((c) => ({ ...c, recordCalls: checked }))} data-testid="tel-record" /> Record calls (after the consent line)
                </label>
                <Field id="tel-consent" label="Consent line" value={draft.consentLine} onChange={set("consentLine")} placeholder="This call may be recorded for quality" />
                <div className="grid gap-3 sm:grid-cols-3">
                    <Field id="tel-greeting" label="IVR greeting" value={draft.ivrGreeting} onChange={set("ivrGreeting")} />
                    <Field id="tel-prompt-pub" label="Press 1 — publishers" value={draft.ivrPublisherPrompt} onChange={set("ivrPublisherPrompt")} />
                    <Field id="tel-prompt-adv" label="Press 2 — advertisers" value={draft.ivrAdvertiserPrompt} onChange={set("ivrAdvertiserPrompt")} />
                </div>
                <Field id="tel-secret" label="Webhook secret (Exotel / Knowlarity URL token)" value={draft.webhookSecret} onChange={set("webhookSecret")} placeholder={card.webhookSecret ?? "not set"} secret />
            </div>
            <div className="mt-3 flex justify-end">
                <Button size="sm" disabled={!dirty || busy} onClick={() => void save({ telephony: patch }, () => setDraft((c) => ({ ...c, apiKey: "", apiToken: "", webhookSecret: "" })))} data-testid="tel-save">
                    {busy ? "Saving…" : "Save"}
                </Button>
            </div>
        </div>
    );
}
