"use client";

import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { isLive } from "@/lib/api-config";
import { PageHeader } from "@/components/adx/page-header";
import { PricingNav } from "./pricing-nav";

interface EngineShellProps {
    title: string;
    subtitle: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
}

/**
 * Page frame for every engine screen, plus the one thing they all share: a
 * refusal to render invented data.
 *
 * Other console domains fall back to fixtures so screens work without a server.
 * These do not, deliberately. Every number here is a claim about what the market
 * charges, and a seeded comparable range would put a fabricated market rate in
 * front of the person deciding whether a publisher is priced correctly. Saying
 * "not connected" is the honest answer and the only safe one.
 */
export function EngineShell({ title, subtitle, actions, children }: EngineShellProps) {
    return (
        <div className="space-y-6">
            <PageHeader title={title} subtitle={subtitle} actions={actions} />
            <PricingNav />
            {isLive("pricingEngine") ? (
                children
            ) : (
                <Card className="rounded-lg border-border p-8 text-center shadow-none">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                        <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-foreground">
                        Not connected to the pricing engine
                    </h3>
                    <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                        These screens read live market data and never seeded stand-ins — a made-up
                        comparable range would look exactly like a real one. Set{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-xs">
                            NEXT_PUBLIC_USE_API=true
                        </code>{" "}
                        and point the console at a running backend.
                    </p>
                </Card>
            )}
        </div>
    );
}
