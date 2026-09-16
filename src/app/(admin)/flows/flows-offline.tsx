import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";

/**
 * What the flow screens show with the API off.
 *
 * The three seeded flows they used to draw are gone rather than kept: their
 * field kinds — `phone`, `slider`, `image_upload`, `section_header` — were
 * words no phone renders, and a board that saved them would have been
 * refused by the server's vocabulary. A flow here is what a publisher is
 * asked on their phone tonight; a seeded one would be a form nobody is shown.
 */
export function FlowsOffline() {
    return (
        <EmptyState
            icon={PlugZap}
            title="The flow editor reads the API"
            description="This console is running on fixtures, and flows are read from the ADX backend's config row — the one both apps boot from. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the backend to edit them."
        />
    );
}
