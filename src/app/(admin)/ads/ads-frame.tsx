"use client";

import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { promotionsReadApi } from "@/services/promotions";
import { AdsNav } from "./ads-nav";

/** The section's heading, the same on every tab. */
export const ADS_TITLE = "Ads & sponsored";

/**
 * AS-1 — Ads & sponsored: the paid placements ADX sells, a section of its
 * own. The tab bar first, the way Creatives and Orders draw theirs, then
 * the heading with the tab's own line and actions.
 */
export function AdsFrame({ subtitle, actions, children }: { subtitle: string; actions?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="space-y-5">
            <AdsNav />
            <PageHeader title={ADS_TITLE} subtitle={subtitle} actions={actions} />
            {promotionsReadApi() ? (
                children
            ) : (
                <EmptyState
                    icon={PlugZap}
                    title="Ads read the API"
                    description="Slots, bookings, sponsored listings and their numbers live in the ADX backend's promotions module. Set NEXT_PUBLIC_USE_API=true and point the console at the backend."
                />
            )}
        </div>
    );
}
