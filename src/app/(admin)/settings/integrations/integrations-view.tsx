"use client";

import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";

const apiKeys = [
    { name: "Production server key", prefix: "adx_live_9f2…", scope: "Full access", created: "12 Jan 2026", lastUsed: "2 minutes ago" },
    { name: "Agent app backend", prefix: "adx_live_c41…", scope: "Orders, payouts", created: "20 Jan 2026", lastUsed: "34 seconds ago" },
    { name: "Analytics pipeline", prefix: "adx_live_77b…", scope: "Read only", created: "3 Feb 2026", lastUsed: "1 hour ago" },
    { name: "Staging sandbox", prefix: "adx_test_1a8…", scope: "Full access (test)", created: "14 Feb 2026", lastUsed: "3 days ago" },
];

const webhooks = [
    { endpoint: "https://hooks.adx.co/orders", events: "order.created, order.completed", health: "healthy" },
    { endpoint: "https://erp.internal/payouts", events: "payout.settled, payout.failed", health: "healthy" },
    { endpoint: "https://crm.partner.in/kyc", events: "kyc.approved, kyc.rejected", health: "failing" },
    { endpoint: "https://hooks.adx.co/disputes", events: "dispute.opened, dispute.resolved", health: "paused" },
];

const services = [
    { name: "Razorpay Payouts", helper: "Settlement rail for publisher and agent payouts", connected: true },
    { name: "Google Maps Platform", helper: "Geocoding and map tiles for the inventory map", connected: true },
    { name: "MSG91", helper: "SMS and WhatsApp delivery for OTP and alerts", connected: true },
    { name: "Digio", helper: "PAN, GSTIN and bank verification for KYC", connected: false },
];

const healthMeta = {
    healthy: { label: "Healthy", tone: "success" as const },
    failing: { label: "Failing", tone: "danger" as const },
    paused: { label: "Paused", tone: "neutral" as const },
};

export function IntegrationsView() {
    return (
        <div className="space-y-5">
            <PageHeader
                title="Integrations and API keys"
                subtitle="Keys, webhooks and connected services powering the exchange"
            />

            <SectionCard
                title="API keys"
                description="Secrets are shown once at creation and stored hashed"
                actions={
                    <Button size="sm" className="h-8" onClick={() => toast.success("New key created. Copy it now, it will not be shown again.")}>
                        <Plus className="mr-1 size-3.5" />
                        Create key
                    </Button>
                }
                contentClassName="p-0"
            >
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                            <th className="px-5 py-2.5">Key name</th>
                            <th className="px-5 py-2.5">Key prefix</th>
                            <th className="px-5 py-2.5">Scope</th>
                            <th className="px-5 py-2.5">Created</th>
                            <th className="px-5 py-2.5">Last used</th>
                            <th className="px-5 py-2.5" />
                        </tr>
                    </thead>
                    <tbody>
                        {apiKeys.map((key) => (
                            <tr key={key.name} className="border-b last:border-0">
                                <td className="px-5 py-3 font-medium text-foreground">{key.name}</td>
                                <td className="px-5 py-3">
                                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                        {key.prefix}
                                    </code>
                                </td>
                                <td className="px-5 py-3 text-muted-foreground">{key.scope}</td>
                                <td className="px-5 py-3 text-muted-foreground">{key.created}</td>
                                <td className="px-5 py-3 text-muted-foreground">{key.lastUsed}</td>
                                <td className="px-5 py-3 text-right">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs text-danger hover:text-danger"
                                        onClick={() => toast.success(`${key.name} revoked`)}
                                    >
                                        Revoke
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </SectionCard>

            <SectionCard
                title="Webhooks"
                description="Signed with the endpoint secret, retried with backoff for 24 hours"
                contentClassName="p-0"
            >
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                            <th className="px-5 py-2.5">Endpoint</th>
                            <th className="px-5 py-2.5">Subscribed events</th>
                            <th className="px-5 py-2.5">Delivery health</th>
                            <th className="px-5 py-2.5" />
                        </tr>
                    </thead>
                    <tbody>
                        {webhooks.map((webhook) => (
                            <tr key={webhook.endpoint} className="border-b last:border-0">
                                <td className="px-5 py-3">
                                    <code className="text-xs text-foreground">{webhook.endpoint}</code>
                                </td>
                                <td className="px-5 py-3 text-muted-foreground">{webhook.events}</td>
                                <td className="px-5 py-3">
                                    <StatusBadge
                                        status={healthMeta[webhook.health as keyof typeof healthMeta]}
                                    />
                                </td>
                                <td className="px-5 py-3 text-right">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => toast.success("Test event delivered")}
                                    >
                                        Test
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </SectionCard>

            <SectionCard
                title="Connected services"
                description="Third-party rails the platform depends on"
            >
                <div className="grid gap-3 md:grid-cols-2">
                    {services.map((service) => (
                        <div
                            key={service.name}
                            className="flex items-center justify-between gap-4 rounded-lg border p-4"
                        >
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-foreground">{service.name}</p>
                                    <StatusBadge
                                        status={
                                            service.connected
                                                ? { label: "Connected", tone: "success" }
                                                : { label: "Not connected", tone: "neutral" }
                                        }
                                    />
                                </div>
                                <p className="mt-0.5 text-xs text-muted-foreground">{service.helper}</p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 shrink-0 bg-card"
                                onClick={() => toast.info(`${service.name} settings open here.`)}
                            >
                                Configure
                            </Button>
                        </div>
                    ))}
                </div>
            </SectionCard>
        </div>
    );
}
