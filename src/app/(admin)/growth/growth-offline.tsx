import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { GrowthNav } from "./growth-nav";

/**
 * What the Growth pages show with the API off.
 *
 * The six seeded programs the CMS used to draw are gone rather than kept as a
 * fallback: their `mls_*` ids were never issued by the backend, and their
 * fields — an audience, a target event, auto-enrol and push switches, enrolled
 * and completed counts — do not exist on `MilestoneTemplate`. A template is a
 * target on every agent's board the moment it is active, and the ladder and
 * the leaderboard are read from the same module; a seeded one would have been
 * a reward nobody could claim on a board nobody was ranked on.
 */
export function GrowthOffline({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div className="space-y-5">
            <PageHeader title={title} subtitle={subtitle} />
            <GrowthNav />
            <EmptyState
                icon={PlugZap}
                title="Growth reads the API"
                description="This console is running on fixtures, and milestone templates, the tier ladder and the leaderboard are read from the ADX backend's agents module. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the backend to work them."
            />
        </div>
    );
}
