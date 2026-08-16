"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";

interface Flag {
    code: string;
    description: string;
    rollout: number;
    environments: "Production" | "Staging" | "Both";
    owner: string;
    enabled: boolean;
}

const initialFlags: Flag[] = [
    { code: "instant_payouts_v2", description: "New payout rail with 5-minute settlement for Gold agents", rollout: 100, environments: "Production", owner: "Payments", enabled: true },
    { code: "map_clustering", description: "Cluster pins on the inventory map above 50 sites", rollout: 100, environments: "Both", owner: "Marketplace", enabled: true },
    { code: "dynamic_pricing_rules", description: "Rule engine v2 with stacking caps and conflict detection", rollout: 40, environments: "Production", owner: "Pricing", enabled: true },
    { code: "kyc_liveness_v3", description: "Passive liveness check replacing blink detection", rollout: 25, environments: "Production", owner: "Trust", enabled: true },
    { code: "advertiser_self_serve", description: "Self-serve campaign builder for verified advertisers", rollout: 10, environments: "Production", owner: "Growth", enabled: true },
    { code: "whatsapp_notifications", description: "WhatsApp channel for payout and order alerts", rollout: 0, environments: "Staging", owner: "Comms", enabled: false },
    { code: "auction_pilot", description: "Second-price auction pilot for premium digital slots", rollout: 0, environments: "Staging", owner: "Pricing", enabled: false },
];

const recentChanges = [
    { flag: "dynamic_pricing_rules", by: "Priya Rao", when: "Today, 9:14 AM", change: "25% to 40%" },
    { flag: "kyc_liveness_v3", by: "Meera Krishnan", when: "Yesterday, 4:02 PM", change: "10% to 25%" },
    { flag: "instant_payouts_v2", by: "Arjun Nair", when: "22 Jul, 11:30 AM", change: "80% to 100%" },
];

export function FlagsView() {
    const [flags, setFlags] = React.useState(initialFlags);

    const toggle = (code: string) => {
        setFlags((current) =>
            current.map((flag) =>
                flag.code === code ? { ...flag, enabled: !flag.enabled } : flag
            )
        );
        const flag = flags.find((candidate) => candidate.code === code);
        toast.success(`${code} ${flag?.enabled ? "disabled" : "enabled"}`);
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title="Feature flags"
                subtitle="Progressive rollouts across the platform"
            />

            <div className="flex items-center gap-3 rounded-lg border border-warning/20 bg-warning-soft px-4 py-3">
                <TriangleAlert className="size-4 shrink-0 text-warning" />
                <p className="text-sm text-foreground">
                    Changes apply within 30 seconds to every environment the flag targets. Every
                    toggle lands in the audit log.
                </p>
            </div>

            <Card className="overflow-hidden rounded-lg border-border shadow-none">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                            <th className="px-5 py-2.5">Flag</th>
                            <th className="px-4 py-2.5">Description</th>
                            <th className="px-4 py-2.5 text-right">Rollout</th>
                            <th className="px-4 py-2.5">Environments</th>
                            <th className="px-4 py-2.5">Owner</th>
                            <th className="px-4 py-2.5 text-right">Enabled</th>
                        </tr>
                    </thead>
                    <tbody>
                        {flags.map((flag) => (
                            <tr key={flag.code} className="border-b last:border-0">
                                <td className="px-5 py-3">
                                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                        {flag.code}
                                    </code>
                                </td>
                                <td className="max-w-[320px] px-4 py-3 text-muted-foreground">
                                    {flag.description}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center justify-end gap-2">
                                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                            <div
                                                className="h-full rounded-full bg-foreground"
                                                style={{ width: `${flag.rollout}%` }}
                                            />
                                        </div>
                                        <span className="w-9 text-right text-xs tabular-nums">
                                            {flag.rollout}%
                                        </span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <StatusBadge
                                        status={{
                                            label: flag.environments,
                                            tone: flag.environments === "Production" ? "info" : "neutral",
                                        }}
                                    />
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">{flag.owner}</td>
                                <td className="px-4 py-3 text-right">
                                    <Switch
                                        checked={flag.enabled}
                                        onCheckedChange={() => toggle(flag.code)}
                                        aria-label={`Toggle ${flag.code}`}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>

            <Card className="overflow-hidden rounded-lg border-border shadow-none">
                <h3 className="px-5 pb-3 pt-4 text-base font-semibold text-foreground">
                    Recent changes
                </h3>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-y bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                            <th className="px-5 py-2.5">Flag</th>
                            <th className="px-5 py-2.5">Changed by</th>
                            <th className="px-5 py-2.5">When</th>
                            <th className="px-5 py-2.5 text-right">Change</th>
                        </tr>
                    </thead>
                    <tbody>
                        {recentChanges.map((change) => (
                            <tr key={`${change.flag}-${change.when}`} className="border-b last:border-0">
                                <td className="px-5 py-3">
                                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                        {change.flag}
                                    </code>
                                </td>
                                <td className="px-5 py-3 text-foreground">{change.by}</td>
                                <td className="px-5 py-3 text-muted-foreground">{change.when}</td>
                                <td className="px-5 py-3 text-right font-medium tabular-nums">
                                    {change.change}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>
        </div>
    );
}
