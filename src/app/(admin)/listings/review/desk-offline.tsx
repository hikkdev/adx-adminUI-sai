import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";

/**
 * What the desk shows with the API off.
 *
 * There is no fixture queue on purpose: a seeded list of "pending" listings
 * would put spots nobody submitted in front of a reviewer, with an Approve
 * button that does nothing. An empty desk that says why is a true statement.
 */
export function DeskOffline() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Listing review"
                subtitle="Spots publishers have sent for review, with their paperwork and their price against the rate-card floor."
            />
            <EmptyState
                icon={PlugZap}
                title="The review desk reads the API"
                description="This console is running on fixtures. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to see what publishers have submitted."
            />
        </div>
    );
}
