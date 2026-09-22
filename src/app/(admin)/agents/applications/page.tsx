import type { Metadata } from "next";
import { AgentsNav } from "../agents-nav";
import { ApplicationsLoader } from "./applications-loader";

export const metadata: Metadata = { title: "Agent applications" };

/**
 * AG-3: the application desk — every person on the way to becoming an
 * agent, whichever door they came in by (the field app, a walk-in, a fleet
 * partner), with the stage each is at and the decision the desk owes.
 */
export default function AgentApplicationsPage() {
    return (
        <div className="space-y-5">
            <AgentsNav />
            <ApplicationsLoader />
        </div>
    );
}
