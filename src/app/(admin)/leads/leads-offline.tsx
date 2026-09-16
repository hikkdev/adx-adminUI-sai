import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";

/**
 * What the leads desk shows with the API off.
 *
 * There is nothing to fall back to and nothing was removed to get here: no
 * seed file has ever described a lead. Every row on this screen is a shop an
 * agent actually walked into, and the desk can assign it or close it through
 * the real endpoints — a fixture beside that would be a business that does not
 * exist, handed to an agent as a morning's work.
 */
export function LeadsOffline() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Leads"
                subtitle="Businesses agents have found and not yet brought onto the marketplace."
            />
            <EmptyState
                icon={PlugZap}
                title="Leads read the API"
                description="This console is running on fixtures, and there are no lead fixtures — a lead is a real shop somebody visited. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to work the desk."
            />
        </div>
    );
}
