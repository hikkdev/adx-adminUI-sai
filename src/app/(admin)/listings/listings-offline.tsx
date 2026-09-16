import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";

/**
 * What the listings table shows with the API off.
 *
 * The fixtures it used to draw are gone rather than kept as a fallback. They
 * carried `lst_*` ids the backend has never issued, so every row opened a
 * detail page for a listing that does not exist, and a spot genuinely created
 * through Add listing never appeared in the list at all. An empty table that
 * says why is a true statement; a plausible one is not.
 */
export function ListingsOffline() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Listings"
                subtitle="Every spot on the marketplace, whatever state it is in."
            />
            <EmptyState
                icon={PlugZap}
                title="Listings read the API"
                description="This console is running on fixtures. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to see the real inventory."
            />
        </div>
    );
}
