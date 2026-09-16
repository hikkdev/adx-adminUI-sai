import type { Metadata } from "next";
import { AgentsLoader } from "../agents-loader";
import { AgentsNav } from "../agents-nav";

export const metadata: Metadata = { title: "Agent directory" };

/**
 * The roster — a client loader rather than an async server fetch: the API
 * client keeps its token in the browser, so the list has to be read from
 * there. The section's second tab since package O-C put the overview at
 * the root.
 */
export default function AgentsDirectoryPage() {
    return (
        <div className="space-y-5">
            <AgentsNav />
            <AgentsLoader />
        </div>
    );
}
