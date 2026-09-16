"use client";

import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { catalogueService } from "@/services/packages";
import { revenueService } from "@/services/revenue";
import { settingsReadApi, settingsService, type PlatformSettings } from "@/services/settings";
import { SettingsView } from "./settings-view";
import { NO_TIERS, type PolicyTiers } from "./subscriptions-card";

/**
 * Lot J2: the tiers the Subscriptions card draws trial days for — the
 * publisher plans and the advertiser catalogue, each read once. A read
 * that fails, or a domain that is off, leaves that audience's list empty
 * and the card falls back to the tiers the policy itself names.
 */
async function readPolicyTiers(): Promise<PolicyTiers> {
    const [publisher, advertiser] = await Promise.all([
        isLive("finance") ? revenueService.plans().then((plans) => plans.map((plan) => plan.tier)).catch(() => []) : Promise.resolve([]),
        isLive("packages")
            ? catalogueService.catalogue().then((catalogue) => catalogue.plans.map((plan) => plan.tier)).catch(() => [])
            : Promise.resolve([]),
    ]);
    return { publisher, advertiser };
}

/**
 * The general Settings page reads the one `AppConfig` row keyed `platform`.
 *
 * No fixtures. The page used to draw a currency, a take rate, a payout
 * cadence and three notification toggles that nothing on the server read —
 * every switch on it changed a toast. What it draws now is exactly the set
 * of numbers other modules read on their hot paths, and a seeded floor here
 * would be a lie about what checkout enforces.
 */
export function SettingsLoader() {
    const live = settingsReadApi();
    const resource = useApiResource<PlatformSettings | null>(`settings:platform:${live}`, () =>
        live ? settingsService.get() : Promise.resolve(null),
    );
    const tiers = useApiResource<PolicyTiers>(`settings:policy-tiers:${live}`, () => (live ? readPolicyTiers() : Promise.resolve(NO_TIERS)));

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-8 text-center shadow-none">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                    <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">Not connected to the ADX backend</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                    Every number on this page is one the backend reads before it lets something happen — a KYC breach, a
                    booking floor, a support SLA. There is no seeded stand-in, because a fixture here would be a claim about
                    what production enforces. Set{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_USE_API=true</code> and point the console
                    at a running backend.
                </p>
            </Card>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(settings) =>
                settings ? (
                    <SettingsView key={JSON.stringify(settings)} settings={settings} tiers={tiers.data ?? NO_TIERS} onSaved={resource.reload} />
                ) : null
            }
        </ResourceBoundary>
    );
}
