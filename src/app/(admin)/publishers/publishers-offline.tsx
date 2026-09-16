import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";

/**
 * What the roster shows with the API off.
 *
 * The `pub_*` fixtures it used to draw are gone. Their ids were never issued
 * by the backend, so every row opened a publisher that does not exist — and
 * they were the source `/listings/new` handed to the real POST, filing new
 * spots under a publisher nobody had heard of.
 */
export function PublishersOffline() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Publishers"
                subtitle="Media owners on the marketplace, however they arrived."
            />
            <EmptyState
                icon={PlugZap}
                title="Publishers read the API"
                description="This console is running on fixtures. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend."
            />
        </div>
    );
}
