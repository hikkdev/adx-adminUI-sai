import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";

/**
 * What the review desk shows with no backend to read.
 *
 * There is no seeded artwork, on purpose: a decision here notifies a real
 * advertiser and gates a real print run, and a fixture creative would look
 * exactly like a submitted one to the person deciding.
 */
export function ModerationOffline() {
    return (
        <EmptyState
            icon={PlugZap}
            title="Creative review reads the API"
            description="Every artwork here is a submission that gates a print run. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend."
        />
    );
}
