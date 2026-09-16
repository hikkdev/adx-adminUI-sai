"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { cn } from "@/lib/utils";
import {
    KYC_PROVIDER_EXPLANATION,
    KYC_PROVIDER_META,
    kycProviderService,
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
 */
export function DigioSection() {
    const live = isLive("kyc");
    const resource = useApiResource<KycProviderConfig | null>(`integrations:kyc:${live}`, () => (live ? kycProviderService.get() : Promise.resolve(null)));
    const [busy, setBusy] = React.useState<KycProviderState | null>(null);

    const config = resource.data;
    const state = config?.kycProvider ?? "DIGIO";

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
                            <dt className="text-xs text-muted-foreground">Base URL</dt>
                            <dd className="mt-0.5 truncate font-mono text-xs text-foreground">{config.baseUrl ?? "not configured"}</dd>
                        </div>
                    </dl>
                    <p className="text-xs text-muted-foreground">
                        Unconfigured keys run the mock path; the probe never degrades that. Every Digio initiate and restart answers 503 while the switch is off Digio, and the apps offer the manual upload instead.
                    </p>
                </div>
            ) : null}
        </SectionCard>
    );
}
