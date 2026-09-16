import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";

/**
 * What the templates screen shows with the API off.
 *
 * The six seeded templates and three seeded plans it used to draw are gone
 * rather than kept as a fallback: their `FT-*` ids were never issued by the
 * backend, so no order could be given one of those steps, and the Active
 * switch on each card changed local state and a toast and nothing else. A
 * template is the list of proofs an agent is asked for on site; a fixture
 * one is a checklist nobody will ever be handed.
 */
export function TemplatesOffline() {
    return (
        <EmptyState
            icon={PlugZap}
            title="Fulfilment templates read the API"
            description="This console is running on fixtures, and templates and plans are read from the ADX backend's milestone module. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the backend to edit them."
        />
    );
}
