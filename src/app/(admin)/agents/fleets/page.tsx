import type { Metadata } from "next";
import { AgentsNav } from "../agents-nav";
import { FleetsLoader } from "./fleets-loader";

export const metadata: Metadata = { title: "Fleet partners" };

/** AG-5: the delivery and ride fleets whose riders ADX invites to apply as field agents. */
export default function FleetPartnersPage() {
    return (
        <div className="space-y-5">
            <AgentsNav />
            <FleetsLoader />
        </div>
    );
}
