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
import { LEAD_FEED_KEYS, LEAD_FEED_LABEL, leadIntegrationsService, type LeadFeedCredentialView, type LeadFeedKey, type LeadFormsView } from "@/services/leads";

/**
 * LH3 (D4 / the ad forms): the credential cards behind the Sources desk.
 * A partner feed needs its endpoint (and a key in a named header);
 * IndiaMART needs only the seller CRM key; Google Places rides the Maps
 * card. The three lead-form ad webhooks need their provider's secret. A
 * key typed here is never shown back — the mask says one is set.
 */
export function LeadSourcesSection() {
    const live = isLive("leads");
    const resource = useApiResource<{ leadFeeds: Record<LeadFeedKey, LeadFeedCredentialView> | null; leadForms: LeadFormsView | null } | null>(`integrations:lead-sources:${live}`, () => (live ? leadIntegrationsService.get() : Promise.resolve(null)));
    const data = resource.data;
    return (
        <SectionCard
            title="Lead feeds and ad forms"
            description="The directory feeds' partner credentials and the lead-form ad webhooks' secrets — the doors behind Leads › Sources. Google Places uses the Maps server key above."
            actions={
                <Link href="/leads/sources" className="text-sm text-primary hover:underline">
                    Sources desk
                </Link>
            }
        >
            {!live ? (
                <p className="text-sm text-muted-foreground">Read from the API; turn the leads domain on to see the cards.</p>
            ) : resource.loading && !data ? (
                <p className="text-sm text-muted-foreground">Reading…</p>
            ) : resource.error ? (
                <p className="text-sm text-danger">{resource.error}</p>
            ) : data?.leadFeeds && data.leadForms ? (
                <div className="space-y-6">
                    <div className="grid gap-4 lg:grid-cols-2">
                        {LEAD_FEED_KEYS.map((key) => (
                            <FeedCard key={key} feedKey={key} card={data.leadFeeds![key]} onSaved={resource.reload} />
                        ))}
                    </div>
                    <FormsCard forms={data.leadForms} onSaved={resource.reload} />
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">This backend does not serve the lead feed sections of the integrations row.</p>
            )}
        </SectionCard>
    );
}

function FeedCard({ feedKey, card, onSaved }: { feedKey: LeadFeedKey; card: LeadFeedCredentialView; onSaved: () => void }) {
    const [endpoint, setEndpoint] = React.useState(card.endpoint ?? "");
    const [headerName, setHeaderName] = React.useState(card.headerName ?? "");
    const [apiKey, setApiKey] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const isIndiamart = feedKey === "indiamart";
    const patch: { endpoint?: string; apiKey?: string; headerName?: string } = {};
    if (endpoint !== (card.endpoint ?? "") && endpoint) patch.endpoint = endpoint;
    if (headerName !== (card.headerName ?? "") && headerName) patch.headerName = headerName;
    if (apiKey) patch.apiKey = apiKey;
    const dirty = Object.keys(patch).length > 0;

    async function save() {
        if (!dirty || busy) return;
        setBusy(true);
        try {
            await leadIntegrationsService.setFeed(feedKey, patch);
            toast.success(`${LEAD_FEED_LABEL[feedKey]} saved`, { description: "Confirm the terms on the source under Settings › Leads scoring before running it." });
            setApiKey("");
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save the card.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="rounded-md border p-4" data-testid={`lead-feed-card-${feedKey}`}>
            <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-medium text-foreground">{LEAD_FEED_LABEL[feedKey]}</h4>
                <StatusBadge status={card.configured ? { label: "Configured", tone: "success" } : { label: "Not configured", tone: "neutral" }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
                {isIndiamart ? "The seller CRM key (Seller dashboard › Lead Manager › CRM API); the endpoint only if IndiaMART moves it." : "A data-partner endpoint that answers { results: [{ id, name, phone, address, city, lat, lng }] } to a POST of { category, city, side, limit }, with the key in the header named."}
            </p>
            <div className="mt-3 grid gap-3">
                <div className="space-y-1.5">
                    <Label htmlFor={`feed-${feedKey}-endpoint`}>Endpoint{isIndiamart ? " (optional)" : ""}</Label>
                    <Input id={`feed-${feedKey}-endpoint`} value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <Label htmlFor={`feed-${feedKey}-key`}>{isIndiamart ? "CRM key" : "API key"}</Label>
                        <Input id={`feed-${feedKey}-key`} type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={card.apiKey ?? "not set"} />
                    </div>
                    {!isIndiamart && (
                        <div className="space-y-1.5">
                            <Label htmlFor={`feed-${feedKey}-header`}>Header</Label>
                            <Input id={`feed-${feedKey}-header`} value={headerName} onChange={(event) => setHeaderName(event.target.value)} placeholder="X-Api-Key" />
                        </div>
                    )}
                </div>
            </div>
            <div className="mt-3 flex justify-end">
                <Button size="sm" disabled={!dirty || busy} onClick={() => void save()}>
                    {busy ? "Saving…" : "Save"}
                </Button>
            </div>
        </div>
    );
}

function FormsCard({ forms, onSaved }: { forms: LeadFormsView; onSaved: () => void }) {
    const [draft, setDraft] = React.useState({ metaAppSecret: "", metaVerifyToken: "", metaPageToken: "", googleKey: "", linkedinSecret: "" });
    const [busy, setBusy] = React.useState(false);
    const dirty = Object.values(draft).some((value) => value.trim());

    async function save() {
        if (!dirty || busy) return;
        setBusy(true);
        try {
            await leadIntegrationsService.setForms({
                ...(draft.metaAppSecret || draft.metaVerifyToken || draft.metaPageToken ? { meta: { ...(draft.metaAppSecret ? { appSecret: draft.metaAppSecret } : {}), ...(draft.metaVerifyToken ? { verifyToken: draft.metaVerifyToken } : {}), ...(draft.metaPageToken ? { pageAccessToken: draft.metaPageToken } : {}) } } : {}),
                ...(draft.googleKey ? { google: { key: draft.googleKey } } : {}),
                ...(draft.linkedinSecret ? { linkedin: { clientSecret: draft.linkedinSecret } } : {}),
            });
            toast.success("Lead-form secrets saved");
            setDraft({ metaAppSecret: "", metaVerifyToken: "", metaPageToken: "", googleKey: "", linkedinSecret: "" });
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save the secrets.");
        } finally {
            setBusy(false);
        }
    }

    const set = (key: keyof typeof draft) => (event: React.ChangeEvent<HTMLInputElement>) => setDraft((current) => ({ ...current, [key]: event.target.value }));

    return (
        <div className="rounded-md border p-4" data-testid="lead-forms-card">
            <h4 className="text-sm font-medium text-foreground">Lead-form ads</h4>
            <p className="mt-1 text-xs text-muted-foreground">
                Register the webhooks with each provider: <code className="text-[11px]">/api/v1/webhooks/leads/meta</code> (Meta Lead Ads — the app secret signs the body, the verify token answers the handshake, a page token fetches the form&apos;s answers), <code className="text-[11px]">/webhooks/leads/google</code> (Google Ads lead forms — the key Google puts in each payload), <code className="text-[11px]">/webhooks/leads/linkedin</code> (Lead Gen Forms — the client secret signs the body). Add <code className="text-[11px]">?side=PUBLISHER</code> to a form that recruits surfaces; advertiser is the default.
            </p>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label>Meta</Label>
                        <StatusBadge status={forms.meta.configured ? { label: "Configured", tone: "success" } : { label: "Not configured", tone: "neutral" }} />
                    </div>
                    <Input type="password" value={draft.metaAppSecret} onChange={set("metaAppSecret")} placeholder={forms.meta.appSecret ?? "App secret"} aria-label="Meta app secret" />
                    <Input type="password" value={draft.metaVerifyToken} onChange={set("metaVerifyToken")} placeholder={forms.meta.verifyToken ?? "Verify token"} aria-label="Meta verify token" />
                    <Input type="password" value={draft.metaPageToken} onChange={set("metaPageToken")} placeholder={forms.meta.pageAccessToken ?? "Page access token"} aria-label="Meta page access token" />
                </div>
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label>Google Ads</Label>
                        <StatusBadge status={forms.google.configured ? { label: "Configured", tone: "success" } : { label: "Not configured", tone: "neutral" }} />
                    </div>
                    <Input type="password" value={draft.googleKey} onChange={set("googleKey")} placeholder={forms.google.key ?? "Lead form key"} aria-label="Google lead form key" />
                </div>
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label>LinkedIn</Label>
                        <StatusBadge status={forms.linkedin.configured ? { label: "Configured", tone: "success" } : { label: "Not configured", tone: "neutral" }} />
                    </div>
                    <Input type="password" value={draft.linkedinSecret} onChange={set("linkedinSecret")} placeholder={forms.linkedin.clientSecret ?? "Client secret"} aria-label="LinkedIn client secret" />
                </div>
            </div>
            <div className="mt-3 flex justify-end">
                <Button size="sm" disabled={!dirty || busy} onClick={() => void save()}>
                    {busy ? "Saving…" : "Save"}
                </Button>
            </div>
        </div>
    );
}
