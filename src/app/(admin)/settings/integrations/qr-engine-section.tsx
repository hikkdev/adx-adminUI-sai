"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { cn } from "@/lib/utils";
import {
    GENQR_REQUIRED_SCOPES,
    QR_DOT_STYLES,
    QR_DOT_STYLE_LABEL,
    QR_ENGINE_LABEL,
    QR_ENGINE_PROVIDERS,
    QR_FRAME_STYLES,
    QR_FRAME_STYLE_LABEL,
    integrationsService,
    isMasked,
    qrEngineTestBlocker,
    type QrDotStyle,
    type QrEngineProvider,
    type QrEngineSettings,
    type QrEngineStyle,
    type QrEngineTest,
    type QrFrameStyle,
} from "@/services/integrations";

interface QrEngineSectionProps {
    /** The `qrEngine` section as `GET /integrations` sent it — the key masked. Undefined on a backend older than QR-1. */
    stored: QrEngineSettings | undefined;
    onChanged: () => void;
}

export const LOCAL_SENTENCE = "Every code is drawn here in the house style — dark teal on white. Nothing is hosted; a hoarding carries ADX's own /t/ link.";
export const GENQR_SENTENCE =
    "GenQR — our own QR platform, on its own deployment — draws the styled artwork for every printed code and hosts the short code in front of each campaign hoarding. ADX is a tenant of it: an Enterprise account, one scoped key.";

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * QR-1: the QR engine card — the switch (Local | GenQR), GenQR's host and
 * key, the ADX-branded short origin the hoardings carry, the print style,
 * and a test that reads the GenQR account and says what the key lacks.
 *
 * `PUT /integrations { section: "qrEngine", patch }`: the provider moves
 * on its own the moment it is chosen (audited QR_ENGINE_CHANGED); the host,
 * key and short origin save together; the style saves as its own patch
 * (blank keeps, a cleared field sends null). A backend older than the
 * field leaves `stored` undefined and the card says so.
 */
export function QrEngineSection({ stored, onChanged }: QrEngineSectionProps) {
    const provider: QrEngineProvider = stored?.provider ?? "LOCAL";
    const [busy, setBusy] = React.useState<QrEngineProvider | null>(null);

    const choose = async (next: QrEngineProvider) => {
        if (next === provider) return;
        setBusy(next);
        try {
            await integrationsService.update("qrEngine", { provider: next });
            toast.success(next === "GENQR" ? "Codes go through GenQR" : "Codes are drawn locally", {
                description:
                    next === "GENQR"
                        ? "Printed codes get GenQR's artwork; new campaigns get a hosted short code in front of /t/. Campaigns paid for before this need a sync from their tracking codes."
                        : "Every code is drawn in the house style again. Hosted codes already printed keep resolving on GenQR.",
            });
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not switch the QR engine.");
        } finally {
            setBusy(null);
        }
    };

    const badge = !stored
        ? { label: "Not reported", tone: "neutral" as const }
        : provider === "LOCAL"
          ? { label: "Local", tone: "neutral" as const }
          : stored.hostsDynamic
            ? { label: "GenQR connected", tone: "success" as const }
            : { label: "GenQR — not configured", tone: "warning" as const };

    return (
        <SectionCard title="QR engine" description="Who draws the codes that go to print, and who hosts the short code on a campaign hoarding.">
            <div className="flex flex-col gap-4 rounded-lg border p-4" data-testid="qr-engine">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{QR_ENGINE_LABEL[provider]}</p>
                    <StatusBadge status={badge} />
                </div>

                {!stored ? (
                    <p className="text-xs text-muted-foreground">This backend does not report a QR engine; every code is drawn locally.</p>
                ) : (
                    <>
                        <div className="space-y-1">
                            <Label className="text-xs">Engine</Label>
                            <div role="radiogroup" aria-label="QR engine" className="inline-flex w-full max-w-md rounded-md border p-0.5">
                                {QR_ENGINE_PROVIDERS.map((option) => {
                                    const active = option === provider;
                                    return (
                                        <button
                                            key={option}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            disabled={busy !== null}
                                            onClick={() => choose(option)}
                                            className={cn(
                                                "flex-1 rounded px-2 py-1 text-xs font-medium transition-colors disabled:cursor-default",
                                                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60",
                                            )}
                                        >
                                            {QR_ENGINE_LABEL[option]}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[11px] text-muted-foreground">{provider === "GENQR" ? GENQR_SENTENCE : LOCAL_SENTENCE}</p>
                        </div>

                        {provider === "GENQR" && (
                            <>
                                {/* Remounted on every re-read, so a saved value replaces the draft without an effect. */}
                                <GenqrCredentials key={`creds:${stored.baseUrl}:${stored.shortBaseUrl}:${stored.apiKey}`} stored={stored} onChanged={onChanged} />
                                <PrintStyle key={`style:${JSON.stringify(stored.style)}`} stored={stored} onChanged={onChanged} />
                                <QrEngineTestControl stored={stored} />
                            </>
                        )}
                    </>
                )}
            </div>
        </SectionCard>
    );
}

/** The host, the key and the short origin — one save. The key is masked on read and blank keeps it. */
function GenqrCredentials({ stored, onChanged }: { stored: QrEngineSettings; onChanged: () => void }) {
    const [baseUrl, setBaseUrl] = React.useState(stored.baseUrl ?? "");
    const [apiKey, setApiKey] = React.useState("");
    const [shortBaseUrl, setShortBaseUrl] = React.useState(stored.shortBaseUrl ?? "");
    const [saving, setSaving] = React.useState(false);

    const dirty = baseUrl.trim() !== (stored.baseUrl ?? "") || apiKey.trim() !== "" || shortBaseUrl.trim() !== (stored.shortBaseUrl ?? "");

    const save = async () => {
        setSaving(true);
        try {
            const patch: Record<string, unknown> = {};
            if (baseUrl.trim() !== (stored.baseUrl ?? "")) patch.baseUrl = baseUrl.trim();
            if (apiKey.trim() && !isMasked(apiKey)) patch.apiKey = apiKey.trim();
            if (shortBaseUrl.trim() !== (stored.shortBaseUrl ?? "")) patch.shortBaseUrl = shortBaseUrl.trim() === "" ? null : shortBaseUrl.trim();
            await integrationsService.update("qrEngine", patch);
            toast.success("GenQR connection saved");
            setApiKey("");
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not save the GenQR connection.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-3" data-testid="qr-engine-credentials">
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                    <Label htmlFor="genqr-base-url" className="text-xs">
                        GenQR base URL
                    </Label>
                    <Input id="genqr-base-url" value={baseUrl} placeholder="https://genqr.example" onChange={(event) => setBaseUrl(event.target.value)} />
                    <p className="text-[11px] text-muted-foreground">Where GenQR is deployed. ADX calls its /api/v1 with the key below.</p>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="genqr-api-key" className="text-xs">
                        API key
                    </Label>
                    <Input
                        id="genqr-api-key"
                        type="password"
                        autoComplete="off"
                        value={apiKey}
                        placeholder={stored.apiKey ?? "gqr_…"}
                        onChange={(event) => setApiKey(event.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                        An Enterprise key with the scopes {GENQR_REQUIRED_SCOPES.join(", ")}. Shown masked; blank keeps the stored one.
                    </p>
                </div>
                <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="genqr-short-base" className="text-xs">
                        Short origin printed on hoardings
                    </Label>
                    <Input id="genqr-short-base" value={shortBaseUrl} placeholder="https://go.adx.in" onChange={(event) => setShortBaseUrl(event.target.value)} />
                    <p className="text-[11px] text-muted-foreground">
                        The ADX-branded host a hoarding carries as <code className="rounded bg-muted px-1 font-mono text-[10px]">/r/XXXX</code>. Set the same value as
                        &ldquo;Redirect base&rdquo; on the GenQR account and proxy that host&rsquo;s /r/ to GenQR; the test below checks the two agree.
                    </p>
                </div>
            </div>
            <div className="flex justify-end">
                <Button size="sm" className="h-8" disabled={!dirty || saving} onClick={save}>
                    {saving ? "Saving…" : "Save connection"}
                </Button>
            </div>
        </div>
    );
}

/** The style every printed code is drawn with on GenQR. Its own patch; a cleared field sends null. */
function PrintStyle({ stored, onChanged }: { stored: QrEngineSettings; onChanged: () => void }) {
    const [draft, setDraft] = React.useState<QrEngineStyle>(stored.style ?? {});
    const [saving, setSaving] = React.useState(false);

    const base = stored.style ?? {};
    const keys: (keyof QrEngineStyle)[] = ["foregroundColor", "backgroundColor", "dotStyle", "frameStyle", "frameCaption", "logoUrl"];
    const dirty = keys.some((key) => (draft[key] ?? "") !== (base[key] ?? ""));
    const colourProblem = (value: string | undefined) => value && !HEX.test(value) ? "Use #rrggbb" : null;
    const logoProblem = draft.logoUrl && !/^(https:\/\/\S+|\/\S*)$/.test(draft.logoUrl) ? "An https URL or a same-origin path" : null;
    const problems = [colourProblem(draft.foregroundColor), colourProblem(draft.backgroundColor), logoProblem].filter(Boolean);

    const save = async () => {
        setSaving(true);
        try {
            const patch: Record<string, unknown> = {};
            for (const key of keys) {
                const next = draft[key] ?? "";
                const was = base[key] ?? "";
                if (next === was) continue;
                patch[key] = next === "" ? null : next;
            }
            await integrationsService.update("qrEngine", { style: patch });
            toast.success("Print style saved");
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not save the print style.");
        } finally {
            setSaving(false);
        }
    };

    const set = (key: keyof QrEngineStyle, value: string) => setDraft((current) => ({ ...current, [key]: value }));

    return (
        <div className="space-y-3 rounded-md bg-muted/40 p-3" data-testid="qr-engine-style">
            <div>
                <p className="text-xs font-medium text-foreground">Print style</p>
                <p className="text-[11px] text-muted-foreground">
                    Sent with every printed code — site plaques, agent cards, pickup labels, hoarding codes. The SVG carries all of it; a PNG carries the colours.
                </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                    <Label htmlFor="qr-style-fg" className="text-xs">
                        Foreground
                    </Label>
                    <Input id="qr-style-fg" value={draft.foregroundColor ?? ""} placeholder="#213333" onChange={(event) => set("foregroundColor", event.target.value.trim())} />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="qr-style-bg" className="text-xs">
                        Background
                    </Label>
                    <Input id="qr-style-bg" value={draft.backgroundColor ?? ""} placeholder="#FFFFFF" onChange={(event) => set("backgroundColor", event.target.value.trim())} />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">Dots</Label>
                    <Select value={draft.dotStyle ?? "square"} onValueChange={(next) => set("dotStyle", next as QrDotStyle)}>
                        <SelectTrigger aria-label="Dot style">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {QR_DOT_STYLES.map((option) => (
                                <SelectItem key={option} value={option}>
                                    {QR_DOT_STYLE_LABEL[option]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">Frame</Label>
                    <Select value={draft.frameStyle ?? "none"} onValueChange={(next) => set("frameStyle", next as QrFrameStyle)}>
                        <SelectTrigger aria-label="Frame style">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {QR_FRAME_STYLES.map((option) => (
                                <SelectItem key={option} value={option}>
                                    {QR_FRAME_STYLE_LABEL[option]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="qr-style-caption" className="text-xs">
                        Caption
                    </Label>
                    <Input id="qr-style-caption" value={draft.frameCaption ?? ""} placeholder="Scan me" maxLength={120} onChange={(event) => set("frameCaption", event.target.value)} />
                    <p className="text-[11px] text-muted-foreground">Each printed code type names its own purpose over this.</p>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="qr-style-logo" className="text-xs">
                        Logo URL
                    </Label>
                    <Input id="qr-style-logo" value={draft.logoUrl ?? ""} placeholder="https://…/logo.png" onChange={(event) => set("logoUrl", event.target.value.trim())} />
                </div>
            </div>
            {problems.length > 0 && <p className="text-[11px] text-danger">{problems.join(" · ")}</p>}
            <div className="flex justify-end">
                <Button size="sm" variant="outline" className="h-8" disabled={!dirty || saving || problems.length > 0} onClick={save}>
                    {saving ? "Saving…" : "Save style"}
                </Button>
            </div>
        </div>
    );
}

/**
 * "Test connection" — `POST /integrations/qr-engine/test`, and the verdict
 * inline: reachable, authorised, the account and plan, the scopes the key
 * lacks, whether the printed origin matches. Disabled, with the reason,
 * until the host and key are on file.
 */
export function QrEngineTestControl({ stored }: { stored: QrEngineSettings }) {
    const [busy, setBusy] = React.useState(false);
    const [verdict, setVerdict] = React.useState<QrEngineTest | null>(null);
    const blocker = qrEngineTestBlocker(stored);

    const run = async () => {
        setBusy(true);
        try {
            setVerdict(await integrationsService.testQrEngine());
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not test the GenQR connection.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Reads the GenQR account on the stored key and prints what it answered. Nothing is minted.</p>
                <Button size="sm" variant="outline" className="h-8" disabled={Boolean(blocker) || busy} onClick={run}>
                    {busy ? "Testing…" : "Test connection"}
                </Button>
            </div>
            {blocker && <p className="text-[11px] text-warning">{blocker}</p>}
            {verdict && <QrEngineVerdict verdict={verdict} />}
        </div>
    );
}

function QrEngineVerdict({ verdict }: { verdict: QrEngineTest }) {
    const ok = verdict.authorized && verdict.scopesMissing.length === 0 && verdict.shortBaseMatches !== false && (verdict.account?.apiAccess ?? true);
    const badge = ok
        ? { label: "Connected", tone: "success" as const }
        : verdict.authorized
          ? { label: "Connected, with gaps", tone: "warning" as const }
          : verdict.reachable
            ? { label: "Refused", tone: "danger" as const }
            : { label: verdict.configured ? "Unreachable" : "Not configured", tone: "danger" as const };
    return (
        <div data-testid="qr-engine-verdict" className="space-y-1 rounded-md border p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={badge} />
                {verdict.status !== null && <span className="font-mono text-[11px] text-muted-foreground">HTTP {verdict.status}</span>}
            </div>
            <p className={ok ? "text-foreground" : verdict.authorized ? "text-warning" : "text-danger"}>{verdict.message}</p>
            {verdict.account && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
                    <dt className="text-muted-foreground">Account</dt>
                    <dd className="font-mono">{verdict.account.email}</dd>
                    <dt className="text-muted-foreground">Plan</dt>
                    <dd>
                        {verdict.account.plan}
                        {!verdict.account.apiAccess && <span className="text-danger"> — no API access</span>}
                    </dd>
                    <dt className="text-muted-foreground">Key scope</dt>
                    <dd className="font-mono">{verdict.account.scope}</dd>
                    <dt className="text-muted-foreground">GenQR prints</dt>
                    <dd className={cn("font-mono", verdict.shortBaseMatches === false && "text-warning")}>{verdict.account.redirectBase || "its own host"}</dd>
                </dl>
            )}
            {verdict.scopesMissing.length > 0 && (
                <p className="text-warning">
                    Add to the key on GenQR: <span className="font-mono">{verdict.scopesMissing.join(", ")}</span>
                </p>
            )}
        </div>
    );
}
