"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { SettingsNav } from "../settings-nav";
import { aiService, type AiProviderKind, type AiSettings } from "@/services/ai";

/**
 * Where the model is chosen.
 *
 * The requirement was explicitly not to be tied to one vendor, so this screen is
 * the whole coupling: four named providers, a fifth slot for anything speaking
 * the OpenAI chat-completions shape, and nothing in the codebase above the
 * provider adapter that knows which was picked. Moving from one to another is
 * this form, not a deployment.
 */

const PROVIDERS: { value: AiProviderKind; label: string; hint: string }[] = [
    { value: "anthropic", label: "Anthropic", hint: "Claude. Key from console.anthropic.com." },
    { value: "openai", label: "OpenAI", hint: "GPT. Key from platform.openai.com." },
    { value: "google", label: "Google", hint: "Gemini. Key from Google AI Studio." },
    {
        value: "azure-openai",
        label: "Azure OpenAI",
        hint: "Your Azure resource URL, and the deployment name as the model.",
    },
    {
        value: "custom",
        label: "Our own, or anything OpenAI-compatible",
        hint: "Any endpoint speaking /chat/completions — self-hosted included. Needs no code.",
    },
];

/** The providers that address a server we have to be told about. */
const NEEDS_BASE_URL: AiProviderKind[] = ["azure-openai", "custom"];

export function AiView({ initial }: { initial: AiSettings }) {
    const [settings, setSettings] = React.useState<AiSettings>(initial);
    /** Empty means "keep the stored key" — the real one never reaches this page. */
    const [apiKey, setApiKey] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const needsBaseUrl = NEEDS_BASE_URL.includes(settings.provider);
    const provider = PROVIDERS.find((entry) => entry.value === settings.provider);

    const set = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) =>
        setSettings((current) => ({ ...current, [key]: value }));

    async function save() {
        setBusy(true);
        try {
            const saved = await aiService.save({
                provider: settings.provider,
                // Omitted when blank: sending an empty string would clear a key
                // that this page was never allowed to read back.
                ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
                model: settings.model ?? "",
                baseUrl: needsBaseUrl ? (settings.baseUrl ?? "") : null,
                enabled: settings.enabled,
                freeQuota: settings.freeQuota,
                paidQuota: settings.paidQuota,
                translateOnRead: settings.translateOnRead,
            });
            setSettings(saved);
            setApiKey("");
            toast.success("AI settings saved");
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save those settings.");
        } finally {
            setBusy(false);
        }
    }

    const configured = settings.enabled && (Boolean(settings.apiKey) || needsBaseUrl);

    return (
        <div className="space-y-5">
            <PageHeader
                title="AI"
                subtitle="Which model drafts listing descriptions and translates the marketplace"
            />
            <SettingsNav />

            <SectionCard
                title="Provider"
                description="One provider serves both jobs. Switching is a change here, not a deployment."
                actions={
                    <StatusBadge
                        status={
                            configured
                                ? { label: "In use", tone: "success" }
                                : { label: "Off", tone: "neutral" }
                        }
                    />
                }
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label>Provider</Label>
                        <Select
                            value={settings.provider}
                            onValueChange={(value) => set("provider", value as AiProviderKind)}
                        >
                            <SelectTrigger className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PROVIDERS.map((entry) => (
                                    <SelectItem key={entry.value} value={entry.value}>
                                        {entry.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {provider && (
                            <p className="text-xs text-muted-foreground">{provider.hint}</p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label>Model</Label>
                        <Input
                            className="h-9"
                            value={settings.model ?? ""}
                            onChange={(event) => set("model", event.target.value)}
                            placeholder={
                                settings.provider === "azure-openai"
                                    ? "Your deployment name"
                                    : "Leave blank for this provider's default"
                            }
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label>API key</Label>
                        <Input
                            className="h-9"
                            type="password"
                            value={apiKey}
                            onChange={(event) => setApiKey(event.target.value)}
                            placeholder={settings.apiKey ?? "Not set"}
                        />
                        <p className="text-xs text-muted-foreground">
                            {settings.apiKey
                                ? `Stored key ends ${settings.apiKey}. Leave blank to keep it.`
                                : "No key stored. Falls back to the AI_API_KEY environment variable."}
                        </p>
                    </div>

                    {needsBaseUrl && (
                        <div className="space-y-1.5">
                            <Label>Base URL</Label>
                            <Input
                                className="h-9"
                                value={settings.baseUrl ?? ""}
                                onChange={(event) => set("baseUrl", event.target.value)}
                                placeholder="https://your-endpoint.example.com/v1"
                            />
                            <p className="text-xs text-muted-foreground">
                                Required by this provider. Nothing is sent anywhere else.
                            </p>
                        </div>
                    )}
                </div>

                <label className="mt-5 flex items-start gap-3 border-t pt-4">
                    <Switch
                        checked={settings.enabled}
                        onCheckedChange={(value) => set("enabled", value)}
                    />
                    <span>
                        <span className="text-sm font-medium text-foreground">
                            Turn AI features on
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                            Off means the Generate button never appears and no listing text is
                            translated. A key on its own does not switch it on.
                        </span>
                    </span>
                </label>
            </SectionCard>

            <SectionCard
                title="Drafting allowance"
                description="How many times one description may be regenerated. Each press costs a model call."
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label>Free publishers</Label>
                        <Input
                            className="h-9"
                            type="number"
                            min={0}
                            max={100}
                            value={settings.freeQuota}
                            onChange={(event) =>
                                set("freeQuota", Number(event.target.value) || 0)
                            }
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Subscribed publishers</Label>
                        <Input
                            className="h-9"
                            type="number"
                            min={0}
                            max={100}
                            value={settings.paidQuota}
                            onChange={(event) =>
                                set("paidQuota", Number(event.target.value) || 0)
                            }
                        />
                    </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                    Counted per description, not per publisher — a publisher listing ten spots gets
                    the allowance on each. A publisher with a subscription running gets the second
                    number.
                </p>
            </SectionCard>

            <SectionCard
                title="Translation"
                description="Listing text is translated into whatever language the reader's account is set to."
            >
                <label className="flex items-start gap-3">
                    <Switch
                        checked={settings.translateOnRead}
                        onCheckedChange={(value) => set("translateOnRead", value)}
                    />
                    <span>
                        <span className="text-sm font-medium text-foreground">
                            Translate listings as they are read
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                            A publisher writing in Malayalam is read in Hindi by an advertiser whose
                            phone is set to Hindi, with neither doing anything. The original is kept
                            and shown on request. Translations are cached by content, so the same
                            sentence across many listings is paid for once.
                        </span>
                    </span>
                </label>
            </SectionCard>

            <div className="flex justify-end">
                <Button onClick={save} disabled={busy}>
                    {busy ? "Saving…" : "Save AI settings"}
                </Button>
            </div>
        </div>
    );
}
