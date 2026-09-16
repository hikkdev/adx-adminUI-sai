import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";

/**
 * What the dispatch board shows with the API off.
 *
 * There is nothing to fall back to and nothing was removed to get here: no
 * seed file has ever described a field visit. Every card on this board is a
 * trip on a real agent's phone with a real 25-minute clock on it, and the
 * board can dispatch, reassign and cancel through the real endpoints — a
 * fixture beside that would be a countdown nobody is watching.
 */
export function VisitsOffline() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Visits"
                subtitle="Field visits dispatched to agents — onboarding calls, renewals, follow-ups and surveys."
            />
            <EmptyState
                icon={PlugZap}
                title="Visits read the API"
                description="This console is running on fixtures, and there are no visit fixtures — a visit is a real trip an agent is asked to make. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to work the board."
            />
        </div>
    );
}
