import { Send } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";

/** What every Comms screen says with the API off: there is nothing seeded to show. */
export function CommsOffline({ what }: { what: string }) {
    return (
        <EmptyState
            icon={Send}
            title="Comms reads the API"
            description={`${what} lives on the server and nothing is seeded in its place. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend.`}
        />
    );
}
